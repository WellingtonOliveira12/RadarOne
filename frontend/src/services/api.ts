import { trackRedirectToPlans } from '../lib/analytics';
import { getToken } from '../lib/auth';
import { logout } from '../lib/logout';

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: any;
  token?: string | null;
  timeout?: number; // Timeout em ms (default: 30000)
  skipAutoLogout?: boolean; // Desabilita logout automático em 401 (para chamadas não-críticas)
  retries?: number; // Número de retries em caso de erro de rede/timeout (default: 0)
  retryDelay?: number; // Delay inicial entre retries em ms (default: 1000)
}

// Timeout padrão de 30 segundos (aumentado para cold start do Render)
const DEFAULT_TIMEOUT = 30000;
// Configuração de retry para cold start
const DEFAULT_RETRIES = 0;
const DEFAULT_RETRY_DELAY = 1000;

// Flag para evitar múltiplos refreshes simultâneos
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

/**
 * Tenta renovar o access token via refresh cookie (httpOnly)
 * Retorna o novo token ou null se falhar
 */
async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // Envia o httpOnly cookie
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) return null;

      const data = await res.json();
      if (data.token) {
        // Importar dinamicamente para evitar circular dependency
        const { setToken } = await import('../lib/auth');
        setToken(data.token);
        return data.token as string;
      }
      return null;
    } catch {
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Estrutura padronizada de erro da API
 * Backend SEMPRE retorna { errorCode, message, details? }
 */
export interface ApiError {
  errorCode: string;
  message: string;
  details?: any;
}

/**
 * Trata erros de subscription/trial redirecionando para /plans
 * SEM deslogar o usuário
 * Evita loop se já estiver em /plans
 */
function handleSubscriptionError(errorCode?: string, status?: number): void {
  if (status === 403 && (errorCode === 'TRIAL_EXPIRED' || errorCode === 'SUBSCRIPTION_REQUIRED')) {
    // Evitar loop: não redirecionar se já estiver em /plans
    if (window.location.pathname !== '/plans') {
      // Track redirecionamento para analytics
      trackRedirectToPlans(errorCode === 'TRIAL_EXPIRED' ? 'trial_expired' : 'subscription_required');

      window.location.href = '/plans?reason=' + (errorCode === 'TRIAL_EXPIRED' ? 'trial_expired' : 'subscription_required');
    }
  }
}

/**
 * Extrai errorCode de forma segura do response
 * Backend padronizado sempre retorna ApiError
 */
function getErrorCode(data: any): string | undefined {
  // Priorizar errorCode (padrão novo)
  if (data?.errorCode) {
    return data.errorCode;
  }

  // Fallback temporário para formato antigo { error } durante migração
  // REMOVER após todos endpoints migrarem
  return undefined;
}

/**
 * Aguarda um tempo antes de continuar (para retry com backoff)
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiRequest<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const maxRetries = options.retries ?? DEFAULT_RETRIES;
  const baseDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Ler token automaticamente se não fornecido manualmente (fallback robusto para null/undefined)
  const token = options.token ?? getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Timeout configurável para evitar spinner infinito quando backend não responde
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  let lastError: any = null;

  // Loop de tentativas (1 + retries)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        credentials: 'include', // Envia cookies httpOnly (refresh token)
      });

      clearTimeout(timeoutId);

      // Tentativa de refresh automático em 401 (access token expirado)
      if (res.status === 401 && !options.skipAutoLogout) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          // Retry com novo token
          headers['Authorization'] = `Bearer ${newToken}`;
          const retryController = new AbortController();
          const retryTimeout = setTimeout(() => retryController.abort(), timeout);
          try {
            const retryRes = await fetch(url, {
              method: options.method || 'GET',
              headers,
              body: options.body ? JSON.stringify(options.body) : undefined,
              signal: retryController.signal,
              credentials: 'include',
            });
            clearTimeout(retryTimeout);
            return await processResponse<T>(retryRes, options);
          } catch (retryError) {
            clearTimeout(retryTimeout);
            throw retryError;
          }
        }
      }

      // Se chegou aqui, a requisição foi bem sucedida (mas pode ter erro HTTP)
      return await processResponse<T>(res, options);

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      lastError = fetchError;

      // Verificar se é erro de rede/timeout que pode ser retentado
      const isRetryableError =
        fetchError.name === 'AbortError' || // Timeout
        fetchError.name === 'TypeError' ||  // Network error (fetch falhou)
        fetchError.message?.includes('fetch'); // Outros erros de fetch

      // Se ainda tem tentativas e é erro retentável
      if (attempt < maxRetries && isRetryableError) {
        // Backoff exponencial: 1s, 2s, 4s...
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[API] Tentativa ${attempt + 1}/${maxRetries + 1} falhou, aguardando ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      // Sem mais tentativas ou erro não retentável
      if (fetchError.name === 'AbortError') {
        const error: any = new Error(
          maxRetries > 0
            ? 'O servidor não respondeu após várias tentativas. O servidor pode estar iniciando, tente novamente em instantes.'
            : 'O servidor não respondeu. Tente novamente em alguns instantes.'
        );
        error.status = 0;
        error.errorCode = 'NETWORK_TIMEOUT';
        error.isNetworkError = true;
        error.isColdStart = true; // Flag para indicar possível cold start
        throw error;
      }

      // Erro de rede genérico (sem internet, DNS, cold start do servidor, etc)
      const error: any = new Error(
        maxRetries > 0
          ? 'Não foi possível conectar ao servidor após várias tentativas. O servidor pode estar iniciando, tente novamente em instantes.'
          : 'Não foi possível conectar ao servidor. Tente novamente em alguns instantes.'
      );
      error.status = 0;
      error.errorCode = 'NETWORK_ERROR';
      error.isNetworkError = true;
      error.isColdStart = true;
      error.originalError = fetchError;
      throw error;
    }
  }

  // Nunca deveria chegar aqui, mas por segurança
  throw lastError;
}

/**
 * Processa a resposta HTTP e trata erros
 */
async function processResponse<T>(res: Response, options: RequestOptions): Promise<T> {

  const text = await res.text();
  let data: any;

  // Detectar quando backend retorna HTML em vez de JSON (ex: SPA fallback incorreto)
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html') && text.includes('<!doctype html')) {
    const error: any = new Error('Serviço temporariamente indisponível. Tente novamente.');
    error.status = 503;
    error.errorCode = 'SERVICE_UNAVAILABLE';
    error.isNetworkError = true;
    throw error;
  }

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // Se não for JSON válido, pode ser erro de configuração
    if (text.includes('<html') || text.includes('<!DOCTYPE')) {
      const error: any = new Error('Serviço temporariamente indisponível.');
      error.status = 503;
      error.errorCode = 'SERVICE_UNAVAILABLE';
      error.isNetworkError = true;
      throw error;
    }
    data = text;
  }

  if (!res.ok) {
    // Backend padronizado: { errorCode, message, details? }
    // Fallback: { error, message } (formato antigo durante migração)
    const msg =
      (data && (data.message || data.error)) ||
      `Erro na requisição (${res.status})`;

    const errorCode = getErrorCode(data);

    // ============================================
    // REGRA DETERMINÍSTICA (SEM HEURÍSTICA)
    // 100% baseada em (status + errorCode)
    // ============================================

    // 1. Tratar erros de subscription/trial (403) - NÃO DESLOGA
    handleSubscriptionError(errorCode, res.status);

    // 2. Tratar erros de autenticação (401) - DESLOGA (a menos que skipAutoLogout=true)
    // REGRA DETERMINÍSTICA: 401 E (!errorCode OU errorCode === 'INVALID_TOKEN')
    // Garante que logout só ocorre em erros 401 válidos
    const isAuthError =
      res.status === 401 &&
      (!errorCode || errorCode === 'INVALID_TOKEN');

    if (isAuthError && !options.skipAutoLogout) {
      // Logout automático usando função global centralizada
      logout('session_expired');
    }

    // 3. Criar erro tipado para propagação
    const error: any = new Error(msg);
    error.status = res.status;
    error.errorCode = errorCode;
    error.message = msg;
    error.data = data;
    error.response = { status: res.status, data };

    throw error;
  }

  return data as T;
}

/**
 * Faz request com retry automático para lidar com cold start do Render
 * Use para operações críticas onde retry faz sentido (ex: login)
 */
async function apiRequestWithRetry<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  return apiRequest<T>(path, {
    ...options,
    retries: options.retries ?? 2, // 3 tentativas total
    retryDelay: options.retryDelay ?? 1500, // 1.5s, 3s, 6s
    timeout: options.timeout ?? 45000, // 45s timeout para cold start
  });
}

export const api = {
  get: <T = any>(path: string, token?: string | null) =>
    apiRequest<T>(path, { method: 'GET', token }),
  post: <T = any>(path: string, body?: any, token?: string | null) =>
    apiRequest<T>(path, { method: 'POST', body, token }),
  put: <T = any>(path: string, body?: any, token?: string | null) =>
    apiRequest<T>(path, { method: 'PUT', body, token }),
  patch: <T = any>(path: string, body?: any, token?: string | null) =>
    apiRequest<T>(path, { method: 'PATCH', body, token }),
  delete: <T = any>(path: string, token?: string | null) =>
    apiRequest<T>(path, { method: 'DELETE', token }),

  // Método com opções completas (para casos especiais)
  request: <T = any>(path: string, options: RequestOptions) =>
    apiRequest<T>(path, options),

  // Método com retry automático para cold start (login, operações críticas)
  requestWithRetry: <T = any>(path: string, options: RequestOptions) =>
    apiRequestWithRetry<T>(path, options),
};

export { BASE_URL };

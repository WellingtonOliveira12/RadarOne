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
  timeout?: number; // Timeout em ms (default: 15000)
  skipAutoLogout?: boolean; // Desabilita logout automático em 401 (para chamadas não-críticas)
}

// Timeout padrão de 15 segundos para evitar spinner infinito
const DEFAULT_TIMEOUT = 15000;

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

async function apiRequest<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;

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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (fetchError: any) {
    clearTimeout(timeoutId);

    // Tratar erros de rede/timeout de forma amigável
    if (fetchError.name === 'AbortError') {
      const error: any = new Error('O servidor não respondeu. Tente novamente em alguns instantes.');
      error.status = 0;
      error.errorCode = 'NETWORK_TIMEOUT';
      error.isNetworkError = true;
      throw error;
    }

    // Erro de rede genérico (sem internet, DNS, etc)
    const error: any = new Error('Erro de conexão. Verifique sua internet e tente novamente.');
    error.status = 0;
    error.errorCode = 'NETWORK_ERROR';
    error.isNetworkError = true;
    error.originalError = fetchError;
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

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
};

export { BASE_URL };

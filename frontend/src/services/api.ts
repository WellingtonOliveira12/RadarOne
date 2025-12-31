import { trackRedirectToPlans } from '../lib/analytics';
import { getToken } from '../lib/auth';
import { logout } from '../lib/logout';

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: any;
  token?: string | null;
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

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data: any;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
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

    // 2. Tratar erros de autenticação (401) - DESLOGA
    // REGRA DETERMINÍSTICA: 401 E (!errorCode OU errorCode === 'INVALID_TOKEN')
    // Garante que logout só ocorre em erros 401 válidos
    const isAuthError =
      res.status === 401 &&
      (!errorCode || errorCode === 'INVALID_TOKEN');

    if (isAuthError) {
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
  delete: <T = any>(path: string, token?: string | null) =>
    apiRequest<T>(path, { method: 'DELETE', token }),
};

export { BASE_URL };

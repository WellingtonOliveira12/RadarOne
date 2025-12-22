import { trackRedirectToPlans } from '../lib/analytics';
import { getToken, clearToken } from './tokenStorage';

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: any;
  token?: string | null;
}

/**
 * Trata erro de trial expirado redirecionando para /plans
 * Evita loop se já estiver em /plans
 */
function handleTrialExpiredError(errorCode?: string, status?: number): void {
  if (status === 403 && errorCode === 'TRIAL_EXPIRED') {
    // Evitar loop: não redirecionar se já estiver em /plans
    if (window.location.pathname !== '/plans') {
      // Track redirecionamento para analytics
      trackRedirectToPlans('trial_expired');

      window.location.href = '/plans?reason=trial_expired';
    }
  }
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
    const msg =
      (data && (data.error || data.message)) ||
      `Erro na requisição (${res.status})`;

    // Tratar erro de trial expirado
    const errorCode = data && data.errorCode;
    handleTrialExpiredError(errorCode, res.status);

    // Tratar token inválido ou expirado (401/403)
    if (res.status === 401 || (res.status === 403 && msg.toLowerCase().includes('token'))) {
      clearToken();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login?reason=session_expired';
      }
    }

    // Criar erro com informações adicionais
    const error: any = new Error(msg);
    error.status = res.status;
    error.errorCode = errorCode;
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
};

export { BASE_URL };

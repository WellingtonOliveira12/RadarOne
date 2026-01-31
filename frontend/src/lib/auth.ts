/**
 * Biblioteca centralizada de autenticação
 *
 * ESTRATÉGIA DE SEGURANÇA:
 * - Access token: armazenado em memória (variável) — curta duração (15min)
 * - Refresh token: httpOnly cookie (gerenciado pelo backend) — 7 dias
 * - Fallback: localStorage para backward compatibility durante transição
 *
 * Ao recarregar a página, o access token é perdido (memória) e renovado
 * automaticamente via /auth/refresh (que usa o cookie httpOnly).
 */

const TOKEN_KEY = 'radarone_token';

// Access token em memória (mais seguro que localStorage)
let inMemoryToken: string | null = null;

/**
 * Obtém o token JWT
 * Prioridade: memória > localStorage (fallback de transição)
 */
export function getToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  // Fallback: verificar localStorage (tokens antigos antes da migração)
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Salva o token JWT em memória (e localStorage para fallback)
 */
export function setToken(token: string): void {
  inMemoryToken = token;
  // Manter localStorage durante transição para que abas existentes continuem funcionando
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Limpa TODAS as informações de autenticação
 */
export function clearAuth(): void {
  inMemoryToken = null;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem('returnUrl');
}

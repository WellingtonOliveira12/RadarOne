/**
 * Biblioteca centralizada de autenticação
 * Gerencia tokens e estado de autenticação no localStorage
 */

const TOKEN_KEY = 'radarone_token';

/**
 * Obtém o token JWT do localStorage
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Salva o token JWT no localStorage
 */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Limpa TODAS as informações de autenticação do localStorage
 * Remove: token, user data, preferences, etc.
 *
 * IMPORTANTE: Esta função NÃO faz redirect - use logout() para isso
 */
export function clearAuth(): void {
  // Remove token
  localStorage.removeItem(TOKEN_KEY);

  // Remove qualquer outro dado relacionado a auth que possa existir
  // (ex: cached user data, returnUrl, etc.)
  sessionStorage.removeItem('returnUrl');

  // Se houver outros dados de auth no localStorage, remova aqui
  // Exemplo: localStorage.removeItem('user_preferences');
}

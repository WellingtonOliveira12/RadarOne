/**
 * Logout Global do RadarOne
 * Centraliza toda a lógica de logout do sistema
 */

import { clearAuth } from './auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';

/** Flag para impedir refresh durante logout */
const LOGOUT_FLAG_KEY = 'radarone_logging_out';

export function isLoggingOut(): boolean {
  return sessionStorage.getItem(LOGOUT_FLAG_KEY) === '1';
}

export function clearLogoutFlag(): void {
  sessionStorage.removeItem(LOGOUT_FLAG_KEY);
}

/**
 * Executa logout global do usuário
 *
 * COMPORTAMENTO:
 * 1. Marca flag de logout (impede refresh race condition)
 * 2. Limpa TODAS as informações de autenticação local
 * 3. Chama /api/auth/logout no backend (revoga refresh token + limpa cookie)
 * 4. Força reload completo da aplicação para /login
 *
 * @param reason - Motivo do logout (opcional) para mostrar mensagem ao usuário
 */
export function logout(reason?: string): void {
  // 1. Marca flag ANTES de tudo — impede loadUser de fazer refresh
  sessionStorage.setItem(LOGOUT_FLAG_KEY, '1');

  // 2. Limpa TUDO relacionado a autenticação local
  clearAuth();

  // 3. Monta URL de destino
  const loginUrl = reason ? `/login?reason=${reason}` : '/login';

  // 4. Chamar backend para revogar refresh token, depois redireciona
  //    Timeout de 2s para não travar se backend demorar
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
  })
    .catch(() => {
      // Ignorar erros — logout local + flag já garantem segurança
    })
    .finally(() => {
      clearTimeout(timeoutId);
      // 5. Força reload completo do app e redireciona
      window.location.href = loginUrl;
    });
}

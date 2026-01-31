/**
 * Logout Global do RadarOne
 * Centraliza toda a lógica de logout do sistema
 */

import { clearAuth } from './auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';

/**
 * Executa logout global do usuário
 *
 * COMPORTAMENTO:
 * 1. Chama /api/auth/logout no backend (revoga refresh token + limpa cookie)
 * 2. Limpa TODAS as informações de autenticação local
 * 3. Força reload completo da aplicação
 * 4. Redireciona para /login
 *
 * @param reason - Motivo do logout (opcional) para mostrar mensagem ao usuário
 */
export function logout(reason?: string): void {
  // 1. Chamar backend para revogar refresh token (fire-and-forget)
  fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include', // Envia o httpOnly cookie para revogação
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {
    // Ignorar erros — logout local já garante segurança
  });

  // 2. Limpa TUDO relacionado a autenticação local
  clearAuth();

  // 3. Monta URL de destino
  const loginUrl = reason ? `/login?reason=${reason}` : '/login';

  // 4. Força reload completo do app e redireciona
  window.location.href = loginUrl;
}

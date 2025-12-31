/**
 * Logout Global do RadarOne
 * Centraliza toda a lógica de logout do sistema
 */

import { clearAuth } from './auth';

/**
 * Executa logout global do usuário
 *
 * COMPORTAMENTO:
 * 1. Limpa TODAS as informações de autenticação (token, cache, etc.)
 * 2. Força reload completo da aplicação
 * 3. Redireciona para /login
 *
 * QUANDO USAR:
 * - Logout manual do usuário (botão "Sair")
 * - Logout automático por 401 Unauthorized
 * - Logout por timeout de sessão
 * - Troca de usuário
 *
 * @param reason - Motivo do logout (opcional) para mostrar mensagem ao usuário
 *                 Exemplos: 'session_expired', 'unauthorized', 'manual'
 */
export function logout(reason?: string): void {
  // 1. Limpa TUDO relacionado a autenticação
  clearAuth();

  // 2. Monta URL de destino (com reason se fornecido)
  const loginUrl = reason ? `/login?reason=${reason}` : '/login';

  // 3. Força reload completo do app e redireciona
  // Usamos window.location.href (não navigate) para garantir:
  // - Limpeza completa de estado React
  // - Sem estados fantasmas em memória
  // - Fresh start garantido
  window.location.href = loginUrl;
}

/**
 * ============================================================
 * SITE SESSION MANAGER - Gerenciador de Sessoes por Site
 * ============================================================
 *
 * Gerencia status de autenticacao e sessoes para scrapers.
 * Implementa:
 * - Status de autenticacao por site (ok, needs_reauth, error)
 * - Backoff inteligente para evitar loops infinitos
 * - Notificacao de admin quando needs_reauth
 * - Cache em memoria para performance
 */

import { logger } from './logger';

// ============================================================
// TIPOS
// ============================================================

export type SiteId = 'MERCADO_LIVRE' | 'OLX' | 'FACEBOOK_MARKETPLACE' | 'WEBMOTORS' | 'ICARROS' | 'ZAP_IMOVEIS' | 'VIVA_REAL' | 'IMOVELWEB' | 'LEILAO';

export type SessionStatus = 'ok' | 'needs_reauth' | 'expired' | 'blocked' | 'error' | 'unknown';

export interface SiteSessionState {
  site: SiteId;
  status: SessionStatus;
  reason?: string;
  lastCheckedAt: Date;
  lastSuccessAt?: Date;
  lastErrorAt?: Date;
  consecutiveErrors: number;
  backoffUntil?: Date;
  needsReauthNotified: boolean;
}

export interface SessionManagerConfig {
  // Tempo de backoff apos erro (minutos)
  errorBackoffMinutes: number;
  // Maximo de erros consecutivos antes de marcar needs_reauth
  maxConsecutiveErrors: number;
  // Tempo de backoff quando needs_reauth (minutos)
  needsReauthBackoffMinutes: number;
}

// ============================================================
// CONFIGURACAO PADRAO
// ============================================================

const DEFAULT_CONFIG: SessionManagerConfig = {
  errorBackoffMinutes: 15,
  maxConsecutiveErrors: 3,
  needsReauthBackoffMinutes: 60,
};

// ============================================================
// CLASSE PRINCIPAL
// ============================================================

class SiteSessionManager {
  private sessions: Map<SiteId, SiteSessionState> = new Map();
  private config: SessionManagerConfig;
  private onNeedsReauthCallback?: (site: SiteId, reason: string) => void;

  constructor(config?: Partial<SessionManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Registra callback para quando um site precisar de reautenticacao
   */
  onNeedsReauth(callback: (site: SiteId, reason: string) => void): void {
    this.onNeedsReauthCallback = callback;
  }

  /**
   * Obtem o estado atual de uma sessao
   */
  getSession(site: SiteId): SiteSessionState {
    const existing = this.sessions.get(site);

    if (existing) {
      return existing;
    }

    // Cria estado inicial
    const initial: SiteSessionState = {
      site,
      status: 'unknown',
      lastCheckedAt: new Date(),
      consecutiveErrors: 0,
      needsReauthNotified: false,
    };

    this.sessions.set(site, initial);
    return initial;
  }

  /**
   * Verifica se o site pode ser usado (nao esta em backoff)
   */
  canUseSite(site: SiteId): { canUse: boolean; reason?: string; backoffMinutes?: number } {
    const session = this.getSession(site);

    // Se esta em backoff, verifica se expirou
    if (session.backoffUntil) {
      const now = new Date();
      if (now < session.backoffUntil) {
        const minutesLeft = Math.ceil((session.backoffUntil.getTime() - now.getTime()) / 60000);
        return {
          canUse: false,
          reason: `Site em backoff: ${session.reason || 'erro anterior'}`,
          backoffMinutes: minutesLeft,
        };
      } else {
        // Backoff expirou, limpa
        session.backoffUntil = undefined;
      }
    }

    // Se needs_reauth, permite tentar mas com aviso
    if (session.status === 'needs_reauth') {
      return {
        canUse: true,
        reason: 'Site precisa reautenticacao - tentando sem sessao',
      };
    }

    return { canUse: true };
  }

  /**
   * Marca sessao como sucesso
   */
  markSuccess(site: SiteId): void {
    const session = this.getSession(site);

    session.status = 'ok';
    session.lastSuccessAt = new Date();
    session.lastCheckedAt = new Date();
    session.consecutiveErrors = 0;
    session.backoffUntil = undefined;
    session.reason = undefined;

    this.sessions.set(site, session);

    logger.debug({ site }, 'SESSION_MANAGER: Sessao marcada como sucesso');
  }

  /**
   * Marca sessao como erro
   */
  markError(site: SiteId, errorType: 'login_required' | 'challenge' | 'blocked' | 'error', reason?: string): void {
    const session = this.getSession(site);

    session.lastErrorAt = new Date();
    session.lastCheckedAt = new Date();
    session.consecutiveErrors++;
    session.reason = reason;

    // Determina status e backoff baseado no tipo de erro
    switch (errorType) {
      case 'login_required':
      case 'challenge':
        // Requer reautenticacao manual
        session.status = 'needs_reauth';
        session.backoffUntil = new Date(Date.now() + this.config.needsReauthBackoffMinutes * 60 * 1000);

        // Notifica apenas uma vez
        if (!session.needsReauthNotified && this.onNeedsReauthCallback) {
          this.onNeedsReauthCallback(site, reason || 'Login required');
          session.needsReauthNotified = true;
        }

        logger.warn({
          site,
          reason,
          backoffMinutes: this.config.needsReauthBackoffMinutes,
        }, 'SESSION_MANAGER: Site marcado como needs_reauth');
        break;

      case 'blocked':
        session.status = 'blocked';
        session.backoffUntil = new Date(Date.now() + this.config.needsReauthBackoffMinutes * 2 * 60 * 1000);

        logger.error({ site, reason }, 'SESSION_MANAGER: Site bloqueado');
        break;

      case 'error':
        // Erro temporario - backoff menor
        if (session.consecutiveErrors >= this.config.maxConsecutiveErrors) {
          session.status = 'error';
          session.backoffUntil = new Date(Date.now() + this.config.errorBackoffMinutes * 60 * 1000);

          logger.warn({
            site,
            consecutiveErrors: session.consecutiveErrors,
            backoffMinutes: this.config.errorBackoffMinutes,
          }, 'SESSION_MANAGER: Muitos erros consecutivos, entrando em backoff');
        }
        break;
    }

    this.sessions.set(site, session);
  }

  /**
   * Reseta o status de um site (apos renovar sessao)
   */
  resetSession(site: SiteId): void {
    this.sessions.set(site, {
      site,
      status: 'unknown',
      lastCheckedAt: new Date(),
      consecutiveErrors: 0,
      needsReauthNotified: false,
    });

    logger.info({ site }, 'SESSION_MANAGER: Sessao resetada');
  }

  /**
   * Lista todos os sites com status
   */
  getAllSessions(): SiteSessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Lista sites que precisam de reautenticacao
   */
  getSitesNeedingReauth(): SiteSessionState[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'needs_reauth' || s.status === 'blocked');
  }

  /**
   * Verifica se site precisa de reautenticacao
   */
  needsReauth(site: SiteId): boolean {
    const session = this.getSession(site);
    return session.status === 'needs_reauth' || session.status === 'blocked';
  }
}

// Singleton
export const siteSessionManager = new SiteSessionManager();

// ============================================================
// HELPER: Detecta tipo de erro de autenticacao
// ============================================================

export function detectAuthError(error: Error | string): {
  type: 'login_required' | 'challenge' | 'blocked' | 'error';
  reason: string;
} {
  const message = typeof error === 'string' ? error : error.message;
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('login_required') ||
      lowerMessage.includes('acesse sua conta') ||
      lowerMessage.includes('account-verification')) {
    return { type: 'login_required', reason: message };
  }

  if (lowerMessage.includes('challenge') ||
      lowerMessage.includes('captcha') ||
      lowerMessage.includes('blocked')) {
    return { type: 'challenge', reason: message };
  }

  if (lowerMessage.includes('blocked') ||
      lowerMessage.includes('banned') ||
      lowerMessage.includes('suspended')) {
    return { type: 'blocked', reason: message };
  }

  return { type: 'error', reason: message };
}

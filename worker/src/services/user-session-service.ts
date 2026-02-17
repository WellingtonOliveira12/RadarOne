/**
 * ============================================================
 * USER SESSION SERVICE
 * ============================================================
 *
 * Gerencia sessões de autenticação POR USUÁRIO (não por conta técnica).
 *
 * Responsabilidades:
 * - Validar storageState enviado pelo usuário
 * - Criptografar e salvar na tabela UserSession
 * - Fornecer contexto autenticado para scrapers
 * - Gerenciar estados: ACTIVE, EXPIRED, NEEDS_REAUTH, INVALID
 * - Cooldown de notificações (não spammar usuário)
 */

import { prisma } from '../lib/prisma';
import { UserSessionStatus } from '@prisma/client';
import { BrowserContext, Browser } from 'playwright';
import { cryptoManager } from '../auth/crypto-manager';
import { randomUA } from '../utils/user-agents';
import { logger } from '../utils/logger';
import { browserManager } from '../engine/browser-manager';

// ============================================================
// TIPOS
// ============================================================

/** Resultado ao obter contexto autenticado */
export interface UserContextResult {
  success: boolean;
  context?: BrowserContext;
  browser?: Browser;
  status: UserSessionStatus;
  sessionId?: string;
  error?: string;
  needsUserAction?: boolean;
  cleanup: () => Promise<void>;
}

/** storageState do Playwright */
interface StorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

/** Resultado de validação de storageState */
interface ValidationResult {
  valid: boolean;
  error?: string;
  cookieCount?: number;
  domains?: string[];
}

/** Configuração por site */
interface SiteConfig {
  domain: string;
  requiresAuth: boolean;
  loginUrl: string;
  validationUrl: string;
}

// ============================================================
// CONFIGURAÇÃO DE SITES
// ============================================================

const SITE_CONFIGS: Record<string, SiteConfig> = {
  MERCADO_LIVRE: {
    domain: 'mercadolivre.com.br',
    requiresAuth: true,
    loginUrl: 'https://www.mercadolivre.com.br/login',
    validationUrl: 'https://www.mercadolivre.com.br/',
  },
  FACEBOOK_MARKETPLACE: {
    domain: 'facebook.com',
    requiresAuth: true,
    loginUrl: 'https://www.facebook.com/login',
    validationUrl: 'https://www.facebook.com/marketplace/',
  },
  SUPERBID: {
    domain: 'superbid.net',
    requiresAuth: true,
    loginUrl: 'https://www.superbid.net/login',
    validationUrl: 'https://www.superbid.net/',
  },
  OLX: {
    domain: 'olx.com.br',
    requiresAuth: false,
    loginUrl: 'https://www.olx.com.br/login',
    validationUrl: 'https://www.olx.com.br/',
  },
  WEBMOTORS: {
    domain: 'webmotors.com.br',
    requiresAuth: false,
    loginUrl: '',
    validationUrl: 'https://www.webmotors.com.br/',
  },
  ICARROS: {
    domain: 'icarros.com.br',
    requiresAuth: false,
    loginUrl: '',
    validationUrl: 'https://www.icarros.com.br/',
  },
  ZAP_IMOVEIS: {
    domain: 'zapimoveis.com.br',
    requiresAuth: false,
    loginUrl: '',
    validationUrl: 'https://www.zapimoveis.com.br/',
  },
  VIVA_REAL: {
    domain: 'vivareal.com.br',
    requiresAuth: false,
    loginUrl: '',
    validationUrl: 'https://www.vivareal.com.br/',
  },
  IMOVELWEB: {
    domain: 'imovelweb.com.br',
    requiresAuth: false,
    loginUrl: '',
    validationUrl: 'https://www.imovelweb.com.br/',
  },
  LEILAO: {
    domain: 'superbid.net',
    requiresAuth: true,
    loginUrl: 'https://www.superbid.net/login',
    validationUrl: 'https://www.superbid.net/',
  },
};

// Cooldown de notificação em horas
const NOTIFICATION_COOLDOWN_HOURS = 6;

// ============================================================
// CLASSE PRINCIPAL
// ============================================================

class UserSessionService {
  /**
   * Valida se chave de criptografia está configurada corretamente
   */
  validateEncryptionKey(): { valid: boolean; error?: string } {
    const key = process.env.SESSION_ENCRYPTION_KEY || process.env.SCRAPER_ENCRYPTION_KEY;

    if (!key) {
      return {
        valid: false,
        error: 'SESSION_ENCRYPTION_KEY não configurada. Configure uma chave de 32+ caracteres.',
      };
    }

    if (key === 'CHANGE_ME_IN_PRODUCTION_32CHARS!') {
      return {
        valid: false,
        error: 'SESSION_ENCRYPTION_KEY está com valor padrão. Configure uma chave segura.',
      };
    }

    if (key.length < 32) {
      return {
        valid: false,
        error: `SESSION_ENCRYPTION_KEY muito curta (${key.length} chars). Mínimo: 32 caracteres.`,
      };
    }

    return { valid: true };
  }

  /**
   * Obtém configuração de um site
   */
  getSiteConfig(site: string): SiteConfig | null {
    return SITE_CONFIGS[site] || null;
  }

  /**
   * Verifica se site requer autenticação
   */
  siteRequiresAuth(site: string): boolean {
    return SITE_CONFIGS[site]?.requiresAuth ?? false;
  }

  /**
   * Valida storageState antes de salvar
   */
  validateStorageState(jsonContent: string, site: string): ValidationResult {
    try {
      const state = JSON.parse(jsonContent) as StorageState;

      // Valida estrutura básica
      if (!state.cookies || !Array.isArray(state.cookies)) {
        return { valid: false, error: 'Formato inválido: campo "cookies" ausente ou inválido' };
      }

      if (!state.origins || !Array.isArray(state.origins)) {
        return { valid: false, error: 'Formato inválido: campo "origins" ausente ou inválido' };
      }

      // Obtém domínio esperado
      const config = this.getSiteConfig(site);
      if (!config) {
        return { valid: false, error: `Site não suportado: ${site}` };
      }

      const expectedDomain = config.domain;

      // Verifica se tem cookies do domínio correto
      const siteCookies = state.cookies.filter(
        (c) =>
          c.domain.includes(expectedDomain) ||
          expectedDomain.includes(c.domain.replace(/^\./, ''))
      );

      if (siteCookies.length === 0) {
        return {
          valid: false,
          error: `Nenhum cookie encontrado para ${expectedDomain}. Certifique-se de fazer login no site correto antes de exportar.`,
        };
      }

      // Conta cookies persistentes (com expiração no futuro)
      const now = Date.now() / 1000;
      const persistentCookies = siteCookies.filter((c) => c.expires > now);

      if (persistentCookies.length < 2) {
        return {
          valid: false,
          error: 'Poucos cookies persistentes. Faça login completo no site antes de exportar.',
        };
      }

      // Coleta domínios únicos
      const domains = [...new Set(state.cookies.map((c) => c.domain))];

      return {
        valid: true,
        cookieCount: siteCookies.length,
        domains,
      };
    } catch (e: any) {
      return { valid: false, error: `JSON inválido: ${e.message}` };
    }
  }

  /**
   * Salva sessão do usuário (upload de storageState)
   */
  async saveUserSession(
    userId: string,
    site: string,
    storageStateJson: string,
    accountLabel?: string
  ): Promise<{ success: boolean; error?: string; sessionId?: string }> {
    try {
      // 1. Valida chave de criptografia
      const keyValidation = this.validateEncryptionKey();
      if (!keyValidation.valid) {
        return { success: false, error: keyValidation.error };
      }

      // 2. Valida storageState
      const validation = this.validateStorageState(storageStateJson, site);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // 3. Obtém configuração do site
      const config = this.getSiteConfig(site);
      if (!config) {
        return { success: false, error: `Site não suportado: ${site}` };
      }

      // 4. Criptografa storageState
      const encryptedStorageState = cryptoManager.encrypt(storageStateJson);

      // 5. Calcula expiração baseada nos cookies
      const state = JSON.parse(storageStateJson) as StorageState;
      const expiresAt = this.calculateExpiration(state.cookies, config.domain);

      // 6. Prepara metadados
      const metadata = {
        cookieCount: validation.cookieCount,
        domains: validation.domains,
        uploadedAt: new Date().toISOString(),
        source: 'user_upload',
      };

      // 7. Upsert no banco (usando índice legado userId_site_domain)
      const session = await prisma.userSession.upsert({
        where: {
          userId_site_domain: {
            userId,
            site,
            domain: config.domain,
          },
        },
        create: {
          userId,
          site,
          domain: config.domain,
          accountLabel: accountLabel || null,
          status: UserSessionStatus.ACTIVE,
          encryptedStorageState,
          metadata,
          expiresAt,
        },
        update: {
          status: UserSessionStatus.ACTIVE,
          encryptedStorageState,
          accountLabel: accountLabel || null,
          metadata,
          expiresAt,
          lastUsedAt: new Date(),
          lastErrorAt: null,
        },
      });

      logger.info(
        {
          userId: cryptoManager.mask(userId, 4, 4),
          site,
          sessionId: session.id,
          cookieCount: validation.cookieCount,
        },
        'USER_SESSION_SAVED: Sessão salva com sucesso'
      );

      return { success: true, sessionId: session.id };
    } catch (error: any) {
      logger.error({ error: error.message }, 'USER_SESSION_SAVE_ERROR');
      return { success: false, error: `Erro ao salvar sessão: ${error.message}` };
    }
  }

  /**
   * Obtém contexto autenticado do Playwright para um usuário/site
   */
  async getUserContext(
    userId: string,
    site: string,
    accountLabel?: string
  ): Promise<UserContextResult> {
    const siteConfig = this.getSiteConfig(site);
    const domain = siteConfig?.domain || site.toLowerCase();

    // Função de cleanup padrão
    const noopCleanup = async () => {};

    // 1. Busca sessão do usuário (usando índice legado userId_site_domain)
    const session = await prisma.userSession.findUnique({
      where: {
        userId_site_domain: {
          userId,
          site,
          domain,
        },
      },
    });

    if (!session) {
      return {
        success: false,
        status: UserSessionStatus.INVALID,
        error: `Nenhuma sessão configurada para ${site}. Por favor, conecte sua conta.`,
        needsUserAction: true,
        cleanup: noopCleanup,
      };
    }

    // 2. Verifica status atual
    if (session.status === UserSessionStatus.NEEDS_REAUTH) {
      return {
        success: false,
        status: UserSessionStatus.NEEDS_REAUTH,
        sessionId: session.id,
        error: 'Sessão expirada. Por favor, reconecte sua conta.',
        needsUserAction: true,
        cleanup: noopCleanup,
      };
    }

    if (session.status === UserSessionStatus.INVALID) {
      return {
        success: false,
        status: UserSessionStatus.INVALID,
        sessionId: session.id,
        error: 'Sessão inválida. Por favor, gere uma nova sessão.',
        needsUserAction: true,
        cleanup: noopCleanup,
      };
    }

    // 3. Verifica expiração
    if (session.expiresAt && new Date() > session.expiresAt) {
      await this.markSessionStatus(session.id, UserSessionStatus.EXPIRED, 'Sessão expirou por tempo');
      return {
        success: false,
        status: UserSessionStatus.EXPIRED,
        sessionId: session.id,
        error: 'Sessão expirou. Por favor, reconecte sua conta.',
        needsUserAction: true,
        cleanup: noopCleanup,
      };
    }

    // 4. Descriptografa storageState
    let storageState: StorageState;
    try {
      const decrypted = cryptoManager.decrypt(session.encryptedStorageState);
      storageState = JSON.parse(decrypted);
    } catch (error: any) {
      logger.error({ sessionId: session.id, error: error.message }, 'USER_SESSION_DECRYPT_ERROR');
      await this.markSessionStatus(session.id, UserSessionStatus.INVALID, 'Erro ao descriptografar');
      return {
        success: false,
        status: UserSessionStatus.INVALID,
        sessionId: session.id,
        error: 'Erro ao carregar sessão. Reconecte sua conta.',
        needsUserAction: true,
        cleanup: noopCleanup,
      };
    }

    // 5. Cria contexto com storageState (usando BrowserManager singleton)
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;

    try {
      browser = await browserManager.getOrLaunch();
      browserManager.trackContextOpen();

      context = await browser.newContext({
        storageState,
        userAgent: randomUA(),
        locale: 'pt-BR',
        viewport: { width: 1920, height: 1080 },
      });

      // 6. Atualiza lastUsedAt
      await prisma.userSession.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });

      logger.debug(
        { userId: cryptoManager.mask(userId, 4, 4), site, sessionId: session.id },
        'USER_SESSION_CONTEXT_OK'
      );

      return {
        success: true,
        context,
        browser,
        status: UserSessionStatus.ACTIVE,
        sessionId: session.id,
        cleanup: async () => {
          try {
            await context?.close();
          } catch {}
          browserManager.trackContextClose();
          // NOTE: Do NOT close browser — it's shared
        },
      };
    } catch (error: any) {
      // Cleanup em caso de erro
      try {
        await context?.close();
      } catch {}
      browserManager.trackContextClose();

      logger.error({ error: error.message }, 'USER_SESSION_CONTEXT_ERROR');
      return {
        success: false,
        status: UserSessionStatus.INVALID,
        sessionId: session.id,
        error: `Erro ao criar contexto: ${error.message}`,
        needsUserAction: true,
        cleanup: noopCleanup,
      };
    }
  }

  /**
   * Marca sessão como NEEDS_REAUTH
   *
   * IMPORTANTE: Isso NÃO é um erro que deve alimentar circuit breaker!
   */
  async markNeedsReauth(
    userId: string,
    site: string,
    reason: string,
    accountLabel?: string
  ): Promise<{ notified: boolean }> {
    const config = this.getSiteConfig(site);
    const session = await prisma.userSession.findUnique({
      where: {
        userId_site_domain: {
          userId,
          site,
          domain: config?.domain || site.toLowerCase(),
        },
      },
    });

    if (!session) {
      return { notified: false };
    }

    // Verifica cooldown de notificação
    const metadata = (session.metadata as Record<string, any>) || {};
    const lastNotified = metadata.cooldownNotifiedAt
      ? new Date(metadata.cooldownNotifiedAt)
      : null;
    const cooldownMs = NOTIFICATION_COOLDOWN_HOURS * 60 * 60 * 1000;
    const shouldNotify = !lastNotified || Date.now() - lastNotified.getTime() > cooldownMs;

    // Atualiza sessão
    await prisma.userSession.update({
      where: { id: session.id },
      data: {
        status: UserSessionStatus.NEEDS_REAUTH,
        lastErrorAt: new Date(),
        metadata: {
          ...metadata,
          lastErrorReason: reason,
          lastErrorAt: new Date().toISOString(),
          ...(shouldNotify ? { cooldownNotifiedAt: new Date().toISOString() } : {}),
        },
      },
    });

    logger.warn(
      {
        userId: cryptoManager.mask(userId, 4, 4),
        site,
        reason,
        shouldNotify,
      },
      'USER_SESSION_NEEDS_REAUTH'
    );

    return { notified: shouldNotify };
  }

  /**
   * Marca sessão com um status específico
   */
  async markSessionStatus(
    sessionId: string,
    status: UserSessionStatus,
    reason?: string
  ): Promise<void> {
    const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session) return;

    const metadata = (session.metadata as Record<string, any>) || {};

    await prisma.userSession.update({
      where: { id: sessionId },
      data: {
        status,
        lastErrorAt: status !== UserSessionStatus.ACTIVE ? new Date() : null,
        metadata: {
          ...metadata,
          lastStatusChange: new Date().toISOString(),
          lastStatusReason: reason,
        },
      },
    });

    logger.info({ sessionId, status, reason }, 'USER_SESSION_STATUS_CHANGED');
  }

  /**
   * Verifica se usuário tem sessão válida para um site
   */
  async hasValidSession(userId: string, site: string, accountLabel?: string): Promise<boolean> {
    const config = this.getSiteConfig(site);
    const session = await prisma.userSession.findUnique({
      where: {
        userId_site_domain: {
          userId,
          site,
          domain: config?.domain || site.toLowerCase(),
        },
      },
      select: { status: true, expiresAt: true },
    });

    if (!session) return false;
    if (session.status !== UserSessionStatus.ACTIVE) return false;
    if (session.expiresAt && new Date() > session.expiresAt) return false;

    return true;
  }

  /**
   * Lista sessões de um usuário
   */
  async listUserSessions(userId: string): Promise<
    Array<{
      id: string;
      site: string;
      domain: string;
      accountLabel: string | null;
      status: UserSessionStatus;
      lastUsedAt: Date | null;
      expiresAt: Date | null;
      metadata: any;
    }>
  > {
    const sessions = await prisma.userSession.findMany({
      where: { userId },
      select: {
        id: true,
        site: true,
        domain: true,
        accountLabel: true,
        status: true,
        lastUsedAt: true,
        expiresAt: true,
        metadata: true,
      },
      orderBy: { site: 'asc' },
    });

    return sessions;
  }

  /**
   * Remove sessão de um usuário
   */
  async deleteUserSession(userId: string, site: string, accountLabel?: string): Promise<void> {
    await prisma.userSession.deleteMany({
      where: {
        userId,
        site,
        accountLabel: accountLabel || null,
      },
    });

    logger.info(
      { userId: cryptoManager.mask(userId, 4, 4), site },
      'USER_SESSION_DELETED'
    );
  }

  /**
   * Obtém status de uma sessão
   */
  async getSessionStatus(
    userId: string,
    site: string,
    accountLabel?: string
  ): Promise<{
    exists: boolean;
    status?: UserSessionStatus;
    lastUsedAt?: Date | null;
    expiresAt?: Date | null;
    needsAction?: boolean;
  }> {
    const config = this.getSiteConfig(site);
    const session = await prisma.userSession.findUnique({
      where: {
        userId_site_domain: {
          userId,
          site,
          domain: config?.domain || site.toLowerCase(),
        },
      },
      select: {
        status: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });

    if (!session) {
      return { exists: false, needsAction: this.siteRequiresAuth(site) };
    }

    const needsAction =
      session.status === UserSessionStatus.NEEDS_REAUTH ||
      session.status === UserSessionStatus.EXPIRED ||
      session.status === UserSessionStatus.INVALID ||
      (session.expiresAt && new Date() > session.expiresAt);

    return {
      exists: true,
      status: session.status,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      needsAction,
    };
  }

  // ─────────────────────────────────────────────────────────
  // MÉTODOS PRIVADOS
  // ─────────────────────────────────────────────────────────

  /**
   * Calcula expiração baseada nos cookies
   */
  private calculateExpiration(
    cookies: StorageState['cookies'],
    domain: string
  ): Date {
    // Encontra cookie de sessão com maior expiração
    const now = Date.now() / 1000;
    const sessionCookies = cookies
      .filter((c) => c.domain.includes(domain) && c.expires > now)
      .sort((a, b) => b.expires - a.expires);

    if (sessionCookies.length > 0) {
      const maxExpires = sessionCookies[0].expires * 1000;
      // Limita a 7 dias no máximo
      const maxAllowed = Date.now() + 7 * 24 * 60 * 60 * 1000;
      return new Date(Math.min(maxExpires, maxAllowed));
    }

    // Fallback: 7 dias
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
}

// Singleton
export const userSessionService = new UserSessionService();

// Valida chave no boot
const keyValidation = userSessionService.validateEncryptionKey();
if (!keyValidation.valid) {
  console.warn(`⚠️  USER_SESSION_SERVICE: ${keyValidation.error}`);
}

import { prisma } from '../lib/prisma';
import { Page, Browser, BrowserContext } from 'playwright';
import { logger } from './logger';
import { cryptoManager } from '../auth/crypto-manager';

/**
 * Session Manager - Gerenciamento de Sessões de Login
 *
 * Para sites que exigem autenticação (ex: leilões privados)
 *
 * Features:
 * - Armazenamento seguro de cookies/tokens
 * - Renovação automática de sessões expiradas
 * - Suporte a múltiplos sites
 * - Criptografia de cookies
 *
 * Uso:
 * ```typescript
 * const session = await sessionManager.getSession(userId, 'superbid');
 * if (!session) {
 *   await sessionManager.performLogin(userId, 'superbid', credentials);
 * }
 * await sessionManager.applySession(page, session);
 * ```
 */

export interface LoginCredentials {
  username: string;
  password: string;
  [key: string]: any; // Campos adicionais específicos do site
}

export interface UserSession {
  id: string;
  userId: string;
  site: string;
  domain: string;
  cookies: any;
  localStorage?: any;
  metadata?: any;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
}

class SessionManager {
  /**
   * Obtém sessão válida para um usuário e site
   */
  async getSession(userId: string, site: string): Promise<UserSession | null> {
    try {
      const session = await prisma.userSession.findFirst({
        where: {
          userId,
          site,
          expiresAt: {
            gt: new Date(), // Não expirada
          },
        },
        orderBy: {
          lastUsedAt: 'desc',
        },
      });

      if (!session) {
        logger.debug({ userId, site }, '🔐 Nenhuma sessão válida encontrada');
        return null;
      }

      // Descriptografa cookies
      const decryptedCookies = this.decrypt(session.cookies as any);

      return {
        ...session,
        cookies: JSON.parse(decryptedCookies),
        localStorage: session.localStorage as any,
        metadata: session.metadata as any,
      };
    } catch (error: any) {
      logger.error({
        userId,
        site,
        error: error.message,
      }, '❌ Erro ao obter sessão');

      return null;
    }
  }

  /**
   * Salva ou atualiza sessão
   */
  async saveSession(
    userId: string,
    site: string,
    domain: string,
    cookies: any[],
    options?: {
      localStorage?: any;
      metadata?: any;
      expiresIn?: number; // Dias (default: 7)
    }
  ): Promise<void> {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (options?.expiresIn || 7));

      // Criptografa cookies
      const encryptedCookies = this.encrypt(JSON.stringify(cookies));

      // Find existing or create (multi-session aware)
      const existing = await prisma.userSession.findFirst({
        where: { userId, site, domain, accountLabel: null },
      });

      if (existing) {
        await prisma.userSession.update({
          where: { id: existing.id },
          data: {
            cookies: encryptedCookies as any,
            localStorage: options?.localStorage as any,
            metadata: options?.metadata as any,
            expiresAt,
            lastUsedAt: new Date(),
          },
        });
      } else {
        await prisma.userSession.create({
          data: {
            userId,
            site,
            domain,
            cookies: encryptedCookies as any,
            localStorage: options?.localStorage as any,
            metadata: options?.metadata as any,
            expiresAt,
          },
        });
      }

      logger.info({
        userId,
        site,
        domain,
        expiresAt,
      }, '💾 Sessão salva com sucesso');
    } catch (error: any) {
      logger.error({
        userId,
        site,
        error: error.message,
      }, '❌ Erro ao salvar sessão');

      throw error;
    }
  }

  /**
   * Aplica sessão (cookies) em uma página Playwright
   */
  async applySession(context: BrowserContext, session: UserSession): Promise<void> {
    try {
      // Aplica cookies
      await context.addCookies(session.cookies);

      // Marca sessão como usada
      await prisma.userSession.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });

      logger.debug({
        sessionId: session.id,
        site: session.site,
      }, '✅ Sessão aplicada');
    } catch (error: any) {
      logger.error({
        sessionId: session.id,
        error: error.message,
      }, '❌ Erro ao aplicar sessão');

      throw error;
    }
  }

  /**
   * Captura cookies e localStorage de uma página
   */
  async captureSession(
    page: Page,
    userId: string,
    site: string,
    domain: string,
    options?: {
      metadata?: any;
      expiresIn?: number;
    }
  ): Promise<void> {
    try {
      // Captura cookies
      const context = page.context();
      const cookies = await context.cookies();

      // Captura localStorage (opcional)
      let localStorage: any = null;
      try {
        localStorage = await page.evaluate(() => {
          const storage: any = {};
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key) {
              storage[key] = window.localStorage.getItem(key);
            }
          }
          return storage;
        });
      } catch (error) {
        // Ignorar se localStorage não acessível
        logger.warn('⚠️  Não foi possível capturar localStorage');
      }

      // Salva sessão
      await this.saveSession(userId, site, domain, cookies, {
        localStorage,
        metadata: options?.metadata,
        expiresIn: options?.expiresIn,
      });

      logger.info({
        userId,
        site,
        cookiesCount: cookies.length,
      }, '📸 Sessão capturada');
    } catch (error: any) {
      logger.error({
        userId,
        site,
        error: error.message,
      }, '❌ Erro ao capturar sessão');

      throw error;
    }
  }

  /**
   * Remove sessão
   */
  async removeSession(userId: string, site: string): Promise<void> {
    try {
      await prisma.userSession.deleteMany({
        where: {
          userId,
          site,
        },
      });

      logger.info({ userId, site }, '🗑️ Sessão removida');
    } catch (error: any) {
      logger.error({
        userId,
        site,
        error: error.message,
      }, '❌ Erro ao remover sessão');
    }
  }

  /**
   * Remove sessões expiradas (limpeza)
   */
  async cleanExpiredSessions(): Promise<number> {
    try {
      const result = await prisma.userSession.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      if (result.count > 0) {
        logger.info({ count: result.count }, '🧹 Sessões expiradas removidas');
      }

      return result.count;
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Erro ao limpar sessões');
      return 0;
    }
  }

  /**
   * Criptografa dados usando cryptoManager centralizado (AES-256-GCM)
   */
  private encrypt(text: string): string {
    return cryptoManager.encrypt(text);
  }

  /**
   * Descriptografa dados usando cryptoManager centralizado (AES-256-GCM)
   */
  private decrypt(text: string): string {
    return cryptoManager.decrypt(text);
  }

  /**
   * Verifica se sessão está válida testando em uma página
   */
  async validateSession(
    page: Page,
    session: UserSession,
    validationFn: (page: Page) => Promise<boolean>
  ): Promise<boolean> {
    try {
      const context = page.context();
      await context.addCookies(session.cookies);

      const isValid = await validationFn(page);

      logger.debug({
        sessionId: session.id,
        isValid,
      }, '🔍 Sessão validada');

      return isValid;
    } catch (error: any) {
      logger.error({
        sessionId: session.id,
        error: error.message,
      }, '❌ Erro ao validar sessão');

      return false;
    }
  }
}

// Singleton
export const sessionManager = new SessionManager();

// Limpeza automática a cada 6 horas
setInterval(
  () => {
    sessionManager.cleanExpiredSessions().catch((error) => {
      logger.error({ error: error.message }, '❌ Erro na limpeza automática de sessões');
    });
  },
  6 * 60 * 60 * 1000
);

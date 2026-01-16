/**
 * ============================================================
 * SESSION MANAGER - Gerenciador de Sessões Persistentes
 * ============================================================
 *
 * Gerencia sessões de autenticação usando Playwright's
 * launchPersistentContext com userDataDir para persistência.
 *
 * Versão com armazenamento em arquivo (não requer migração DB).
 */

import { chromium, BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  AccountStatus,
  AccountConfig,
  AccountCredentials,
  AuthenticatedContext,
  AuthResult,
  AuthEventType,
  PageDetectionResult,
  SessionState,
  MFAType,
  SESSIONS_BASE_DIR,
  SESSIONS_BASE_DIR_DEV,
  CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_TIMEOUT,
  MAX_RENEW_ATTEMPTS,
  CircuitBreakerState,
  IAuthFlow,
} from './types';
import { cryptoManager } from './crypto-manager';
import { totpManager } from './totp-manager';
import { randomUA } from '../utils/user-agents';

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const getSessionsDir = (): string => {
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    return SESSIONS_BASE_DIR;
  }
  return SESSIONS_BASE_DIR_DEV;
};

const getAccountsFile = (): string => {
  return path.join(getSessionsDir(), 'accounts.json');
};

// ============================================================
// STORAGE DE CONTAS (arquivo JSON)
// ============================================================

interface AccountsStorage {
  accounts: Record<string, AccountConfig>;
  sessions: Record<string, SessionState>;
}

async function loadAccountsStorage(): Promise<AccountsStorage> {
  try {
    const filePath = getAccountsFile();
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { accounts: {}, sessions: {} };
  }
}

async function saveAccountsStorage(storage: AccountsStorage): Promise<void> {
  const filePath = getAccountsFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(storage, null, 2), 'utf-8');
}

// ============================================================
// REGISTRY DE AUTH FLOWS
// ============================================================

const authFlows: Map<string, IAuthFlow> = new Map();

export function registerAuthFlow(flow: IAuthFlow): void {
  authFlows.set(flow.siteId, flow);
  console.log(`AUTH_FLOW_REGISTERED: ${flow.siteId}`);
}

export function getAuthFlow(siteId: string): IAuthFlow | null {
  return authFlows.get(siteId) || null;
}

// ============================================================
// CLASSE PRINCIPAL
// ============================================================

class SessionManager {
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private activeContexts: Map<string, BrowserContext> = new Map();
  private locks: Map<string, Promise<any>> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const sessionsDir = getSessionsDir();
    console.log(`SESSION_MANAGER: Inicializando...`);
    console.log(`SESSION_MANAGER: Diretório: ${sessionsDir}`);

    try {
      await fs.mkdir(sessionsDir, { recursive: true });
    } catch (error: any) {
      console.error(`SESSION_MANAGER: Erro ao criar diretório: ${error.message}`);
    }

    await this.registerFlows();
    this.initialized = true;
    console.log(`SESSION_MANAGER: Inicializado`);
  }

  private async registerFlows(): Promise<void> {
    try {
      const { mercadoLivreAuthFlow } = await import('./flows/mercadolivre-flow');
      registerAuthFlow(mercadoLivreAuthFlow);
    } catch (error) {
      console.log('SESSION_MANAGER: Flow ML não disponível');
    }
  }

  /**
   * Obtém contexto autenticado
   */
  async getContext(site: string, accountId?: string): Promise<AuthenticatedContext> {
    await this.initialize();

    if (this.isCircuitOpen(site)) {
      throw new Error(`AUTH_CIRCUIT_OPEN: Site ${site} em circuit breaker`);
    }

    const storage = await loadAccountsStorage();
    const selectedAccountId = accountId || await this.selectAccount(site, storage);

    if (!selectedAccountId) {
      throw new Error(`AUTH_NO_ACCOUNT: Nenhuma conta para ${site}. Use scripts/auth/manage-accounts.ts add`);
    }

    const lockKey = `${site}:${selectedAccountId}`;
    if (this.locks.has(lockKey)) {
      await this.locks.get(lockKey);
    }

    const lockPromise = this.getContextInternal(site, selectedAccountId, storage);
    this.locks.set(lockKey, lockPromise);

    try {
      return await lockPromise;
    } finally {
      this.locks.delete(lockKey);
    }
  }

  private async getContextInternal(
    site: string,
    accountId: string,
    storage: AccountsStorage
  ): Promise<AuthenticatedContext> {
    this.logEvent('AUTH_LOAD', site, accountId);

    const account = storage.accounts[accountId];
    if (!account) {
      throw new Error(`AUTH_ACCOUNT_NOT_FOUND: ${accountId}`);
    }

    if (account.status === AccountStatus.BLOCKED || account.status === AccountStatus.DISABLED) {
      throw new Error(`AUTH_ACCOUNT_${account.status}: ${accountId}`);
    }

    const userDataDir = path.join(getSessionsDir(), site.toLowerCase(), accountId);
    await fs.mkdir(userDataDir, { recursive: true });

    // Lança contexto persistente
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
      userAgent: randomUA(),
      locale: 'pt-BR',
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    try {
      const flow = getAuthFlow(site);
      let isAuthenticated = false;

      if (flow) {
        // Navega para validação
        const config = this.getSiteConfig(site);
        await page.goto(config.validationUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        isAuthenticated = await flow.validateSession(page);
      }

      if (!isAuthenticated) {
        console.log(`AUTH_SESSION_INVALID: Renovando sessão...`);
        const result = await this.renewSession(page, site, account);

        if (!result.success) {
          await page.close();
          await context.close();

          // Atualiza status
          account.status = result.needsManualIntervention ? AccountStatus.NEEDS_REAUTH : AccountStatus.DEGRADED;
          account.statusMessage = result.error;
          account.consecutiveFailures++;
          account.lastFailureAt = new Date();
          storage.accounts[accountId] = account;
          await saveAccountsStorage(storage);

          throw new Error(`AUTH_RENEW_FAILED: ${result.error}`);
        }
      }

      await page.close();

      // Atualiza sucesso
      account.status = AccountStatus.OK;
      account.consecutiveFailures = 0;
      account.lastSuccessAt = new Date();
      storage.accounts[accountId] = account;
      await saveAccountsStorage(storage);

      this.logEvent('AUTH_OK', site, accountId);
      this.activeContexts.set(`${site}:${accountId}`, context);

      const sessionState: SessionState = {
        accountId,
        site,
        userDataDir,
        isAuthenticated: true,
        createdAt: new Date(),
        lastValidatedAt: new Date(),
      };

      return {
        context,
        accountId,
        site,
        sessionState,
        release: async () => {
          await this.releaseContext(`${site}:${accountId}`);
        },
        invalidate: async (reason: string) => {
          account.status = AccountStatus.DEGRADED;
          account.statusMessage = reason;
          storage.accounts[accountId] = account;
          await saveAccountsStorage(storage);
          await this.releaseContext(`${site}:${accountId}`);
        },
      };
    } catch (error: any) {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
      throw error;
    }
  }

  private async renewSession(page: any, site: string, account: AccountConfig): Promise<AuthResult> {
    const flow = getAuthFlow(site);
    if (!flow) {
      return { success: false, pageResult: PageDetectionResult.UNKNOWN, error: 'Flow não encontrado' };
    }

    this.logEvent('AUTH_RENEW_START', site, account.accountId);

    for (let attempt = 1; attempt <= MAX_RENEW_ATTEMPTS; attempt++) {
      try {
        const config = this.getSiteConfig(site);
        await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        const pageState = await flow.detectPageState(page);

        if (pageState === PageDetectionResult.LOGGED_IN) {
          this.logEvent('AUTH_RENEW_OK', site, account.accountId);
          return { success: true, pageResult: pageState };
        }

        if (pageState === PageDetectionResult.ACCOUNT_BLOCKED || pageState === PageDetectionResult.CHALLENGE) {
          return { success: false, pageResult: pageState, error: `Page state: ${pageState}`, needsManualIntervention: true };
        }

        const loginResult = await flow.performLogin(page, account.credentials);

        if (!loginResult.success && loginResult.pageResult === PageDetectionResult.MFA_REQUIRED) {
          if (account.mfaType === MFAType.TOTP && account.credentials.totpSecret) {
            const mfaResult = await flow.handleMFA(page, account);
            if (mfaResult.success) {
              this.logEvent('AUTH_RENEW_OK', site, account.accountId);
              return mfaResult;
            }
          }
          return { ...loginResult, needsManualIntervention: true };
        }

        if (loginResult.success) {
          await page.waitForTimeout(3000);
          const postState = await flow.detectPageState(page);

          if (postState === PageDetectionResult.LOGGED_IN || postState === PageDetectionResult.CONTENT_PAGE) {
            this.logEvent('AUTH_RENEW_OK', site, account.accountId);
            return { success: true, pageResult: postState };
          }

          if (postState === PageDetectionResult.MFA_REQUIRED && account.mfaType === MFAType.TOTP) {
            const mfaResult = await flow.handleMFA(page, account);
            if (mfaResult.success) {
              this.logEvent('AUTH_RENEW_OK', site, account.accountId);
            }
            return mfaResult;
          }
        }

        if (attempt < MAX_RENEW_ATTEMPTS) {
          await page.waitForTimeout(5000);
        }
      } catch (error: any) {
        if (attempt >= MAX_RENEW_ATTEMPTS) {
          this.logEvent('AUTH_RENEW_FAILED', site, account.accountId, { error: error.message });
          return { success: false, pageResult: PageDetectionResult.UNKNOWN, error: error.message };
        }
        await page.waitForTimeout(5000);
      }
    }

    return { success: false, pageResult: PageDetectionResult.UNKNOWN, error: 'Max attempts exceeded' };
  }

  private async selectAccount(site: string, storage: AccountsStorage): Promise<string | null> {
    const accounts = Object.values(storage.accounts)
      .filter(a => a.site === site && a.status !== AccountStatus.BLOCKED && a.status !== AccountStatus.DISABLED)
      .sort((a, b) => b.priority - a.priority || a.consecutiveFailures - b.consecutiveFailures);

    return accounts[0]?.accountId || null;
  }

  private getSiteConfig(site: string): { loginUrl: string; validationUrl: string } {
    const configs: Record<string, { loginUrl: string; validationUrl: string }> = {
      MERCADO_LIVRE: {
        loginUrl: 'https://www.mercadolivre.com.br/login',
        validationUrl: 'https://www.mercadolivre.com.br/',
      },
      SUPERBID: {
        loginUrl: 'https://www.superbid.net/login',
        validationUrl: 'https://www.superbid.net/',
      },
    };
    return configs[site] || { loginUrl: '', validationUrl: '' };
  }

  private isCircuitOpen(site: string): boolean {
    const state = this.circuitBreakers.get(site);
    if (!state?.isOpen) return false;
    if (state.openedAt && Date.now() - state.openedAt.getTime() > CIRCUIT_BREAKER_TIMEOUT) {
      state.isOpen = false;
      return false;
    }
    return true;
  }

  private async releaseContext(key: string): Promise<void> {
    const context = this.activeContexts.get(key);
    if (context) {
      try {
        await context.close();
      } catch {}
      this.activeContexts.delete(key);
    }
  }

  private logEvent(type: AuthEventType, site: string, accountId: string, details?: Record<string, any>): void {
    const masked = accountId.length > 8 ? `${accountId.slice(0, 4)}...${accountId.slice(-4)}` : accountId;
    console.log(`[${new Date().toISOString()}] ${type}: site=${site} account=${masked}${details ? ' ' + JSON.stringify(details) : ''}`);
  }

  async cleanup(): Promise<void> {
    for (const [, context] of this.activeContexts) {
      try { await context.close(); } catch {}
    }
    this.activeContexts.clear();
  }

  /**
   * Adiciona uma conta programaticamente
   */
  async addAccount(config: Omit<AccountConfig, 'accountId' | 'status' | 'consecutiveFailures'>): Promise<string> {
    const storage = await loadAccountsStorage();
    const accountId = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const account: AccountConfig = {
      ...config,
      accountId,
      status: AccountStatus.OK,
      consecutiveFailures: 0,
      credentials: {
        ...config.credentials,
        password: cryptoManager.encrypt(config.credentials.password),
        totpSecret: config.credentials.totpSecret ? cryptoManager.encrypt(config.credentials.totpSecret) : undefined,
      },
    };

    storage.accounts[accountId] = account;
    await saveAccountsStorage(storage);

    console.log(`AUTH_ACCOUNT_ADDED: ${accountId} for ${config.site}`);
    return accountId;
  }

  /**
   * Lista contas
   */
  async listAccounts(site?: string): Promise<AccountConfig[]> {
    const storage = await loadAccountsStorage();
    let accounts = Object.values(storage.accounts);
    if (site) {
      accounts = accounts.filter(a => a.site === site);
    }
    return accounts;
  }

  /**
   * Verifica se existe conta para um site
   */
  async hasAccountForSite(site: string): Promise<boolean> {
    const storage = await loadAccountsStorage();
    return Object.values(storage.accounts).some(a => a.site === site && a.status !== AccountStatus.BLOCKED);
  }
}

// Singleton
export const sessionManager = new SessionManager();

// Auto-init
sessionManager.initialize().catch(console.error);

// Cleanup
process.on('SIGINT', async () => { await sessionManager.cleanup(); process.exit(0); });
process.on('SIGTERM', async () => { await sessionManager.cleanup(); process.exit(0); });

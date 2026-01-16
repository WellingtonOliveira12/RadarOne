/**
 * ============================================================
 * AUTH MANAGER - Gerenciador de Autenticação por StorageState
 * ============================================================
 *
 * Gerencia sessões de autenticação usando storageState do Playwright.
 * Projetado para:
 * - Carregar sessões de arquivos locais ou variáveis de ambiente
 * - Validar se sessão ainda está ativa
 * - Detectar páginas que exigem login
 * - Suportar múltiplos sites
 *
 * Fluxo:
 * 1. Sessão gerada LOCALMENTE via script CLI (browser headful)
 * 2. storageState.json salvo e enviado para Render como Secret/env
 * 3. Worker carrega storageState no startup
 * 4. Scraper usa contexto autenticado
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getSiteAuthConfig, SiteAuthConfig } from '../config/auth-sites';
import { randomUA } from './user-agents';

// ============================================================
// CONFIGURAÇÕES
// ============================================================

/** Diretório para armazenar sessões */
const SESSIONS_DIR = process.env.SESSIONS_DIR || '/tmp/radarone-sessions';

/** Prefixo das variáveis de ambiente com sessões base64 */
const SESSION_ENV_PREFIX = 'SESSION_';

// ============================================================
// TIPOS
// ============================================================

export interface AuthState {
  loaded: boolean;
  path: string | null;
  source: 'file' | 'env' | 'none';
  siteId: string;
  isValid: boolean;
  expiresAt: Date | null;
  lastValidated: Date | null;
  error: string | null;
}

export interface AuthContextResult {
  context: BrowserContext;
  browser: Browser;
  authState: AuthState;
}

export interface SessionValidationResult {
  isLoggedIn: boolean;
  needsLogin: boolean;
  needsMFA: boolean;
  pageType: 'LOGGED_IN' | 'LOGIN_PAGE' | 'MFA_REQUIRED' | 'UNKNOWN';
  details: string;
}

// ============================================================
// CLASSE PRINCIPAL
// ============================================================

class AuthManager {
  private sessionCache: Map<string, AuthState> = new Map();

  /**
   * Inicializa o gerenciador de autenticação
   * Deve ser chamado no startup do worker
   */
  async initialize(): Promise<void> {
    console.log('AUTH_MANAGER: Inicializando...');

    // Garante que diretório de sessões existe
    try {
      await fs.mkdir(SESSIONS_DIR, { recursive: true });
      console.log(`AUTH_MANAGER: Diretório de sessões: ${SESSIONS_DIR}`);
    } catch (error: any) {
      console.error(`AUTH_MANAGER: Erro ao criar diretório: ${error.message}`);
    }

    // Carrega sessões de variáveis de ambiente (base64)
    await this.loadSessionsFromEnv();
  }

  /**
   * Carrega sessões de variáveis de ambiente BASE64
   * Formato: SESSION_MERCADO_LIVRE=base64_encoded_json
   */
  private async loadSessionsFromEnv(): Promise<void> {
    const envVars = Object.keys(process.env).filter(key =>
      key.startsWith(SESSION_ENV_PREFIX) && key !== 'SESSION_ENCRYPTION_KEY'
    );

    for (const envVar of envVars) {
      const siteId = envVar.replace(SESSION_ENV_PREFIX, '');
      const base64Value = process.env[envVar];

      if (!base64Value) continue;

      try {
        // Decodifica base64
        const jsonContent = Buffer.from(base64Value, 'base64').toString('utf-8');

        // Valida se é JSON válido
        JSON.parse(jsonContent);

        // Salva em arquivo
        const sessionPath = path.join(SESSIONS_DIR, `${siteId.toLowerCase()}.json`);
        await fs.writeFile(sessionPath, jsonContent, 'utf-8');

        console.log(`AUTH_MANAGER: Sessão ${siteId} carregada de env var para ${sessionPath}`);

        // Atualiza cache
        this.sessionCache.set(siteId, {
          loaded: true,
          path: sessionPath,
          source: 'env',
          siteId,
          isValid: true, // Assume válido, será validado no uso
          expiresAt: null,
          lastValidated: null,
          error: null,
        });
      } catch (error: any) {
        console.error(`AUTH_MANAGER: Erro ao carregar sessão ${siteId} de env: ${error.message}`);
      }
    }
  }

  /**
   * Obtém o caminho do arquivo de sessão para um site
   */
  getSessionPath(siteId: string): string {
    return path.join(SESSIONS_DIR, `${siteId.toLowerCase()}.json`);
  }

  /**
   * Verifica se existe sessão para um site
   */
  async hasSession(siteId: string): Promise<boolean> {
    const sessionPath = this.getSessionPath(siteId);
    try {
      await fs.access(sessionPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtém estado da autenticação para um site
   */
  async getAuthState(siteId: string): Promise<AuthState> {
    // Verifica cache
    const cached = this.sessionCache.get(siteId);
    if (cached) {
      return cached;
    }

    const sessionPath = this.getSessionPath(siteId);

    try {
      await fs.access(sessionPath);

      const state: AuthState = {
        loaded: true,
        path: sessionPath,
        source: 'file',
        siteId,
        isValid: true,
        expiresAt: null,
        lastValidated: null,
        error: null,
      };

      this.sessionCache.set(siteId, state);
      return state;
    } catch {
      return {
        loaded: false,
        path: null,
        source: 'none',
        siteId,
        isValid: false,
        expiresAt: null,
        lastValidated: null,
        error: 'Sessão não encontrada',
      };
    }
  }

  /**
   * Obtém contexto autenticado do Playwright para um site
   */
  async getAuthenticatedContext(siteId: string): Promise<AuthContextResult> {
    const config = getSiteAuthConfig(siteId);
    if (!config) {
      throw new Error(`AUTH_MANAGER: Site não suportado: ${siteId}`);
    }

    const authState = await this.getAuthState(siteId);

    console.log(`AUTH_STATE: siteId=${siteId} loaded=${authState.loaded} source=${authState.source} path=${authState.path}`);

    // Lança browser
    const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    });

    let context: BrowserContext;

    if (authState.loaded && authState.path) {
      // Carrega contexto com storageState
      try {
        context = await browser.newContext({
          storageState: authState.path,
          userAgent: randomUA(),
          locale: 'pt-BR',
          viewport: { width: 1920, height: 1080 },
        });

        console.log(`AUTH_CONTEXT: Contexto criado com storageState de ${authState.path}`);
      } catch (error: any) {
        console.error(`AUTH_CONTEXT_ERROR: Falha ao carregar storageState: ${error.message}`);

        // Fallback: cria contexto sem autenticação
        context = await browser.newContext({
          userAgent: randomUA(),
          locale: 'pt-BR',
          viewport: { width: 1920, height: 1080 },
        });

        authState.loaded = false;
        authState.error = error.message;
      }
    } else {
      // Cria contexto sem autenticação
      context = await browser.newContext({
        userAgent: randomUA(),
        locale: 'pt-BR',
        viewport: { width: 1920, height: 1080 },
      });

      console.log(`AUTH_CONTEXT: Contexto criado SEM autenticação (sessão não encontrada)`);
    }

    return {
      context,
      browser,
      authState,
    };
  }

  /**
   * Valida se a sessão ainda está ativa
   */
  async validateSession(
    page: Page,
    siteId: string
  ): Promise<SessionValidationResult> {
    const config = getSiteAuthConfig(siteId);
    if (!config) {
      return {
        isLoggedIn: false,
        needsLogin: true,
        needsMFA: false,
        pageType: 'UNKNOWN',
        details: `Site não configurado: ${siteId}`,
      };
    }

    const bodyText = await page.evaluate(() =>
      document.body?.innerText?.toLowerCase() || ''
    );

    // Verifica se está logado
    for (const selector of config.loggedInSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          console.log(`AUTH_VALIDATE: Logado detectado via ${selector}`);
          return {
            isLoggedIn: true,
            needsLogin: false,
            needsMFA: false,
            pageType: 'LOGGED_IN',
            details: `Elemento encontrado: ${selector}`,
          };
        }
      } catch {
        // Continua verificando
      }
    }

    // Verifica se precisa de MFA
    if (config.mayRequireMFA) {
      // Verifica seletores de MFA
      for (const selector of config.mfaSelectors || []) {
        try {
          const element = await page.$(selector);
          if (element) {
            console.log(`AUTH_MFA_DETECTED: Seletor ${selector}`);
            return {
              isLoggedIn: false,
              needsLogin: false,
              needsMFA: true,
              pageType: 'MFA_REQUIRED',
              details: `MFA necessário: ${selector}`,
            };
          }
        } catch {
          // Continua verificando
        }
      }

      // Verifica textos de MFA
      for (const text of config.mfaTexts || []) {
        if (bodyText.includes(text)) {
          console.log(`AUTH_MFA_DETECTED: Texto "${text}"`);
          return {
            isLoggedIn: false,
            needsLogin: false,
            needsMFA: true,
            pageType: 'MFA_REQUIRED',
            details: `MFA necessário: texto "${text}"`,
          };
        }
      }
    }

    // Verifica se é página de login
    for (const selector of config.loginPageSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          console.log(`AUTH_LOGIN_PAGE: Seletor ${selector}`);
          return {
            isLoggedIn: false,
            needsLogin: true,
            needsMFA: false,
            pageType: 'LOGIN_PAGE',
            details: `Página de login: ${selector}`,
          };
        }
      } catch {
        // Continua verificando
      }
    }

    // Verifica textos que indicam necessidade de login
    for (const text of config.loginRequiredTexts) {
      if (bodyText.includes(text)) {
        console.log(`AUTH_LOGIN_REQUIRED: Texto "${text}"`);
        return {
          isLoggedIn: false,
          needsLogin: true,
          needsMFA: false,
          pageType: 'LOGIN_PAGE',
          details: `Login necessário: texto "${text}"`,
        };
      }
    }

    // Não conseguiu determinar
    return {
      isLoggedIn: false,
      needsLogin: false,
      needsMFA: false,
      pageType: 'UNKNOWN',
      details: 'Não foi possível determinar estado de autenticação',
    };
  }

  /**
   * Detecta se página atual exige login
   */
  async detectLoginRequired(page: Page, siteId: string): Promise<boolean> {
    const config = getSiteAuthConfig(siteId);
    if (!config) return false;

    const bodyText = await page.evaluate(() =>
      document.body?.innerText?.toLowerCase() || ''
    );

    // Verifica textos de login obrigatório
    for (const text of config.loginRequiredTexts) {
      if (bodyText.includes(text)) {
        return true;
      }
    }

    // Verifica seletores de página de login
    for (const selector of config.loginPageSelectors) {
      try {
        const element = await page.$(selector);
        if (element) return true;
      } catch {
        // Continua verificando
      }
    }

    return false;
  }

  /**
   * Detecta se página requer MFA/OTP
   */
  async detectMFARequired(page: Page, siteId: string): Promise<boolean> {
    const config = getSiteAuthConfig(siteId);
    if (!config || !config.mayRequireMFA) return false;

    const bodyText = await page.evaluate(() =>
      document.body?.innerText?.toLowerCase() || ''
    );

    // Verifica textos de MFA
    for (const text of config.mfaTexts || []) {
      if (bodyText.includes(text)) {
        return true;
      }
    }

    // Verifica seletores de MFA
    for (const selector of config.mfaSelectors || []) {
      try {
        const element = await page.$(selector);
        if (element) return true;
      } catch {
        // Continua verificando
      }
    }

    return false;
  }

  /**
   * Salva storageState do contexto atual
   * Usado pelos scripts CLI para gerar sessão
   */
  async saveStorageState(context: BrowserContext, siteId: string): Promise<string> {
    const sessionPath = this.getSessionPath(siteId);

    await context.storageState({ path: sessionPath });

    console.log(`AUTH_SAVE: StorageState salvo em ${sessionPath}`);

    // Atualiza cache
    this.sessionCache.set(siteId, {
      loaded: true,
      path: sessionPath,
      source: 'file',
      siteId,
      isValid: true,
      expiresAt: null,
      lastValidated: new Date(),
      error: null,
    });

    return sessionPath;
  }

  /**
   * Converte storageState para base64 (para env var)
   */
  async getStorageStateBase64(siteId: string): Promise<string | null> {
    const sessionPath = this.getSessionPath(siteId);

    try {
      const content = await fs.readFile(sessionPath, 'utf-8');
      return Buffer.from(content).toString('base64');
    } catch {
      return null;
    }
  }

  /**
   * Remove sessão de um site
   */
  async removeSession(siteId: string): Promise<void> {
    const sessionPath = this.getSessionPath(siteId);

    try {
      await fs.unlink(sessionPath);
      this.sessionCache.delete(siteId);
      console.log(`AUTH_REMOVE: Sessão ${siteId} removida`);
    } catch (error: any) {
      console.log(`AUTH_REMOVE: Sessão ${siteId} não encontrada`);
    }
  }

  /**
   * Lista todas as sessões disponíveis
   */
  async listSessions(): Promise<AuthState[]> {
    const sessions: AuthState[] = [];

    try {
      const files = await fs.readdir(SESSIONS_DIR);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const siteId = file.replace('.json', '').toUpperCase();
          const state = await this.getAuthState(siteId);
          sessions.push(state);
        }
      }
    } catch {
      // Diretório não existe ou vazio
    }

    return sessions;
  }

  /**
   * Marca sessão como expirada/inválida
   */
  markSessionExpired(siteId: string, reason: string): void {
    const state = this.sessionCache.get(siteId);
    if (state) {
      state.isValid = false;
      state.error = reason;
      this.sessionCache.set(siteId, state);
    }

    console.log(`AUTH_EXPIRED: siteId=${siteId} reason=${reason}`);
  }
}

// Singleton
export const authManager = new AuthManager();

// ============================================================
// HELPERS PARA USO NO SCRAPER
// ============================================================

/**
 * Helper: Obtém contexto autenticado ou lança erro claro
 */
export async function getAuthenticatedContextOrFail(
  siteId: string
): Promise<AuthContextResult> {
  const result = await authManager.getAuthenticatedContext(siteId);

  if (!result.authState.loaded) {
    throw new Error(
      `AUTH_NO_SESSION: Nenhuma sessão encontrada para ${siteId}. ` +
      `Execute o script de geração de sessão localmente e configure no Render.`
    );
  }

  return result;
}

/**
 * Helper: Verifica e trata LOGIN_REQUIRED
 */
export async function handleLoginRequired(
  page: Page,
  siteId: string
): Promise<{ shouldRetry: boolean; error: string | null }> {
  const isLoginRequired = await authManager.detectLoginRequired(page, siteId);

  if (!isLoginRequired) {
    return { shouldRetry: false, error: null };
  }

  // Verifica se é MFA
  const isMFA = await authManager.detectMFARequired(page, siteId);

  if (isMFA) {
    authManager.markSessionExpired(siteId, 'MFA_REQUIRED');
    return {
      shouldRetry: false,
      error: `AUTH_MFA_REQUIRED: Site ${siteId} está solicitando autenticação de dois fatores. ` +
             `Gere uma nova sessão localmente com scripts/generate-session.ts`,
    };
  }

  // Sessão expirou
  authManager.markSessionExpired(siteId, 'SESSION_EXPIRED');
  return {
    shouldRetry: false,
    error: `AUTH_SESSION_EXPIRED: Sessão do ${siteId} expirou. ` +
           `Gere uma nova sessão localmente com scripts/generate-session.ts`,
  };
}

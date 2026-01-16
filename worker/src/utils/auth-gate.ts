/**
 * ============================================================
 * AUTH GATE - Padrao de Autenticacao para Scrapers
 * ============================================================
 *
 * Fornece um padrao unificado para:
 * - Detectar quando um site exige login
 * - Carregar sessoes de storageState
 * - Gerenciar fallback e backoff
 *
 * USO:
 * 1. Configure a env var {SITE}_STORAGE_STATE_B64 com o storageState em base64
 * 2. Ou use {SITE}_STORAGE_STATE_PATH para caminho do arquivo
 * 3. No scraper, use authGate.withAuth(site, async (context) => { ... })
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUA } from './user-agents';
import { siteSessionManager, SiteId, detectAuthError } from './site-session-manager';
import { logger } from './logger';

// ============================================================
// TIPOS
// ============================================================

export interface AuthGateConfig {
  site: SiteId;
  envVarBase64: string;
  envVarPath: string;
  secretFilePaths: string[];
  validationUrl?: string;
}

export interface AuthContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  isAuthenticated: boolean;
  source: 'env_base64' | 'secret_file' | 'session_manager' | 'none';
}

export interface AuthGateResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  authSource: string;
}

// ============================================================
// CONFIGURACOES DE SITES
// ============================================================

const SITE_CONFIGS: Record<SiteId, AuthGateConfig> = {
  MERCADO_LIVRE: {
    site: 'MERCADO_LIVRE',
    envVarBase64: 'ML_STORAGE_STATE_B64',
    envVarPath: 'ML_STORAGE_STATE_PATH',
    secretFilePaths: [
      '/etc/secrets/ml-storage-state.json',
      '/etc/secrets/mercadolivre-storage-state.json',
      '/var/data/sessions/mercadolivre.json',
    ],
    validationUrl: 'https://www.mercadolivre.com.br/minha-conta',
  },
  OLX: {
    site: 'OLX',
    envVarBase64: 'OLX_STORAGE_STATE_B64',
    envVarPath: 'OLX_STORAGE_STATE_PATH',
    secretFilePaths: ['/etc/secrets/olx-storage-state.json'],
  },
  WEBMOTORS: {
    site: 'WEBMOTORS',
    envVarBase64: 'WEBMOTORS_STORAGE_STATE_B64',
    envVarPath: 'WEBMOTORS_STORAGE_STATE_PATH',
    secretFilePaths: ['/etc/secrets/webmotors-storage-state.json'],
  },
  ICARROS: {
    site: 'ICARROS',
    envVarBase64: 'ICARROS_STORAGE_STATE_B64',
    envVarPath: 'ICARROS_STORAGE_STATE_PATH',
    secretFilePaths: ['/etc/secrets/icarros-storage-state.json'],
  },
  ZAP_IMOVEIS: {
    site: 'ZAP_IMOVEIS',
    envVarBase64: 'ZAP_STORAGE_STATE_B64',
    envVarPath: 'ZAP_STORAGE_STATE_PATH',
    secretFilePaths: ['/etc/secrets/zap-storage-state.json'],
  },
  VIVA_REAL: {
    site: 'VIVA_REAL',
    envVarBase64: 'VIVAREAL_STORAGE_STATE_B64',
    envVarPath: 'VIVAREAL_STORAGE_STATE_PATH',
    secretFilePaths: ['/etc/secrets/vivareal-storage-state.json'],
  },
  IMOVELWEB: {
    site: 'IMOVELWEB',
    envVarBase64: 'IMOVELWEB_STORAGE_STATE_B64',
    envVarPath: 'IMOVELWEB_STORAGE_STATE_PATH',
    secretFilePaths: ['/etc/secrets/imovelweb-storage-state.json'],
  },
  LEILAO: {
    site: 'LEILAO',
    envVarBase64: 'LEILAO_STORAGE_STATE_B64',
    envVarPath: 'LEILAO_STORAGE_STATE_PATH',
    secretFilePaths: ['/etc/secrets/leilao-storage-state.json'],
  },
};

// ============================================================
// HELPERS
// ============================================================

const TEMP_SESSIONS_DIR = process.env.SESSIONS_DIR || '/tmp/radarone-sessions';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isValidStorageState(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return typeof parsed === 'object' && Array.isArray(parsed.cookies);
  } catch {
    return false;
  }
}

// ============================================================
// AUTH GATE CLASS
// ============================================================

class AuthGate {
  /**
   * Obtem configuracao de um site
   */
  getConfig(site: SiteId): AuthGateConfig {
    return SITE_CONFIGS[site];
  }

  /**
   * Carrega storageState para um site (cascata de prioridades)
   */
  async loadStorageState(site: SiteId): Promise<{ path: string | null; source: string }> {
    const config = SITE_CONFIGS[site];
    if (!config) {
      return { path: null, source: 'none' };
    }

    // 1. Verifica ENV path
    const envPath = process.env[config.envVarPath];
    if (envPath && await fileExists(envPath)) {
      const content = await fs.readFile(envPath, 'utf-8');
      if (isValidStorageState(content)) {
        logger.debug({ site, source: 'env_path' }, 'AUTH_GATE: StorageState carregado de ENV path');
        return { path: envPath, source: 'env_path' };
      }
    }

    // 2. Verifica Secret Files
    for (const secretPath of config.secretFilePaths) {
      if (await fileExists(secretPath)) {
        const content = await fs.readFile(secretPath, 'utf-8');
        if (isValidStorageState(content)) {
          logger.debug({ site, source: 'secret_file', path: secretPath }, 'AUTH_GATE: StorageState carregado de Secret File');
          return { path: secretPath, source: 'secret_file' };
        }
      }
    }

    // 3. Verifica ENV base64
    const base64Value = process.env[config.envVarBase64];
    if (base64Value) {
      try {
        const jsonContent = Buffer.from(base64Value, 'base64').toString('utf-8');
        if (isValidStorageState(jsonContent)) {
          await fs.mkdir(TEMP_SESSIONS_DIR, { recursive: true });
          const sessionPath = path.join(TEMP_SESSIONS_DIR, `${site.toLowerCase()}-from-env.json`);
          await fs.writeFile(sessionPath, jsonContent, 'utf-8');
          logger.debug({ site, source: 'env_base64' }, 'AUTH_GATE: StorageState decodificado de ENV base64');
          return { path: sessionPath, source: 'env_base64' };
        }
      } catch (e: any) {
        logger.warn({ site, error: e.message }, 'AUTH_GATE: Erro ao decodificar base64');
      }
    }

    return { path: null, source: 'none' };
  }

  /**
   * Cria contexto autenticado para um site
   */
  async createContext(site: SiteId): Promise<AuthContext> {
    const storage = await this.loadStorageState(site);

    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const userAgent = randomUA();
    let context: BrowserContext;
    let isAuthenticated = false;

    if (storage.path) {
      try {
        context = await browser.newContext({
          storageState: storage.path,
          userAgent,
          locale: 'pt-BR',
          viewport: { width: 1920, height: 1080 },
        });
        isAuthenticated = true;
        logger.info({ site, source: storage.source }, 'AUTH_GATE: Contexto criado com autenticacao');
      } catch (e: any) {
        logger.warn({ site, error: e.message }, 'AUTH_GATE: Falha ao carregar storageState, usando anonimo');
        context = await browser.newContext({
          userAgent,
          locale: 'pt-BR',
          viewport: { width: 1920, height: 1080 },
        });
      }
    } else {
      context = await browser.newContext({
        userAgent,
        locale: 'pt-BR',
        viewport: { width: 1920, height: 1080 },
      });
      logger.debug({ site }, 'AUTH_GATE: Contexto criado sem autenticacao');
    }

    // Bloqueia recursos desnecessarios
    await context.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2}', route => route.abort());

    const page = await context.newPage();

    return {
      browser,
      context,
      page,
      isAuthenticated,
      source: storage.source as any,
    };
  }

  /**
   * Executa operacao com autenticacao e gerenciamento de erros
   */
  async withAuth<T>(
    site: SiteId,
    operation: (context: AuthContext) => Promise<T>
  ): Promise<AuthGateResult<T>> {
    // Verifica se site esta em backoff
    const canUse = siteSessionManager.canUseSite(site);
    if (!canUse.canUse) {
      return {
        success: false,
        error: `Site em backoff: ${canUse.reason}`,
        authSource: 'backoff',
      };
    }

    let authContext: AuthContext | null = null;

    try {
      authContext = await this.createContext(site);

      const result = await operation(authContext);

      // Marca sucesso
      siteSessionManager.markSuccess(site);

      return {
        success: true,
        data: result,
        authSource: authContext.source,
      };
    } catch (error: any) {
      // Detecta e marca erro
      const authError = detectAuthError(error);
      siteSessionManager.markError(site, authError.type, authError.reason);

      return {
        success: false,
        error: error.message,
        authSource: authContext?.source || 'none',
      };
    } finally {
      // Cleanup
      if (authContext) {
        try { await authContext.page.close(); } catch {}
        try { await authContext.context.close(); } catch {}
        try { await authContext.browser.close(); } catch {}
      }
    }
  }

  /**
   * Verifica se um site tem sessao configurada
   */
  async hasSession(site: SiteId): Promise<boolean> {
    const storage = await this.loadStorageState(site);
    return storage.path !== null;
  }

  /**
   * Lista sites com sessao configurada
   */
  async listConfiguredSites(): Promise<{ site: SiteId; source: string }[]> {
    const result: { site: SiteId; source: string }[] = [];

    for (const site of Object.keys(SITE_CONFIGS) as SiteId[]) {
      const storage = await this.loadStorageState(site);
      if (storage.path) {
        result.push({ site, source: storage.source });
      }
    }

    return result;
  }
}

// Singleton
export const authGate = new AuthGate();

// ============================================================
// ERROS TIPADOS
// ============================================================

export class AuthRequiredError extends Error {
  constructor(public site: SiteId, public reason: string) {
    super(`AUTH_REQUIRED: ${site} - ${reason}`);
    this.name = 'AuthRequiredError';
  }
}

export class ChallengeDetectedError extends Error {
  constructor(public site: SiteId, public reason: string) {
    super(`CHALLENGE_DETECTED: ${site} - ${reason}`);
    this.name = 'ChallengeDetectedError';
  }
}

export class SiteBlockedError extends Error {
  constructor(public site: SiteId, public reason: string) {
    super(`SITE_BLOCKED: ${site} - ${reason}`);
    this.name = 'SiteBlockedError';
  }
}

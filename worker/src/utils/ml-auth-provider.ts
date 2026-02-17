/**
 * ============================================================
 * ML AUTH PROVIDER - Provedor de Autenticacao para Mercado Livre
 * ============================================================
 *
 * Centraliza a logica de carregamento de sessao do Mercado Livre
 * com fallback em cascata:
 *
 * Prioridade 0: Sessao do banco de dados (UserSession por userId)
 * Prioridade A: Secret File path via ML_STORAGE_STATE_PATH
 * Prioridade B: ENV base64 via ML_STORAGE_STATE_B64 ou SESSION_MERCADO_LIVRE
 * Prioridade C: Session manager existente (userDataDir se USE_SESSION_MANAGER=true)
 * Fallback: contexto anonimo
 */

import { Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUA } from './user-agents';
import { userSessionService } from '../services/user-session-service';
import { browserManager } from '../engine/browser-manager';

// ============================================================
// CONFIGURACOES
// ============================================================

const SITE_ID = 'MERCADO_LIVRE';

/** Diretorio temporario para storageState decodificado */
const TEMP_SESSIONS_DIR = process.env.SESSIONS_DIR || '/tmp/radarone-sessions';

/** Caminhos de Secret File no Render */
const SECRET_FILE_PATHS = [
  '/etc/secrets/ml-storage-state.json',
  '/etc/secrets/mercadolivre-storage-state.json',
  '/var/data/sessions/mercadolivre.json',
];

// ============================================================
// TIPOS
// ============================================================

export interface MLAuthState {
  loaded: boolean;
  path: string | null;
  source: 'database' | 'secret_file' | 'env_base64' | 'session_manager' | 'none';
  error: string | null;
  userId?: string;
  sessionId?: string;
  storageStateJson?: string; // Para quando vem do banco
}

export interface MLAuthContextResult {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  authState: MLAuthState;
  cleanup: () => Promise<void>;
}

// ============================================================
// FUNCOES DE DETECCAO
// ============================================================

/**
 * Verifica se um arquivo existe e e legivel
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Valida se o conteudo e um storageState valido do Playwright
 */
function isValidStorageState(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    // storageState deve ter cookies e origins
    return (
      typeof parsed === 'object' &&
      Array.isArray(parsed.cookies) &&
      Array.isArray(parsed.origins)
    );
  } catch {
    return false;
  }
}

// ============================================================
// PRIORIDADE 0: Database (UserSession por userId)
// ============================================================

async function tryLoadFromDatabase(userId?: string): Promise<MLAuthState> {
  if (!userId) {
    return { loaded: false, path: null, source: 'none', error: null };
  }

  console.log(`ML_AUTH_PROVIDER: Verificando sessão no banco para userId=${userId.slice(0, 8)}...`);

  try {
    const result = await userSessionService.getUserContext(userId, SITE_ID);

    if (result.success && result.context) {
      console.log(`ML_AUTH_PROVIDER: [PRIORITY 0] Sessão encontrada no banco para userId`);

      // Precisamos do storageState raw para usar no contexto
      // Busca direto do banco para extrair o JSON
      const { prisma } = await import('../lib/prisma');
      const { cryptoManager } = await import('../auth/crypto-manager');

      const session = await prisma.userSession.findFirst({
        where: {
          userId,
          site: SITE_ID,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          encryptedStorageState: true,
        },
      });

      if (session?.encryptedStorageState) {
        const storageStateJson = cryptoManager.decrypt(session.encryptedStorageState);

        // Cleanup do contexto criado pelo userSessionService (vamos criar um novo)
        await result.cleanup();

        return {
          loaded: true,
          path: 'DATABASE',
          source: 'database',
          error: null,
          userId,
          sessionId: session.id,
          storageStateJson,
        };
      }

      await result.cleanup();
    }

    // Se não deu certo, tenta marcar como needs_reauth se existe
    if (result.needsUserAction && result.status === 'NEEDS_REAUTH') {
      console.log(`ML_AUTH_PROVIDER: Sessão do banco precisa de reautenticação`);
      return {
        loaded: false,
        path: null,
        source: 'none',
        error: `Sessão do usuário precisa de reautenticação: ${result.error}`,
        userId,
        sessionId: result.sessionId,
      };
    }

    return { loaded: false, path: null, source: 'none', error: null };
  } catch (e: any) {
    console.log(`ML_AUTH_PROVIDER: Erro ao buscar sessão do banco: ${e.message}`);
    return { loaded: false, path: null, source: 'none', error: null };
  }
}

// ============================================================
// PRIORIDADE A: Secret File
// ============================================================

async function tryLoadFromSecretFile(): Promise<MLAuthState> {
  // 1. Primeiro verifica ML_STORAGE_STATE_PATH explicitamente configurado
  const envPath = process.env.ML_STORAGE_STATE_PATH;
  if (envPath) {
    console.log(`ML_AUTH_PROVIDER: Verificando ML_STORAGE_STATE_PATH=${envPath}`);
    if (await fileExists(envPath)) {
      try {
        const content = await fs.readFile(envPath, 'utf-8');
        if (isValidStorageState(content)) {
          console.log(`ML_AUTH_PROVIDER: [PRIORITY A] Secret File valido em ${envPath}`);
          return {
            loaded: true,
            path: envPath,
            source: 'secret_file',
            error: null,
          };
        } else {
          console.log(`ML_AUTH_PROVIDER: Secret File em ${envPath} nao e storageState valido`);
        }
      } catch (e: any) {
        console.log(`ML_AUTH_PROVIDER: Erro ao ler ${envPath}: ${e.message}`);
      }
    } else {
      console.log(`ML_AUTH_PROVIDER: Arquivo nao encontrado: ${envPath}`);
    }
  }

  // 2. Verifica caminhos padrao de Secret File
  for (const secretPath of SECRET_FILE_PATHS) {
    if (await fileExists(secretPath)) {
      try {
        const content = await fs.readFile(secretPath, 'utf-8');
        if (isValidStorageState(content)) {
          console.log(`ML_AUTH_PROVIDER: [PRIORITY A] Secret File valido em ${secretPath}`);
          return {
            loaded: true,
            path: secretPath,
            source: 'secret_file',
            error: null,
          };
        }
      } catch (e: any) {
        console.log(`ML_AUTH_PROVIDER: Erro ao ler ${secretPath}: ${e.message}`);
      }
    }
  }

  return { loaded: false, path: null, source: 'none', error: null };
}

// ============================================================
// PRIORIDADE B: ENV base64
// ============================================================

async function tryLoadFromEnvBase64(): Promise<MLAuthState> {
  // Verifica ML_STORAGE_STATE_B64 ou SESSION_MERCADO_LIVRE
  const base64Value = process.env.ML_STORAGE_STATE_B64 || process.env.SESSION_MERCADO_LIVRE;

  if (!base64Value) {
    return { loaded: false, path: null, source: 'none', error: null };
  }

  const envVarName = process.env.ML_STORAGE_STATE_B64 ? 'ML_STORAGE_STATE_B64' : 'SESSION_MERCADO_LIVRE';
  console.log(`ML_AUTH_PROVIDER: Verificando ${envVarName} (${base64Value.length} chars)`);

  try {
    // Decodifica base64
    const jsonContent = Buffer.from(base64Value, 'base64').toString('utf-8');

    // Valida JSON
    if (!isValidStorageState(jsonContent)) {
      console.log(`ML_AUTH_PROVIDER: ${envVarName} decodificado mas nao e storageState valido`);
      return {
        loaded: false,
        path: null,
        source: 'none',
        error: `${envVarName} nao e storageState valido`,
      };
    }

    // Salva em arquivo temporario
    await fs.mkdir(TEMP_SESSIONS_DIR, { recursive: true });
    const sessionPath = path.join(TEMP_SESSIONS_DIR, 'mercadolivre-from-env.json');
    await fs.writeFile(sessionPath, jsonContent, 'utf-8');

    console.log(`ML_AUTH_PROVIDER: [PRIORITY B] ENV base64 decodificado para ${sessionPath}`);

    return {
      loaded: true,
      path: sessionPath,
      source: 'env_base64',
      error: null,
    };
  } catch (e: any) {
    console.log(`ML_AUTH_PROVIDER: Erro ao decodificar ${envVarName}: ${e.message}`);
    return {
      loaded: false,
      path: null,
      source: 'none',
      error: `Erro ao decodificar ${envVarName}: ${e.message}`,
    };
  }
}

// ============================================================
// PRIORIDADE C: Session Manager (userDataDir)
// ============================================================

async function tryLoadFromSessionManager(): Promise<MLAuthState> {
  // So usa se USE_SESSION_MANAGER=true
  if (process.env.USE_SESSION_MANAGER !== 'true') {
    return { loaded: false, path: null, source: 'none', error: null };
  }

  // Verifica se existe sessao no session manager
  const sessionsDir = process.env.NODE_ENV === 'production' || process.env.RENDER
    ? '/var/data/sessions'
    : '/tmp/radarone-sessions';

  const accountsPath = path.join(sessionsDir, 'accounts.json');

  try {
    const content = await fs.readFile(accountsPath, 'utf-8');
    const storage = JSON.parse(content);

    // Verifica se existe conta para MERCADO_LIVRE
    const mlAccounts = Object.values(storage.accounts || {}).filter(
      (a: any) => a.site === SITE_ID && a.status !== 'BLOCKED' && a.status !== 'DISABLED'
    );

    if (mlAccounts.length > 0) {
      console.log(`ML_AUTH_PROVIDER: [PRIORITY C] Session Manager tem ${mlAccounts.length} conta(s) para ML`);
      // Retorna path especial indicando uso do session manager
      return {
        loaded: true,
        path: 'SESSION_MANAGER',
        source: 'session_manager',
        error: null,
      };
    }
  } catch {
    // Arquivo nao existe ou erro de parse
  }

  return { loaded: false, path: null, source: 'none', error: null };
}

// ============================================================
// FUNCAO PRINCIPAL: getMLAuthState
// ============================================================

/**
 * Obtem o estado de autenticacao do ML seguindo a cascata de prioridades
 * @param userId - ID do usuário (opcional). Se fornecido, tenta primeiro buscar sessão do banco.
 */
export async function getMLAuthState(userId?: string): Promise<MLAuthState> {
  console.log('ML_AUTH_PROVIDER: Verificando fontes de autenticacao...');
  if (userId) {
    console.log(`ML_AUTH_PROVIDER: userId fornecido: ${userId.slice(0, 8)}...`);
  }

  // Prioridade 0: Database (se userId fornecido)
  if (userId) {
    const databaseState = await tryLoadFromDatabase(userId);
    if (databaseState.loaded) {
      return databaseState;
    }
    // Se não encontrou mas tem erro específico de NEEDS_REAUTH, propaga
    if (databaseState.error?.includes('reautenticação')) {
      return databaseState;
    }
  }

  // Prioridade A: Secret File
  const secretFileState = await tryLoadFromSecretFile();
  if (secretFileState.loaded) {
    return secretFileState;
  }

  // Prioridade B: ENV base64
  const envBase64State = await tryLoadFromEnvBase64();
  if (envBase64State.loaded) {
    return envBase64State;
  }

  // Prioridade C: Session Manager
  const sessionManagerState = await tryLoadFromSessionManager();
  if (sessionManagerState.loaded) {
    return sessionManagerState;
  }

  // Nenhuma fonte disponivel
  console.log('ML_AUTH_PROVIDER: Nenhuma sessao de autenticacao encontrada');
  console.log('ML_AUTH_PROVIDER: Opcoes para configurar:');
  console.log('  0. Conectar conta via UI (sessão no banco por userId)');
  console.log('  1. ML_STORAGE_STATE_PATH: caminho para arquivo storageState.json');
  console.log('  2. ML_STORAGE_STATE_B64: storageState em base64');
  console.log('  3. SESSION_MERCADO_LIVRE: storageState em base64 (legado)');
  console.log('  4. USE_SESSION_MANAGER=true + conta via manage-accounts.ts');

  return {
    loaded: false,
    path: null,
    source: 'none',
    error: userId
      ? 'ML_LOGIN_REQUIRED_NO_SESSION'
      : 'Nenhuma fonte de autenticacao configurada',
    userId,
  };
}

// ============================================================
// FUNCAO PRINCIPAL: getMLAuthenticatedContext
// ============================================================

/**
 * Obtem contexto autenticado do Playwright para Mercado Livre
 *
 * Se houver sessao configurada, usa storageState
 * Caso contrario, retorna contexto anonimo
 *
 * @param userId - ID do usuário (opcional). Se fornecido, tenta primeiro buscar sessão do banco.
 */
export async function getMLAuthenticatedContext(userId?: string): Promise<MLAuthContextResult> {
  const authState = await getMLAuthState(userId);

  // Log do estado
  console.log(`ML_AUTH_STATE: loaded=${authState.loaded} source=${authState.source} path=${authState.path || 'none'}`);

  // Configuracao do browser
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  console.log(`ML_BROWSER_PATH: ${browsersPath || 'default'}`);

  // Se source e SESSION_MANAGER, delega para o sessionManager
  if (authState.source === 'session_manager') {
    // Importa dinamicamente para evitar dependencia circular
    const { sessionManager } = await import('../auth');

    try {
      const authContext = await sessionManager.getContext(SITE_ID);
      const page = await authContext.context.newPage();

      return {
        browser: null as any, // Gerenciado pelo sessionManager
        context: authContext.context,
        page,
        authState,
        cleanup: async () => {
          await authContext.release();
        },
      };
    } catch (e: any) {
      console.log(`ML_AUTH_PROVIDER: Session Manager falhou: ${e.message}`);
      // Fallback para contexto anonimo
      authState.loaded = false;
      authState.source = 'none';
      authState.error = e.message;
    }
  }

  // Acquire browser through acquireContext (semaphore-controlled)
  const acquired = await browserManager.acquireContext();
  const browser = acquired.browser;

  const userAgent = randomUA();
  console.log(`ML_USER_AGENT: ${userAgent.slice(0, 60)}...`);

  let context: BrowserContext;

  if (authState.loaded && authState.source === 'database' && authState.storageStateJson) {
    // Cria contexto com storageState do banco (JSON direto)
    try {
      const storageState = JSON.parse(authState.storageStateJson);
      context = await browser.newContext({
        storageState,
        userAgent,
        locale: 'pt-BR',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      });
      console.log(`ML_AUTH_CONTEXT: Contexto criado com storageState do banco (database)`);
    } catch (e: any) {
      console.log(`ML_AUTH_CONTEXT_ERROR: Falha ao carregar storageState do banco: ${e.message}`);
      context = await browser.newContext({
        userAgent,
        locale: 'pt-BR',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      });
      authState.loaded = false;
      authState.error = e.message;
    }
  } else if (authState.loaded && authState.path && authState.path !== 'SESSION_MANAGER' && authState.path !== 'DATABASE') {
    // Cria contexto COM storageState de arquivo
    try {
      context = await browser.newContext({
        storageState: authState.path,
        userAgent,
        locale: 'pt-BR',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      });
      console.log(`ML_AUTH_CONTEXT: Contexto criado com storageState de ${authState.source}`);
    } catch (e: any) {
      console.log(`ML_AUTH_CONTEXT_ERROR: Falha ao carregar storageState: ${e.message}`);
      // Fallback para contexto sem auth
      context = await browser.newContext({
        userAgent,
        locale: 'pt-BR',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      });
      authState.loaded = false;
      authState.error = e.message;
    }
  } else {
    // Cria contexto SEM storageState (anonimo)
    console.log(`ML_AUTH_FALLBACK: Usando contexto sem autenticacao`);
    context = await browser.newContext({
      userAgent,
      locale: 'pt-BR',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
  }

  // Bloqueia recursos desnecessarios
  await context.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2}', route => route.abort());

  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    authState,
    cleanup: async () => {
      try {
        await page.close();
      } catch {}
      try {
        await context.close();
      } catch {}
      acquired.release();
      // NOTE: Do NOT close browser — it's shared via BrowserManager
    },
  };
}

// ============================================================
// FUNCAO PARA MARCAR NEEDS_REAUTH
// ============================================================

/**
 * Marca a sessão do usuário como NEEDS_REAUTH quando detectado login required
 * @param userId - ID do usuário
 * @param reason - Motivo da marcação
 * @returns true se marcou com sucesso
 */
export async function markMLSessionNeedsReauth(
  userId: string | undefined,
  reason: string
): Promise<boolean> {
  if (!userId) {
    console.log('ML_AUTH_PROVIDER: Não é possível marcar NEEDS_REAUTH sem userId');
    return false;
  }

  try {
    const result = await userSessionService.markNeedsReauth(userId, SITE_ID, reason);
    console.log(`ML_AUTH_PROVIDER: Sessão marcada como NEEDS_REAUTH para userId=${userId.slice(0, 8)}... reason=${reason}`);
    return result.notified;
  } catch (e: any) {
    console.error(`ML_AUTH_PROVIDER: Erro ao marcar NEEDS_REAUTH: ${e.message}`);
    return false;
  }
}

// ============================================================
// DETECCAO DE LOGIN/CHALLENGE
// ============================================================

export interface PageDiagnostics {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  bodyLength: number;
  isLoginRequired: boolean;
  isChallengeDetected: boolean;
  isContentPage: boolean;
  signals: {
    hasLoginForm: boolean;
    hasLoginText: boolean;
    hasChallengeUrl: boolean;
    hasCaptcha: boolean;
    hasSearchResults: boolean;
    bodySnippet: string;
  };
}

/**
 * Diagnostica o estado da pagina apos navegacao
 */
export async function diagnosePageState(page: Page, requestedUrl: string): Promise<PageDiagnostics> {
  const finalUrl = page.url();
  let title = '';

  try {
    title = await page.title();
  } catch {
    title = '[ERRO]';
  }

  const signals = await page.evaluate(() => {
    const bodyText = document.body?.innerText?.toLowerCase() || '';
    const bodyLength = bodyText.length;

    // Textos de login
    const loginTexts = [
      'para continuar, acesse sua conta',
      'acesse sua conta',
      'faca login',
      'entre na sua conta',
      'identifique-se',
    ];

    const hasLoginText = loginTexts.some(t => bodyText.includes(t));

    // Formulario de login
    const hasLoginForm = !!(
      document.querySelector('input[name="user_id"]') ||
      document.querySelector('#login_user_id') ||
      document.querySelector('form[action*="login"]')
    );

    // Captcha
    const hasCaptcha = !!(
      document.querySelector('.g-recaptcha') ||
      document.querySelector('#g-recaptcha') ||
      document.querySelector('iframe[src*="recaptcha"]') ||
      document.querySelector('.h-captcha') ||
      document.querySelector('iframe[src*="hcaptcha"]')
    );

    // Resultados de busca
    const hasSearchResults = !!(
      document.querySelector('.ui-search-layout__item') ||
      document.querySelector('[class*="search-result"]') ||
      document.querySelector('[class*="search-layout__item"]')
    );

    return {
      hasLoginForm,
      hasLoginText,
      hasCaptcha,
      hasSearchResults,
      bodyLength,
      bodySnippet: bodyText.slice(0, 500),
    };
  });

  // URLs de challenge/login
  const challengePatterns = [
    '/login',
    '/account-verification',
    '/gz/account-verification',
    '/challenge',
    '/security',
  ];
  const hasChallengeUrl = challengePatterns.some(p => finalUrl.includes(p));

  // Determina estado
  const isLoginRequired = signals.hasLoginText || signals.hasLoginForm || hasChallengeUrl;
  const isChallengeDetected = signals.hasCaptcha || (signals.bodyLength < 2000 && !signals.hasSearchResults);
  const isContentPage = signals.hasSearchResults || signals.bodyLength > 5000;

  // Log de diagnostico
  console.log('ML_PAGE_DIAGNOSTICS:');
  console.log(`  requestedUrl: ${requestedUrl}`);
  console.log(`  finalUrl: ${finalUrl}`);
  console.log(`  title: ${title}`);
  console.log(`  bodyLength: ${signals.bodyLength}`);
  console.log(`  isLoginRequired: ${isLoginRequired}`);
  console.log(`  isChallengeDetected: ${isChallengeDetected}`);
  console.log(`  isContentPage: ${isContentPage}`);
  console.log(`  hasLoginForm: ${signals.hasLoginForm}`);
  console.log(`  hasLoginText: ${signals.hasLoginText}`);
  console.log(`  hasChallengeUrl: ${hasChallengeUrl}`);
  console.log(`  hasCaptcha: ${signals.hasCaptcha}`);
  console.log(`  hasSearchResults: ${signals.hasSearchResults}`);

  return {
    requestedUrl,
    finalUrl,
    title,
    bodyLength: signals.bodyLength,
    isLoginRequired,
    isChallengeDetected,
    isContentPage,
    signals: {
      ...signals,
      hasChallengeUrl,
    },
  };
}

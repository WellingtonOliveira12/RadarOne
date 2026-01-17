/**
 * ============================================================
 * SESSION PROVIDER - Interface abstrata para providers de sessão
 * ============================================================
 *
 * Permite trocar implementação sem alterar código consumidor.
 * Prepara arquitetura para Opção B (browser remoto).
 *
 * Ordem de prioridade:
 * 1. UserUploadProvider (sessão do usuário via upload)
 * 2. RemoteBrowserProvider (futuro: browser remoto)
 * 3. TechnicalPoolProvider (contas técnicas do sistema)
 * 4. AnonymousProvider (fallback sem autenticação)
 */

import { BrowserContext, Browser } from 'playwright';
import { userSessionService, UserContextResult } from './user-session-service';
import { logger } from '../utils/logger';

// ============================================================
// TIPOS
// ============================================================

export type SessionSource = 'user_upload' | 'remote_browser' | 'technical_pool' | 'anonymous';

export interface SessionContextResult {
  success: boolean;
  context?: BrowserContext;
  browser?: Browser;
  source: SessionSource;
  sessionId?: string;
  needsUserAction?: boolean;
  skipReason?: string;
  error?: string;
  cleanup: () => Promise<void>;
}

export interface SessionProvider {
  name: string;
  priority: number;

  /** Verifica se provider pode fornecer sessão para este usuário/site */
  isAvailable(userId: string, site: string): Promise<boolean>;

  /** Obtém contexto autenticado */
  getContext(userId: string, site: string): Promise<SessionContextResult>;

  /** Marca sessão como inválida */
  invalidate(userId: string, site: string, reason: string): Promise<void>;
}

// ============================================================
// PROVIDER 1: USER UPLOAD (Opção A)
// ============================================================

class UserUploadProvider implements SessionProvider {
  name = 'UserUploadProvider';
  priority = 100;

  async isAvailable(userId: string, site: string): Promise<boolean> {
    return await userSessionService.hasValidSession(userId, site);
  }

  async getContext(userId: string, site: string): Promise<SessionContextResult> {
    const result = await userSessionService.getUserContext(userId, site);

    return {
      success: result.success,
      context: result.context,
      browser: result.browser,
      source: 'user_upload',
      sessionId: result.sessionId,
      needsUserAction: result.needsUserAction,
      error: result.error,
      cleanup: result.cleanup,
    };
  }

  async invalidate(userId: string, site: string, reason: string): Promise<void> {
    await userSessionService.markNeedsReauth(userId, site, reason);
  }
}

// ============================================================
// PROVIDER 2: REMOTE BROWSER (Opção B - FUTURO)
// ============================================================

class RemoteBrowserProvider implements SessionProvider {
  name = 'RemoteBrowserProvider';
  priority = 90;

  async isAvailable(_userId: string, _site: string): Promise<boolean> {
    // TODO: Implementar quando Opção B for desenvolvida
    // Verificar se existe sessão remota ativa para este usuário
    return false;
  }

  async getContext(_userId: string, _site: string): Promise<SessionContextResult> {
    // TODO: Implementar conexão via WebSocket ao browser remoto
    // 1. Verificar se existe sessão remota ativa
    // 2. Conectar ao Browserless/Playwright Server
    // 3. Retornar contexto com streaming
    return {
      success: false,
      source: 'remote_browser',
      error: 'RemoteBrowserProvider não implementado ainda',
      cleanup: async () => {},
    };
  }

  async invalidate(_userId: string, _site: string, _reason: string): Promise<void> {
    // TODO: Implementar invalidação de sessão remota
  }
}

// ============================================================
// PROVIDER 3: TECHNICAL POOL (contas do sistema)
// ============================================================

class TechnicalPoolProvider implements SessionProvider {
  name = 'TechnicalPoolProvider';
  priority = 50;

  async isAvailable(_userId: string, site: string): Promise<boolean> {
    // Verifica se existe conta técnica para o site
    // Usa o sessionManager existente (src/auth/session-manager.ts)
    try {
      const { sessionManager } = await import('../auth/session-manager');
      return await sessionManager.hasAccountForSite(site);
    } catch {
      return false;
    }
  }

  async getContext(_userId: string, site: string): Promise<SessionContextResult> {
    try {
      const { sessionManager } = await import('../auth/session-manager');
      const authContext = await sessionManager.getContext(site);
      const page = await authContext.context.newPage();
      await page.close(); // Só precisamos do context

      return {
        success: true,
        context: authContext.context,
        source: 'technical_pool',
        sessionId: authContext.accountId,
        cleanup: async () => {
          await authContext.release();
        },
      };
    } catch (error: any) {
      return {
        success: false,
        source: 'technical_pool',
        error: error.message,
        cleanup: async () => {},
      };
    }
  }

  async invalidate(_userId: string, _site: string, _reason: string): Promise<void> {
    // Contas técnicas são gerenciadas separadamente
    // Não fazemos nada aqui
  }
}

// ============================================================
// REGISTRY DE PROVIDERS
// ============================================================

const providers: SessionProvider[] = [
  new UserUploadProvider(),
  new RemoteBrowserProvider(),
  new TechnicalPoolProvider(),
];

// Ordena por prioridade (maior primeiro)
providers.sort((a, b) => b.priority - a.priority);

/**
 * Registra um novo provider
 */
export function registerSessionProvider(provider: SessionProvider): void {
  providers.push(provider);
  providers.sort((a, b) => b.priority - a.priority);
  logger.info({ provider: provider.name, priority: provider.priority }, 'SESSION_PROVIDER_REGISTERED');
}

/**
 * Obtém contexto usando cascata de providers
 */
export async function getSessionContext(
  userId: string,
  site: string
): Promise<SessionContextResult> {
  // Verifica se site requer autenticação
  const requiresAuth = userSessionService.siteRequiresAuth(site);

  for (const provider of providers) {
    const available = await provider.isAvailable(userId, site);

    if (available) {
      logger.debug(
        { provider: provider.name, userId, site },
        'SESSION_PROVIDER_TRYING'
      );

      const result = await provider.getContext(userId, site);

      if (result.success) {
        logger.info(
          { provider: provider.name, site, source: result.source },
          'SESSION_CONTEXT_OK'
        );
        return result;
      }

      // Se falhou mas precisa de ação do usuário, retorna imediatamente
      if (result.needsUserAction) {
        return result;
      }
    }
  }

  // Nenhum provider disponível
  if (requiresAuth) {
    return {
      success: false,
      source: 'anonymous',
      needsUserAction: true,
      skipReason: 'SESSION_REQUIRED',
      error: `Este site requer autenticação. Por favor, conecte sua conta do ${site}.`,
      cleanup: async () => {},
    };
  }

  // Site não requer auth, pode usar contexto anônimo
  return {
    success: false,
    source: 'anonymous',
    skipReason: 'NO_SESSION_AVAILABLE',
    error: 'Nenhuma sessão disponível, usando contexto anônimo.',
    cleanup: async () => {},
  };
}

/**
 * Invalida sessão em todos os providers
 */
export async function invalidateSession(
  userId: string,
  site: string,
  reason: string
): Promise<void> {
  for (const provider of providers) {
    try {
      await provider.invalidate(userId, site, reason);
    } catch (error) {
      // Ignora erros de invalidação
    }
  }
}

/**
 * Verifica se existe sessão válida em algum provider
 */
export async function hasValidSession(userId: string, site: string): Promise<boolean> {
  for (const provider of providers) {
    if (await provider.isAvailable(userId, site)) {
      return true;
    }
  }
  return false;
}

// ============================================================
// TIPOS DE ERRO PARA NÃO FAZER RETRY
// ============================================================

/**
 * Verifica se erro é de autenticação (não deve fazer retry)
 */
export function isAuthError(error: Error | string): boolean {
  const message = typeof error === 'string' ? error : error.message;
  const lowerMessage = message.toLowerCase();

  const authPatterns = [
    'login_required',
    'needs_reauth',
    'session_required',
    'session_expired',
    'auth_session_expired',
    'account-verification',
    'acesse sua conta',
    'faça login',
    'faca login',
    'identifique-se',
    'entre na sua conta',
  ];

  return authPatterns.some((p) => lowerMessage.includes(p));
}

/**
 * Verifica se erro deve ser tratado como SKIPPED (não como ERROR)
 */
export function shouldSkipNotError(error: Error | string): boolean {
  return isAuthError(error);
}

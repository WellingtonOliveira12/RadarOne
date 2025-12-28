/**
 * Sentry Configuration - RadarOne Frontend
 *
 * Captura e rastreia erros do frontend em produção
 */

import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const IS_PROD = import.meta.env.PROD;
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

/**
 * Inicializa o Sentry
 * Deve ser chamado no início da aplicação
 */
export function initSentry(): void {
  // Só ativa em produção e se DSN estiver configurado
  if (!IS_PROD || !SENTRY_DSN) {
    console.log('[Sentry] Não inicializado:', {
      isProd: IS_PROD,
      hasDSN: Boolean(SENTRY_DSN),
    });
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: IS_PROD ? 'production' : 'development',
      release: `radarone-frontend@${APP_VERSION}`,

      // Performance Monitoring
      tracesSampleRate: IS_PROD ? 0.1 : 1.0, // 10% em prod, 100% em dev

      // Session Replay
      replaysSessionSampleRate: 0.1, // 10% das sessões
      replaysOnErrorSampleRate: 1.0, // 100% quando há erro

      // Integrations
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true, // LGPD: oculta texto sensível
          blockAllMedia: true, // LGPD: bloqueia mídia
        }),
      ],

      // Filtering
      beforeSend(event, hint) {
        // Filtra erros de extensões de navegador
        const error = hint.originalException as Error;
        if (error && error.stack) {
          if (
            error.stack.includes('chrome-extension://') ||
            error.stack.includes('moz-extension://')
          ) {
            return null; // Não envia
          }
        }

        // Remove informações sensíveis dos headers
        if (event.request?.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['Cookie'];
        }

        return event;
      },

      // Ignore erros comuns de navegador
      ignoreErrors: [
        // Network errors
        'NetworkError',
        'Network request failed',
        'Failed to fetch',

        // Browser extensions
        'ResizeObserver loop',

        // Cancelamento de requisições
        'AbortError',
        'Request aborted',

        // Erros irrelevantes
        'Non-Error promise rejection',
      ],
    });

    console.log('[Sentry] Inicializado com sucesso');
  } catch (error) {
    console.error('[Sentry] Erro ao inicializar:', error);
  }
}

/**
 * Captura uma exceção manualmente
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  if (!IS_PROD) {
    console.error('[Sentry] Exception (dev):', error, context);
    return;
  }

  Sentry.captureException(error, { extra: context });
}

/**
 * Captura uma mensagem
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!IS_PROD) {
    console.log(`[Sentry] Message (dev) [${level}]:`, message);
    return;
  }

  Sentry.captureMessage(message, level);
}

/**
 * Define contexto do usuário
 */
export function setUserContext(user: {
  id: string;
  email?: string;
  name?: string;
}): void {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.name,
  });
}

/**
 * Limpa contexto do usuário (logout)
 */
export function clearUserContext(): void {
  Sentry.setUser(null);
}

/**
 * Adiciona breadcrumb (rastro de eventos)
 */
export function addBreadcrumb(message: string, data?: Record<string, any>): void {
  Sentry.addBreadcrumb({
    message,
    level: 'info',
    data,
  });
}

/**
 * Cria transaction para performance monitoring
 * NOTA: API antiga do Sentry, desabilitada temporariamente
 */
export function startTransaction(name: string, op: string) {
  // return Sentry.startTransaction({ name, op });
  console.log('[Sentry] Transaction:', name, op);
  return null;
}

/**
 * Verifica se Sentry está inicializado
 */
export function isSentryInitialized(): boolean {
  return Boolean(SENTRY_DSN && IS_PROD);
}

/**
 * Expõe Sentry no window para uso no ErrorBoundary
 */
if (typeof window !== 'undefined' && IS_PROD && SENTRY_DSN) {
  window.Sentry = {
    captureException: (error: Error, context?: any) => {
      Sentry.captureException(error, context);
    },
    captureMessage: (message: string, level?: string) => {
      Sentry.captureMessage(message, level as any);
    },
  };
}

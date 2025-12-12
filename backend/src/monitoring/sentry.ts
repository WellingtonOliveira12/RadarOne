import * as Sentry from '@sentry/node';

let sentryInitialized = false;

/**
 * Inicializa o Sentry para monitoramento de erros
 * Só ativa se SENTRY_DSN estiver configurado no .env
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.log('[SENTRY] SENTRY_DSN não configurado. Observabilidade desativada.');
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      // Taxa de amostragem de transações (0.0 a 1.0)
      // 1.0 = 100% das transações são enviadas
      // 0.1 = 10% das transações são enviadas (economia de quota)
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      // Configurações adicionais
      beforeSend(event) {
        // Filtrar dados sensíveis antes de enviar para o Sentry
        if (event.request) {
          delete event.request.cookies;
          if (event.request.headers) {
            delete event.request.headers.Authorization;
            delete event.request.headers.authorization;
          }
        }
        return event;
      },
    });

    sentryInitialized = true;
    console.log('[SENTRY] ✅ Inicializado com sucesso');
    console.log(`[SENTRY] Ambiente: ${process.env.NODE_ENV || 'development'}`);
  } catch (error) {
    console.error('[SENTRY] ❌ Erro ao inicializar:', error);
  }
}

/**
 * Captura exceções de jobs com contexto adicional
 * @param error O erro capturado
 * @param context Contexto adicional (nome do job, parâmetros, etc.)
 */
export function captureJobException(
  error: unknown,
  context: {
    jobName: string;
    additionalData?: Record<string, any>;
  }
) {
  if (!sentryInitialized) {
    return;
  }

  try {
    Sentry.captureException(error, {
      tags: {
        job: context.jobName,
        source: 'automated_job',
      },
      extra: {
        ...context.additionalData,
        timestamp: new Date().toISOString(),
      },
      level: 'error',
    });

    console.log(`[SENTRY] 🚨 Exceção capturada do job: ${context.jobName}`);
  } catch (sentryError) {
    console.error('[SENTRY] ❌ Erro ao capturar exceção:', sentryError);
  }
}

/**
 * Captura exceções genéricas
 * @param error O erro capturado
 * @param context Contexto adicional opcional
 */
export function captureException(error: unknown, context?: Record<string, any>) {
  if (!sentryInitialized) {
    return;
  }

  try {
    Sentry.captureException(error, {
      extra: context,
    });
  } catch (sentryError) {
    console.error('[SENTRY] ❌ Erro ao capturar exceção:', sentryError);
  }
}

/**
 * Envia uma mensagem customizada para o Sentry
 * @param message Mensagem a ser enviada
 * @param level Nível de severidade
 */
export function captureMessage(
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal' = 'info'
) {
  if (!sentryInitialized) {
    return;
  }

  try {
    Sentry.captureMessage(message, level);
  } catch (sentryError) {
    console.error('[SENTRY] ❌ Erro ao enviar mensagem:', sentryError);
  }
}

/**
 * Verifica se o Sentry está inicializado
 */
export function isSentryInitialized(): boolean {
  return sentryInitialized;
}

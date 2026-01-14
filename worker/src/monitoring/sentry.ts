import * as Sentry from '@sentry/node';

/**
 * Configuração do Sentry para Worker
 *
 * Monitora erros e exceções não tratadas
 */

export function initSentry() {
  // Apenas em produção
  if (process.env.NODE_ENV !== 'production' || !process.env.SENTRY_DSN) {
    console.log('⚠️  Sentry não configurado (NODE_ENV !== production ou SENTRY_DSN vazio)');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    // Tracing - amostragem baixa para não gerar muito custo
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),

    // Configurações do worker
    serverName: 'radarone-worker',

    // Beforehand filter
    beforeSend(event, hint) {
      // Ignora erros específicos conhecidos
      const error = hint.originalException;

      if (error && typeof error === 'object') {
        const message = (error as Error).message || '';

        // Ignora timeouts normais de rede (não são bugs)
        if (message.includes('net::ERR') || message.includes('timeout')) {
          return null; // Não envia para Sentry
        }

        // Ignora circuit breaker OPEN (comportamento esperado)
        if (message.includes('Circuit breaker OPEN')) {
          return null;
        }
      }

      return event;
    },
  });

  console.log('✅ Sentry initialized for worker');
}

/**
 * Captura exceção manual
 */
export function captureException(error: Error, context?: Record<string, any>) {
  if (process.env.NODE_ENV !== 'production') {
    console.error('❌ Error (would be sent to Sentry in production):', error);
    return;
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Captura mensagem manual
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📝 Message (would be sent to Sentry in production): ${message}`);
    return;
  }

  Sentry.captureMessage(message, level);
}

/**
 * Adiciona contexto global (usuário, tags, etc)
 */
export function setContext(key: string, value: Record<string, any>) {
  Sentry.setContext(key, value);
}

/**
 * Adiciona tag
 */
export function setTag(key: string, value: string) {
  Sentry.setTag(key, value);
}

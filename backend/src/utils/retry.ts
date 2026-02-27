/**
 * Utilitário de Retry com Backoff Exponencial
 *
 * Permite retry automático de operações assíncronas que falharam
 * devido a erros transientes (timeouts, problemas de rede, etc.)
 */

import { logInfo } from './loggerHelpers';

export interface RetryOptions {
  retries: number;          // Número máximo de tentativas (além da primeira)
  delayMs: number;          // Delay inicial entre tentativas (em ms)
  factor?: number;          // Fator de multiplicação do delay (padrão: 2)
  jobName?: string;         // Nome do job para logs
  onRetry?: (attempt: number, error: unknown) => void; // Callback opcional em cada retry
}

/**
 * Verifica se o erro é considerado transiente
 * Erros transientes são aqueles que podem ser resolvidos com retry
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  // Converter erro para string para análise
  const errorStr = error instanceof Error ? error.message : String(error);
  const errorCode = (error as any)?.code;

  // Erros de rede comuns
  const networkErrors = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'EPIPE',
    'EAI_AGAIN'
  ];

  if (errorCode && networkErrors.includes(errorCode)) {
    return true;
  }

  // Erros de timeout e conexão no texto
  const transientKeywords = [
    'timeout',
    'connection terminated',
    'connection refused',
    'network error',
    'socket hang up',
    'ECONNRESET',
    'ETIMEDOUT',
    'temporarily unavailable',
    'connection pool timeout',
    'transaction rollback'
  ];

  const lowerErrorStr = errorStr.toLowerCase();

  for (const keyword of transientKeywords) {
    if (lowerErrorStr.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  // Erros HTTP 5xx e 429 (rate limit) também são considerados transientes
  const statusCode = (error as any)?.statusCode || (error as any)?.status;
  if (statusCode >= 500 || statusCode === 429) {
    return true;
  }

  return false;
}

/**
 * Executa uma operação assíncrona com retry automático
 *
 * @param operation Função assíncrona a ser executada
 * @param options Opções de retry
 * @returns Resultado da operação
 * @throws Último erro capturado após esgotar todas as tentativas
 */
export async function retryAsync<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    retries,
    delayMs,
    factor = 2,
    jobName = 'unknown',
    onRetry
  } = options;

  let lastError: unknown;
  let currentDelay = delayMs;

  // Primeira tentativa (não conta como retry)
  try {
    return await operation();
  } catch (error) {
    lastError = error;

    // Se não é transiente, falha imediatamente
    if (!isTransientError(error)) {
      logInfo('RETRY: Non-transient error, not retrying', { jobName });
      throw error;
    }
  }

  // Tentativas de retry
  for (let attempt = 1; attempt <= retries; attempt++) {
    logInfo('RETRY: Attempt failed, waiting before retry', {
      jobName, attempt, retries, delayMs: currentDelay
    });

    // Log do erro
    const errorMsg = lastError instanceof Error
      ? lastError.message
      : String(lastError);
    logInfo('RETRY: Error details', { jobName, error: errorMsg });

    // Callback opcional
    if (onRetry) {
      onRetry(attempt, lastError);
    }

    // Aguardar antes de tentar novamente
    await sleep(currentDelay);

    // Tentar executar a operação novamente
    try {
      const result = await operation();
      logInfo('RETRY: Success on retry', { jobName, attempt, retries });
      return result;
    } catch (error) {
      lastError = error;

      // Se não é transiente, falha imediatamente
      if (!isTransientError(error)) {
        logInfo('RETRY: Non-transient error on attempt, aborting', { jobName, attempt });
        throw error;
      }

      // Aumentar delay para próxima tentativa (backoff exponencial)
      currentDelay = Math.floor(currentDelay * factor);
    }
  }

  // Todas as tentativas falharam
  logInfo('RETRY: All attempts failed', { jobName, retries });
  throw lastError;
}

/**
 * Helper para aguardar um período de tempo
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Cria uma função de retry pré-configurada para um job específico
 * Útil para evitar repetição de configuração
 */
export function createRetryHelper(defaultOptions: Partial<RetryOptions>) {
  return async <T>(
    operation: () => Promise<T>,
    overrideOptions?: Partial<RetryOptions>
  ): Promise<T> => {
    const options: RetryOptions = {
      retries: 3,
      delayMs: 1000,
      factor: 2,
      ...defaultOptions,
      ...overrideOptions
    };

    return retryAsync(operation, options);
  };
}

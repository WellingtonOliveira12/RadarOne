/**
 * Retry Helper - Implementação de retry com backoff exponencial
 *
 * Permite tentar operações novamente em caso de falha com delay crescente
 */

export interface RetryOptions {
  maxAttempts?: number; // Número máximo de tentativas (padrão: 3)
  initialDelay?: number; // Delay inicial em ms (padrão: 1000)
  maxDelay?: number; // Delay máximo em ms (padrão: 30000)
  backoffFactor?: number; // Fator multiplicador do backoff (padrão: 2)
  onRetry?: (error: Error, attempt: number) => void; // Callback chamado antes de cada retry
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
}

/**
 * Executa uma função com retry e backoff exponencial
 *
 * @param fn - Função assíncrona a ser executada
 * @param options - Opções de configuração do retry
 * @returns Resultado da operação
 *
 * @example
 * const result = await retry(
 *   async () => await scrapeSite(url),
 *   {
 *     maxAttempts: 5,
 *     initialDelay: 2000,
 *     onRetry: (error, attempt) => {
 *       console.log(`Attempt ${attempt} failed: ${error.message}`);
 *     }
 *   }
 * );
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    onRetry,
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error: any) {
      lastError = error;

      // Se é a última tentativa, lança o erro
      if (attempt === maxAttempts) {
        console.error(
          `❌ Failed after ${maxAttempts} attempts: ${error.message}`
        );
        throw error;
      }

      // Calcula delay com backoff exponencial
      const currentDelay = Math.min(delay, maxDelay);

      // Log e callback antes de retry
      console.warn(
        `⚠️  Attempt ${attempt}/${maxAttempts} failed: ${error.message}. Retrying in ${Math.round(currentDelay / 1000)}s...`
      );

      if (onRetry) {
        onRetry(error, attempt);
      }

      // Aguarda antes da próxima tentativa
      await sleep(currentDelay);

      // Aumenta delay para próxima tentativa
      delay = delay * backoffFactor;
    }
  }

  // TypeScript safety - nunca deve chegar aqui
  throw lastError!;
}

/**
 * Versão do retry que retorna resultado com metadados ao invés de lançar exceção
 *
 * Útil quando você quer tratar falhas sem usar try/catch
 */
export async function retryWithResult<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    onRetry,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt,
      };
    } catch (error: any) {
      lastError = error;

      if (attempt === maxAttempts) {
        return {
          success: false,
          error: lastError,
          attempts: attempt,
        };
      }

      const currentDelay = Math.min(delay, maxDelay);

      console.warn(
        `⚠️  Attempt ${attempt}/${maxAttempts} failed: ${error.message}. Retrying in ${Math.round(currentDelay / 1000)}s...`
      );

      if (onRetry) {
        onRetry(error, attempt);
      }

      await sleep(currentDelay);
      delay = delay * backoffFactor;
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: maxAttempts,
  };
}

/**
 * Helper para criar retry com configurações pré-definidas
 */
export const retryPresets = {
  /**
   * Configuração rápida: 3 tentativas, delays curtos
   */
  quick: {
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 5000,
    backoffFactor: 2,
  },

  /**
   * Configuração padrão: 5 tentativas, delays médios
   */
  standard: {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 15000,
    backoffFactor: 2,
  },

  /**
   * Configuração agressiva: 10 tentativas, delays longos
   */
  aggressive: {
    maxAttempts: 10,
    initialDelay: 2000,
    maxDelay: 60000,
    backoffFactor: 2.5,
  },

  /**
   * Configuração para scrapers: 7 tentativas, delays progressivos
   */
  scraping: {
    maxAttempts: 7,
    initialDelay: 3000,
    maxDelay: 30000,
    backoffFactor: 2,
  },
};

/**
 * Verifica se um erro é de autenticação (NÃO deve fazer retry)
 */
export function isAuthenticationError(error: any): boolean {
  const message = (error.message || '').toLowerCase();

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
    'auth_error',
    'authentication',
  ];

  return authPatterns.some((p) => message.includes(p));
}

/**
 * Verifica se um erro é recuperável (deve fazer retry)
 *
 * Erros de rede, timeouts, etc são recuperáveis
 * Erros de validação, 404, autenticação, etc não são
 */
export function isRetriableError(error: any): boolean {
  // ═══════════════════════════════════════════════════════════════
  // ERROS DE AUTENTICAÇÃO NUNCA FAZEM RETRY
  // ═══════════════════════════════════════════════════════════════
  if (isAuthenticationError(error)) {
    console.log(`🔐 AUTH_ERROR detectado - NÃO fazendo retry: ${error.message?.slice(0, 100)}`);
    return false;
  }
  // ═══════════════════════════════════════════════════════════════

  // Erros de rede do Playwright/fetch
  if (error.message?.includes('net::')) return true;
  if (error.message?.includes('timeout')) return true;
  if (error.message?.includes('ERR_')) return true;

  // Status codes HTTP recuperáveis
  if (error.status) {
    const retriableStatuses = [408, 429, 500, 502, 503, 504];
    return retriableStatuses.includes(error.status);
  }

  // Por padrão, considera recuperável
  return true;
}

/**
 * Wrapper de retry que só tenta novamente se o erro for recuperável
 */
export async function retryIfRecoverable<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return retry(async () => {
    try {
      return await fn();
    } catch (error: any) {
      if (!isRetriableError(error)) {
        console.log(`❌ Non-retriable error: ${error.message}`);
        throw error; // Lança imediatamente sem retry
      }
      throw error; // Lança para que o retry tente novamente
    }
  }, options);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

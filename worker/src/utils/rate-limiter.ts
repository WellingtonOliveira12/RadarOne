/**
 * Rate Limiter - Token Bucket Algorithm
 *
 * Implementa rate limiting robusto por site para evitar bloqueios
 * Cada site tem sua própria configuração de taxa
 */

interface RateLimitConfig {
  tokensPerInterval: number; // Número de requisições permitidas por intervalo
  interval: number; // Intervalo em milissegundos
  maxTokens: number; // Capacidade máxima do bucket
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  config: RateLimitConfig;
}

/**
 * Configurações de rate limit por site
 */
const SITE_CONFIGS: Record<string, RateLimitConfig> = {
  MERCADO_LIVRE: {
    tokensPerInterval: 10,
    interval: 60000, // 10 requests per minute
    maxTokens: 20,
  },
  OLX: {
    tokensPerInterval: 15,
    interval: 60000, // 15 requests per minute
    maxTokens: 30,
  },
  FACEBOOK_MARKETPLACE: {
    tokensPerInterval: 5,
    interval: 60000, // 5 requests per minute (conservative for FB)
    maxTokens: 10,
  },
  LEILAO: {
    tokensPerInterval: 5,
    interval: 60000, // 5 requests per minute (mais conservador)
    maxTokens: 10,
  },
  WEBMOTORS: {
    tokensPerInterval: 12,
    interval: 60000, // 12 requests per minute
    maxTokens: 24,
  },
  ICARROS: {
    tokensPerInterval: 12,
    interval: 60000, // 12 requests per minute
    maxTokens: 24,
  },
  ZAP_IMOVEIS: {
    tokensPerInterval: 8,
    interval: 60000, // 8 requests per minute
    maxTokens: 16,
  },
  VIVA_REAL: {
    tokensPerInterval: 8,
    interval: 60000, // 8 requests per minute
    maxTokens: 16,
  },
  IMOVELWEB: {
    tokensPerInterval: 10,
    interval: 60000, // 10 requests per minute
    maxTokens: 20,
  },
};

/**
 * Rate Limiter global - mantém buckets por site
 */
class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();

  /**
   * Inicializa bucket para um site se não existir
   */
  private initBucket(site: string): TokenBucket {
    const config = SITE_CONFIGS[site] || SITE_CONFIGS.MERCADO_LIVRE;

    const bucket: TokenBucket = {
      tokens: config.maxTokens,
      lastRefill: Date.now(),
      config,
    };

    this.buckets.set(site, bucket);
    return bucket;
  }

  /**
   * Reabastece tokens baseado no tempo decorrido
   */
  private refillTokens(bucket: TokenBucket): void {
    const now = Date.now();
    const timePassed = now - bucket.lastRefill;

    if (timePassed >= bucket.config.interval) {
      const intervalsPass = Math.floor(timePassed / bucket.config.interval);
      const tokensToAdd = intervalsPass * bucket.config.tokensPerInterval;

      bucket.tokens = Math.min(
        bucket.tokens + tokensToAdd,
        bucket.config.maxTokens
      );
      bucket.lastRefill = now;
    }
  }

  /**
   * Tenta consumir um token. Se não houver, aguarda até que esteja disponível
   *
   * @param site - Site para aplicar rate limit
   * @returns Promise que resolve quando o token for consumido
   */
  async acquire(site: string): Promise<void> {
    let bucket = this.buckets.get(site);

    if (!bucket) {
      bucket = this.initBucket(site);
    }

    while (true) {
      this.refillTokens(bucket);

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        console.log(
          `🚦 Rate limit OK for ${site} (${bucket.tokens} tokens remaining)`
        );
        return;
      }

      // Calcula tempo até próximo token
      const timeUntilRefill =
        bucket.config.interval - (Date.now() - bucket.lastRefill);
      const waitTime = Math.max(100, timeUntilRefill);

      console.log(
        `⏳ Rate limit reached for ${site}. Waiting ${Math.round(waitTime / 1000)}s...`
      );

      await this.delay(waitTime);
    }
  }

  /**
   * Verifica se há tokens disponíveis sem consumir
   */
  canAcquire(site: string): boolean {
    let bucket = this.buckets.get(site);

    if (!bucket) {
      bucket = this.initBucket(site);
    }

    this.refillTokens(bucket);
    return bucket.tokens >= 1;
  }

  /**
   * Retorna informações sobre o bucket de um site
   */
  getStatus(site: string): {
    tokens: number;
    maxTokens: number;
    tokensPerInterval: number;
    interval: number;
  } | null {
    const bucket = this.buckets.get(site);

    if (!bucket) {
      return null;
    }

    this.refillTokens(bucket);

    return {
      tokens: bucket.tokens,
      maxTokens: bucket.config.maxTokens,
      tokensPerInterval: bucket.config.tokensPerInterval,
      interval: bucket.config.interval,
    };
  }

  /**
   * Reseta o bucket de um site (útil para testes)
   */
  reset(site: string): void {
    this.buckets.delete(site);
  }

  /**
   * Reseta todos os buckets
   */
  resetAll(): void {
    this.buckets.clear();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

/**
 * Decorator para aplicar rate limiting a funções assíncronas
 *
 * @example
 * const scrapeWithLimit = withRateLimit('MERCADO_LIVRE', scrapeMercadoLivre);
 */
export function withRateLimit<T extends (...args: any[]) => Promise<any>>(
  site: string,
  fn: T
): T {
  return (async (...args: any[]) => {
    await rateLimiter.acquire(site);
    return fn(...args);
  }) as T;
}

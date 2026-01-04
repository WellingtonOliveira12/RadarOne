import { logger } from './logger';

/**
 * Proxy Manager - Rotação de proxies para anti-bloqueio
 *
 * Features:
 * - Rotação automática entre múltiplos proxies
 * - Detecção de proxies com falha
 * - Cooldown temporário para proxies problemáticos
 * - Estatísticas de uso
 * - Fallback para conexão direta se todos falharem
 *
 * Suporta formatos:
 * - HTTP: http://ip:port
 * - HTTPS: https://ip:port
 * - SOCKS5: socks5://ip:port
 * - Autenticado: http://user:pass@ip:port
 *
 * Providers recomendados:
 * - Bright Data (https://brightdata.com)
 * - Oxylabs (https://oxylabs.io)
 * - Smartproxy (https://smartproxy.com)
 * - ProxyMesh (https://proxymesh.com)
 */

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export interface ProxyStats {
  total: number;
  healthy: number;
  failed: number;
  cooldown: number;
  successRate: number;
}

interface ProxyState {
  config: ProxyConfig;
  failures: number;
  successes: number;
  lastUsed: number;
  lastFailure: number;
  inCooldown: boolean;
}

class ProxyManager {
  private proxies: ProxyState[] = [];
  private enabled: boolean = false;
  private currentIndex: number = 0;

  // Configurações
  private maxFailures: number = 3; // Falhas antes de cooldown
  private cooldownMs: number = 15 * 60 * 1000; // 15 minutos
  private rotationStrategy: 'round-robin' | 'least-used' | 'random' = 'round-robin';

  constructor() {
    this.loadProxies();

    if (this.enabled) {
      logger.info({
        count: this.proxies.length,
        strategy: this.rotationStrategy,
      }, '🔄 Proxy rotation habilitado');
    }
  }

  /**
   * Carrega proxies do ambiente
   */
  private loadProxies(): void {
    const proxyList = process.env.PROXY_LIST || process.env.PROXIES;

    if (!proxyList) {
      logger.debug('⚠️  Proxy rotation desabilitado (PROXY_LIST não configurado)');
      return;
    }

    // Parse proxy list (formato: "url1,url2,url3" ou "url1;url2;url3")
    const urls = proxyList.split(/[,;]/).map((url) => url.trim()).filter(Boolean);

    for (const url of urls) {
      try {
        const proxy = this.parseProxyUrl(url);
        this.proxies.push({
          config: proxy,
          failures: 0,
          successes: 0,
          lastUsed: 0,
          lastFailure: 0,
          inCooldown: false,
        });
      } catch (error: any) {
        logger.warn({ url, error: error.message }, '⚠️  Proxy inválido ignorado');
      }
    }

    if (this.proxies.length > 0) {
      this.enabled = true;

      // Configurações opcionais
      if (process.env.PROXY_MAX_FAILURES) {
        this.maxFailures = parseInt(process.env.PROXY_MAX_FAILURES);
      }

      if (process.env.PROXY_COOLDOWN_MINUTES) {
        this.cooldownMs = parseInt(process.env.PROXY_COOLDOWN_MINUTES) * 60 * 1000;
      }

      if (process.env.PROXY_ROTATION_STRATEGY) {
        this.rotationStrategy = process.env.PROXY_ROTATION_STRATEGY as any;
      }
    }
  }

  /**
   * Parse proxy URL
   */
  private parseProxyUrl(url: string): ProxyConfig {
    try {
      const parsed = new URL(url);

      const config: ProxyConfig = {
        server: `${parsed.protocol}//${parsed.host}`,
      };

      if (parsed.username) {
        config.username = decodeURIComponent(parsed.username);
      }

      if (parsed.password) {
        config.password = decodeURIComponent(parsed.password);
      }

      return config;
    } catch (error) {
      throw new Error(`Invalid proxy URL: ${url}`);
    }
  }

  /**
   * Obtém próximo proxy disponível
   */
  getNext(): ProxyConfig | null {
    if (!this.enabled || this.proxies.length === 0) {
      return null;
    }

    // Remove proxies de cooldown se tempo expirou
    this.updateCooldowns();

    // Filtra proxies disponíveis
    const available = this.proxies.filter((p) => !p.inCooldown);

    if (available.length === 0) {
      logger.warn('⚠️  Todos os proxies em cooldown, usando conexão direta');
      return null;
    }

    // Seleciona proxy baseado na estratégia
    let selected: ProxyState;

    switch (this.rotationStrategy) {
      case 'round-robin':
        selected = this.getRoundRobin(available);
        break;

      case 'least-used':
        selected = this.getLeastUsed(available);
        break;

      case 'random':
        selected = this.getRandom(available);
        break;

      default:
        selected = available[0];
    }

    selected.lastUsed = Date.now();

    logger.debug({
      server: selected.config.server,
      strategy: this.rotationStrategy,
      successes: selected.successes,
      failures: selected.failures,
    }, '🔄 Proxy selecionado');

    return selected.config;
  }

  /**
   * Round-robin: próximo na lista
   */
  private getRoundRobin(available: ProxyState[]): ProxyState {
    const index = this.currentIndex % available.length;
    this.currentIndex++;
    return available[index];
  }

  /**
   * Least-used: menos utilizado recentemente
   */
  private getLeastUsed(available: ProxyState[]): ProxyState {
    return available.reduce((least, current) =>
      current.lastUsed < least.lastUsed ? current : least
    );
  }

  /**
   * Random: aleatório
   */
  private getRandom(available: ProxyState[]): ProxyState {
    const index = Math.floor(Math.random() * available.length);
    return available[index];
  }

  /**
   * Atualiza status de cooldown
   */
  private updateCooldowns(): void {
    const now = Date.now();

    for (const proxy of this.proxies) {
      if (proxy.inCooldown) {
        const elapsed = now - proxy.lastFailure;

        if (elapsed >= this.cooldownMs) {
          proxy.inCooldown = false;
          proxy.failures = 0; // Reset failures

          logger.info({
            server: proxy.config.server,
          }, '✅ Proxy recuperado do cooldown');
        }
      }
    }
  }

  /**
   * Registra sucesso de um proxy
   */
  reportSuccess(proxyConfig: ProxyConfig): void {
    const proxy = this.findProxy(proxyConfig);

    if (proxy) {
      proxy.successes++;

      logger.debug({
        server: proxy.config.server,
        successes: proxy.successes,
      }, '✅ Proxy funcionou');
    }
  }

  /**
   * Registra falha de um proxy
   */
  reportFailure(proxyConfig: ProxyConfig, error?: string): void {
    const proxy = this.findProxy(proxyConfig);

    if (proxy) {
      proxy.failures++;
      proxy.lastFailure = Date.now();

      logger.warn({
        server: proxy.config.server,
        failures: proxy.failures,
        maxFailures: this.maxFailures,
        error,
      }, '❌ Proxy falhou');

      // Coloca em cooldown se atingiu limite
      if (proxy.failures >= this.maxFailures) {
        proxy.inCooldown = true;

        logger.warn({
          server: proxy.config.server,
          cooldownMinutes: this.cooldownMs / 60000,
        }, '🔴 Proxy em cooldown');
      }
    }
  }

  /**
   * Encontra proxy na lista
   */
  private findProxy(config: ProxyConfig): ProxyState | undefined {
    return this.proxies.find((p) => p.config.server === config.server);
  }

  /**
   * Verifica se proxy rotation está habilitado
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Obtém estatísticas
   */
  getStats(): ProxyStats {
    const total = this.proxies.length;
    const healthy = this.proxies.filter((p) => !p.inCooldown).length;
    const cooldown = this.proxies.filter((p) => p.inCooldown).length;
    const failed = this.proxies.filter((p) => p.failures > 0).length;

    const totalAttempts = this.proxies.reduce((sum, p) => sum + p.successes + p.failures, 0);
    const totalSuccesses = this.proxies.reduce((sum, p) => sum + p.successes, 0);
    const successRate = totalAttempts > 0 ? totalSuccesses / totalAttempts : 0;

    return {
      total,
      healthy,
      failed,
      cooldown,
      successRate,
    };
  }

  /**
   * Obtém configuração detalhada para Playwright
   */
  getPlaywrightConfig(proxyConfig: ProxyConfig | null): any {
    if (!proxyConfig) {
      return undefined;
    }

    const config: any = {
      server: proxyConfig.server,
    };

    if (proxyConfig.username) {
      config.username = proxyConfig.username;
    }

    if (proxyConfig.password) {
      config.password = proxyConfig.password;
    }

    return config;
  }

  /**
   * Reset de todas as estatísticas
   */
  reset(): void {
    for (const proxy of this.proxies) {
      proxy.failures = 0;
      proxy.successes = 0;
      proxy.lastUsed = 0;
      proxy.lastFailure = 0;
      proxy.inCooldown = false;
    }

    this.currentIndex = 0;

    logger.info('🔄 Estatísticas de proxy resetadas');
  }
}

// Singleton
export const proxyManager = new ProxyManager();

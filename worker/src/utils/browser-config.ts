import { Browser, BrowserContext } from 'playwright';
import { randomUA } from './user-agents';
import { proxyManager } from './proxy-manager';
import { logger } from './logger';

/**
 * Browser Configuration Helper
 *
 * Centraliza configuração de browser context com:
 * - User Agent rotation
 * - Proxy rotation
 * - Locale e timezone
 * - Outras configurações anti-detecção
 */

export interface BrowserContextConfig {
  browser: Browser;
  useProxy?: boolean; // Default: true se proxies disponíveis
  locale?: string; // Default: 'pt-BR'
  timezone?: string; // Default: 'America/Sao_Paulo'
}

export interface ConfiguredContext {
  context: BrowserContext;
  proxyUsed: any | null;
}

/**
 * Cria browser context configurado com UA rotation e proxy (se disponível)
 */
export async function createConfiguredContext(
  config: BrowserContextConfig
): Promise<ConfiguredContext> {
  const useProxy = config.useProxy !== false && proxyManager.isEnabled();
  const proxyConfig = useProxy ? proxyManager.getNext() : null;

  const contextOptions: any = {
    userAgent: randomUA(),
    locale: config.locale || 'pt-BR',
    timezoneId: config.timezone || 'America/Sao_Paulo',

    // Anti-detecção adicional
    viewport: {
      width: 1920,
      height: 1080,
    },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,

    // Headers padrão
    extraHTTPHeaders: {
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  };

  // Adiciona proxy se disponível
  if (proxyConfig) {
    contextOptions.proxy = proxyManager.getPlaywrightConfig(proxyConfig);

    logger.debug({
      proxy: proxyConfig.server,
      hasAuth: !!(proxyConfig.username),
    }, '🔄 Usando proxy');
  }

  const context = await config.browser.newContext(contextOptions);

  return {
    context,
    proxyUsed: proxyConfig,
  };
}

/**
 * Reporta resultado do uso do proxy
 */
export function reportProxyResult(
  proxyConfig: any | null,
  success: boolean,
  error?: string
): void {
  if (!proxyConfig) return;

  if (success) {
    proxyManager.reportSuccess(proxyConfig);
  } else {
    proxyManager.reportFailure(proxyConfig, error);
  }
}

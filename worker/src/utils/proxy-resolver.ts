/**
 * Proxy Resolver — Per-site proxy selection with fallback chain.
 *
 * Resolution order:
 * 1. Site-specific env var (ML_PROXY_URL, FB_PROXY_URL, OLX_PROXY_URL)
 * 2. Global env var (PROXY_URL)
 * 3. No proxy (direct connection)
 *
 * Usage:
 *   const proxy = resolveProxyForSite('MERCADO_LIVRE');
 *   const context = await browser.newContext({ proxy });
 */

export interface PlaywrightProxy {
  server: string;
  username?: string;
  password?: string;
}

export interface ProxyResolution {
  proxy: PlaywrightProxy | undefined;
  source: 'site_specific' | 'global' | 'none';
  site: string;
  masked: string;
}

const SITE_ENV_MAP: Record<string, string> = {
  MERCADO_LIVRE: 'ML_PROXY_URL',
  OLX: 'OLX_PROXY_URL',
  FACEBOOK_MARKETPLACE: 'FB_PROXY_URL',
  WEBMOTORS: 'WM_PROXY_URL',
  ICARROS: 'IC_PROXY_URL',
  ZAPIMOVEIS: 'ZAP_PROXY_URL',
  VIVAREAL: 'VR_PROXY_URL',
  IMOVELWEB: 'IW_PROXY_URL',
  LEILAO: 'LEILAO_PROXY_URL',
};

/**
 * Resolves proxy config for a given site.
 * Checks site-specific env first, then falls back to global PROXY_URL.
 */
export function resolveProxyForSite(site: string): ProxyResolution {
  // 1. Site-specific env
  const siteEnvKey = SITE_ENV_MAP[site];
  const siteUrl = siteEnvKey ? process.env[siteEnvKey] : undefined;

  if (siteUrl) {
    const proxy = parseProxyUrl(siteUrl);
    return {
      proxy,
      source: 'site_specific',
      site,
      masked: maskProxyUrl(siteUrl),
    };
  }

  // 2. Global fallback
  const globalUrl = process.env.PROXY_URL;
  if (globalUrl) {
    const proxy = parseProxyUrl(globalUrl);
    return {
      proxy,
      source: 'global',
      site,
      masked: maskProxyUrl(globalUrl),
    };
  }

  // 3. No proxy
  return {
    proxy: undefined,
    source: 'none',
    site,
    masked: 'direct',
  };
}

/**
 * Parses a proxy URL into Playwright-compatible format.
 * Supports: http://user:pass@host:port, http://host:port, socks5://...
 */
export function parseProxyUrl(url: string): PlaywrightProxy {
  const parsed = new URL(url);

  const proxy: PlaywrightProxy = {
    server: `${parsed.protocol}//${parsed.hostname}:${parsed.port || '80'}`,
  };

  if (parsed.username) {
    proxy.username = decodeURIComponent(parsed.username);
  }
  if (parsed.password) {
    proxy.password = decodeURIComponent(parsed.password);
  }

  return proxy;
}

/**
 * Masks proxy URL for safe logging (hides credentials).
 * "http://user:pass@host:8080" → "http://us**:****@host:8080"
 */
export function maskProxyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const user = parsed.username
      ? `${parsed.username.slice(0, 2)}**`
      : '';
    const pass = parsed.password ? '****' : '';
    const auth = user ? `${user}:${pass}@` : '';
    return `${parsed.protocol}//${auth}${parsed.hostname}:${parsed.port || '80'}`;
  } catch {
    return '<invalid-url>';
  }
}

/**
 * Verifies external IP and geolocation via a lightweight API.
 * Returns null on failure (best-effort, never blocks pipeline).
 */
export async function verifyGeo(
  page: import('playwright').Page
): Promise<{ ip: string; country: string; region?: string } | null> {
  try {
    const response = await page.goto('https://ipapi.co/json/', { timeout: 8000 });
    if (!response || !response.ok()) return null;

    const body = await page.textContent('body');
    if (!body) return null;

    const data = JSON.parse(body);
    return {
      ip: data.ip || 'unknown',
      country: data.country_code || 'unknown',
      region: data.region || undefined,
    };
  } catch {
    return null;
  }
}

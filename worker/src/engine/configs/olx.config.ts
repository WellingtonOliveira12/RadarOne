import { SiteConfig } from '../types';

/**
 * Parse Brazilian price format for OLX
 */
function parseBrazilianPrice(text: string): number {
  try {
    const cleaned = text
      .replace(/R\$/g, '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
}

export const olxConfig: SiteConfig = {
  site: 'OLX',
  domain: 'olx.com.br',
  authMode: 'cookies_optional',
  selectors: {
    containers: [
      // PRIMARY: BEM block class for OLX ad card wrapper (2025-2026)
      // The <a> or <div> wrapper has class "olx-adcard" (exact BEM block).
      // DO NOT use [class*="AdCard"] — it matches inner elements (AdCard_media, AdCard_content)
      // which contain only images or only text, not the full card.
      '.olx-adcard',
      // Fallback: Design System component
      '[data-ds-component="DS-AdCard"]',
      // Fallback: legacy patterns
      'a[data-lurker-detail]',
      // Broader fallback: any element with AdCard in class that IS an anchor
      'a[class*="AdCard"]',
    ],
    title: [
      'h2',
      'h2[class*="title"]',
      '[data-ds-component="DS-Text"]',
      'span[class*="title"]',
      'h3',
    ],
    price: [
      // OLX 2025-2026: price inside data-testid containers (confirmed in production)
      '[data-testid="adcard-price-info"] h3',
      '[data-testid="adcard-price-info"] p',
      '[data-testid="adcard-price-info"] span',
      'h3[class*="price"]',
      'span[class*="price"]',
      'p[class*="price"]',
      'span[aria-label*="preço"]',
    ],
    link: [
      'a[href*="olx.com.br"]',
      'a[href*="/d/"]',
      'a[data-lurker-detail]',
      'a[href*="/autos"]',
      'a[href*="/item"]',
      'a',
    ],
    location: [
      'span[class*="location"]',
      '[data-testid="ad-location"]',
      '[class*="location"]',
      'p[class*="detail"]',
      'span[class*="detail"]',
    ],
    image: [
      'img[src*="img.olx"]',
      'img[data-src*="img.olx"]',
      'img[loading="lazy"]',
      'img',
    ],
  },
  rateLimit: { tokensPerMin: 15 },
  timeouts: [10000, 20000, 30000],
  navigationTimeout: 60000,
  renderDelay: 3500,
  renderWaitSelector: '.olx-adcard, [data-ds-component="DS-AdCard"], a[data-lurker-detail]',
  scroll: {
    strategy: 'fixed',
    fixedSteps: 4,
    delayBetweenScrollsMs: 1500,
  },
  antiDetection: {
    stealthLevel: 'standard',
    blockImages: false,
    blockFonts: false,
    blockCSS: false,
    blockMedia: false,
    injectStealthScripts: true,
    randomizeViewport: true,
  },
  externalIdExtractor: (url: string) => {
    // Strip query string and fragment before extracting ID
    const cleanUrl = url.split(/[?#]/)[0];
    // OLX ad URLs end with a numeric ID: .../some-title-1234567890
    // Try trailing numeric segment first (most common)
    const trailingMatch = cleanUrl.match(/[/-](\d{7,})$/);
    if (trailingMatch) return `OLX-${trailingMatch[1]}`;
    // Fallback: any long numeric segment in the path
    const pathMatch = cleanUrl.match(/\/(\d{7,})/);
    if (pathMatch) return `OLX-${pathMatch[1]}`;
    // Fallback: shorter numeric ID (5+ digits) — OLX may use shorter IDs
    const shortMatch = cleanUrl.match(/[/-](\d{5,})$/);
    if (shortMatch) return `OLX-${shortMatch[1]}`;
    // Fallback: deterministic hash from URL pathname (stable across cycles)
    // This handles new OLX URL formats without numeric IDs
    try {
      const pathname = new URL(url).pathname;
      if (pathname && pathname.length > 5 && pathname !== '/') {
        // Simple deterministic hash
        let hash = 0;
        for (let i = 0; i < pathname.length; i++) {
          hash = ((hash << 5) - hash + pathname.charCodeAt(i)) | 0;
        }
        return `OLX-P${Math.abs(hash).toString(36)}`;
      }
    } catch { /* invalid URL */ }
    return '';
  },
  priceParser: parseBrazilianPrice,
  urlNormalizer: (url: string) => {
    if (url.startsWith('http')) return url;
    // OLX uses regional subdomains (sp.olx.com.br, rj.olx.com.br, etc.)
    // Default to www if no subdomain is present
    return `https://www.olx.com.br${url}`;
  },
  noResultsPatterns: [
    'nenhum resultado',
    'não encontramos',
    'nao encontramos',
    'no results',
  ],
  loginPatterns: [
    'faça login',
    'faca login',
    'entrar na conta',
  ],
  // Warm-up: visit homepage first to establish cookies/anti-bot tokens before searching.
  warmupUrl: 'https://www.olx.com.br/',
  // Search via UI: type keyword into search input and submit instead of direct URL navigation.
  // OLX SPA blocks direct ?q= hits for headless browsers but allows UI-driven search.
  searchViaInput: true,
  searchInputSelectors: [
    'input[data-testid="search-input"]',
    'input[name="q"]',
    'input[type="search"]',
    'input[placeholder*="Buscar"]',
    'input[placeholder*="buscar"]',
    'input[placeholder*="O que"]',
    '#searchtext',
    'input.olx-input',
    'header input[type="text"]',
    'nav input[type="text"]',
  ],
  // Realistic navigation headers.
  extraHeaders: {
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  },
};

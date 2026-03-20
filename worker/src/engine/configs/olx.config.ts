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
      // PRIMARY: AdCard class pattern (confirmed 129 matches in production 2026-03-20)
      '[class*="AdCard"]',
      // OLX Design System
      '[data-ds-component="DS-AdCard"]',
      'li[data-ds-component="DS-AdCard"]',
      'section[data-ds-component="DS-AdCard"]',
      // Legacy patterns
      'a[data-lurker-detail]',
      '.olx-ad-card',
      '#ad-list li',
      'ul[class*="list"] > li',
    ],
    title: [
      'h2',
      'h2[class*="title"]',
      '[data-ds-component="DS-Text"]',
      'span[class*="title"]',
      'h3',
    ],
    price: [
      'span[class*="price"]',
      'p[class*="price"]',
      '[data-ds-component="DS-Text"]',
      'span[aria-label*="preço"]',
      'span[aria-label*="preco"]',
    ],
    link: [
      // OLX 2025-2026: ad links may use /autos-e-pecas/, /item/, or other paths
      'a[href*="olx.com.br"]',
      'a[href*="/d/"]',
      'a[data-lurker-detail]',
      'a[href*="/autos"]',
      'a[href*="/item"]',
      'a',
    ],
    location: [
      '[data-testid="ad-location"]',
      'span[class*="location"]',
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
  renderWaitSelector: '[class*="AdCard"], [data-ds-component="DS-AdCard"], a[data-lurker-detail]',
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

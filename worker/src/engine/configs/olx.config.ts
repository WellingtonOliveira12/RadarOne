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
      // OLX Design System (2024-2026)
      '[data-ds-component="DS-AdCard"]',
      'li[data-ds-component="DS-AdCard"]',
      'section[data-ds-component="DS-AdCard"]',
      // Legacy lurker
      'a[data-lurker-detail]',
      // Modern hashed class patterns
      'li[class*="sc-"] a[href*="/d/"]',
      '[class*="AdCard"]',
      '.olx-ad-card',
      // Broad fallback: any <a> linking to /d/ inside a list
      '#ad-list li',
      'ul[class*="list"] > li',
      'section[class*="list"] a[href*="/d/"]',
    ],
    title: [
      'h2',
      'h2[class*="title"]',
      '[data-ds-component="DS-Text"]',
      '.olx-ad-card__title',
      'span[class*="title"]',
      'h3',
    ],
    price: [
      'span[class*="price"]',
      'p[class*="price"]',
      '[data-ds-component="DS-Text"]',
      '.olx-ad-card__price',
      'span[aria-label*="preço"]',
      'span[aria-label*="preco"]',
    ],
    link: [
      'a[href*="/d/"]',
      'a[data-lurker-detail]',
      'a[href*="olx.com.br"]',
      'a',
    ],
    location: [
      '[data-testid="ad-location"]',
      'span[class*="location"]',
      '.olx-ad-card__location',
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
  renderWaitSelector: '[data-ds-component="DS-AdCard"], a[data-lurker-detail], a[href*="/d/"]',
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

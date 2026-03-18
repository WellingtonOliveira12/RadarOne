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
  authMode: 'anonymous',
  selectors: {
    containers: [
      '[data-ds-component="DS-AdCard"]',
      'li[data-ds-component="DS-AdCard"]',
      'a[data-lurker-detail]',
      'li.sc-1fcmfeb-2',          // OLX 2025+ listing item class pattern
      'section[data-ds-component="DS-AdCard"]',
      '[class*="AdCard"]',
      '.olx-ad-card',
      'ul[class*="list"] > li a[href*="/d/"]', // List items with ad links
    ],
    title: [
      'h2',
      '[data-ds-component="DS-Text"]',
      '.olx-ad-card__title',
      'h2[class*="title"]',
      'span[class*="title"]',
    ],
    price: [
      'span[class*="price"]',
      '[data-ds-component="DS-Text"]',
      '.olx-ad-card__price',
      'p[class*="price"]',
      'span[aria-label*="preço"]',
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
    ],
    image: [
      'img[src*="img.olx"]',
      'img[data-src*="img.olx"]',
      'img',
    ],
  },
  rateLimit: { tokensPerMin: 15 },
  timeouts: [8000, 15000, 25000],
  navigationTimeout: 45000,
  renderDelay: 2000,
  scroll: {
    strategy: 'fixed',
    fixedSteps: 3,
    delayBetweenScrollsMs: 1200,
  },
  antiDetection: {
    stealthLevel: 'minimal',
    blockImages: true,
    blockFonts: true,
    blockCSS: false,
    blockMedia: false,
    injectStealthScripts: false,
    randomizeViewport: false,
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
};

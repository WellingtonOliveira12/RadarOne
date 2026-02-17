import { SiteConfig } from '../types';

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

export const webmotorsConfig: SiteConfig = {
  site: 'WEBMOTORS',
  domain: 'webmotors.com.br',
  authMode: 'anonymous',
  selectors: {
    containers: [
      '[data-testid="listing-card"]',
      '.card-vehicle',
      'article[class*="card"]',
      '.listing-card',
    ],
    title: [
      '[data-testid="card-title"]',
      '.card-vehicle__title',
      'h2',
    ],
    price: [
      '[data-testid="best-price"]',
      '.card-vehicle__price',
      'span[class*="price"]',
    ],
    link: [
      'a',
      'a[href*="webmotors"]',
    ],
    location: [
      '[data-testid="card-location"]',
      '.card-vehicle__location',
      'span[class*="location"]',
    ],
    image: [
      'img',
    ],
  },
  rateLimit: { tokensPerMin: 12 },
  timeouts: [5000, 10000, 15000],
  navigationTimeout: 30000,
  renderDelay: 800,
  scroll: {
    strategy: 'fixed',
    fixedSteps: 3,
    delayBetweenScrollsMs: 800,
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
    const match = url.match(/\/(\d+)\?/) || url.match(/\/(\d+)$/);
    return match ? `WM-${match[1]}` : '';
  },
  priceParser: parseBrazilianPrice,
  urlNormalizer: (url: string) =>
    url.startsWith('http') ? url : `https://www.webmotors.com.br${url}`,
  noResultsPatterns: [
    'nenhum resultado',
    'não encontramos',
    'no results',
  ],
  loginPatterns: [],
};

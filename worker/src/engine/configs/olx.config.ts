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
      '.olx-ad-card',
      '[class*="AdCard"]',
      'a[data-lurker-detail]',
    ],
    title: [
      'h2',
      '[data-ds-component="DS-Text"]',
      '.olx-ad-card__title',
    ],
    price: [
      '[data-ds-component="DS-Text"]',
      '.olx-ad-card__price',
      'span[class*="price"]',
    ],
    link: [
      'a',
      'a[href*="olx.com.br"]',
    ],
    location: [
      '[data-testid="ad-location"]',
      '.olx-ad-card__location',
      'span[class*="location"]',
    ],
    image: [
      'img',
    ],
  },
  rateLimit: { tokensPerMin: 15 },
  timeouts: [5000, 10000, 15000],
  navigationTimeout: 30000,
  renderDelay: 1000,
  scroll: {
    strategy: 'fixed',
    fixedSteps: 2,
    delayBetweenScrollsMs: 1000,
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
    const match = url.match(/\/(\d+)$/);
    return match ? `OLX-${match[1]}` : '';
  },
  priceParser: parseBrazilianPrice,
  urlNormalizer: (url: string) =>
    url.startsWith('http') ? url : `https://www.olx.com.br${url}`,
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

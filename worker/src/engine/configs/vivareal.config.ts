import { SiteConfig } from '../types';

/**
 * Parse Brazilian price format for Viva Real
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

export const vivaRealConfig: SiteConfig = {
  site: 'VIVA_REAL',
  domain: 'vivareal.com.br',
  authMode: 'anonymous',
  selectors: {
    containers: [
      '.property-card__container',
      '[data-type="property"]',
      'article.property-card',
      '.card-container',
    ],
    title: [
      '.property-card__title',
      'h2.card__address',
      'h2',
    ],
    price: [
      '.property-card__price',
      '.card__price',
      'span[class*="price"]',
    ],
    link: [
      'a.property-card__content-link',
      'a.card__link',
      'a',
    ],
    location: [
      '.property-card__address',
      '.card__street',
      'span[class*="location"]',
    ],
    image: [
      'img',
    ],
  },
  rateLimit: { tokensPerMin: 8 },
  timeouts: [5000, 10000, 15000],
  navigationTimeout: 30000,
  renderDelay: 1000,
  scroll: {
    strategy: 'fixed',
    fixedSteps: 3,
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
    const match = url.match(/id-(\d+)/);
    return match ? `VR-${match[1]}` : '';
  },
  priceParser: parseBrazilianPrice,
  urlNormalizer: (url: string) =>
    url.startsWith('http') ? url : `https://www.vivareal.com.br${url}`,
  noResultsPatterns: [
    'nenhum resultado',
    'não encontramos',
  ],
  loginPatterns: [
    'faça login',
  ],
};

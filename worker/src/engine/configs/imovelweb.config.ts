import { SiteConfig } from '../types';

/**
 * Parse Brazilian price format for ImovelWeb
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

export const imovelWebConfig: SiteConfig = {
  site: 'IMOVELWEB',
  domain: 'imovelweb.com.br',
  authMode: 'anonymous',
  selectors: {
    containers: [
      '[data-qa="posting PROPERTY"]',
      '.posting-card',
      'article.property-card',
      '.card-container',
    ],
    title: [
      '[data-qa="POSTING_CARD_DESCRIPTION"]',
      '.property-card__title',
      'h2',
    ],
    price: [
      '[data-qa="POSTING_CARD_PRICE"]',
      '.property-card__price',
      'span[class*="price"]',
    ],
    link: [
      'a',
      'a[href*="imovelweb"]',
    ],
    location: [
      '[data-qa="POSTING_CARD_LOCATION"]',
      '.property-card__address',
    ],
    image: [
      'img',
    ],
  },
  rateLimit: { tokensPerMin: 10 },
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
    const match = url.match(/-(\d+)\.html/);
    return match ? `IW-${match[1]}` : '';
  },
  priceParser: parseBrazilianPrice,
  urlNormalizer: (url: string) =>
    url.startsWith('http') ? url : `https://www.imovelweb.com.br${url}`,
  noResultsPatterns: [
    'nenhum resultado',
    'não encontramos',
    'no results',
  ],
  loginPatterns: [
    'faça login',
  ],
};

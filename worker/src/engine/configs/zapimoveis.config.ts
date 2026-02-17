import { SiteConfig } from '../types';

/**
 * Parse Brazilian price format for ZAP Imóveis
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

export const zapImoveisConfig: SiteConfig = {
  site: 'ZAP_IMOVEIS',
  domain: 'zapimoveis.com.br',
  authMode: 'anonymous',
  selectors: {
    containers: [
      '[data-position]',
      '.card-container',
      '[data-type="property"]',
      'article.property-card',
    ],
    title: [
      'h2.card__address',
      '.property-card__title',
      'h2',
    ],
    price: [
      '.card__price',
      '.property-card__price',
      'span[class*="price"]',
    ],
    link: [
      'a.card__link',
      'a.property-card__content-link',
      'a',
    ],
    location: [
      '.card__street',
      '.property-card__address',
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
    const matchDataId = url.match(/data-id=(\d+)/);
    if (matchDataId) return `ZAP-${matchDataId[1]}`;
    const match = url.match(/(\d+)$/);
    return match ? `ZAP-${match[1]}` : '';
  },
  priceParser: parseBrazilianPrice,
  urlNormalizer: (url: string) =>
    url.startsWith('http') ? url : `https://www.zapimoveis.com.br${url}`,
  noResultsPatterns: [
    'nenhum resultado',
    'não encontramos',
  ],
  loginPatterns: [
    'faça login',
  ],
};

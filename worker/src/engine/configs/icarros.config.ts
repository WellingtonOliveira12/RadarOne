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

export const icarrosConfig: SiteConfig = {
  site: 'ICARROS',
  domain: 'icarros.com.br',
  authMode: 'anonymous',
  selectors: {
    containers: [
      '.ItemList__ItemWrap',
      '.card-item',
      'article[class*="item"]',
      '.listing-item',
    ],
    title: [
      '.CardDescription__Title',
      '.card-item__title',
      'h2',
    ],
    price: [
      '.CardPrice__Value',
      '.card-item__price',
      'span[class*="price"]',
    ],
    link: [
      'a',
      'a[href*="icarros"]',
    ],
    location: [
      '.CardLocation',
      '.card-item__location',
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
    const match = url.match(/\/(\d+)\.html/);
    return match ? `IC-${match[1]}` : '';
  },
  priceParser: parseBrazilianPrice,
  urlNormalizer: (url: string) =>
    url.startsWith('http') ? url : `https://www.icarros.com.br${url}`,
  noResultsPatterns: [
    'nenhum resultado',
    'não encontramos',
    'no results',
  ],
  loginPatterns: [],
};

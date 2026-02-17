import { SiteConfig } from '../types';

function parseLeilaoPrice(text: string): number {
  try {
    const cleaned = text.replace(/[^\d,]/g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
}

export const leilaoConfig: SiteConfig = {
  site: 'LEILAO',
  domain: 'leilao.generic',
  authMode: 'anonymous',
  selectors: {
    // Multi-platform: Superbid, VIP Leilões, Sodré Santoro, generic
    containers: [
      '.card-lot',
      '.lot-card',
      '.item-lote',
      '.lote',
      '.lote-item',
      '.lot',
      '[class*="lot"]',
      '[class*="lote"]',
      'article',
      '.card',
    ],
    title: [
      '.lot-title',
      '.titulo',
      '.descricao',
      'h3',
      'h4',
      '[class*="title"]',
      '[class*="titulo"]',
    ],
    price: [
      '.price',
      '.bid-value',
      '.valor',
      '.lance',
      '.lance-atual',
      '[class*="price"]',
      '[class*="valor"]',
      '[class*="lance"]',
    ],
    link: [
      'a',
    ],
    location: [
      '[class*="location"]',
      '[class*="local"]',
    ],
    image: [
      'img',
    ],
  },
  rateLimit: { tokensPerMin: 5 },
  timeouts: [5000, 10000, 20000],
  navigationTimeout: 30000,
  renderDelay: 2000,
  scroll: {
    strategy: 'fixed',
    fixedSteps: 3,
    delayBetweenScrollsMs: 1000,
  },
  antiDetection: {
    stealthLevel: 'standard',
    blockImages: false,
    blockFonts: true,
    blockCSS: false,
    blockMedia: false,
    injectStealthScripts: true,
    randomizeViewport: false,
  },
  externalIdExtractor: (url: string) => {
    const slug = url.split('/').pop() || '';
    return slug ? `LEI-${slug}` : '';
  },
  priceParser: parseLeilaoPrice,
  urlNormalizer: (url: string) => {
    if (url.startsWith('http')) return url;
    // Cannot determine base URL for generic leilão sites
    return url;
  },
  noResultsPatterns: [
    'nenhum resultado',
    'nenhum lote',
    'não encontrado',
  ],
  loginPatterns: [
    'faça login',
    'entrar',
  ],
};

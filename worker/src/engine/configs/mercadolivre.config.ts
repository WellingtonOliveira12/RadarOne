import { SiteConfig, AuthContextResult } from '../types';
import { getMLAuthenticatedContext } from '../../utils/ml-auth-provider';

/**
 * Parse Brazilian price format: "2.350,00" -> 2350.00, "25000" -> 25000
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

/**
 * Custom auth provider for Mercado Livre.
 * Uses the existing ML auth cascade:
 * 0) Database (user session)
 * A) Secret file
 * B) ENV base64
 * C) Session manager
 * D) Anonymous fallback
 */
async function mlAuthProvider(userId: string): Promise<AuthContextResult> {
  const result = await getMLAuthenticatedContext(userId);

  return {
    browser: result.browser,
    context: result.context,
    page: result.page,
    authenticated: result.authState.loaded,
    source: result.authState.source === 'none' ? 'anonymous' : (result.authState.source as any),
    sessionId: result.authState.sessionId,
    cleanup: result.cleanup,
  };
}

export const mercadoLivreConfig: SiteConfig = {
  site: 'MERCADO_LIVRE',
  domain: 'mercadolivre.com.br',
  authMode: 'cookies_optional',
  customAuthProvider: mlAuthProvider,
  selectors: {
    containers: [
      'li.ui-search-layout__item',
      'div.ui-search-result__wrapper',
      '.ui-search-result__content',
      '.ui-search-result',
      '.ui-search-layout__item',
      '.andes-card.ui-search-result',
      '[class*="ui-search-result"]',
      '[class*="search-layout__item"]',
      '.shops__result-item',
      '.results-item',
      'article[class*="result"]',
    ],
    title: [
      '.ui-search-item__title',
      '.ui-search-item__group__element .ui-search-item__title',
      'h2.ui-search-item__title',
      '[class*="item__title"]',
      '.poly-box h2',
      '.poly-component__title',
    ],
    price: [
      '.andes-money-amount__fraction',
      '.ui-search-price__second-line .andes-money-amount__fraction',
      '[class*="price"] .andes-money-amount__fraction',
      '.price-tag-fraction',
      '[class*="money-amount__fraction"]',
    ],
    link: [
      'a.ui-search-link',
      'a.ui-search-item__group__element',
      'a.ui-search-result__content',
      'a[href*="/MLB"]',
      'a[href*="mercadolivre.com.br/"]',
    ],
    location: [
      '.ui-search-item__location-label',
      '.ui-search-item__group__element--location',
      '[class*="location"]',
      '.ui-search-item__location',
    ],
    image: ['img'],
  },
  rateLimit: { tokensPerMin: 10 },
  timeouts: [5000, 10000, 20000],
  navigationTimeout: 45000,
  renderDelay: 2000,
  scroll: {
    strategy: 'fixed',
    fixedSteps: 3,
    delayBetweenScrollsMs: 500,
  },
  antiDetection: {
    stealthLevel: 'standard',
    blockImages: true,
    blockFonts: true,
    blockCSS: false,
    blockMedia: false,
    injectStealthScripts: true,
    randomizeViewport: false,
  },
  externalIdExtractor: (url: string) => {
    const patterns = [
      /\/ML[A-Z]-?(\d+)/i,
      /[?&]id=ML[A-Z]-?(\d+)/i,
      /ML[A-Z]-?(\d+)/i,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[0].replace(/\//g, '').replace(/-/g, '');
      }
    }
    // Fallback: numeric sequence
    const numericMatch = url.match(/(\d{8,})/);
    return numericMatch ? `MLB${numericMatch[1]}` : '';
  },
  priceParser: parseBrazilianPrice,
  urlNormalizer: (url: string) =>
    url.startsWith('http') ? url : `https://www.mercadolivre.com.br${url}`,
  noResultsPatterns: [
    'não encontramos',
    'nao encontramos',
    'sem resultados',
    'no results',
    'nenhum resultado',
  ],
  loginPatterns: [
    'para continuar, acesse sua conta',
    'acesse sua conta',
    'faça login',
    'faca login',
    'entre na sua conta',
    'identifique-se',
  ],
};

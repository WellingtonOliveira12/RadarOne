import { SiteConfig } from '../types';

/**
 * Parse Brazilian price format for Facebook
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

export const facebookConfig: SiteConfig = {
  site: 'FACEBOOK_MARKETPLACE',
  domain: 'facebook.com',
  authMode: 'cookies_required',
  // No customAuthProvider — uses generic auth-strategy.ts (DB cookies)
  selectors: {
    containers: [
      'a[href*="/marketplace/item/"]',
      'div[data-testid="marketplace_feed_item"]',
      'div[role="listitem"]',
      'div[class*="x9f619"][class*="x78zum5"]',
    ],
    title: [
      'span[dir="auto"]',
      'span[class*="x1lliihq"]',
    ],
    price: [
      'span[class*="x193iq5w"]',
      'span[dir="auto"]',
    ],
    link: [
      'a[href*="/marketplace/item/"]',
    ],
    location: [
      'span[class*="x1cp"]',
    ],
    image: [
      'img[src*="scontent"]',
      'img',
    ],
  },
  rateLimit: { tokensPerMin: 5 },
  timeouts: [8000, 15000, 25000],
  navigationTimeout: 60000,
  renderDelay: 4000,
  renderWaitSelector: 'a[href*="/marketplace/item/"]',
  scroll: {
    strategy: 'adaptive',
    maxScrollAttempts: 10,
    stableThreshold: 2,
    delayBetweenScrollsMs: 1200,
  },
  antiDetection: {
    stealthLevel: 'aggressive',
    blockImages: true,
    blockFonts: true,
    blockCSS: false,
    blockMedia: true,
    injectStealthScripts: true,
    randomizeViewport: true,
  },
  supportedUrlPatterns: [
    /facebook\.com\/marketplace/i,
    /facebook\.com\/groups\/.*\/buy_sell/i,
  ],
  externalIdExtractor: (url: string) => {
    const m = url.match(/\/marketplace\/item\/(\d+)/);
    return m ? `FB-${m[1]}` : '';
  },
  priceParser: parseBrazilianPrice,
  urlNormalizer: (url: string) =>
    url.startsWith('http') ? url : `https://www.facebook.com${url}`,
  noResultsPatterns: [
    'no listings found',
    'nenhuma publicação',
    'nenhum resultado',
  ],
  loginPatterns: [
    'log in to continue',
    'you must log in',
    'faça login',
    'create an account',
  ],
  checkpointPatterns: [
    'checkpoint',
    'account has been locked',
    'confirm your identity',
    'confirme sua identidade',
  ],
};

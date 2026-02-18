import { describe, it, expect, vi } from 'vitest';
import { extractAds } from '../../src/engine/ad-extractor';
import { SiteConfig, MonitorWithFilters } from '../../src/engine/types';

/**
 * Creates a mock page where $$eval runs the callback against provided DOM-like elements.
 * Each element is a plain object simulating the Element API used inside $$eval.
 */
function createMockPage(elements: MockElement[]) {
  return {
    $$eval: vi.fn().mockImplementation(
      (_selector: string, fn: Function, params: any) => {
        // Run the extraction callback against our mock elements
        return fn(elements, params);
      }
    ),
    locator: vi.fn().mockReturnValue({
      count: vi.fn().mockResolvedValue(1),
    }),
  } as any;
}

interface MockElement {
  tagName: string;
  href?: string;
  children?: Record<string, MockElement | MockElement[] | null>;
  textContent?: string;
  spans?: Array<{ textContent: string }>;
}

/**
 * Creates a DOM-like element object that supports querySelector/querySelectorAll
 * and getAttribute, matching what the $$eval callback expects.
 */
function createElement(opts: {
  tagName: string;
  href?: string;
  childSelectors?: Record<string, { tagName?: string; href?: string; textContent?: string; src?: string } | null>;
  spans?: Array<{ textContent: string }>;
}): any {
  const { tagName, href, childSelectors = {}, spans = [] } = opts;

  return {
    tagName,
    getAttribute(attr: string) {
      if (attr === 'href') return href || '';
      return '';
    },
    querySelector(sel: string): any {
      // Check childSelectors first
      if (childSelectors[sel] !== undefined) {
        const child = childSelectors[sel];
        if (!child) return null;
        return {
          tagName: child.tagName || 'SPAN',
          textContent: child.textContent || '',
          getAttribute(a: string) {
            if (a === 'href') return child.href || '';
            if (a === 'src') return child.src || '';
            return '';
          },
        };
      }
      // Fallback for generic selectors
      if (sel === 'a') {
        // For <a> containers, there's no nested <a>
        if (tagName === 'A') return null;
        return null;
      }
      if (sel === 'h2, h3') return null;
      return null;
    },
    querySelectorAll(sel: string): any[] {
      if (sel === 'span') {
        return spans.map((s) => ({
          textContent: s.textContent,
          trim() { return this.textContent; },
        }));
      }
      return [];
    },
  };
}

// Minimal SiteConfig for tests
const testConfig: SiteConfig = {
  site: 'FACEBOOK_MARKETPLACE',
  domain: 'facebook.com',
  authMode: 'cookies_required',
  selectors: {
    containers: ['a[href*="/marketplace/item/"]'],
    title: ['span[dir="auto"]'],
    price: ['span[class*="x193iq5w"]'],
    link: ['a[href*="/marketplace/item/"]'],
    location: [],
    image: [],
  },
  rateLimit: { tokensPerMin: 5 },
  timeouts: [5000],
  navigationTimeout: 30000,
  renderDelay: 1000,
  scroll: { strategy: 'fixed', fixedSteps: 1, delayBetweenScrollsMs: 100 },
  antiDetection: {
    stealthLevel: 'aggressive',
    blockImages: false,
    blockFonts: false,
    blockCSS: false,
    blockMedia: false,
    injectStealthScripts: false,
    randomizeViewport: false,
  },
  externalIdExtractor: (url: string) => {
    const m = url.match(/\/marketplace\/item\/(\d+)/);
    return m ? `FB-${m[1]}` : '';
  },
  priceParser: (text: string) => {
    const cleaned = text.replace(/R\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const p = parseFloat(cleaned);
    return isNaN(p) ? 0 : p;
  },
  urlNormalizer: (url: string) =>
    url.startsWith('http') ? url : url ? `https://www.facebook.com${url}` : '',
  noResultsPatterns: [],
  loginPatterns: [],
  checkpointPatterns: [],
};

const testMonitor: MonitorWithFilters = {
  id: 'mon-1',
  userId: 'user-1',
  name: 'Test Monitor',
  site: 'FACEBOOK_MARKETPLACE',
  searchUrl: 'https://facebook.com/marketplace/category/search',
  active: true,
};

describe('extractAds', () => {
  it('should extract URL from container <a> element directly (Facebook fix)', async () => {
    const elements = [
      createElement({
        tagName: 'A',
        href: '/marketplace/item/123456789/',
        childSelectors: {
          'span[dir="auto"]': { textContent: 'iPhone 15 Pro Max' },
          'span[class*="x193iq5w"]': { textContent: 'R$ 5.000' },
        },
      }),
    ];

    const page = createMockPage(elements);
    const result = await extractAds(page, 'a[href*="/marketplace/item/"]', testConfig, testMonitor);

    expect(result.adsRaw).toBe(1);
    expect(result.ads).toHaveLength(1);
    expect(result.ads[0].url).toBe('https://www.facebook.com/marketplace/item/123456789/');
    expect(result.ads[0].title).toBe('iPhone 15 Pro Max');
    expect(result.ads[0].externalId).toBe('FB-123456789');
  });

  it('should extract URL from nested <a> for div containers (backward compat ML/OLX)', async () => {
    const elements = [
      createElement({
        tagName: 'DIV',
        childSelectors: {
          'span[dir="auto"]': { textContent: 'Samsung Galaxy S24' },
          'span[class*="x193iq5w"]': { textContent: 'R$ 3.000' },
          'a[href*="/marketplace/item/"]': { href: '/marketplace/item/987654321/', tagName: 'A' },
        },
      }),
    ];

    const page = createMockPage(elements);
    const result = await extractAds(page, 'div[data-testid="item"]', testConfig, testMonitor);

    expect(result.adsRaw).toBe(1);
    expect(result.ads).toHaveLength(1);
    expect(result.ads[0].url).toBe('https://www.facebook.com/marketplace/item/987654321/');
    expect(result.ads[0].title).toBe('Samsung Galaxy S24');
  });

  it('should use span fallback for title when container is <a> and no title selector matches', async () => {
    const elements = [
      createElement({
        tagName: 'A',
        href: '/marketplace/item/111222333/',
        childSelectors: {
          'span[dir="auto"]': null,
          'span[class*="x193iq5w"]': { textContent: 'R$ 1.500' },
        },
        spans: [
          { textContent: 'R$ 1.500' },       // skipped: contains R$
          { textContent: '12' },              // skipped: starts with digit
          { textContent: 'ab' },              // skipped: too short (<=3)
          { textContent: 'Mesa de escritorio grande' }, // this one matches
        ],
      }),
    ];

    const page = createMockPage(elements);
    const result = await extractAds(page, 'a[href*="/marketplace/item/"]', testConfig, testMonitor);

    expect(result.ads).toHaveLength(1);
    expect(result.ads[0].title).toBe('Mesa de escritorio grande');
  });

  it('should count no_url in skippedReasons when URL is empty', async () => {
    const elements = [
      createElement({
        tagName: 'A',
        href: '', // empty href
        childSelectors: {
          'span[dir="auto"]': { textContent: 'Some Product' },
          'span[class*="x193iq5w"]': { textContent: 'R$ 100' },
        },
      }),
    ];

    const page = createMockPage(elements);
    const result = await extractAds(page, 'a[href*="/marketplace/item/"]', testConfig, testMonitor);

    expect(result.ads).toHaveLength(0);
    expect(result.skippedReasons).toHaveProperty('no_url', 1);
  });

  it('should fallback to el.querySelector("a") for div containers with no linkSel match', async () => {
    // Simulate a div container where the link selector doesn't match,
    // but there's a generic <a> tag available
    const elements = [
      createElement({
        tagName: 'DIV',
        childSelectors: {
          'span[dir="auto"]': { textContent: 'Notebook Dell' },
          'span[class*="x193iq5w"]': { textContent: 'R$ 2.000' },
          'a[href*="/marketplace/item/"]': null, // link selector doesn't match
          'a': { href: '/marketplace/item/555666777/', tagName: 'A' }, // generic <a> fallback
        },
      }),
    ];

    const page = createMockPage(elements);
    const result = await extractAds(page, 'div.container', testConfig, testMonitor);

    expect(result.adsRaw).toBe(1);
    expect(result.ads).toHaveLength(1);
    expect(result.ads[0].url).toBe('https://www.facebook.com/marketplace/item/555666777/');
  });
});

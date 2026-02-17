import { describe, it, expect, vi } from 'vitest';

// Mock Playwright Page
function createMockPage(overrides: {
  url?: string;
  title?: string;
  evaluate?: any;
}) {
  return {
    url: () => overrides.url || 'https://example.com/search',
    title: async () => overrides.title || 'Test Page',
    evaluate: overrides.evaluate || vi.fn().mockResolvedValue({
      hasRecaptcha: false,
      hasHcaptcha: false,
      hasCloudflare: false,
      hasDatadome: false,
      hasLoginForm: false,
      hasLoginText: false,
      hasNoResultsMsg: false,
      hasSearchResults: true,
      hasCheckpoint: false,
      visibleElements: 100,
      bodyLength: 10000,
    }),
  } as any;
}

// Import after mock setup
import { diagnosePage } from '../../src/engine/page-diagnoser';
import { SiteConfig } from '../../src/engine/types';

const baseSiteConfig: SiteConfig = {
  site: 'TEST_SITE',
  domain: 'example.com',
  authMode: 'anonymous',
  selectors: {
    containers: ['.item'],
    title: ['h2'],
    price: ['.price'],
    link: ['a'],
    location: ['.location'],
    image: ['img'],
  },
  rateLimit: { tokensPerMin: 10 },
  timeouts: [5000],
  navigationTimeout: 30000,
  renderDelay: 1000,
  scroll: { strategy: 'fixed', fixedSteps: 2 },
  antiDetection: {
    stealthLevel: 'minimal',
    blockImages: false,
    blockFonts: false,
    blockCSS: false,
    blockMedia: false,
    injectStealthScripts: false,
    randomizeViewport: false,
  },
  externalIdExtractor: (url) => url.match(/\/(\d+)/)?.[1] || '',
  priceParser: (text) => parseFloat(text.replace(/[^\d.]/g, '')) || 0,
  urlNormalizer: (url) => url,
  noResultsPatterns: ['no results', 'nenhum resultado'],
  loginPatterns: ['log in', 'faça login'],
};

describe('diagnosePage', () => {
  it('should detect CONTENT page', async () => {
    const page = createMockPage({});
    const result = await diagnosePage(page, baseSiteConfig, 'https://example.com/search');

    expect(result.pageType).toBe('CONTENT');
    expect(result.signals.hasSearchResults).toBe(true);
    expect(result.finalUrl).toBe('https://example.com/search');
  });

  it('should detect LOGIN_REQUIRED page', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue({
        hasRecaptcha: false,
        hasHcaptcha: false,
        hasCloudflare: false,
        hasDatadome: false,
        hasLoginForm: true,
        hasLoginText: true,
        hasNoResultsMsg: false,
        hasSearchResults: false,
        hasCheckpoint: false,
        visibleElements: 10,
        bodyLength: 500,
      }),
    });

    const result = await diagnosePage(page, baseSiteConfig, 'https://example.com/search');
    expect(result.pageType).toBe('LOGIN_REQUIRED');
  });

  it('should detect CAPTCHA page', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue({
        hasRecaptcha: true,
        hasHcaptcha: false,
        hasCloudflare: false,
        hasDatadome: false,
        hasLoginForm: false,
        hasLoginText: false,
        hasNoResultsMsg: false,
        hasSearchResults: false,
        hasCheckpoint: false,
        visibleElements: 5,
        bodyLength: 300,
      }),
    });

    const result = await diagnosePage(page, baseSiteConfig, 'https://example.com/search');
    expect(result.pageType).toBe('CAPTCHA');
  });

  it('should detect NO_RESULTS page', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue({
        hasRecaptcha: false,
        hasHcaptcha: false,
        hasCloudflare: false,
        hasDatadome: false,
        hasLoginForm: false,
        hasLoginText: false,
        hasNoResultsMsg: true,
        hasSearchResults: false,
        hasCheckpoint: false,
        visibleElements: 30,
        bodyLength: 2000,
      }),
    });

    const result = await diagnosePage(page, baseSiteConfig, 'https://example.com/search');
    expect(result.pageType).toBe('NO_RESULTS');
  });

  it('should detect BLOCKED page (Cloudflare)', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue({
        hasRecaptcha: false,
        hasHcaptcha: false,
        hasCloudflare: true,
        hasDatadome: false,
        hasLoginForm: false,
        hasLoginText: false,
        hasNoResultsMsg: false,
        hasSearchResults: false,
        hasCheckpoint: false,
        visibleElements: 5,
        bodyLength: 300,
      }),
    });

    const result = await diagnosePage(page, baseSiteConfig, 'https://example.com/search');
    expect(result.pageType).toBe('BLOCKED');
  });

  it('should detect CHECKPOINT page', async () => {
    const configWithCheckpoint: SiteConfig = {
      ...baseSiteConfig,
      checkpointPatterns: ['confirm your identity', 'account has been locked'],
    };

    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue({
        hasRecaptcha: false,
        hasHcaptcha: false,
        hasCloudflare: false,
        hasDatadome: false,
        hasLoginForm: false,
        hasLoginText: false,
        hasNoResultsMsg: false,
        hasSearchResults: false,
        hasCheckpoint: true,
        visibleElements: 10,
        bodyLength: 500,
      }),
    });

    const result = await diagnosePage(page, configWithCheckpoint, 'https://example.com/search');
    expect(result.pageType).toBe('CHECKPOINT');
  });

  it('should detect EMPTY page', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue({
        hasRecaptcha: false,
        hasHcaptcha: false,
        hasCloudflare: false,
        hasDatadome: false,
        hasLoginForm: false,
        hasLoginText: false,
        hasNoResultsMsg: false,
        hasSearchResults: false,
        hasCheckpoint: false,
        visibleElements: 2,
        bodyLength: 50,
      }),
    });

    const result = await diagnosePage(page, baseSiteConfig, 'https://example.com/search');
    expect(result.pageType).toBe('EMPTY');
  });
});

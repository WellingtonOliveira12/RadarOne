import { describe, it, expect } from 'vitest';
import {
  buildSearchUrl,
  buildFacebookMarketplaceUrl,
  slugify,
  extractKeywords,
} from '../../src/engine/url-builder';
import { MonitorWithFilters } from '../../src/engine/types';

// ============================================================
// HELPERS
// ============================================================

function makeMonitor(overrides: Partial<MonitorWithFilters> = {}): MonitorWithFilters {
  return {
    id: 'test-monitor-1',
    userId: 'test-user-1',
    name: 'Test Monitor',
    site: 'FACEBOOK_MARKETPLACE',
    searchUrl: 'https://www.facebook.com/marketplace/',
    active: true,
    mode: 'STRUCTURED_FILTERS',
    country: 'BR',
    stateRegion: 'GO',
    city: 'Itaberaí',
    filtersJson: { keywords: 'carro' },
    ...overrides,
  };
}

// ============================================================
// 1. URL_ONLY monitors — MUST NOT be modified
// ============================================================

describe('URL_ONLY monitors are not affected', () => {
  it('returns null for URL_ONLY mode', () => {
    const monitor = makeMonitor({ mode: 'URL_ONLY' });
    const result = buildSearchUrl(monitor);
    expect(result).toBeNull();
  });

  it('returns null for undefined mode (backward compat)', () => {
    const monitor = makeMonitor({ mode: undefined });
    const result = buildSearchUrl(monitor);
    expect(result).toBeNull();
  });
});

// ============================================================
// 2. Non-Facebook sites — not affected
// ============================================================

describe('Other marketplaces are not affected', () => {
  it('builds OLX URL with state subdomain and keyword', () => {
    const monitor = makeMonitor({ site: 'OLX' });
    const result = buildSearchUrl(monitor);
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://www.olx.com.br/?q=carro');
    expect(result!.location).toBe('BR-GO-Itaberaí');
  });

  it('returns null for OLX without any keyword source (graceful fallback)', () => {
    const monitor = makeMonitor({
      site: 'OLX',
      name: '',
      filtersJson: {},
      searchUrl: 'https://www.olx.com.br/',
    });
    const result = buildSearchUrl(monitor);
    expect(result).toBeNull();
  });

  it('OLX uses monitor.name as keyword when filtersJson is empty (production case)', () => {
    const monitor = makeMonitor({
      site: 'OLX',
      name: 'Corolla',
      filtersJson: { keywords: '', category: '' },
      keywords: [],
      searchUrl: 'https://www.olx.com.br/',
    });
    const result = buildSearchUrl(monitor);
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://www.olx.com.br/?q=Corolla');
  });

  it('OLX extracts keywords from searchUrl ?q= param', () => {
    const monitor = makeMonitor({
      site: 'OLX',
      filtersJson: {},
      searchUrl: 'https://www.olx.com.br/autos-e-pecas?q=Corolla',
    });
    const result = buildSearchUrl(monitor);
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://www.olx.com.br/?q=Corolla');
  });

  it('OLX extracts keywords from monitor.keywords array', () => {
    const monitor = makeMonitor({
      site: 'OLX',
      filtersJson: {},
      keywords: ['Corolla'],
    });
    const result = buildSearchUrl(monitor);
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://www.olx.com.br/?q=Corolla');
  });

  it('returns null for MERCADO_LIVRE with STRUCTURED_FILTERS', () => {
    const monitor = makeMonitor({ site: 'MERCADO_LIVRE' });
    const result = buildSearchUrl(monitor);
    expect(result).toBeNull();
  });
});

// ============================================================
// 3. Facebook STRUCTURED_FILTERS — URL building
// ============================================================

describe('Facebook STRUCTURED_FILTERS URL building', () => {
  it('builds URL with city + keyword (Brasil/GO/Itaberaí + carro)', () => {
    const monitor = makeMonitor({
      country: 'BR',
      stateRegion: 'GO',
      city: 'Itaberaí',
      filtersJson: { keywords: 'carro' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toContain('facebook.com/marketplace/itaberai/search/');
    expect(result.url).toContain('query=carro');
    expect(result.location).toBe('BR-GO-Itaberaí');
    expect(result.filtersApplied).toBeDefined();
  });

  it('builds URL with city only (no keyword)', () => {
    const monitor = makeMonitor({
      name: '',
      city: 'São Paulo',
      filtersJson: {},
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toBe(
      'https://www.facebook.com/marketplace/sao-paulo/'
    );
  });

  it('builds URL with keyword only (no city)', () => {
    const monitor = makeMonitor({
      city: '',
      filtersJson: { keywords: 'moto' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toContain('facebook.com/marketplace/search/');
    expect(result.url).toContain('query=moto');
  });

  it('encodes special characters in keyword', () => {
    const monitor = makeMonitor({
      city: 'Goiânia',
      filtersJson: { keywords: 'carro usado 2020' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toContain('marketplace/goiania/search/');
    // URLSearchParams encodes spaces as + (equivalent to %20 for query params)
    expect(result.url).toMatch(/query=carro[\+%20]usado[\+%20]2020/);
  });

  it('handles city with multiple words and accents', () => {
    const monitor = makeMonitor({
      city: 'Rio de Janeiro',
      filtersJson: { keywords: 'apartamento' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toContain('marketplace/rio-de-janeiro/search/');
    expect(result.url).toContain('query=apartamento');
  });

  it('handles US location (Los Angeles)', () => {
    const monitor = makeMonitor({
      country: 'US',
      stateRegion: 'CA',
      city: 'Los Angeles',
      filtersJson: { keywords: 'car' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toContain('marketplace/los-angeles/search/');
    expect(result.url).toContain('query=car');
    expect(result.location).toBe('US-CA-Los Angeles');
  });

  it('builds location tag with country only', () => {
    const monitor = makeMonitor({
      country: 'BR',
      stateRegion: '',
      city: '',
      filtersJson: { keywords: 'moto' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.location).toBe('BR');
  });
});

// ============================================================
// 3b. Advanced Filters — Facebook Marketplace
// ============================================================

describe('Facebook advanced filters', () => {
  it('adds sortBy param to URL', () => {
    const monitor = makeMonitor({
      filtersJson: { keywords: 'iphone', sortBy: 'newest' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toContain('sortBy=creation_time_descend');
    expect(result.filtersApplied.appliedUrl).toContain('sortBy=newest');
  });

  it('adds price params to URL', () => {
    const monitor = makeMonitor({
      filtersJson: { keywords: 'moto', minPrice: 1000, maxPrice: 5000 },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toContain('minPrice=1000');
    expect(result.url).toContain('maxPrice=5000');
    expect(result.filtersApplied.appliedUrl).toContain('minPrice=1000');
    expect(result.filtersApplied.appliedUrl).toContain('maxPrice=5000');
  });

  it('adds condition params to URL', () => {
    const monitor = makeMonitor({
      filtersJson: { keywords: 'carro', condition: ['new', 'like_new'] },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toContain('itemCondition=new%2Cused_like_new');
    expect(result.filtersApplied.appliedUrl).toContain('condition=new,like_new');
  });

  it('adds daysSinceListed param for publishedWithin', () => {
    const monitor = makeMonitor({
      filtersJson: { keywords: 'tv', publishedWithin: '24h' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toContain('daysSinceListed=1');
    expect(result.filtersApplied.appliedUrl).toContain('publishedWithin=24h');
  });

  it('ignores publishedWithin=any', () => {
    const monitor = makeMonitor({
      filtersJson: { keywords: 'tv', publishedWithin: 'any' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).not.toContain('daysSinceListed');
  });

  it('marks availability as ignored', () => {
    const monitor = makeMonitor({
      filtersJson: { keywords: 'tv', availability: 'sold' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.filtersApplied.ignored).toContain('availability=sold');
  });

  it('does not skip relevance sortBy (default)', () => {
    const monitor = makeMonitor({
      filtersJson: { keywords: 'tv', sortBy: 'relevance' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).not.toContain('sortBy=');
  });

  it('combines all filters in single URL', () => {
    const monitor = makeMonitor({
      city: 'São Paulo',
      filtersJson: {
        keywords: 'iphone',
        sortBy: 'price_asc',
        minPrice: 500,
        maxPrice: 3000,
        condition: ['good'],
        publishedWithin: '7d',
      },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toContain('marketplace/sao-paulo/search/');
    expect(result.url).toContain('sortBy=price_ascend');
    expect(result.url).toContain('minPrice=500');
    expect(result.url).toContain('maxPrice=3000');
    expect(result.url).toContain('itemCondition=used_good');
    expect(result.url).toContain('daysSinceListed=7');
    expect(result.filtersApplied.appliedUrl.length).toBe(5);
  });

  it('uses monitor.priceMin/priceMax as fallback', () => {
    const monitor = makeMonitor({
      filtersJson: { keywords: 'carro' },
      priceMin: 2000,
      priceMax: 10000,
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toContain('minPrice=2000');
    expect(result.url).toContain('maxPrice=10000');
  });

  it('backward compat: old monitors without advanced filters still work', () => {
    const monitor = makeMonitor({
      filtersJson: { keywords: 'moto' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toContain('query=moto');
    expect(result.filtersApplied.appliedUrl.length).toBe(0);
    expect(result.filtersApplied.ignored.length).toBe(0);
  });
});

// ============================================================
// 4. Error cases
// ============================================================

describe('Error handling', () => {
  it('throws when no city AND no keyword AND no name provided', () => {
    const monitor = makeMonitor({
      name: '',
      city: '',
      filtersJson: {},
    });
    expect(() => buildFacebookMarketplaceUrl(monitor)).toThrow(
      'FB_URL_BUILD_FAILED'
    );
  });

  it('throws when city is null and keywords empty and name empty', () => {
    const monitor = makeMonitor({
      name: '',
      city: null,
      filtersJson: { keywords: '' },
    });
    expect(() => buildFacebookMarketplaceUrl(monitor)).toThrow(
      'FB_URL_BUILD_FAILED'
    );
  });

  it('error message includes location context', () => {
    const monitor = makeMonitor({
      name: '',
      country: 'BR',
      stateRegion: 'GO',
      city: null,
      filtersJson: {},
    });
    expect(() => buildFacebookMarketplaceUrl(monitor)).toThrow(
      'Location: BR-GO'
    );
  });
});

// ============================================================
// 5. slugify function
// ============================================================

describe('slugify', () => {
  it('removes accents', () => {
    expect(slugify('Itaberaí')).toBe('itaberai');
    expect(slugify('São Paulo')).toBe('sao-paulo');
    expect(slugify('Goiânia')).toBe('goiania');
  });

  it('handles multiple spaces', () => {
    expect(slugify('Rio  de   Janeiro')).toBe('rio-de-janeiro');
  });

  it('handles special characters', () => {
    expect(slugify("Porto Alegre (RS)")).toBe('porto-alegre-rs');
  });

  it('handles already clean strings', () => {
    expect(slugify('london')).toBe('london');
  });
});

// ============================================================
// 6. extractKeywords function
// ============================================================

describe('extractKeywords', () => {
  it('extracts from filtersJson.keywords', () => {
    const monitor = makeMonitor({ filtersJson: { keywords: 'carro sedan' } });
    expect(extractKeywords(monitor)).toBe('carro sedan');
  });

  it('extracts from filtersJson.keyword (singular)', () => {
    const monitor = makeMonitor({ filtersJson: { keyword: 'moto' } });
    expect(extractKeywords(monitor)).toBe('moto');
  });

  it('returns empty for missing filtersJson and empty name', () => {
    const monitor = makeMonitor({ name: '', filtersJson: undefined, searchUrl: '' });
    expect(extractKeywords(monitor)).toBe('');
  });

  it('trims whitespace', () => {
    const monitor = makeMonitor({ filtersJson: { keywords: '  carro  ' } });
    expect(extractKeywords(monitor)).toBe('carro');
  });

  it('falls back to monitor.keywords array', () => {
    const monitor = makeMonitor({
      filtersJson: {},
      keywords: ['Corolla'],
    });
    expect(extractKeywords(monitor)).toBe('Corolla');
  });

  it('falls back to searchUrl ?q= param', () => {
    const monitor = makeMonitor({
      filtersJson: {},
      searchUrl: 'https://www.olx.com.br/autos-e-pecas?q=Civic',
    });
    expect(extractKeywords(monitor)).toBe('Civic');
  });

  it('falls back to searchUrl ?query= param', () => {
    const monitor = makeMonitor({
      filtersJson: {},
      searchUrl: 'https://www.facebook.com/marketplace/search/?query=moto',
    });
    expect(extractKeywords(monitor)).toBe('moto');
  });

  it('prefers filtersJson.keywords over other sources', () => {
    const monitor = makeMonitor({
      filtersJson: { keywords: 'primary' },
      keywords: ['fallback'],
      searchUrl: 'https://olx.com.br/?q=url-fallback',
    });
    expect(extractKeywords(monitor)).toBe('primary');
  });

  it('falls back to monitor.name as last resort', () => {
    const monitor = makeMonitor({
      name: 'Corolla',
      filtersJson: { keywords: '', category: '' },
      keywords: [],
      searchUrl: 'https://www.olx.com.br/',
    });
    expect(extractKeywords(monitor)).toBe('Corolla');
  });

  it('returns empty when all sources including name are empty', () => {
    const monitor = makeMonitor({
      name: '',
      filtersJson: {},
      searchUrl: '',
    });
    expect(extractKeywords(monitor)).toBe('');
  });
});

// ============================================================
// 7. buildSearchUrl entry point
// ============================================================

describe('buildSearchUrl entry point', () => {
  it('returns UrlBuildResult for FB STRUCTURED_FILTERS', () => {
    const monitor = makeMonitor();
    const result = buildSearchUrl(monitor);
    expect(result).not.toBeNull();
    expect(result!.url).toContain('facebook.com/marketplace/itaberai');
    expect(result!.location).toBe('BR-GO-Itaberaí');
  });

  it('returns null for non-STRUCTURED_FILTERS mode', () => {
    const monitor = makeMonitor({ mode: 'URL_ONLY' });
    expect(buildSearchUrl(monitor)).toBeNull();
  });

  it('builds OLX URL for OLX STRUCTURED_FILTERS', () => {
    const monitor = makeMonitor({ site: 'OLX' });
    const result = buildSearchUrl(monitor);
    expect(result).not.toBeNull();
    expect(result!.url).toContain('olx.com.br/?q=carro');
  });

  it('returns null for unsupported site (WEBMOTORS)', () => {
    const monitor = makeMonitor({ site: 'WEBMOTORS' });
    expect(buildSearchUrl(monitor)).toBeNull();
  });
});

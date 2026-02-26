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
  it('returns null for OLX with STRUCTURED_FILTERS', () => {
    const monitor = makeMonitor({ site: 'OLX' });
    const result = buildSearchUrl(monitor);
    expect(result).toBeNull();
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
    expect(result.url).toBe(
      'https://www.facebook.com/marketplace/itaberai/search/?query=carro'
    );
    expect(result.location).toBe('BR-GO-Itaberaí');
  });

  it('builds URL with city only (no keyword)', () => {
    const monitor = makeMonitor({
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
    expect(result.url).toBe(
      'https://www.facebook.com/marketplace/search/?query=moto'
    );
  });

  it('encodes special characters in keyword', () => {
    const monitor = makeMonitor({
      city: 'Goiânia',
      filtersJson: { keywords: 'carro usado 2020' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toBe(
      'https://www.facebook.com/marketplace/goiania/search/?query=carro%20usado%202020'
    );
  });

  it('handles city with multiple words and accents', () => {
    const monitor = makeMonitor({
      city: 'Rio de Janeiro',
      filtersJson: { keywords: 'apartamento' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toBe(
      'https://www.facebook.com/marketplace/rio-de-janeiro/search/?query=apartamento'
    );
  });

  it('handles US location (Los Angeles)', () => {
    const monitor = makeMonitor({
      country: 'US',
      stateRegion: 'CA',
      city: 'Los Angeles',
      filtersJson: { keywords: 'car' },
    });
    const result = buildFacebookMarketplaceUrl(monitor);
    expect(result.url).toBe(
      'https://www.facebook.com/marketplace/los-angeles/search/?query=car'
    );
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
// 4. Error cases
// ============================================================

describe('Error handling', () => {
  it('throws when no city AND no keyword provided', () => {
    const monitor = makeMonitor({
      city: '',
      filtersJson: {},
    });
    expect(() => buildFacebookMarketplaceUrl(monitor)).toThrow(
      'FB_URL_BUILD_FAILED'
    );
  });

  it('throws when city is null and keywords empty', () => {
    const monitor = makeMonitor({
      city: null,
      filtersJson: { keywords: '' },
    });
    expect(() => buildFacebookMarketplaceUrl(monitor)).toThrow(
      'FB_URL_BUILD_FAILED'
    );
  });

  it('error message includes location context', () => {
    const monitor = makeMonitor({
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

  it('returns empty for missing filtersJson', () => {
    const monitor = makeMonitor({ filtersJson: undefined });
    expect(extractKeywords(monitor)).toBe('');
  });

  it('trims whitespace', () => {
    const monitor = makeMonitor({ filtersJson: { keywords: '  carro  ' } });
    expect(extractKeywords(monitor)).toBe('carro');
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

  it('returns null for unsupported site', () => {
    const monitor = makeMonitor({ site: 'OLX' });
    expect(buildSearchUrl(monitor)).toBeNull();
  });
});

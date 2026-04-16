import { describe, it, expect } from 'vitest';
import { resolvePriceRange } from '../../src/engine/price-range-resolver';

describe('resolvePriceRange', () => {
  it('returns null/null with source=none when no source provides a range', () => {
    const r = resolvePriceRange({ site: 'MERCADO_LIVRE' });
    expect(r).toEqual({ min: null, max: null, source: 'none' });
  });

  it('reads filtersJson first', () => {
    const r = resolvePriceRange({
      site: 'OLX',
      filtersJson: { minPrice: 500, maxPrice: 1600 },
    });
    expect(r.min).toBe(500);
    expect(r.max).toBe(1600);
    expect(r.source).toContain('filtersJson.min');
    expect(r.source).toContain('filtersJson.max');
  });

  it('falls back to top-level monitor columns', () => {
    const r = resolvePriceRange({
      site: 'MERCADO_LIVRE',
      priceMin: 1000,
      priceMax: 2000,
    });
    expect(r.min).toBe(1000);
    expect(r.max).toBe(2000);
    expect(r.source).toContain('monitor.priceMin');
  });

  it('merges partial sources: filtersJson provides min, columns provide max', () => {
    const r = resolvePriceRange({
      site: 'OLX',
      filtersJson: { minPrice: 500 },
      priceMax: 1600,
    });
    expect(r.min).toBe(500);
    expect(r.max).toBe(1600);
  });

  it('extracts from ML URL _PriceRange_X-Y when nothing else set', () => {
    const r = resolvePriceRange({
      site: 'MERCADO_LIVRE',
      searchUrl:
        'https://lista.mercadolivre.com.br/iphone_PriceRange_1000-1700',
    });
    expect(r.min).toBe(1000);
    expect(r.max).toBe(1700);
    expect(r.source).toMatch(/url\.min/);
    expect(r.source).toMatch(/url\.max/);
  });

  it('ignores PriceRange_0-X as min (0 is not a meaningful lower bound)', () => {
    const r = resolvePriceRange({
      site: 'MERCADO_LIVRE',
      searchUrl: 'https://lista.mercadolivre.com.br/iphone_PriceRange_0-7000',
    });
    expect(r.min).toBeNull();
    expect(r.max).toBe(7000);
  });

  it('extracts from OLX URL ps/pe', () => {
    const r = resolvePriceRange({
      site: 'OLX',
      searchUrl: 'https://www.olx.com.br/celulares?q=iphone%2013&ps=500&pe=1600',
    });
    expect(r.min).toBe(500);
    expect(r.max).toBe(1600);
  });

  it('filtersJson takes precedence over URL', () => {
    const r = resolvePriceRange({
      site: 'OLX',
      filtersJson: { minPrice: 300, maxPrice: 2000 },
      searchUrl: 'https://www.olx.com.br/celulares?ps=500&pe=1600',
    });
    expect(r.min).toBe(300);
    expect(r.max).toBe(2000);
  });

  it('rejects zero/negative values from filtersJson', () => {
    const r = resolvePriceRange({
      site: 'MERCADO_LIVRE',
      filtersJson: { minPrice: 0, maxPrice: -5 },
    });
    expect(r.min).toBeNull();
    expect(r.max).toBeNull();
  });

  it('extracts ML PriceRange with BRL currency suffix (new ML URL format)', () => {
    const r = resolvePriceRange({
      site: 'MERCADO_LIVRE',
      searchUrl:
        'https://lista.mercadolivre.com.br/celulares-telefones/celulares-smartphones/iphone/iphone_PriceRange_0BRL-7500BRL_PublishedToday_YES',
    });
    expect(r.min).toBeNull(); // 0 is not a meaningful lower bound
    expect(r.max).toBe(7500);
    expect(r.source).toMatch(/url\.max/);
  });

  it('extracts ML PriceRange with BRL suffix on both bounds', () => {
    const r = resolvePriceRange({
      site: 'MERCADO_LIVRE',
      searchUrl:
        'https://lista.mercadolivre.com.br/iphone_PriceRange_1000BRL-3000BRL',
    });
    expect(r.min).toBe(1000);
    expect(r.max).toBe(3000);
  });

  it('still parses legacy ML PriceRange format without suffix', () => {
    // Regression guard: legacy format must keep working after BRL relaxation.
    const r = resolvePriceRange({
      site: 'MERCADO_LIVRE',
      searchUrl: 'https://lista.mercadolivre.com.br/iphone_PriceRange_500-2500',
    });
    expect(r.min).toBe(500);
    expect(r.max).toBe(2500);
  });

  it('handles malformed filtersJson gracefully', () => {
    const r = resolvePriceRange({
      site: 'MERCADO_LIVRE',
      filtersJson: 'not-an-object' as any,
    });
    expect(r.min).toBeNull();
    expect(r.max).toBeNull();
  });
});

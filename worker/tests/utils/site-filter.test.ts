import { describe, it, expect } from 'vitest';
import {
  parseSiteList,
  readSiteFilterFromEnv,
  buildSiteFilterClause,
} from '../../src/utils/site-filter';

describe('parseSiteList', () => {
  it('returns empty on undefined/empty', () => {
    expect(parseSiteList(undefined)).toEqual([]);
    expect(parseSiteList('')).toEqual([]);
    expect(parseSiteList('   ')).toEqual([]);
  });

  it('parses single value', () => {
    expect(parseSiteList('MERCADO_LIVRE')).toEqual(['MERCADO_LIVRE']);
  });

  it('parses comma-separated, trims, uppercases, dedupes', () => {
    expect(parseSiteList('mercado_livre, OLX , olx, facebook_marketplace')).toEqual([
      'MERCADO_LIVRE',
      'OLX',
      'FACEBOOK_MARKETPLACE',
    ]);
  });
});

describe('readSiteFilterFromEnv', () => {
  it('reads both vars', () => {
    const cfg = readSiteFilterFromEnv({
      WORKER_SITES_INCLUDE: 'MERCADO_LIVRE',
      WORKER_SITES_EXCLUDE: 'OLX',
    } as any);
    expect(cfg).toEqual({ include: ['MERCADO_LIVRE'], exclude: ['OLX'] });
  });

  it('tolerates missing vars', () => {
    expect(readSiteFilterFromEnv({} as any)).toEqual({ include: [], exclude: [] });
  });
});

describe('buildSiteFilterClause', () => {
  it('returns null clause when no filter is set (legacy behavior)', () => {
    const r = buildSiteFilterClause({ include: [], exclude: [] });
    expect(r.clause).toBeNull();
    expect(r.summary).toContain('no filter');
  });

  it('builds an IN clause for INCLUDE', () => {
    const r = buildSiteFilterClause({ include: ['MERCADO_LIVRE'], exclude: [] });
    expect(r.clause).toEqual({ site: { in: ['MERCADO_LIVRE'] } });
    expect(r.summary).toContain('INCLUDE=[MERCADO_LIVRE]');
  });

  it('builds a NOT IN clause for EXCLUDE', () => {
    const r = buildSiteFilterClause({ include: [], exclude: ['MERCADO_LIVRE'] });
    expect(r.clause).toEqual({ site: { notIn: ['MERCADO_LIVRE'] } });
    expect(r.summary).toContain('EXCLUDE=[MERCADO_LIVRE]');
  });

  it('INCLUDE takes precedence when both are set', () => {
    const r = buildSiteFilterClause({
      include: ['MERCADO_LIVRE'],
      exclude: ['OLX'],
    });
    expect(r.clause).toEqual({ site: { in: ['MERCADO_LIVRE'] } });
    expect(r.summary).toMatch(/INCLUDE.*EXCLUDE ignored/);
  });

  it('supports multiple sites in INCLUDE', () => {
    const r = buildSiteFilterClause({
      include: ['MERCADO_LIVRE', 'OLX'],
      exclude: [],
    });
    expect(r.clause).toEqual({ site: { in: ['MERCADO_LIVRE', 'OLX'] } });
  });

  it('supports multiple sites in EXCLUDE', () => {
    const r = buildSiteFilterClause({
      include: [],
      exclude: ['MERCADO_LIVRE', 'FACEBOOK_MARKETPLACE'],
    });
    expect(r.clause).toEqual({
      site: { notIn: ['MERCADO_LIVRE', 'FACEBOOK_MARKETPLACE'] },
    });
  });
});

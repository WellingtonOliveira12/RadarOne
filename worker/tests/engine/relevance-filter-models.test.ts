import { describe, it, expect } from 'vitest';
import { checkRelevance } from '../../src/engine/relevance-filter';

/**
 * Regression tests for the numeric-token-mandatory rule added to prevent
 * iPhone 11/12/14 leaking into an "iPhone 13" monitor.
 */
describe('relevance-filter — numeric tokens are mandatory', () => {
  const keywords = 'iphone 13';
  const monitorName = 'OLX_iphone13';

  it('accepts an exact iPhone 13 match', () => {
    const r = checkRelevance('iPhone 13 128GB preto', monitorName, keywords, { keywordsSource: 'explicit' });
    expect(r.relevant).toBe(true);
  });

  it('accepts iPhone 13 Pro (extra tokens are fine)', () => {
    const r = checkRelevance('iPhone 13 Pro Max 256GB', monitorName, keywords, { keywordsSource: "explicit" });
    expect(r.relevant).toBe(true);
  });

  it('rejects iPhone 11 (model number mismatch)', () => {
    const r = checkRelevance('Apple iPhone 11 (64 GB) - Preto', monitorName, keywords, { keywordsSource: "explicit" });
    expect(r.relevant).toBe(false);
    expect(r.reason).toBe('keyword_not_in_title');
  });

  it('rejects iPhone 12', () => {
    const r = checkRelevance('iPhone 12 Dual SIM 128 GB verde', monitorName, keywords, { keywordsSource: "explicit" });
    expect(r.relevant).toBe(false);
  });

  it('rejects iPhone 14', () => {
    const r = checkRelevance('Apple iPhone 14 128 GB', monitorName, keywords, { keywordsSource: "explicit" });
    expect(r.relevant).toBe(false);
  });

  it('rejects iPhone 130 (substring trap)', () => {
    const r = checkRelevance('iPhone 130 special edition', monitorName, keywords, { keywordsSource: "explicit" });
    expect(r.relevant).toBe(false);
  });

  it('rejects pure iPhone without a model number', () => {
    const r = checkRelevance('iPhone novo lacrado', monitorName, keywords, { keywordsSource: "explicit" });
    expect(r.relevant).toBe(false);
  });

  it('still rejects an electronics blacklist hit', () => {
    const r = checkRelevance('Capinha iPhone 13', monitorName, keywords, { keywordsSource: "explicit" });
    expect(r.relevant).toBe(false);
    expect(r.reason).toBe('electronics_blacklist');
  });

  it('monitor without numeric token (e.g. generic "Iphone") still accepts any iPhone', () => {
    const r = checkRelevance('iPhone 11 128GB', 'Iphone', 'iphone');
    expect(r.relevant).toBe(true);
  });

  it('handles hyphenated title "iPhone 13-Pro"', () => {
    const r = checkRelevance('iPhone 13-Pro 256GB', monitorName, keywords, { keywordsSource: "explicit" });
    expect(r.relevant).toBe(true);
  });
});

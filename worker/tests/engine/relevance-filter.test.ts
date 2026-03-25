import { describe, it, expect } from 'vitest';
import { checkRelevance } from '../../src/engine/relevance-filter';

describe('checkRelevance', () => {
  // ─── Rule 1: keyword presence ────────────────────────────────────────────

  it('rejects ad with no keyword match', () => {
    const result = checkRelevance('Samsung Galaxy S24', 'Monitor', 'iPhone 15 Pro');
    expect(result.relevant).toBe(false);
    expect(result.reason).toBe('keyword_not_in_title');
  });

  it('accepts ad with at least one keyword match', () => {
    const result = checkRelevance('iPhone 13 128GB usado', 'Monitor', 'iPhone 15 Pro');
    expect(result.relevant).toBe(true);
  });

  it('accepts all ads when keywords have no significant words (< 4 chars)', () => {
    const result = checkRelevance('Qualquer título aleatório', 'Monitor', 'TV 50');
    expect(result.relevant).toBe(true);
  });

  // ─── Rule 2: category blacklist ──────────────────────────────────────────

  it('rejects vehicle blacklist match (bota in car monitor)', () => {
    // Ad must pass Rule 1 (keyword match) to reach Rule 2 (blacklist)
    const result = checkRelevance('Bota para Fiat Uno couro', 'Fiat Uno', 'Fiat Uno');
    expect(result.relevant).toBe(false);
    expect(result.reason).toBe('vehicle_blacklist');
  });

  it('rejects electronics blacklist match (capinha in iphone monitor)', () => {
    const result = checkRelevance('Capinha iPhone 15 transparente', 'iPhone', 'iPhone 15');
    expect(result.relevant).toBe(false);
    expect(result.reason).toBe('electronics_blacklist');
  });

  // ─── Rule 3: score is informational, not a gate ──────────────────────────

  it('does NOT reject ad with low relevance score (regression test)', () => {
    // 4 significant words: "apple", "iphone", "usado", "azul"
    // Ad matches only "iphone" → 1/4 = 25% (was rejected at 30% threshold)
    const result = checkRelevance(
      'iPhone 13 Pro 128GB',
      'Monitor',
      'Apple iPhone usado azul',
    );
    expect(result.relevant).toBe(true);
    expect(result.score).toBeLessThan(30); // Confirms low score
    expect(result.score).toBeGreaterThan(0); // But not zero
  });

  it('does NOT reject ad matching 1 of 5 significant keywords', () => {
    // 5 significant words: "notebook", "dell", "inspiron", "gamer", "usado"
    // Ad matches only "notebook" → 1/5 = 20%
    const result = checkRelevance(
      'Notebook Lenovo IdeaPad 15',
      'Notebook',
      'Notebook Dell Inspiron Gamer usado',
    );
    expect(result.relevant).toBe(true);
    expect(result.score).toBeLessThan(30);
  });

  it('computes correct score for full match', () => {
    const result = checkRelevance(
      'iPhone 15 Pro Max 256GB',
      'Monitor',
      'iPhone',
    );
    expect(result.relevant).toBe(true);
    expect(result.score).toBe(100);
  });

  // ─── Monitor names with underscores (production regression) ─────────────

  it('handles monitor names with underscores (e.g. 01_IPHONE_GERAL_PG1)', () => {
    // Production bug: "Apple iPhone 15 Pro Max (256 Gb)" was rejected
    // because "01_iphone_geral_pg1" was treated as a single token
    const result = checkRelevance(
      'Apple iPhone 15 Pro Max (256 Gb) - Titânio Azul',
      '01_IPHONE_GERAL_PG5',
      '01_IPHONE_GERAL_PG5',
    );
    expect(result.relevant).toBe(true);
  });

  it('handles monitor names with underscores and extracts keywords correctly', () => {
    const result = checkRelevance(
      'Apple iPhone 11 64gb - Preto, 4gb Ram',
      '01_IPHONE_GERAL_PG1',
      '01_IPHONE_GERAL_PG1',
    );
    expect(result.relevant).toBe(true);
  });

  it('handles iPad monitor names with underscores', () => {
    const result = checkRelevance(
      'Apple iPad 10ª geração 64GB Wi-Fi',
      '03_IPAD10_GERAL_PG1',
      '03_IPAD10_GERAL_PG1',
    );
    expect(result.relevant).toBe(true);
  });

  // ─── Fallback to monitor name ────────────────────────────────────────────

  it('uses monitorName as fallback when keywords are empty', () => {
    const result = checkRelevance('iPhone 15 Pro Max', 'iPhone 15', '');
    expect(result.relevant).toBe(true);
  });

  // ─── Failsafe ────────────────────────────────────────────────────────────

  it('accepts ad on filter error (failsafe)', () => {
    // Pass undefined to trigger error inside filter
    const result = checkRelevance(undefined as any, 'Monitor', 'keyword');
    expect(result.relevant).toBe(true);
    expect(result.score).toBe(100);
  });
});

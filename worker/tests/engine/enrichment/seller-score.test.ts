import { describe, it, expect } from 'vitest';
import { computeSellerScore } from '../../../src/engine/enrichment/seller-score';

describe('computeSellerScore', () => {
  it('returns 0 for neutral title without seller data', () => {
    expect(computeSellerScore('Toyota Corolla 2022')).toBe(0);
  });

  it('penalizes urgency noise in title', () => {
    expect(computeSellerScore('Vendo urgente Civic 2020')).toBe(-5);
    expect(computeSellerScore('Preciso vender logo HB20')).toBe(-5);
    expect(computeSellerScore('Desapego corolla 2022')).toBe(-5);
  });

  it('title pro hints no longer give positive score (V2.1)', () => {
    // V2.1: removed pro hints from title-only scoring
    expect(computeSellerScore('Loja Seminovos Toyota Corolla 2022')).toBe(0);
    expect(computeSellerScore('Concessionária Ford Ranger 2023')).toBe(0);
  });

  it('rewards seller name + phone (strong signal)', () => {
    expect(computeSellerScore('Corolla 2022', {
      sellerName: 'João Silva',
      hasPhone: true,
    })).toBe(5);
  });

  it('rewards seller name only (moderate signal)', () => {
    expect(computeSellerScore('Corolla 2022', { sellerName: 'João Silva' })).toBe(3);
  });

  it('isPro alone gives no score (V2.1)', () => {
    expect(computeSellerScore('Corolla 2022', { isPro: true })).toBe(0);
  });

  it('phone alone gives no score', () => {
    expect(computeSellerScore('Corolla 2022', { hasPhone: true })).toBe(0);
  });

  it('combines title penalty with seller bonus', () => {
    // urgency (-5) + name+phone (+5) = 0
    const score = computeSellerScore('Vendo urgente Corolla 2022', {
      sellerName: 'Auto Shop',
      hasPhone: true,
    });
    expect(score).toBe(0);
  });

  it('ignores empty seller name', () => {
    expect(computeSellerScore('Corolla 2022', { sellerName: '' })).toBe(0);
    expect(computeSellerScore('Corolla 2022', { sellerName: '  ' })).toBe(0);
  });

  it('handles null/undefined seller gracefully', () => {
    expect(computeSellerScore('Corolla 2022', null)).toBe(0);
    expect(computeSellerScore('Corolla 2022', undefined)).toBe(0);
  });

  it('clamps to -5 minimum', () => {
    expect(computeSellerScore('Urgente desapego preciso vender')).toBe(-5);
  });

  it('clamps to +5 maximum (V2.1 cap)', () => {
    // name (+3) + name+phone would be +5, but since name is checked first...
    // name + phone = +5 (max)
    const score = computeSellerScore('Corolla 2022', {
      sellerName: 'Premium Auto',
      isPro: true,
      hasPhone: true,
    });
    expect(score).toBe(5);
    expect(score).toBeLessThanOrEqual(5);
  });
});

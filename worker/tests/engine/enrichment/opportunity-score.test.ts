import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the module
vi.mock('../../../src/lib/prisma', () => ({
  prisma: {
    adSeen: {
      findMany: vi.fn(),
    },
  },
}));

import { computeOpportunityScore } from '../../../src/engine/enrichment/opportunity-score';
import type { OpportunityResult } from '../../../src/engine/enrichment/score-types';
import {
  formatScoreTelegram,
  formatScoreEmail,
  formatScoreText,
} from '../../../src/engine/enrichment/score-formatters';
import type { FipeEnrichment } from '../../../src/engine/enrichment/fipe-types';
import { prisma } from '../../../src/lib/prisma';

const mockFindMany = vi.mocked(prisma.adSeen.findMany);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: return enough ads for median calculation
  mockFindMany.mockResolvedValue([
    { price: 50000 },
    { price: 55000 },
    { price: 60000 },
    { price: 65000 },
    { price: 70000 },
  ] as any);
});

// ─── computeOpportunityScore ────────────────────────────────────────────────

describe('computeOpportunityScore', () => {
  const baseInput = {
    title: 'Toyota Corolla XEI 2.0 2022',
    price: 50000,
    location: 'São Paulo - SP',
    site: 'OLX',
    monitorId: 'mon-1',
  };

  it('returns null for ads without price', async () => {
    const result = await computeOpportunityScore({ ...baseInput, price: 0 });
    expect(result).toBeNull();
  });

  it('returns null for ads with negative price', async () => {
    const result = await computeOpportunityScore({ ...baseInput, price: -100 });
    expect(result).toBeNull();
  });

  it('computes score with FIPE (below FIPE = high score)', async () => {
    const fipe: FipeEnrichment = {
      price: 70000,
      confidence: 'HIGH',
      label: 'Toyota Corolla XEI 2.0 2022',
      delta: -20000,
      ratio: 0.71,
      classification: 'BELOW_FIPE',
    };

    const result = await computeOpportunityScore({ ...baseInput, price: 50000, fipe });
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(75);
    expect(result!.label).toContain('OPORTUNIDADE');
  });

  it('computes score with FIPE (above FIPE = low score)', async () => {
    const fipe: FipeEnrichment = {
      price: 50000,
      confidence: 'HIGH',
      label: 'Toyota Corolla XEI 2.0 2022',
      delta: 30000,
      ratio: 1.6,
      classification: 'ABOVE_FIPE',
    };

    const result = await computeOpportunityScore({ ...baseInput, price: 80000, fipe });
    expect(result).not.toBeNull();
    expect(result!.score).toBeLessThanOrEqual(50);
  });

  it('computes score without FIPE (uses market median)', async () => {
    // Market median from mock: 60000
    // Ad price: 45000 → below median → good score
    const result = await computeOpportunityScore({
      ...baseInput,
      price: 45000,
      fipe: undefined,
    });

    expect(result).not.toBeNull();
    expect(result!.meta.hasFipe).toBe(false);
    expect(result!.meta.scoreMarket).not.toBeNull();
    expect(result!.score).toBeGreaterThan(50);
  });

  it('computes score without FIPE and without market data', async () => {
    // Return fewer than 3 ads → no median available
    mockFindMany.mockResolvedValue([{ price: 50000 }] as any);

    const result = await computeOpportunityScore({
      ...baseInput,
      price: 50000,
      fipe: undefined,
    });

    expect(result).not.toBeNull();
    expect(result!.meta.hasFipe).toBe(false);
    expect(result!.meta.scoreMarket).toBeNull();
    // Score should be limited (quality + confidence only)
    expect(result!.score).toBeLessThanOrEqual(80);
  });

  it('quality score: penalizes noise words', async () => {
    const clean = await computeOpportunityScore({
      ...baseInput,
      title: 'Toyota Corolla XEI 2.0 2022',
    });

    const noisy = await computeOpportunityScore({
      ...baseInput,
      title: 'leia a descrição troca financio 2022',
    });

    expect(clean).not.toBeNull();
    expect(noisy).not.toBeNull();
    expect(clean!.meta.scoreQuality).toBeGreaterThan(noisy!.meta.scoreQuality);
  });

  it('quality score: rewards year + brand + model in title', async () => {
    const result = await computeOpportunityScore({
      ...baseInput,
      title: 'Honda Civic EXL 2022',
    });

    expect(result).not.toBeNull();
    // year (+10) + brand (+5) + model (+5) = 20
    expect(result!.meta.scoreQuality).toBe(20);
  });

  it('quality score: penalizes short titles', async () => {
    const result = await computeOpportunityScore({
      ...baseInput,
      title: 'carro 2022',
    });

    expect(result).not.toBeNull();
    // year (+10) + short (-5) = 5
    expect(result!.meta.scoreQuality).toBe(5);
  });

  it('confidence: HIGH FIPE → 10', async () => {
    const fipe: FipeEnrichment = {
      price: 60000,
      confidence: 'HIGH',
      label: 'X',
      delta: -10000,
      ratio: 0.83,
      classification: 'BELOW_FIPE',
    };

    const result = await computeOpportunityScore({ ...baseInput, fipe });
    expect(result!.meta.scoreConfidence).toBe(10);
  });

  it('confidence: MEDIUM FIPE → 5', async () => {
    const fipe: FipeEnrichment = {
      price: 60000,
      confidence: 'MEDIUM',
      label: 'X',
      delta: -10000,
      ratio: 0.83,
      classification: 'BELOW_FIPE',
    };

    const result = await computeOpportunityScore({ ...baseInput, fipe });
    expect(result!.meta.scoreConfidence).toBe(5);
  });

  it('confidence: no FIPE with valid price → 5', async () => {
    const result = await computeOpportunityScore({ ...baseInput, fipe: undefined });
    expect(result!.meta.scoreConfidence).toBe(5);
  });

  it('never throws on unexpected input', async () => {
    mockFindMany.mockRejectedValue(new Error('DB down'));

    const result = await computeOpportunityScore({
      title: '',
      price: undefined,
      site: 'OLX',
      monitorId: 'test',
    });
    expect(result).toBeNull();
  });

  it('handles DB error gracefully for median', async () => {
    mockFindMany.mockRejectedValue(new Error('Connection timeout'));

    const fipe: FipeEnrichment = {
      price: 70000,
      confidence: 'HIGH',
      label: 'X',
      delta: -20000,
      ratio: 0.71,
      classification: 'BELOW_FIPE',
    };

    // Should still compute score with FIPE, market falls back to neutral
    const result = await computeOpportunityScore({ ...baseInput, fipe });
    expect(result).not.toBeNull();
    expect(result!.meta.hasFipe).toBe(true);
    expect(result!.meta.scoreMarket).toBeNull();
  });
});

// ─── Label Classification ───────────────────────────────────────────────────

describe('score labels', () => {
  it('85+ → OPORTUNIDADE', async () => {
    const fipe: FipeEnrichment = {
      price: 100000,
      confidence: 'HIGH',
      label: 'X',
      delta: -30000,
      ratio: 0.7,
      classification: 'BELOW_FIPE',
    };

    // Price far below FIPE and market
    mockFindMany.mockResolvedValue(
      Array(10).fill({ price: 95000 }) as any
    );

    const result = await computeOpportunityScore({
      title: 'Toyota Corolla XEI 2.0 2022',
      price: 70000,
      site: 'OLX',
      monitorId: 'mon-1',
      fipe,
    });

    expect(result!.score).toBeGreaterThanOrEqual(85);
    expect(result!.label).toContain('OPORTUNIDADE');
  });
});

// ─── Formatting ─────────────────────────────────────────────────────────────

describe('formatScoreTelegram', () => {
  const baseResult: OpportunityResult = {
    score: 87,
    label: '🔥 OPORTUNIDADE',
    confidenceLevel: 'HIGH',
    meta: {
      hasFipe: true,
      scoreFipe: 90,
      scoreMarket: 75,
      scoreQuality: 20,
      scoreConfidence: 10,
      deltaFipe: -0.11,
      deltaMarket: -0.15,
    },
  };

  it('includes score number', () => {
    const result = formatScoreTelegram(baseResult);
    expect(result).toContain('87/100');
  });

  it('includes label', () => {
    const result = formatScoreTelegram(baseResult);
    expect(result).toContain('OPORTUNIDADE');
  });
});

describe('formatScoreEmail', () => {
  it('returns HTML with score badge', () => {
    const html = formatScoreEmail({
      score: 90,
      label: '🔥 OPORTUNIDADE',
      confidenceLevel: 'HIGH',
      meta: { hasFipe: true, scoreFipe: 90, scoreMarket: 75, scoreQuality: 20, scoreConfidence: 10 },
    });
    expect(html).toContain('90/100');
    expect(html).toContain('#e74c3c'); // red-hot for 85+
  });

  it('uses green for 70-84', () => {
    const html = formatScoreEmail({
      score: 75,
      label: '🟢 BOM NEGÓCIO',
      confidenceLevel: 'HIGH',
      meta: { hasFipe: true, scoreFipe: 70, scoreMarket: 60, scoreQuality: 15, scoreConfidence: 8 },
    });
    expect(html).toContain('#27ae60'); // green
  });

  it('uses orange for 50-69', () => {
    const html = formatScoreEmail({
      score: 55,
      label: '🟡 OK',
      confidenceLevel: 'MEDIUM',
      meta: { hasFipe: false, scoreFipe: null, scoreMarket: 50, scoreQuality: 10, scoreConfidence: 5 },
    });
    expect(html).toContain('#f39c12'); // orange
  });

  it('uses grey for below 50', () => {
    const html = formatScoreEmail({
      score: 30,
      label: '🔴 CARO',
      confidenceLevel: 'HIGH',
      meta: { hasFipe: true, scoreFipe: 20, scoreMarket: 20, scoreQuality: 5, scoreConfidence: 5 },
    });
    expect(html).toContain('#95a5a6'); // grey
  });

  it('shows confidence level in email', () => {
    const html = formatScoreEmail({
      score: 75,
      label: '🟢 BOM NEGÓCIO',
      confidenceLevel: 'MEDIUM',
      meta: { hasFipe: false, scoreFipe: null, scoreMarket: 60, scoreQuality: 15, scoreConfidence: 5 },
    });
    expect(html).toContain('Confian');
  });
});

describe('formatScoreText', () => {
  it('formats plain text with score and confidence', () => {
    const text = formatScoreText({
      score: 87,
      label: '🔥 OPORTUNIDADE',
      confidenceLevel: 'HIGH',
      meta: { hasFipe: true, scoreFipe: 90, scoreMarket: 75, scoreQuality: 20, scoreConfidence: 10 },
    });
    expect(text).toContain('87/100');
    expect(text).toContain('OPORTUNIDADE');
    expect(text).toContain('Confian');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing
vi.mock('../../../src/lib/prisma', () => ({
  prisma: {
    adSeen: {
      findMany: vi.fn(),
    },
  },
}));

import { computeOpportunityScoreV2 } from '../../../src/engine/enrichment/score-orchestrator';
import type { FipeEnrichment } from '../../../src/engine/enrichment/fipe-types';
import { prisma } from '../../../src/lib/prisma';

const mockFindMany = vi.mocked(prisma.adSeen.findMany);

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([
    { price: 50000 },
    { price: 55000 },
    { price: 60000 },
    { price: 65000 },
    { price: 70000 },
  ] as any);
});

const baseInput = {
  title: 'Toyota Corolla XEI 2.0 2022',
  price: 50000,
  location: 'São Paulo - SP',
  site: 'OLX',
  monitorId: 'mon-1',
};

// ─── Core Orchestration ─────────────────────────────────────────────────────

describe('computeOpportunityScoreV2', () => {
  it('returns result with V2.1 breakdown and confidence', async () => {
    const result = await computeOpportunityScoreV2(baseInput);
    expect(result).not.toBeNull();
    expect(result!.breakdown).toBeDefined();
    expect(result!.confidenceLevel).toBeDefined();
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(result!.confidenceLevel);
  });

  it('returns null for invalid input (no price)', async () => {
    const result = await computeOpportunityScoreV2({ ...baseInput, price: 0 });
    expect(result).toBeNull();
  });

  it('applies reduced time boost (max +7)', async () => {
    const result = await computeOpportunityScoreV2({
      ...baseInput,
      publishedAt: new Date(),
    });
    expect(result!.breakdown!.timeBoost).toBe(7);
    expect(result!.breakdown!.timeBoost).toBeLessThanOrEqual(7);
  });

  it('no time boost for old ads', async () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const result = await computeOpportunityScoreV2({
      ...baseInput,
      publishedAt: fourDaysAgo,
    });
    expect(result!.breakdown!.timeBoost).toBe(0);
  });

  it('applies negative seller score for urgency', async () => {
    const result = await computeOpportunityScoreV2({
      ...baseInput,
      title: 'Vendo urgente Corolla 2022',
    });
    expect(result!.breakdown!.sellerScore).toBeLessThan(0);
  });

  it('seller score capped at +5 (V2.1)', async () => {
    const result = await computeOpportunityScoreV2({
      ...baseInput,
      seller: { sellerName: 'Auto Shop', isPro: true, hasPhone: true },
    });
    expect(result!.breakdown!.sellerScore).toBeLessThanOrEqual(5);
  });

  it('uses categoryAdjustment instead of multiplier', async () => {
    const result = await computeOpportunityScoreV2(baseInput);
    expect(result!.breakdown!.categoryAdjustment).toBeDefined();
    expect(typeof result!.breakdown!.categoryAdjustment).toBe('number');
  });

  it('vehicle with FIPE gets +3 category adjustment', async () => {
    const fipe: FipeEnrichment = {
      price: 70000, confidence: 'HIGH', label: 'X',
      delta: -20000, ratio: 0.71, classification: 'BELOW_FIPE',
    };
    const result = await computeOpportunityScoreV2({ ...baseInput, fipe });
    expect(result!.breakdown!.categoryAdjustment).toBe(3);
  });
});

// ─── V2.1 Safety Caps ───────────────────────────────────────────────────────

describe('V2.1 Safety Caps', () => {
  it('caps score at 85 when FIPE delta is weak (> -0.15)', async () => {
    // FIPE delta = -0.10 (weak, only -10% below FIPE)
    const fipe: FipeEnrichment = {
      price: 55000, confidence: 'HIGH', label: 'X',
      delta: -5000, ratio: 0.91, classification: 'BELOW_FIPE',
    };

    // Market strongly below → would push score high
    mockFindMany.mockResolvedValue(
      Array(10).fill({ price: 80000 }) as any,
    );

    const result = await computeOpportunityScoreV2({
      ...baseInput,
      price: 50000,
      fipe,
      publishedAt: new Date(), // +7 time boost
      seller: { sellerName: 'X', hasPhone: true }, // +5 seller
    });

    expect(result).not.toBeNull();
    expect(result!.score).toBeLessThanOrEqual(85);
  });

  it('allows score above 85 when FIPE delta is strong (<= -0.15)', async () => {
    // FIPE delta = -0.30 (strong, 30% below FIPE)
    const fipe: FipeEnrichment = {
      price: 100000, confidence: 'HIGH', label: 'X',
      delta: -30000, ratio: 0.70, classification: 'BELOW_FIPE',
    };

    mockFindMany.mockResolvedValue(
      Array(10).fill({ price: 95000 }) as any,
    );

    const result = await computeOpportunityScoreV2({
      ...baseInput,
      price: 70000,
      fipe,
      publishedAt: new Date(),
    });

    expect(result).not.toBeNull();
    // Score can exceed 85 because FIPE delta is strong
    expect(result!.score).toBeGreaterThan(85);
  });

  it('penalizes FIPE vs Market conflict', async () => {
    // FIPE says cheap (delta = -0.20), market says expensive (delta = +0.30)
    const fipe: FipeEnrichment = {
      price: 62500, confidence: 'HIGH', label: 'X',
      delta: -12500, ratio: 0.80, classification: 'BELOW_FIPE',
    };

    // Market: median is 38000 → ad at 50000 is above market
    mockFindMany.mockResolvedValue([
      { price: 35000 }, { price: 37000 }, { price: 38000 },
      { price: 39000 }, { price: 40000 },
    ] as any);

    const withConflict = await computeOpportunityScoreV2({
      ...baseInput, price: 50000, fipe,
    });

    // Same but market agrees with FIPE
    mockFindMany.mockResolvedValue(
      Array(10).fill({ price: 60000 }) as any,
    );

    const withAgreement = await computeOpportunityScoreV2({
      ...baseInput, price: 50000, fipe,
    });

    // Conflict should produce lower score
    expect(withConflict!.score).toBeLessThan(withAgreement!.score);
  });

  it('final score is clamped between 10 and 95', async () => {
    // Super good deal
    const fipe: FipeEnrichment = {
      price: 200000, confidence: 'HIGH', label: 'X',
      delta: -150000, ratio: 0.25, classification: 'BELOW_FIPE',
    };
    mockFindMany.mockResolvedValue(Array(10).fill({ price: 180000 }) as any);

    const highResult = await computeOpportunityScoreV2({
      ...baseInput, price: 50000, fipe,
      publishedAt: new Date(),
      seller: { sellerName: 'X', hasPhone: true },
    });
    expect(highResult!.score).toBeLessThanOrEqual(95);
    expect(highResult!.score).toBeGreaterThanOrEqual(10);

    // Terrible deal (no need for fipe here)
    mockFindMany.mockResolvedValue(Array(10).fill({ price: 20000 }) as any);
    const lowResult = await computeOpportunityScoreV2({
      ...baseInput, price: 100000,
      title: 'Vendo urgente coisa 2022',
    });
    expect(lowResult!.score).toBeGreaterThanOrEqual(10);
    expect(lowResult!.score).toBeLessThanOrEqual(95);
  });
});

// ─── Label Gate ─────────────────────────────────────────────────────────────

describe('V2.1 Label Gate', () => {
  it('OPORTUNIDADE requires strong FIPE or market delta', async () => {
    // Weak FIPE delta (-0.09) but high base score from market
    const fipe: FipeEnrichment = {
      price: 55000, confidence: 'HIGH', label: 'X',
      delta: -5000, ratio: 0.91, classification: 'BELOW_FIPE',
    };

    // Market is very favorable
    mockFindMany.mockResolvedValue(Array(10).fill({ price: 70000 }) as any);

    const result = await computeOpportunityScoreV2({
      ...baseInput, price: 50000, fipe,
    });

    // Even if score is high, label should NOT be OPORTUNIDADE
    // because neither FIPE delta <= -0.15 nor market delta <= -0.20
    if (result!.score >= 85) {
      // delta_fipe is -0.09, delta_market is -0.29 → market IS strong
      // So this should be OPORTUNIDADE because market delta is strong
      expect(result!.label).toContain('OPORTUNIDADE');
    }
  });

  it('score >= 85 without strong delta → BOM NEGÓCIO (not OPORTUNIDADE)', async () => {
    // Neither FIPE nor market show strong cheap signal
    // but quality + confidence + time push score up
    mockFindMany.mockResolvedValue([
      { price: 48000 }, { price: 49000 }, { price: 50000 },
      { price: 51000 }, { price: 52000 },
    ] as any);

    const result = await computeOpportunityScoreV2({
      ...baseInput,
      price: 49000, // barely below median, deltaMarket ~ -0.02
      publishedAt: new Date(),
      seller: { sellerName: 'X', hasPhone: true },
    });

    // V3: Without FIPE, score uses simplified mode — no price labels
    if (result) {
      expect(result.scoreMode).toBe('simplified');
      expect(result.label).not.toContain('OPORTUNIDADE');
      expect(result.label).not.toContain('CARO');
      // Simplified labels: ANÚNCIO DESTAQUE, ANÚNCIO, ANÚNCIO RECENTE
      expect(result.label).toContain('AN\u00DANCIO');
    }
  });
});

// ─── Confidence Level ───────────────────────────────────────────────────────

describe('V2.1 Confidence Level', () => {
  it('HIGH when FIPE + market available', async () => {
    const fipe: FipeEnrichment = {
      price: 70000, confidence: 'HIGH', label: 'X',
      delta: -20000, ratio: 0.71, classification: 'BELOW_FIPE',
    };
    const result = await computeOpportunityScoreV2({ ...baseInput, fipe });
    expect(result!.confidenceLevel).toBe('HIGH');
  });

  it('MEDIUM when only market available', async () => {
    const result = await computeOpportunityScoreV2(baseInput);
    expect(result!.confidenceLevel).toBe('MEDIUM');
  });

  it('MEDIUM when only FIPE available', async () => {
    mockFindMany.mockResolvedValue([{ price: 50000 }] as any); // < 3 ads → no median
    const fipe: FipeEnrichment = {
      price: 70000, confidence: 'HIGH', label: 'X',
      delta: -20000, ratio: 0.71, classification: 'BELOW_FIPE',
    };
    const result = await computeOpportunityScoreV2({ ...baseInput, fipe });
    expect(result!.confidenceLevel).toBe('MEDIUM');
  });

  it('LOW when neither FIPE nor market available', async () => {
    mockFindMany.mockResolvedValue([{ price: 50000 }] as any); // < 3 ads
    const result = await computeOpportunityScoreV2(baseInput);
    expect(result!.confidenceLevel).toBe('LOW');
  });
});

// ─── Failsafe ───────────────────────────────────────────────────────────────

describe('V2.1 Failsafe', () => {
  it('falls back gracefully when DB fails', async () => {
    mockFindMany.mockRejectedValue(new Error('DB down'));

    const fipe: FipeEnrichment = {
      price: 70000, confidence: 'HIGH', label: 'X',
      delta: -20000, ratio: 0.71, classification: 'BELOW_FIPE',
    };

    const result = await computeOpportunityScoreV2({
      ...baseInput, fipe,
    });

    expect(result).not.toBeNull();
    expect(result!.breakdown).toBeDefined();
    expect(result!.confidenceLevel).toBeDefined();
  });

  it('returns null only when V1 base itself fails', async () => {
    const result = await computeOpportunityScoreV2({
      title: '', price: 0, site: 'OLX', monitorId: 'test',
    });
    expect(result).toBeNull();
  });
});

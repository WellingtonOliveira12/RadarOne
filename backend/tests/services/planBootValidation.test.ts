import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes para planBootValidation — ensurePlansIntegrity
 *
 * Casos testados:
 * - Plano ok (trialDays=7) → não modifica
 * - Plano com trialDays=0 → corrige para 7
 * - Conta broken trials corretamente
 */

const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      plan: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      $queryRaw: vi.fn(),
    },
  };
});

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// Mock loggerHelpers para não poluir output
vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

import { ensurePlansIntegrity } from '../../src/services/planBootValidation';
import { logError, logInfo } from '../../src/utils/loggerHelpers';

describe('ensurePlansIntegrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plano ok (trialDays=7) → não modifica', async () => {
    mockPrisma.plan.findMany.mockResolvedValue([
      { id: 'plan-1', slug: 'free', trialDays: 7, isActive: true },
      { id: 'plan-2', slug: 'pro', trialDays: 7, isActive: true },
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

    const result = await ensurePlansIntegrity();

    expect(result.plansChecked).toBe(2);
    expect(result.plansFixed).toBe(0);
    expect(result.brokenTrials).toBe(0);
    expect(mockPrisma.plan.update).not.toHaveBeenCalled();
  });

  it('plano com trialDays=0 → corrige para 7', async () => {
    mockPrisma.plan.findMany.mockResolvedValue([
      { id: 'plan-1', slug: 'free', trialDays: 0, isActive: true },
    ]);
    mockPrisma.plan.update.mockResolvedValue({});
    mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

    const result = await ensurePlansIntegrity();

    expect(result.plansFixed).toBe(1);
    expect(mockPrisma.plan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { trialDays: 7 },
    });
    expect(logError).toHaveBeenCalledWith(
      '[PLANS] CRITICAL: trialDays inválido detectado no boot',
      expect.objectContaining({
        planSlug: 'free',
        oldTrialDays: 0,
        newTrialDays: 7,
      })
    );
  });

  it('conta broken trials corretamente', async () => {
    mockPrisma.plan.findMany.mockResolvedValue([
      { id: 'plan-1', slug: 'free', trialDays: 7, isActive: true },
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(3) }]);

    const result = await ensurePlansIntegrity();

    expect(result.brokenTrials).toBe(3);
    expect(logError).toHaveBeenCalledWith(
      '[PLANS] ALERT: broken trials detectados',
      expect.objectContaining({ brokenTrials: 3 })
    );
  });

  it('erro no banco → non-fatal, retorna resultado parcial', async () => {
    mockPrisma.plan.findMany.mockRejectedValue(new Error('DB offline'));

    const result = await ensurePlansIntegrity();

    expect(result.plansChecked).toBe(0);
    expect(result.plansFixed).toBe(0);
    expect(logError).toHaveBeenCalledWith(
      '[PLANS] Erro na validação de planos (non-fatal)',
      expect.any(Object)
    );
  });
});

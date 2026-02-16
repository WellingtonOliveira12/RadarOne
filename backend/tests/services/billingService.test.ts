import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes para billingService — guard rail + deduplicação + idempotência
 *
 * Casos testados:
 * - trialDays = 7 → trial de 7 dias (cenário normal)
 * - trialDays = 0 → fallback para 7 dias (guard rail)
 * - trialEndsAt sempre no futuro após criação
 * - Plano não encontrado → erro
 * - Idempotência: trial existente do mesmo plano → retorna existente
 * - ACTIVE existente → rejeita SUBSCRIPTION_ALREADY_ACTIVE
 * - Trial já usado antes → rejeita TRIAL_ALREADY_USED
 * - Cancela trials expirados antigos
 */

// Mock Prisma e email com vi.hoisted
const { mockPrisma, mockSendTrialStartedEmail } = vi.hoisted(() => {
  const txProxy: any = {};
  return {
    mockPrisma: {
      plan: {
        findUnique: vi.fn(),
      },
      subscription: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(async (fn: any) => fn(txProxy)),
      _txProxy: txProxy,
    },
    mockSendTrialStartedEmail: vi.fn(() => Promise.resolve()),
  };
});

// O txProxy usa os mesmos mocks do prisma.subscription
mockPrisma._txProxy.subscription = mockPrisma.subscription;

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../src/services/emailService', () => ({
  sendTrialStartedEmail: mockSendTrialStartedEmail,
}));

import { startTrialForUser, TrialBusinessError } from '../../src/services/billingService';

const MOCK_PLAN_FREE = {
  id: 'plan-free',
  name: 'Free',
  slug: 'free',
  trialDays: 7,
  maxMonitors: 1,
};

function mockSubscriptionCreate(plan: any) {
  return (args: any) => {
    return Promise.resolve({
      id: 'sub-new',
      userId: args.data.userId,
      planId: args.data.planId,
      status: args.data.status,
      isTrial: args.data.isTrial,
      trialEndsAt: args.data.trialEndsAt,
      validUntil: args.data.validUntil,
      queriesLimit: args.data.queriesLimit,
      isLifetime: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      plan,
      user: { email: 'test@example.com' },
    });
  };
}

/** Helper: setup mocks para cenário de "sem subscriptions existentes" */
function setupCleanUser(plan: any) {
  mockPrisma.plan.findUnique.mockResolvedValue(plan);
  mockPrisma.subscription.findMany.mockResolvedValue([]);
  mockPrisma.subscription.findFirst.mockResolvedValue(null);
  mockPrisma.subscription.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.subscription.create.mockImplementation(mockSubscriptionCreate(plan));
}

describe('startTrialForUser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-16T12:00:00Z'));
    vi.clearAllMocks();
    mockSendTrialStartedEmail.mockReturnValue(Promise.resolve());
    // Re-link txProxy após clearAllMocks
    mockPrisma._txProxy.subscription = mockPrisma.subscription;
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma._txProxy));
  });

  // =========================================
  // Guard Rail de trialDays
  // =========================================

  it('trialDays=7 → trial de 7 dias', async () => {
    const plan = { ...MOCK_PLAN_FREE, trialDays: 7 };
    setupCleanUser(plan);

    const result = await startTrialForUser('user-1', 'free');

    expect(result.isExisting).toBe(false);
    expect(result.subscription.trialEndsAt).toBeDefined();
    const diffMs = result.subscription.trialEndsAt!.getTime() - new Date('2026-02-16T12:00:00Z').getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });

  it('trialDays=0 → fallback para 7 dias (guard rail)', async () => {
    const plan = { ...MOCK_PLAN_FREE, trialDays: 0 };
    setupCleanUser(plan);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await startTrialForUser('user-1', 'free');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL: plan.trialDays inválido')
    );

    expect(result.isExisting).toBe(false);
    const diffMs = result.subscription.trialEndsAt!.getTime() - new Date('2026-02-16T12:00:00Z').getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);

    consoleSpy.mockRestore();
  });

  it('trialEndsAt sempre no futuro após criação', async () => {
    const plan = { ...MOCK_PLAN_FREE, trialDays: 1 };
    setupCleanUser(plan);

    const result = await startTrialForUser('user-1', 'free');
    const now = new Date('2026-02-16T12:00:00Z');

    expect(result.subscription.trialEndsAt!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('plano não encontrado → erro', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue(null);

    await expect(startTrialForUser('user-1', 'inexistente'))
      .rejects.toThrow('Plano não encontrado');
  });

  // =========================================
  // Idempotência
  // =========================================

  it('trial existente do mesmo plano → retorna existente (idempotente)', async () => {
    const plan = { ...MOCK_PLAN_FREE, trialDays: 7 };
    mockPrisma.plan.findUnique.mockResolvedValue(plan);

    const existingSub = {
      id: 'sub-existing',
      userId: 'user-1',
      planId: 'plan-free',
      status: 'TRIAL',
      isTrial: true,
      isLifetime: false,
      trialEndsAt: new Date('2026-02-23T12:00:00Z'),
      validUntil: new Date('2026-02-23T12:00:00Z'),
      plan: { slug: 'free' },
    };

    mockPrisma.subscription.findMany.mockResolvedValue([existingSub]);

    const result = await startTrialForUser('user-1', 'free');

    expect(result.isExisting).toBe(true);
    expect(result.subscription.id).toBe('sub-existing');
    // Não deve ter chamado create
    expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
  });

  // =========================================
  // Rejeições
  // =========================================

  it('subscription ACTIVE existente → rejeita SUBSCRIPTION_ALREADY_ACTIVE', async () => {
    const plan = { ...MOCK_PLAN_FREE, trialDays: 7 };
    mockPrisma.plan.findUnique.mockResolvedValue(plan);

    const activeSub = {
      id: 'sub-active',
      userId: 'user-1',
      planId: 'plan-pro',
      status: 'ACTIVE',
      isTrial: false,
      isLifetime: false,
      validUntil: new Date('2026-03-16T12:00:00Z'),
      plan: { slug: 'pro' },
    };

    mockPrisma.subscription.findMany.mockResolvedValue([activeSub]);

    await expect(startTrialForUser('user-1', 'free'))
      .rejects.toThrow(TrialBusinessError);

    try {
      await startTrialForUser('user-1', 'free');
    } catch (e: any) {
      expect(e.errorCode).toBe('SUBSCRIPTION_ALREADY_ACTIVE');
    }
  });

  it('trial já usado anteriormente → rejeita TRIAL_ALREADY_USED', async () => {
    const plan = { ...MOCK_PLAN_FREE, trialDays: 7 };
    mockPrisma.plan.findUnique.mockResolvedValue(plan);

    // Nenhuma sub ativa
    mockPrisma.subscription.findMany.mockResolvedValue([]);

    // Mas já usou trial antes (expired)
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-old',
      userId: 'user-1',
      planId: 'plan-free',
      status: 'EXPIRED',
      isTrial: true,
    });

    await expect(startTrialForUser('user-1', 'free'))
      .rejects.toThrow(TrialBusinessError);

    try {
      await startTrialForUser('user-1', 'free');
    } catch (e: any) {
      expect(e.errorCode).toBe('TRIAL_ALREADY_USED');
    }
  });

  // =========================================
  // Limpeza de trials antigos
  // =========================================

  it('cancela trials expirados antigos ao criar novo', async () => {
    const plan = { ...MOCK_PLAN_FREE, trialDays: 7 };
    setupCleanUser(plan);

    await startTrialForUser('user-1', 'free');

    expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          status: 'TRIAL',
          isTrial: true,
        }),
        data: { status: 'EXPIRED' },
      })
    );
  });
});

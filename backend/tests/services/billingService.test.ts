import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes para billingService — guard rail de trialDays
 *
 * Casos testados:
 * - trialDays = 7 → trial de 7 dias (cenário normal)
 * - trialDays = 0 → fallback para 7 dias (guard rail)
 * - trialEndsAt sempre no futuro após criação
 * - Plano não encontrado → erro
 */

// Mock Prisma e email com vi.hoisted
const { mockPrisma, mockSendTrialStartedEmail } = vi.hoisted(() => {
  return {
    mockPrisma: {
      plan: {
        findUnique: vi.fn(),
      },
      subscription: {
        create: vi.fn(),
      },
    },
    mockSendTrialStartedEmail: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../src/services/emailService', () => ({
  sendTrialStartedEmail: mockSendTrialStartedEmail,
}));

import { startTrialForUser } from '../../src/services/billingService';

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
      id: 'sub-1',
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

describe('startTrialForUser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-16T12:00:00Z'));
    mockSendTrialStartedEmail.mockReturnValue(Promise.resolve());
  });

  it('trialDays=7 → trial de 7 dias', async () => {
    const plan = { ...MOCK_PLAN_FREE, trialDays: 7 };
    mockPrisma.plan.findUnique.mockResolvedValue(plan);
    mockPrisma.subscription.create.mockImplementation(mockSubscriptionCreate(plan));

    const result = await startTrialForUser('user-1', 'free');

    expect(result.trialEndsAt).toBeDefined();
    const diffMs = result.trialEndsAt!.getTime() - new Date('2026-02-16T12:00:00Z').getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });

  it('trialDays=0 → fallback para 7 dias (guard rail)', async () => {
    const plan = { ...MOCK_PLAN_FREE, trialDays: 0 };
    mockPrisma.plan.findUnique.mockResolvedValue(plan);
    mockPrisma.subscription.create.mockImplementation(mockSubscriptionCreate(plan));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await startTrialForUser('user-1', 'free');

    // Deve ter logado o warning CRITICAL
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL: plan.trialDays inválido')
    );

    // trialEndsAt deve ser ~7 dias no futuro (fallback)
    expect(result.trialEndsAt).toBeDefined();
    const diffMs = result.trialEndsAt!.getTime() - new Date('2026-02-16T12:00:00Z').getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);

    consoleSpy.mockRestore();
  });

  it('trialEndsAt sempre no futuro após criação', async () => {
    const plan = { ...MOCK_PLAN_FREE, trialDays: 1 };
    mockPrisma.plan.findUnique.mockResolvedValue(plan);
    mockPrisma.subscription.create.mockImplementation(mockSubscriptionCreate(plan));

    const result = await startTrialForUser('user-1', 'free');
    const now = new Date('2026-02-16T12:00:00Z');

    expect(result.trialEndsAt!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('plano não encontrado → erro', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue(null);

    await expect(startTrialForUser('user-1', 'inexistente'))
      .rejects.toThrow('Plano não encontrado');
  });
});

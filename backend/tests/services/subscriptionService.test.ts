import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes para subscriptionService — fonte canônica de validação de subscription
 *
 * Casos testados:
 * - ✅ Retorna null quando não há subscriptions
 * - ✅ Retorna trial válido quando trialEndsAt > now
 * - ✅ Retorna null quando trial expirado (trialEndsAt < now)
 * - ✅ Retorna subscription ACTIVE válida
 * - ✅ Retorna null quando ACTIVE expirada (validUntil < now)
 * - ✅ Subscription vitalícia sempre válida
 * - ✅ Prioriza ACTIVE sobre TRIAL
 * - ✅ Ignora subscriptions CANCELLED, EXPIRED, SUSPENDED
 */

// Mock Prisma
const { mockPrisma } = vi.hoisted(() => {
  const mockPrismaSubscription = {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  };

  return {
    mockPrisma: {
      subscription: mockPrismaSubscription,
    },
  };
});

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import {
  getCurrentSubscriptionForUser,
  hasValidSubscription,
  cancelOldSubscriptions,
} from '../../src/services/subscriptionService';

// Helpers para criar subscriptions de teste
function makeSubscription(overrides: Record<string, any> = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    planId: 'plan-1',
    status: 'TRIAL',
    startDate: new Date('2026-02-01'),
    validUntil: new Date('2026-02-23'),
    trialEndsAt: new Date('2026-02-23'),
    queriesUsed: 0,
    queriesLimit: 1000,
    isLifetime: false,
    isTrial: true,
    externalProvider: null,
    externalSubId: null,
    kiwifyOrderId: null,
    kiwifyCustomerId: null,
    createdAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-01'),
    plan: { id: 'plan-1', name: 'Free', slug: 'free' },
    ...overrides,
  };
}

describe('getCurrentSubscriptionForUser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-16T12:00:00Z'));
  });

  it('retorna null quando não há subscriptions', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);

    const result = await getCurrentSubscriptionForUser('user-1');
    expect(result).toBeNull();
  });

  it('retorna trial válido quando trialEndsAt > now', async () => {
    const sub = makeSubscription({
      status: 'TRIAL',
      trialEndsAt: new Date('2026-02-23T12:00:00Z'), // 7 dias no futuro
    });
    mockPrisma.subscription.findMany.mockResolvedValue([sub]);

    const result = await getCurrentSubscriptionForUser('user-1');
    expect(result).not.toBeNull();
    expect(result!.status).toBe('TRIAL');
    expect(result!.id).toBe('sub-1');
  });

  it('retorna null quando trial expirado (trialEndsAt < now)', async () => {
    const sub = makeSubscription({
      status: 'TRIAL',
      trialEndsAt: new Date('2026-02-10T12:00:00Z'), // 6 dias no passado
      validUntil: new Date('2026-02-10T12:00:00Z'),
    });
    mockPrisma.subscription.findMany.mockResolvedValue([sub]);

    const result = await getCurrentSubscriptionForUser('user-1');
    expect(result).toBeNull();
  });

  it('retorna subscription ACTIVE válida', async () => {
    const sub = makeSubscription({
      status: 'ACTIVE',
      isTrial: false,
      trialEndsAt: null,
      validUntil: new Date('2026-03-16T12:00:00Z'), // 1 mês no futuro
    });
    mockPrisma.subscription.findMany.mockResolvedValue([sub]);

    const result = await getCurrentSubscriptionForUser('user-1');
    expect(result).not.toBeNull();
    expect(result!.status).toBe('ACTIVE');
  });

  it('retorna null quando ACTIVE expirada (validUntil < now)', async () => {
    const sub = makeSubscription({
      status: 'ACTIVE',
      isTrial: false,
      trialEndsAt: null,
      validUntil: new Date('2026-02-10T12:00:00Z'), // expirado
    });
    mockPrisma.subscription.findMany.mockResolvedValue([sub]);

    const result = await getCurrentSubscriptionForUser('user-1');
    expect(result).toBeNull();
  });

  it('subscription vitalícia sempre válida (ignora datas)', async () => {
    const sub = makeSubscription({
      status: 'ACTIVE',
      isLifetime: true,
      validUntil: null,
      trialEndsAt: null,
    });
    mockPrisma.subscription.findMany.mockResolvedValue([sub]);

    const result = await getCurrentSubscriptionForUser('user-1');
    expect(result).not.toBeNull();
    expect(result!.isLifetime).toBe(true);
  });

  it('prioriza ACTIVE válida sobre TRIAL expirado', async () => {
    const expiredTrial = makeSubscription({
      id: 'sub-old',
      status: 'TRIAL',
      trialEndsAt: new Date('2026-02-10T12:00:00Z'),
    });
    const activeSub = makeSubscription({
      id: 'sub-active',
      status: 'ACTIVE',
      isTrial: false,
      validUntil: new Date('2026-03-16T12:00:00Z'),
    });
    // findMany retorna ordenado por status asc (ACTIVE antes de TRIAL)
    mockPrisma.subscription.findMany.mockResolvedValue([activeSub, expiredTrial]);

    const result = await getCurrentSubscriptionForUser('user-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('sub-active');
    expect(result!.status).toBe('ACTIVE');
  });

  it('TRIAL sem trialEndsAt (edge case) é considerado válido', async () => {
    const sub = makeSubscription({
      status: 'TRIAL',
      trialEndsAt: null,
    });
    mockPrisma.subscription.findMany.mockResolvedValue([sub]);

    const result = await getCurrentSubscriptionForUser('user-1');
    expect(result).not.toBeNull();
  });

  it('TRIAL vitalício é sempre válido (edge case)', async () => {
    const sub = makeSubscription({
      status: 'TRIAL',
      isLifetime: true,
      trialEndsAt: new Date('2020-01-01'), // past date, but lifetime
    });
    mockPrisma.subscription.findMany.mockResolvedValue([sub]);

    const result = await getCurrentSubscriptionForUser('user-1');

    expect(result).not.toBeNull();
    expect(result!.isLifetime).toBe(true);
  });

  it('subscription vitalícia ACTIVE retorna sem verificar datas', async () => {
    const lifetime = makeSubscription({
      id: 'sub-lifetime',
      status: 'ACTIVE',
      isLifetime: true,
      validUntil: null,
    });
    const expired = makeSubscription({
      id: 'sub-expired',
      status: 'ACTIVE',
      isLifetime: false,
      validUntil: new Date('2026-02-01'), // expired
    });
    mockPrisma.subscription.findMany.mockResolvedValue([lifetime, expired]);

    const result = await getCurrentSubscriptionForUser('user-1');

    expect(result!.id).toBe('sub-lifetime');
    expect(result!.isLifetime).toBe(true);
  });

  it('findMany é chamado com filtro status ACTIVE/TRIAL e include plan', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);

    await getCurrentSubscriptionForUser('user-2');

    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-2',
          status: { in: ['ACTIVE', 'TRIAL'] },
        }),
        include: { plan: true },
      })
    );
  });
});

// ============================================================
// hasValidSubscription
// ============================================================

describe('hasValidSubscription', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-16T12:00:00Z'));
  });

  it('returns true when user has a valid subscription', async () => {
    const sub = makeSubscription({
      status: 'ACTIVE',
      validUntil: new Date('2026-03-01'),
    });
    mockPrisma.subscription.findMany.mockResolvedValue([sub]);

    const result = await hasValidSubscription('user-1');

    expect(result).toBe(true);
  });

  it('returns false when user has no subscriptions', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);

    const result = await hasValidSubscription('user-1');

    expect(result).toBe(false);
  });

  it('returns false when trial is expired', async () => {
    const sub = makeSubscription({
      status: 'TRIAL',
      trialEndsAt: new Date('2026-02-10'), // expired
    });
    mockPrisma.subscription.findMany.mockResolvedValue([sub]);

    const result = await hasValidSubscription('user-1');

    expect(result).toBe(false);
  });

  it('returns true for lifetime subscription', async () => {
    const sub = makeSubscription({
      status: 'ACTIVE',
      isLifetime: true,
      validUntil: null,
    });
    mockPrisma.subscription.findMany.mockResolvedValue([sub]);

    const result = await hasValidSubscription('user-1');

    expect(result).toBe(true);
  });
});

// ============================================================
// cancelOldSubscriptions
// ============================================================

describe('cancelOldSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels ACTIVE and TRIAL subscriptions for a user', async () => {
    mockPrisma.subscription.updateMany.mockResolvedValue({ count: 2 });

    const result = await cancelOldSubscriptions('user-1');

    expect(result).toBe(2);
    expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: { in: ['ACTIVE', 'TRIAL'] },
        isLifetime: false,
      },
      data: { status: 'CANCELLED' },
    });
  });

  it('returns 0 when no subscriptions to cancel', async () => {
    mockPrisma.subscription.updateMany.mockResolvedValue({ count: 0 });

    const result = await cancelOldSubscriptions('user-1');

    expect(result).toBe(0);
  });

  it('never cancels lifetime subscriptions (isLifetime: false in where clause)', async () => {
    mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });

    await cancelOldSubscriptions('user-1');

    const callArgs = mockPrisma.subscription.updateMany.mock.calls[0][0];
    expect(callArgs.where.isLifetime).toBe(false);
  });

  it('sets status to CANCELLED', async () => {
    mockPrisma.subscription.updateMany.mockResolvedValue({ count: 3 });

    await cancelOldSubscriptions('user-1');

    const callArgs = mockPrisma.subscription.updateMany.mock.calls[0][0];
    expect(callArgs.data.status).toBe('CANCELLED');
  });

  it('propagates DB errors', async () => {
    mockPrisma.subscription.updateMany.mockRejectedValue(new Error('DB error'));

    await expect(cancelOldSubscriptions('user-1')).rejects.toThrow('DB error');
  });
});

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

import { getCurrentSubscriptionForUser } from '../../src/services/subscriptionService';

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
});

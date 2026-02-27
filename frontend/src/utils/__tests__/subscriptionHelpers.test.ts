import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSubscriptionStatus } from '../subscriptionHelpers';
import type { User, Subscription } from '../subscriptionHelpers';

/**
 * Testes para getSubscriptionStatus — lógica canônica do frontend
 *
 * Casos testados:
 * - ✅ Sem usuário → no_subscription
 * - ✅ Sem subscriptions → subscription_required
 * - ✅ TRIAL válido (trialEndsAt no futuro) → hasValidSubscription
 * - ✅ TRIAL expirado (trialEndsAt no passado) → trial_expired
 * - ✅ ACTIVE válido → hasValidSubscription
 * - ✅ ACTIVE expirado (validUntil no passado) → subscription_required
 * - ✅ Vitalício sempre válido
 * - ✅ Múltiplas subscriptions: ignora expirado se existe válido
 * - ✅ Usuário novo com trial recém-criado NÃO retorna trial_expired
 * - ✅ Banner único: nunca retorna dois reasons simultâneos
 */

function makeUser(subscriptions?: Subscription[]): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'USER',
    subscriptions,
  };
}

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    status: 'TRIAL',
    isTrial: true,
    isLifetime: false,
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // +7 dias
    validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    plan: { name: 'Free', slug: 'free' },
    ...overrides,
  };
}

describe('getSubscriptionStatus', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('retorna no_subscription sem usuário', () => {
    const result = getSubscriptionStatus(null);
    expect(result.hasValidSubscription).toBe(false);
    expect(result.reason).toBe('no_subscription');
  });

  it('retorna subscription_required sem subscriptions', () => {
    const user = makeUser([]);
    const result = getSubscriptionStatus(user);
    expect(result.hasValidSubscription).toBe(false);
    expect(result.reason).toBe('subscription_required');
  });

  it('retorna subscription_required com subscriptions undefined', () => {
    const user = makeUser(undefined);
    const result = getSubscriptionStatus(user);
    expect(result.hasValidSubscription).toBe(false);
    expect(result.reason).toBe('subscription_required');
  });

  it('TRIAL válido (trialEndsAt no futuro) → hasValidSubscription', () => {
    const user = makeUser([makeSub({
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })]);
    const result = getSubscriptionStatus(user);
    expect(result.hasValidSubscription).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('TRIAL expirado (trialEndsAt no passado) → trial_expired', () => {
    const user = makeUser([makeSub({
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // -1 dia
    })]);
    const result = getSubscriptionStatus(user);
    expect(result.hasValidSubscription).toBe(false);
    expect(result.reason).toBe('trial_expired');
  });

  it('ACTIVE válido → hasValidSubscription', () => {
    const user = makeUser([makeSub({
      status: 'ACTIVE',
      isTrial: false,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })]);
    const result = getSubscriptionStatus(user);
    expect(result.hasValidSubscription).toBe(true);
  });

  it('ACTIVE expirado → continua buscando (sem válida = subscription_required)', () => {
    const user = makeUser([makeSub({
      status: 'ACTIVE',
      isTrial: false,
      validUntil: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    })]);
    const result = getSubscriptionStatus(user);
    expect(result.hasValidSubscription).toBe(false);
    expect(result.reason).toBe('subscription_required');
  });

  it('vitalício sempre válido', () => {
    const user = makeUser([makeSub({
      status: 'ACTIVE',
      isLifetime: true,
      validUntil: null,
    })]);
    const result = getSubscriptionStatus(user);
    expect(result.hasValidSubscription).toBe(true);
  });

  it('múltiplas subs: ignora expirado se existe válido', () => {
    const user = makeUser([
      makeSub({
        id: 'sub-new',
        status: 'TRIAL',
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // válido
      }),
      makeSub({
        id: 'sub-old',
        status: 'TRIAL',
        trialEndsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // expirado
      }),
    ]);
    const result = getSubscriptionStatus(user);
    expect(result.hasValidSubscription).toBe(true);
    expect(result.subscription?.id).toBe('sub-new');
  });

  it('múltiplas subs: trial expirado antigo + nenhuma válida → trial_expired', () => {
    const user = makeUser([
      makeSub({
        id: 'sub-old',
        status: 'TRIAL',
        trialEndsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ]);
    const result = getSubscriptionStatus(user);
    expect(result.hasValidSubscription).toBe(false);
    expect(result.reason).toBe('trial_expired');
  });

  it('usuário novo com trial recém-criado NÃO retorna trial_expired', () => {
    // Simula cenário de registro: trial criado agora com +7 dias
    const user = makeUser([makeSub({
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })]);
    const result = getSubscriptionStatus(user);
    expect(result.hasValidSubscription).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('TRIAL sem trialEndsAt (edge case) → válido', () => {
    const user = makeUser([makeSub({
      status: 'TRIAL',
      trialEndsAt: null,
    })]);
    const result = getSubscriptionStatus(user);
    expect(result.hasValidSubscription).toBe(true);
  });

  it('status CANCELLED → subscription_required', () => {
    const user = makeUser([makeSub({
      status: 'CANCELLED',
    })]);
    const result = getSubscriptionStatus(user);
    expect(result.hasValidSubscription).toBe(false);
    expect(result.reason).toBe('subscription_required');
  });

  it('retorna apenas um reason (nunca dois)', () => {
    const user = makeUser([makeSub({
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() - 1000).toISOString(),
    })]);
    const result = getSubscriptionStatus(user);
    // Deve retornar exatamente um reason
    expect(result.hasValidSubscription).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(['trial_expired', 'subscription_required', 'no_subscription']).toContain(result.reason);
  });
});

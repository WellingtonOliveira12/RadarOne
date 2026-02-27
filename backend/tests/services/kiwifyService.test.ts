import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for kiwifyService — Kiwify checkout URL generation and plan queries
 *
 * Cases tested:
 * - generateCheckoutUrl: valid plan, missing plan, missing kiwifyProductId, missing user
 * - isPlanKiwifyEnabled: plan with/without kiwifyProductId
 * - getKiwifyEnabledPlans: returns only active plans with kiwifyProductId
 */

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    plan: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

import {
  generateCheckoutUrl,
  isPlanKiwifyEnabled,
  getKiwifyEnabledPlans,
  setKiwifyProductId,
} from '../../src/services/kiwifyService';

// ============================================
// FIXTURES
// ============================================

const MOCK_PLAN = {
  id: 'plan-pro',
  name: 'Pro',
  slug: 'pro',
  priceCents: 4990,
  kiwifyProductId: 'kiwify-prod-123',
  isActive: true,
};

const MOCK_USER = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
};

// ============================================
// generateCheckoutUrl
// ============================================

describe('generateCheckoutUrl', () => {
  const originalEnv = process.env.KIWIFY_BASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.KIWIFY_BASE_URL = 'https://pay.kiwify.com.br';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.KIWIFY_BASE_URL = originalEnv;
    } else {
      delete process.env.KIWIFY_BASE_URL;
    }
  });

  it('generates valid checkout URL for a valid plan', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue(MOCK_PLAN);
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

    const result = await generateCheckoutUrl({
      userId: 'user-123',
      planSlug: 'pro',
    });

    expect(result.planName).toBe('Pro');
    expect(result.price).toBe(49.9);
    expect(result.checkoutUrl).toContain('https://pay.kiwify.com.br/kiwify-prod-123');
    expect(result.checkoutUrl).toContain('email=test%40example.com');
    expect(result.checkoutUrl).toContain('name=Test+User');
  });

  it('includes successUrl and cancelUrl when provided', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue(MOCK_PLAN);
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

    const result = await generateCheckoutUrl({
      userId: 'user-123',
      planSlug: 'pro',
      successUrl: 'https://radarone.com/success',
      cancelUrl: 'https://radarone.com/cancel',
    });

    expect(result.checkoutUrl).toContain('success_url=');
    expect(result.checkoutUrl).toContain('cancel_url=');
  });

  it('includes coupon params when couponCode is provided', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue(MOCK_PLAN);
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

    const result = await generateCheckoutUrl({
      userId: 'user-123',
      planSlug: 'pro',
      couponCode: 'DISCOUNT50',
    });

    expect(result.checkoutUrl).toContain('coupon=DISCOUNT50');
    expect(result.checkoutUrl).toContain('discount_code=DISCOUNT50');
  });

  it('uses custom KIWIFY_BASE_URL from env', async () => {
    process.env.KIWIFY_BASE_URL = 'https://custom-pay.kiwify.com';
    mockPrisma.plan.findUnique.mockResolvedValue(MOCK_PLAN);
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

    const result = await generateCheckoutUrl({
      userId: 'user-123',
      planSlug: 'pro',
    });

    expect(result.checkoutUrl).toContain('https://custom-pay.kiwify.com/kiwify-prod-123');
  });

  it('falls back to default base URL when env not set', async () => {
    delete process.env.KIWIFY_BASE_URL;

    // Need to re-import because the module reads env at module level for resend,
    // but kiwifyService reads KIWIFY_BASE_URL at call time
    mockPrisma.plan.findUnique.mockResolvedValue(MOCK_PLAN);
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

    const result = await generateCheckoutUrl({
      userId: 'user-123',
      planSlug: 'pro',
    });

    expect(result.checkoutUrl).toContain('https://pay.kiwify.com.br/kiwify-prod-123');
  });

  it('throws when plan not found', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue(null);

    await expect(
      generateCheckoutUrl({ userId: 'user-123', planSlug: 'nonexistent' })
    ).rejects.toThrow('Plano não encontrado: nonexistent');
  });

  it('throws when plan has no kiwifyProductId', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue({ ...MOCK_PLAN, kiwifyProductId: null });

    await expect(
      generateCheckoutUrl({ userId: 'user-123', planSlug: 'pro' })
    ).rejects.toThrow('não tem kiwifyProductId configurado');
  });

  it('throws when user not found', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue(MOCK_PLAN);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      generateCheckoutUrl({ userId: 'nonexistent', planSlug: 'pro' })
    ).rejects.toThrow('Usuário não encontrado: nonexistent');
  });

  it('converts priceCents to price correctly', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue({ ...MOCK_PLAN, priceCents: 9990 });
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

    const result = await generateCheckoutUrl({
      userId: 'user-123',
      planSlug: 'pro',
    });

    expect(result.price).toBe(99.9);
  });
});

// ============================================
// isPlanKiwifyEnabled
// ============================================

describe('isPlanKiwifyEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when plan has kiwifyProductId', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue({ kiwifyProductId: 'kiwify-123' });

    const result = await isPlanKiwifyEnabled('pro');

    expect(result).toBe(true);
    expect(mockPrisma.plan.findUnique).toHaveBeenCalledWith({
      where: { slug: 'pro' },
      select: { kiwifyProductId: true },
    });
  });

  it('returns false when plan has no kiwifyProductId', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue({ kiwifyProductId: null });

    const result = await isPlanKiwifyEnabled('free');

    expect(result).toBe(false);
  });

  it('returns false when plan not found', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue(null);

    const result = await isPlanKiwifyEnabled('nonexistent');

    expect(result).toBe(false);
  });
});

// ============================================
// getKiwifyEnabledPlans
// ============================================

describe('getKiwifyEnabledPlans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns active plans with kiwifyProductId', async () => {
    const plans = [
      { id: 'plan-pro', name: 'Pro', slug: 'pro', priceCents: 4990, kiwifyProductId: 'kiwify-pro' },
      { id: 'plan-premium', name: 'Premium', slug: 'premium', priceCents: 9990, kiwifyProductId: 'kiwify-premium' },
    ];
    mockPrisma.plan.findMany.mockResolvedValue(plans);

    const result = await getKiwifyEnabledPlans();

    expect(result).toEqual(plans);
    expect(mockPrisma.plan.findMany).toHaveBeenCalledWith({
      where: {
        kiwifyProductId: { not: null },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        priceCents: true,
        kiwifyProductId: true,
      },
    });
  });

  it('returns empty array when no plans have kiwify enabled', async () => {
    mockPrisma.plan.findMany.mockResolvedValue([]);

    const result = await getKiwifyEnabledPlans();

    expect(result).toEqual([]);
  });
});

// ============================================
// setKiwifyProductId
// ============================================

describe('setKiwifyProductId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates kiwifyProductId for a plan', async () => {
    mockPrisma.plan.update.mockResolvedValue({ ...MOCK_PLAN, kiwifyProductId: 'new-product-id' });

    const result = await setKiwifyProductId('pro', 'new-product-id');

    expect(result.kiwifyProductId).toBe('new-product-id');
    expect(mockPrisma.plan.update).toHaveBeenCalledWith({
      where: { slug: 'pro' },
      data: { kiwifyProductId: 'new-product-id' },
    });
  });
});

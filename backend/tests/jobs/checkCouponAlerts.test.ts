import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for checkCouponAlerts job
 *
 * Cases tested:
 * - Returns JobRunResult with correct shape on success
 * - Creates COUPON_EXPIRING_SOON alerts for coupons expiring <= 3 days
 * - Sets severity CRITICAL when expiring in <= 1 day, WARNING otherwise
 * - Skips duplicated alerts created in the last 24h
 * - Creates COUPON_USAGE_LIMIT_NEAR alerts for coupons >= 80% used
 * - Sets severity CRITICAL when >= 95% used, WARNING otherwise
 * - Skips usage-limit duplicated alerts
 * - Creates COUPON_HIGH_USAGE alerts for coupons with > 10 uses in 24h
 * - Returns error result when an exception occurs
 */

// ============================================
// Mocks (hoisted)
// ============================================

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    coupon: {
      findMany: vi.fn(),
    },
    adminAlert: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    couponUsage: {
      findMany: vi.fn(),
    },
  } as any,
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

// Import AFTER mocks
import { checkCouponAlerts } from '../../src/jobs/checkCouponAlerts';

// ============================================
// Helpers
// ============================================

function makeCoupon(overrides: Record<string, any> = {}) {
  return {
    id: 'coupon-1',
    code: 'PROMO10',
    isActive: true,
    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    maxUses: null,
    usedCount: 0,
    plan: null,
    _count: { usageLogs: 0 },
    ...overrides,
  };
}

// ============================================
// Tests
// ============================================

describe('checkCouponAlerts Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no existing alerts (no duplicates)
    mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
    mockPrisma.adminAlert.create.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // Return shape
  // ============================================

  it('should return JobRunResult shape on empty data', async () => {
    mockPrisma.coupon.findMany.mockResolvedValue([]);
    mockPrisma.couponUsage.findMany.mockResolvedValue([]);

    const result = await checkCouponAlerts();

    expect(result).toMatchObject({
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      summary: expect.any(String),
      metadata: expect.objectContaining({
        expiringCount: 0,
        nearLimitCount: 0,
        popularCount: 0,
        totalAlerts: 0,
      }),
    });
  });

  // ============================================
  // COUPON_EXPIRING_SOON alerts
  // ============================================

  it('should create COUPON_EXPIRING_SOON alert with WARNING severity for coupon expiring in 2 days', async () => {
    const coupon = makeCoupon({
      id: 'coupon-exp-2d',
      code: 'SAVE20',
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      plan: { name: 'Pro' },
      _count: { usageLogs: 5 },
      maxUses: 100,
    });

    // First findMany = expiring coupons, second = coupons with limit, third = recent usages (couponUsage)
    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([coupon])  // expiring
      .mockResolvedValueOnce([]);       // with limit

    mockPrisma.couponUsage.findMany.mockResolvedValue([]);

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'COUPON_EXPIRING_SOON',
          severity: 'WARNING',
          source: 'coupon:coupon-exp-2d',
        }),
      })
    );
  });

  it('should create COUPON_EXPIRING_SOON alert with CRITICAL severity for coupon expiring in <= 1 day', async () => {
    const coupon = makeCoupon({
      id: 'coupon-exp-1d',
      code: 'LAST24H',
      expiresAt: new Date(Date.now() + 18 * 60 * 60 * 1000), // 18 hours
      plan: null,
      _count: { usageLogs: 2 },
      maxUses: null,
    });

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([coupon])
      .mockResolvedValueOnce([]);

    mockPrisma.couponUsage.findMany.mockResolvedValue([]);

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'COUPON_EXPIRING_SOON',
          severity: 'CRITICAL',
        }),
      })
    );
  });

  it('should skip COUPON_EXPIRING_SOON when duplicate alert exists in last 24h', async () => {
    const coupon = makeCoupon({ id: 'coupon-dup', code: 'DUPALERT' });

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([coupon])
      .mockResolvedValueOnce([]);

    mockPrisma.couponUsage.findMany.mockResolvedValue([]);

    // Simulate existing alert
    mockPrisma.adminAlert.findFirst.mockResolvedValueOnce({ id: 'existing-alert' });

    await checkCouponAlerts();

    // create should NOT be called for expiring alert (skipped), no other alert types either
    expect(mockPrisma.adminAlert.create).not.toHaveBeenCalled();
  });

  it('should include planName in metadata when coupon has an associated plan', async () => {
    const coupon = makeCoupon({
      id: 'coupon-plan',
      code: 'PLANCODE',
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      plan: { name: 'Premium' },
      _count: { usageLogs: 3 },
      maxUses: 50,
    });

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([coupon])
      .mockResolvedValueOnce([]);

    mockPrisma.couponUsage.findMany.mockResolvedValue([]);

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ planName: 'Premium' }),
        }),
      })
    );
  });

  it('should set planName to null in metadata when coupon has no plan', async () => {
    const coupon = makeCoupon({
      id: 'coupon-noplan',
      code: 'NOPLAN',
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      plan: null,
      _count: { usageLogs: 0 },
    });

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([coupon])
      .mockResolvedValueOnce([]);

    mockPrisma.couponUsage.findMany.mockResolvedValue([]);

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ planName: null }),
        }),
      })
    );
  });

  // ============================================
  // COUPON_USAGE_LIMIT_NEAR alerts
  // ============================================

  it('should create COUPON_USAGE_LIMIT_NEAR alert when coupon usage >= 80%', async () => {
    const coupon = makeCoupon({
      id: 'coupon-near',
      code: 'NEAR80',
      maxUses: 100,
      _count: { usageLogs: 85 }, // 85%
      plan: null,
    });

    // No expiring coupons, one coupon with limit
    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([])       // expiring (no expiry date filter here, but returned empty)
      .mockResolvedValueOnce([coupon]); // with limit

    mockPrisma.couponUsage.findMany.mockResolvedValue([]);

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'COUPON_USAGE_LIMIT_NEAR',
          severity: 'WARNING',
          source: 'coupon:coupon-near',
        }),
      })
    );
  });

  it('should set CRITICAL severity for COUPON_USAGE_LIMIT_NEAR when >= 95%', async () => {
    const coupon = makeCoupon({
      id: 'coupon-critical',
      code: 'CRITICAL95',
      maxUses: 100,
      _count: { usageLogs: 96 }, // 96%
      plan: null,
    });

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([coupon]);

    mockPrisma.couponUsage.findMany.mockResolvedValue([]);

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'COUPON_USAGE_LIMIT_NEAR',
          severity: 'CRITICAL',
        }),
      })
    );
  });

  it('should skip COUPON_USAGE_LIMIT_NEAR when coupon usage < 80%', async () => {
    const coupon = makeCoupon({
      id: 'coupon-low',
      code: 'LOW50',
      maxUses: 100,
      _count: { usageLogs: 50 }, // 50%
      plan: null,
    });

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([coupon]);

    mockPrisma.couponUsage.findMany.mockResolvedValue([]);

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).not.toHaveBeenCalled();
  });

  it('should skip COUPON_USAGE_LIMIT_NEAR when duplicate alert exists in last 24h', async () => {
    const coupon = makeCoupon({
      id: 'coupon-dupUsage',
      code: 'DUPUSAGE',
      maxUses: 100,
      _count: { usageLogs: 90 },
      plan: null,
    });

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([coupon]);

    mockPrisma.couponUsage.findMany.mockResolvedValue([]);

    // First findFirst for expiring: returns null (no expiring coupons here so no call)
    // findFirst for usage limit: returns existing alert
    mockPrisma.adminAlert.findFirst.mockResolvedValue({ id: 'existing-usage-alert' });

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).not.toHaveBeenCalled();
  });

  it('should skip coupon with maxUses=null in usage-limit loop (filter by maxUses: { not: null })', async () => {
    // If maxUses is null in the coupon object returned, the JS filter should exclude it
    const coupon = makeCoupon({
      id: 'coupon-unlimited',
      code: 'UNLIMITED',
      maxUses: null,
      _count: { usageLogs: 999 },
      plan: null,
    });

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([coupon]); // returned but has null maxUses

    mockPrisma.couponUsage.findMany.mockResolvedValue([]);

    await checkCouponAlerts();

    // Filter `if (!coupon.maxUses) return false` ensures no alert is created
    expect(mockPrisma.adminAlert.create).not.toHaveBeenCalled();
  });

  // ============================================
  // COUPON_HIGH_USAGE alerts
  // ============================================

  it('should create COUPON_HIGH_USAGE alert for coupon with > 10 uses in 24h', async () => {
    const couponData = {
      id: 'coupon-popular',
      code: 'VIRAL',
      isActive: true,
      maxUses: null,
      usedCount: 15,
      plan: { name: 'Starter' },
    };

    // Build 11 usage records for the same coupon
    const usages = Array.from({ length: 11 }, (_, i) => ({
      couponId: 'coupon-popular',
      usedAt: new Date(),
      coupon: couponData,
    }));

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockPrisma.couponUsage.findMany.mockResolvedValue(usages);

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'COUPON_HIGH_USAGE',
          source: 'coupon:coupon-popular',
        }),
      })
    );
  });

  it('should set CRITICAL severity for COUPON_HIGH_USAGE when count >= 50', async () => {
    const couponData = {
      id: 'coupon-mega-popular',
      code: 'MEGAVIRAL',
      isActive: true,
      maxUses: null,
      usedCount: 55,
      plan: null,
    };

    const usages = Array.from({ length: 55 }, () => ({
      couponId: 'coupon-mega-popular',
      usedAt: new Date(),
      coupon: couponData,
    }));

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockPrisma.couponUsage.findMany.mockResolvedValue(usages);

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'COUPON_HIGH_USAGE',
          severity: 'CRITICAL',
        }),
      })
    );
  });

  it('should set WARNING severity for COUPON_HIGH_USAGE when count >= 20 and < 50', async () => {
    const couponData = {
      id: 'coupon-warning-popular',
      code: 'WARNINGVIRAL',
      isActive: true,
      maxUses: null,
      usedCount: 25,
      plan: null,
    };

    const usages = Array.from({ length: 25 }, () => ({
      couponId: 'coupon-warning-popular',
      usedAt: new Date(),
      coupon: couponData,
    }));

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockPrisma.couponUsage.findMany.mockResolvedValue(usages);

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'COUPON_HIGH_USAGE',
          severity: 'WARNING',
        }),
      })
    );
  });

  it('should set INFO severity for COUPON_HIGH_USAGE when count >= 10 and < 20', async () => {
    const couponData = {
      id: 'coupon-info-popular',
      code: 'INFOVIRAL',
      isActive: true,
      maxUses: null,
      usedCount: 12,
      plan: null,
    };

    const usages = Array.from({ length: 12 }, () => ({
      couponId: 'coupon-info-popular',
      usedAt: new Date(),
      coupon: couponData,
    }));

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockPrisma.couponUsage.findMany.mockResolvedValue(usages);

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'COUPON_HIGH_USAGE',
          severity: 'INFO',
        }),
      })
    );
  });

  it('should not create COUPON_HIGH_USAGE alert when coupon is inactive', async () => {
    const couponData = {
      id: 'coupon-inactive',
      code: 'INACTIVE',
      isActive: false, // inactive
      maxUses: null,
      usedCount: 50,
      plan: null,
    };

    const usages = Array.from({ length: 15 }, () => ({
      couponId: 'coupon-inactive',
      usedAt: new Date(),
      coupon: couponData,
    }));

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockPrisma.couponUsage.findMany.mockResolvedValue(usages);

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).not.toHaveBeenCalled();
  });

  it('should skip COUPON_HIGH_USAGE when duplicate alert exists in last 24h', async () => {
    const couponData = {
      id: 'coupon-dupHigh',
      code: 'DUPHIGH',
      isActive: true,
      maxUses: null,
      usedCount: 20,
      plan: null,
    };

    const usages = Array.from({ length: 12 }, () => ({
      couponId: 'coupon-dupHigh',
      usedAt: new Date(),
      coupon: couponData,
    }));

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockPrisma.couponUsage.findMany.mockResolvedValue(usages);

    // All findFirst calls return existing alert
    mockPrisma.adminAlert.findFirst.mockResolvedValue({ id: 'dup-high-alert' });

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).not.toHaveBeenCalled();
  });

  it('should include usageRate as percentage string when coupon has maxUses', async () => {
    const couponData = {
      id: 'coupon-rate',
      code: 'RATECODE',
      isActive: true,
      maxUses: 200,
      usedCount: 50,
      plan: null,
    };

    const usages = Array.from({ length: 15 }, () => ({
      couponId: 'coupon-rate',
      usedAt: new Date(),
      coupon: couponData,
    }));

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockPrisma.couponUsage.findMany.mockResolvedValue(usages);

    await checkCouponAlerts();

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'COUPON_HIGH_USAGE',
          // message should contain % figure for maxUses
          message: expect.stringContaining('%'),
        }),
      })
    );
  });

  // ============================================
  // Aggregated usages by coupon
  // ============================================

  it('should aggregate multiple usage records for the same coupon', async () => {
    const couponData = {
      id: 'coupon-agg',
      code: 'AGGCODE',
      isActive: true,
      maxUses: null,
      usedCount: 25,
      plan: null,
    };

    // 13 records for same coupon
    const usages = Array.from({ length: 13 }, () => ({
      couponId: 'coupon-agg',
      usedAt: new Date(),
      coupon: couponData,
    }));

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockPrisma.couponUsage.findMany.mockResolvedValue(usages);

    await checkCouponAlerts();

    // Should create exactly one alert for the coupon, not 13
    expect(mockPrisma.adminAlert.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'COUPON_HIGH_USAGE',
          metadata: expect.objectContaining({ usesLast24h: 13 }),
        }),
      })
    );
  });

  // ============================================
  // Error handling
  // ============================================

  it('should return error result when a database error occurs', async () => {
    mockPrisma.coupon.findMany.mockRejectedValue(new Error('DB connection lost'));

    const result = await checkCouponAlerts();

    expect(result).toMatchObject({
      processedCount: 0,
      successCount: 0,
      errorCount: 1,
      summary: expect.stringContaining('DB connection lost'),
      metadata: expect.objectContaining({
        error: 'DB connection lost',
      }),
    });
  });

  it('should not throw — always resolves even on error', async () => {
    mockPrisma.coupon.findMany.mockRejectedValue(new Error('Fatal error'));

    await expect(checkCouponAlerts()).resolves.not.toThrow();
  });

  // ============================================
  // Multiple alerts in the same run
  // ============================================

  it('should process multiple alert types in a single run', async () => {
    const expiringCoupon = makeCoupon({
      id: 'coupon-expiring',
      code: 'EXPIRE',
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      plan: null,
      _count: { usageLogs: 3 },
      maxUses: 100,
    });

    const limitCoupon = makeCoupon({
      id: 'coupon-limit',
      code: 'LIMIT',
      maxUses: 100,
      _count: { usageLogs: 90 },
      plan: null,
    });

    mockPrisma.coupon.findMany
      .mockResolvedValueOnce([expiringCoupon]) // expiring
      .mockResolvedValueOnce([limitCoupon]);   // with limit

    const popularUsages = Array.from({ length: 11 }, () => ({
      couponId: 'coupon-popular-multi',
      usedAt: new Date(),
      coupon: {
        id: 'coupon-popular-multi',
        code: 'POPULAR',
        isActive: true,
        maxUses: null,
        usedCount: 11,
        plan: null,
      },
    }));

    mockPrisma.couponUsage.findMany.mockResolvedValue(popularUsages);

    await checkCouponAlerts();

    // 3 alerts total: expiring + limit + popular
    expect(mockPrisma.adminAlert.create).toHaveBeenCalledTimes(3);
  });
});

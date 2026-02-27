import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for planService — plan limits, monitor creation guards, site guards
 *
 * Cases tested:
 * - getUserPlanLimits:
 *   - development env → returns generous limits without DB
 *   - production with ACTIVE subscription → returns plan limits
 *   - production with TRIAL subscription → returns plan limits
 *   - production no subscription, free plan found → returns free plan limits
 *   - production no subscription, no free plan → returns minimal defaults
 *   - DB error → returns minimal defaults (error recovery)
 * - canUserCreateMonitor:
 *   - under limit → canCreate=true
 *   - at limit → canCreate=false with reason
 * - canUserUseSite:
 *   - multiSite plan → always allowed
 *   - no existing monitors → allowed
 *   - same site as existing → allowed
 *   - different site from existing, single-site plan → denied
 */

// Hoist mocks before any module evaluation
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    subscription: {
      findFirst: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
    },
    monitor: {
      count: vi.fn(),
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

import {
  getUserPlanLimits,
  canUserCreateMonitor,
  canUserUseSite,
} from '../../src/services/planService';

// ============================================================
// Helpers
// ============================================================

function makePlan(overrides: Record<string, any> = {}) {
  return {
    id: 'plan-1',
    slug: 'pro',
    name: 'Pro',
    maxMonitors: 20,
    maxSites: 5,
    maxAlertsPerDay: 100,
    ...overrides,
  };
}

function makeSubscription(planOverrides: Record<string, any> = {}, subOverrides: Record<string, any> = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    status: 'ACTIVE',
    isLifetime: false,
    validUntil: null,
    trialEndsAt: null,
    plan: makePlan(planOverrides),
    ...subOverrides,
  };
}

// ============================================================
// getUserPlanLimits
// ============================================================

describe('getUserPlanLimits', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.clearAllMocks();
  });

  describe('development environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('returns generous dev limits without hitting DB', async () => {
      const limits = await getUserPlanLimits('user-1');

      expect(limits.maxMonitors).toBe(50);
      expect(limits.maxSites).toBe(10);
      expect(limits.maxAlertsPerDay).toBe(999);
      expect(limits.multiSite).toBe(true);
      expect(mockPrisma.subscription.findFirst).not.toHaveBeenCalled();
    });

    it('does not query DB in development', async () => {
      await getUserPlanLimits('user-1');

      expect(mockPrisma.plan.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.subscription.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('production environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('returns plan limits from ACTIVE subscription', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(
        makeSubscription({ maxMonitors: 30, maxSites: 8, maxAlertsPerDay: 500 })
      );

      const limits = await getUserPlanLimits('user-1');

      expect(limits.maxMonitors).toBe(30);
      expect(limits.maxSites).toBe(8);
      expect(limits.maxAlertsPerDay).toBe(500);
      expect(limits.multiSite).toBe(true); // maxSites > 1
    });

    it('returns plan limits from TRIAL subscription', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(
        makeSubscription(
          { maxMonitors: 5, maxSites: 2, maxAlertsPerDay: 20 },
          { status: 'TRIAL' }
        )
      );

      const limits = await getUserPlanLimits('user-1');

      expect(limits.maxMonitors).toBe(5);
      expect(limits.maxSites).toBe(2);
      expect(limits.maxAlertsPerDay).toBe(20);
    });

    it('multiSite is false when maxSites=1', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(
        makeSubscription({ maxMonitors: 3, maxSites: 1, maxAlertsPerDay: 10 })
      );

      const limits = await getUserPlanLimits('user-1');

      expect(limits.multiSite).toBe(false);
    });

    it('falls back to free plan when no subscription found', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.plan.findUnique.mockResolvedValue(
        makePlan({ slug: 'free', maxMonitors: 1, maxSites: 1, maxAlertsPerDay: 3 })
      );

      const limits = await getUserPlanLimits('user-1');

      expect(limits.maxMonitors).toBe(1);
      expect(limits.maxSites).toBe(1);
      expect(limits.maxAlertsPerDay).toBe(3);
      expect(limits.multiSite).toBe(false);
      expect(mockPrisma.plan.findUnique).toHaveBeenCalledWith({ where: { slug: 'free' } });
    });

    it('returns minimal defaults when no subscription and no free plan', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.plan.findUnique.mockResolvedValue(null);

      const limits = await getUserPlanLimits('user-1');

      expect(limits.maxMonitors).toBe(1);
      expect(limits.maxSites).toBe(1);
      expect(limits.maxAlertsPerDay).toBe(3);
      expect(limits.multiSite).toBe(false);
    });

    it('returns minimal defaults on DB error (error recovery)', async () => {
      mockPrisma.subscription.findFirst.mockRejectedValue(new Error('DB offline'));

      const limits = await getUserPlanLimits('user-1');

      expect(limits.maxMonitors).toBe(1);
      expect(limits.maxSites).toBe(1);
      expect(limits.maxAlertsPerDay).toBe(3);
      expect(limits.multiSite).toBe(false);
    });

    it('returns minimal defaults when subscription has no plan', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        plan: null, // plan not included in result
      });
      mockPrisma.plan.findUnique.mockResolvedValue(null);

      const limits = await getUserPlanLimits('user-1');

      expect(limits.maxMonitors).toBe(1);
    });

    it('queries DB with correct filter for ACTIVE/TRIAL non-expired subscriptions', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.plan.findUnique.mockResolvedValue(null);

      await getUserPlanLimits('user-1');

      expect(mockPrisma.subscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            status: { in: ['ACTIVE', 'TRIAL'] },
          }),
          include: { plan: true },
        })
      );
    });
  });
});

// ============================================================
// canUserCreateMonitor
// ============================================================

describe('canUserCreateMonitor', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development'; // dev returns limit=50
    vi.clearAllMocks();
  });

  it('returns canCreate=true when under the limit', async () => {
    mockPrisma.monitor.count.mockResolvedValue(3);

    const result = await canUserCreateMonitor('user-1');

    expect(result.canCreate).toBe(true);
    expect(result.currentCount).toBe(3);
    expect(result.limit).toBe(50); // dev limit
    expect(result.reason).toBeUndefined();
  });

  it('returns canCreate=false when at the limit', async () => {
    mockPrisma.monitor.count.mockResolvedValue(50); // at dev limit

    const result = await canUserCreateMonitor('user-1');

    expect(result.canCreate).toBe(false);
    expect(result.reason).toContain('50');
    expect(result.reason).toContain('upgrade');
    expect(result.currentCount).toBe(50);
    expect(result.limit).toBe(50);
  });

  it('returns canCreate=false when over the limit', async () => {
    mockPrisma.monitor.count.mockResolvedValue(99);

    const result = await canUserCreateMonitor('user-1');

    expect(result.canCreate).toBe(false);
    expect(result.currentCount).toBe(99);
  });

  it('counts only active monitors', async () => {
    mockPrisma.monitor.count.mockResolvedValue(0);

    await canUserCreateMonitor('user-1');

    expect(mockPrisma.monitor.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', active: true },
    });
  });

  it('returns canCreate=true when at count=0 and limit=1 (production single plan)', async () => {
    process.env.NODE_ENV = 'production';
    mockPrisma.subscription.findFirst.mockResolvedValue(null);
    mockPrisma.plan.findUnique.mockResolvedValue(
      makePlan({ maxMonitors: 1, maxSites: 1, maxAlertsPerDay: 3 })
    );
    mockPrisma.monitor.count.mockResolvedValue(0);

    const result = await canUserCreateMonitor('user-1');

    expect(result.canCreate).toBe(true);
    expect(result.limit).toBe(1);
  });
});

// ============================================================
// canUserUseSite
// ============================================================

describe('canUserUseSite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('multiSite plan (dev environment)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('always allows any site on multiSite plan', async () => {
      const result = await canUserUseSite('user-1', 'MERCADO_LIVRE');

      expect(result.canUse).toBe(true);
      expect(result.reason).toBeUndefined();
      // Should not query monitors since multiSite=true
      expect(mockPrisma.monitor.findMany).not.toHaveBeenCalled();
    });

    it('allows different sites on multiSite plan', async () => {
      const result1 = await canUserUseSite('user-1', 'MERCADO_LIVRE');
      const result2 = await canUserUseSite('user-1', 'FACEBOOK_MARKETPLACE');

      expect(result1.canUse).toBe(true);
      expect(result2.canUse).toBe(true);
    });
  });

  describe('single-site plan (production)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      // Single-site plan (maxSites=1, multiSite=false)
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.plan.findUnique.mockResolvedValue(
        makePlan({ maxMonitors: 1, maxSites: 1, maxAlertsPerDay: 3 })
      );
    });

    it('allows any site when no existing monitors', async () => {
      mockPrisma.monitor.findMany.mockResolvedValue([]);

      const result = await canUserUseSite('user-1', 'OLX');

      expect(result.canUse).toBe(true);
    });

    it('allows same site as existing monitors', async () => {
      mockPrisma.monitor.findMany.mockResolvedValue([{ site: 'MERCADO_LIVRE' }]);

      const result = await canUserUseSite('user-1', 'MERCADO_LIVRE');

      expect(result.canUse).toBe(true);
    });

    it('denies different site when user already has monitors on another site', async () => {
      mockPrisma.monitor.findMany.mockResolvedValue([{ site: 'MERCADO_LIVRE' }]);

      const result = await canUserUseSite('user-1', 'FACEBOOK_MARKETPLACE');

      expect(result.canUse).toBe(false);
      expect(result.reason).toContain('MERCADO_LIVRE');
      expect(result.reason).toContain('upgrade');
    });

    it('queries monitors with correct filter (all monitors, distinct by site)', async () => {
      mockPrisma.monitor.findMany.mockResolvedValue([]);

      await canUserUseSite('user-1', 'OLX');

      expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { site: true },
        distinct: ['site'],
      });
    });
  });
});

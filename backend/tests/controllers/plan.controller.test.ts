import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// HOISTED MOCKS
// ============================================================

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    plan: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
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
import { PlanController } from '../../src/controllers/plan.controller';

// ============================================================
// HELPERS
// ============================================================

function makeReq(overrides: Partial<any> = {}): any {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}

function makeRes(): any {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

const mockPlanFree = {
  id: 'plan-free',
  name: 'Free',
  slug: 'free',
  description: 'Plano gratuito',
  priceCents: 0,
  billingPeriod: 'MONTHLY',
  trialDays: 7,
  maxMonitors: 1,
  maxSites: 1,
  maxAlertsPerDay: 5,
  checkInterval: 60,
  isRecommended: false,
  priority: 1,
  isActive: true,
  isLifetime: false,
  checkoutUrl: null,
};

const mockPlanPro = {
  id: 'plan-pro',
  name: 'Pro',
  slug: 'pro',
  description: 'Plano Pro com recursos completos',
  priceCents: 4990,
  billingPeriod: 'MONTHLY',
  trialDays: 7,
  maxMonitors: 10,
  maxSites: 5,
  maxAlertsPerDay: 100,
  checkInterval: 15,
  isRecommended: true,
  priority: 2,
  isActive: true,
  isLifetime: false,
  checkoutUrl: 'https://kiwify.com.br/pro',
};

// ============================================================
// TESTS
// ============================================================

describe('PlanController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // listPlans
  // ----------------------------------------------------------
  describe('listPlans', () => {
    it('returns empty array when no active plans exist', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.plan.findMany.mockResolvedValue([]);

      await PlanController.listPlans(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns all active plans ordered by priority', async () => {
      const req = makeReq();
      const res = makeRes();
      const plans = [mockPlanFree, mockPlanPro];
      mockPrisma.plan.findMany.mockResolvedValue(plans);

      await PlanController.listPlans(req, res);

      expect(mockPrisma.plan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          orderBy: { priority: 'asc' },
        })
      );
      expect(res.json).toHaveBeenCalledWith(plans);
    });

    it('selects only the expected fields', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.plan.findMany.mockResolvedValue([]);

      await PlanController.listPlans(req, res);

      const call = mockPrisma.plan.findMany.mock.calls[0][0];
      const expectedFields = [
        'id', 'name', 'slug', 'description', 'priceCents', 'billingPeriod',
        'trialDays', 'maxMonitors', 'maxSites', 'maxAlertsPerDay', 'checkInterval',
        'isRecommended', 'priority', 'isActive', 'isLifetime', 'checkoutUrl',
      ];
      for (const field of expectedFields) {
        expect(call.select).toHaveProperty(field, true);
      }
    });

    it('returns 500 on database error', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.plan.findMany.mockRejectedValue(new Error('DB crash'));

      await PlanController.listPlans(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao listar planos' });
    });
  });

  // ----------------------------------------------------------
  // getPlanBySlug
  // ----------------------------------------------------------
  describe('getPlanBySlug', () => {
    it('returns 404 when plan not found', async () => {
      const req = makeReq({ params: { slug: 'nonexistent' } });
      const res = makeRes();
      mockPrisma.plan.findUnique.mockResolvedValue(null);

      await PlanController.getPlanBySlug(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Plano não encontrado' });
    });

    it('returns plan when found by slug', async () => {
      const req = makeReq({ params: { slug: 'pro' } });
      const res = makeRes();
      mockPrisma.plan.findUnique.mockResolvedValue(mockPlanPro);

      await PlanController.getPlanBySlug(req, res);

      expect(mockPrisma.plan.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: 'pro' } })
      );
      expect(res.json).toHaveBeenCalledWith(mockPlanPro);
    });

    it('returns free plan by slug', async () => {
      const req = makeReq({ params: { slug: 'free' } });
      const res = makeRes();
      mockPrisma.plan.findUnique.mockResolvedValue(mockPlanFree);

      await PlanController.getPlanBySlug(req, res);

      expect(res.json).toHaveBeenCalledWith(mockPlanFree);
    });

    it('selects only the expected fields', async () => {
      const req = makeReq({ params: { slug: 'pro' } });
      const res = makeRes();
      mockPrisma.plan.findUnique.mockResolvedValue(mockPlanPro);

      await PlanController.getPlanBySlug(req, res);

      const call = mockPrisma.plan.findUnique.mock.calls[0][0];
      const expectedFields = [
        'id', 'name', 'slug', 'description', 'priceCents', 'billingPeriod',
        'trialDays', 'maxMonitors', 'maxSites', 'maxAlertsPerDay', 'checkInterval',
        'isRecommended', 'priority', 'isActive', 'isLifetime', 'checkoutUrl',
      ];
      for (const field of expectedFields) {
        expect(call.select).toHaveProperty(field, true);
      }
    });

    it('returns 500 on database error', async () => {
      const req = makeReq({ params: { slug: 'pro' } });
      const res = makeRes();
      mockPrisma.plan.findUnique.mockRejectedValue(new Error('DB crash'));

      await PlanController.getPlanBySlug(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao buscar plano' });
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// HOISTED MOCKS
// ============================================================

const {
  mockPrisma,
  mockStartTrialForUser,
  mockGenerateCheckoutUrl,
  mockGetCurrentSubscriptionForUser,
  mockLogInfo,
  mockLogError,
} = vi.hoisted(() => ({
  mockPrisma: {
    monitor: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
  mockStartTrialForUser: vi.fn(),
  mockGenerateCheckoutUrl: vi.fn(),
  mockGetCurrentSubscriptionForUser: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../../src/services/billingService', () => ({
  startTrialForUser: mockStartTrialForUser,
  TrialBusinessError: class TrialBusinessError extends Error {
    public readonly errorCode: string;
    constructor(message: string, errorCode: string) {
      super(message);
      this.name = 'TrialBusinessError';
      this.errorCode = errorCode;
    }
  },
}));
vi.mock('../../src/services/kiwifyService', () => ({
  generateCheckoutUrl: mockGenerateCheckoutUrl,
}));
vi.mock('../../src/services/subscriptionService', () => ({
  getCurrentSubscriptionForUser: mockGetCurrentSubscriptionForUser,
}));
vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: mockLogInfo,
  logError: mockLogError,
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));
vi.mock('../../src/constants/errorCodes', () => ({
  ErrorCodes: {
    TRIAL_ALREADY_ACTIVE: 'TRIAL_ALREADY_ACTIVE',
    TRIAL_ALREADY_USED: 'TRIAL_ALREADY_USED',
    SUBSCRIPTION_ALREADY_ACTIVE: 'SUBSCRIPTION_ALREADY_ACTIVE',
  },
}));

// Import AFTER mocks
import { SubscriptionController } from '../../src/controllers/subscription.controller';

// ============================================================
// HELPERS
// ============================================================

function makeReq(overrides: Partial<any> = {}): any {
  return {
    userId: 'user-1',
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

const mockPlan = {
  id: 'plan-1',
  name: 'Starter',
  slug: 'starter',
  maxMonitors: 5,
  maxAlertsPerDay: 50,
  isLifetime: false,
  billingPeriod: 'MONTHLY',
};

const mockSubscription = {
  id: 'sub-1',
  userId: 'user-1',
  planId: 'plan-1',
  status: 'ACTIVE',
  startDate: new Date('2026-01-01'),
  validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
  trialEndsAt: null,
  isLifetime: false,
  isTrial: false,
  createdAt: new Date('2026-01-01'),
  plan: mockPlan,
};

// ============================================================
// TESTS
// ============================================================

describe('SubscriptionController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // getMySubscription
  // ----------------------------------------------------------
  describe('getMySubscription', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined });
      const res = makeRes();

      await SubscriptionController.getMySubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Não autenticado' });
    });

    it('returns null subscription when no valid subscription found', async () => {
      const req = makeReq();
      const res = makeRes();
      mockGetCurrentSubscriptionForUser.mockResolvedValue(null);

      await SubscriptionController.getMySubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        subscription: null,
        usage: null,
        timeRemaining: { daysRemaining: 0, expiresAt: null, isExpired: true },
      });
    });

    it('returns subscription with usage data for active subscription', async () => {
      const req = makeReq();
      const res = makeRes();
      mockGetCurrentSubscriptionForUser.mockResolvedValue(mockSubscription);
      mockPrisma.monitor.count.mockResolvedValue(3);
      mockPrisma.monitor.findMany.mockResolvedValue([
        { site: 'MERCADO_LIVRE' },
        { site: 'OLX' },
      ]);

      await SubscriptionController.getMySubscription(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription: expect.objectContaining({ id: 'sub-1', status: 'ACTIVE' }),
          usage: expect.objectContaining({
            monitorsCreated: 3,
            monitorsLimit: 5,
            canCreateMore: true,
            uniqueSitesCount: 2,
          }),
        })
      );
    });

    it('returns daysRemaining = -1 for lifetime subscription', async () => {
      const req = makeReq();
      const res = makeRes();
      mockGetCurrentSubscriptionForUser.mockResolvedValue({
        ...mockSubscription,
        isLifetime: true,
        validUntil: null,
      });
      mockPrisma.monitor.count.mockResolvedValue(0);
      mockPrisma.monitor.findMany.mockResolvedValue([]);

      await SubscriptionController.getMySubscription(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timeRemaining: expect.objectContaining({ daysRemaining: -1, isExpired: false }),
        })
      );
    });

    it('calculates days remaining for TRIAL subscription', async () => {
      const req = makeReq();
      const res = makeRes();
      const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
      mockGetCurrentSubscriptionForUser.mockResolvedValue({
        ...mockSubscription,
        status: 'TRIAL',
        trialEndsAt,
        isLifetime: false,
        validUntil: null,
      });
      mockPrisma.monitor.count.mockResolvedValue(1);
      mockPrisma.monitor.findMany.mockResolvedValue([{ site: 'OLX' }]);

      await SubscriptionController.getMySubscription(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.timeRemaining.daysRemaining).toBeGreaterThan(0);
      expect(call.timeRemaining.isExpired).toBe(false);
    });

    it('returns 500 on service error', async () => {
      const req = makeReq();
      const res = makeRes();
      mockGetCurrentSubscriptionForUser.mockRejectedValue(new Error('DB error'));

      await SubscriptionController.getMySubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao buscar assinatura' });
    });
  });

  // ----------------------------------------------------------
  // startTrial
  // ----------------------------------------------------------
  describe('startTrial', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, body: { planSlug: 'starter' } });
      const res = makeRes();

      await SubscriptionController.startTrial(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 when planSlug is missing', async () => {
      const req = makeReq({ body: {} });
      const res = makeRes();

      await SubscriptionController.startTrial(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'planSlug é obrigatório' });
    });

    it('returns 200 when trial already exists (idempotent)', async () => {
      const req = makeReq({ body: { planSlug: 'starter' } });
      const res = makeRes();
      mockStartTrialForUser.mockResolvedValue({
        isExisting: true,
        subscription: mockSubscription,
      });

      await SubscriptionController.startTrial(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Seu trial já está ativo' })
      );
    });

    it('returns 201 when trial is successfully created', async () => {
      const req = makeReq({ body: { planSlug: 'starter' } });
      const res = makeRes();
      mockStartTrialForUser.mockResolvedValue({
        isExisting: false,
        subscription: mockSubscription,
      });

      await SubscriptionController.startTrial(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Trial iniciado com sucesso' })
      );
    });

    it('returns 409 on TrialBusinessError', async () => {
      const req = makeReq({ body: { planSlug: 'starter' } });
      const res = makeRes();

      // Import the real TrialBusinessError from the mock
      const { TrialBusinessError } = await import('../../src/services/billingService');
      mockStartTrialForUser.mockRejectedValue(
        new TrialBusinessError('Trial already used', 'TRIAL_ALREADY_USED')
      );

      await SubscriptionController.startTrial(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: 'TRIAL_ALREADY_USED' })
      );
    });

    it('returns 500 on generic error', async () => {
      const req = makeReq({ body: { planSlug: 'starter' } });
      const res = makeRes();
      mockStartTrialForUser.mockRejectedValue(new Error('Unexpected'));

      await SubscriptionController.startTrial(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----------------------------------------------------------
  // changePlan
  // ----------------------------------------------------------
  describe('changePlan', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, body: { planSlug: 'pro' } });
      const res = makeRes();

      await SubscriptionController.changePlan(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 when planSlug is missing', async () => {
      const req = makeReq({ body: {} });
      const res = makeRes();

      await SubscriptionController.changePlan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when plan not found', async () => {
      const req = makeReq({ body: { planSlug: 'nonexistent' } });
      const res = makeRes();
      mockPrisma.plan.findUnique.mockResolvedValue(null);

      await SubscriptionController.changePlan(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Plano não encontrado' });
    });

    it('changes plan and cancels previous subscription', async () => {
      const req = makeReq({ body: { planSlug: 'pro' } });
      const res = makeRes();
      const newPlan = { ...mockPlan, id: 'plan-2', name: 'Pro', slug: 'pro' };
      const currentSub = { ...mockSubscription, plan: mockPlan };

      mockPrisma.plan.findUnique.mockResolvedValue(newPlan);
      mockPrisma.subscription.findFirst.mockResolvedValue(currentSub);
      mockPrisma.subscription.update.mockResolvedValue({ ...currentSub, status: 'CANCELLED' });
      mockStartTrialForUser.mockResolvedValue({
        isExisting: false,
        subscription: { ...mockSubscription, planId: 'plan-2' },
      });

      await SubscriptionController.changePlan(req, res);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Plano alterado com sucesso',
          oldPlan: 'Starter',
          newPlan: 'Pro',
        })
      );
    });

    it('changes plan when no current subscription exists', async () => {
      const req = makeReq({ body: { planSlug: 'pro' } });
      const res = makeRes();
      const newPlan = { ...mockPlan, name: 'Pro' };

      mockPrisma.plan.findUnique.mockResolvedValue(newPlan);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockStartTrialForUser.mockResolvedValue({
        isExisting: false,
        subscription: mockSubscription,
      });

      await SubscriptionController.changePlan(req, res);

      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Plano alterado com sucesso' })
      );
    });

    it('returns 500 on service error', async () => {
      const req = makeReq({ body: { planSlug: 'pro' } });
      const res = makeRes();
      mockPrisma.plan.findUnique.mockRejectedValue(new Error('DB error'));

      await SubscriptionController.changePlan(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----------------------------------------------------------
  // cancelSubscription
  // ----------------------------------------------------------
  describe('cancelSubscription', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined });
      const res = makeRes();

      await SubscriptionController.cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 404 when no active subscription found', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await SubscriptionController.cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Nenhuma assinatura ativa encontrada' });
    });

    it('cancels subscription successfully', async () => {
      const req = makeReq();
      const res = makeRes();
      const cancelledSub = { ...mockSubscription, status: 'CANCELLED', plan: mockPlan };

      mockPrisma.subscription.findFirst.mockResolvedValue(mockSubscription);
      mockPrisma.subscription.update.mockResolvedValue(cancelledSub);

      await SubscriptionController.cancelSubscription(req, res);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Assinatura cancelada com sucesso' })
      );
    });

    it('returns 500 on service error', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.subscription.findFirst.mockRejectedValue(new Error('DB error'));

      await SubscriptionController.cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----------------------------------------------------------
  // createCheckout
  // ----------------------------------------------------------
  describe('createCheckout', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, body: { planSlug: 'starter' } });
      const res = makeRes();

      await SubscriptionController.createCheckout(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 when planSlug is missing', async () => {
      const req = makeReq({ body: {} });
      const res = makeRes();

      await SubscriptionController.createCheckout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'planSlug é obrigatório' });
    });

    it('generates checkout URL without coupon', async () => {
      const req = makeReq({ body: { planSlug: 'starter' } });
      const res = makeRes();
      mockGenerateCheckoutUrl.mockResolvedValue({
        checkoutUrl: 'https://pay.kiwify.com.br/checkout',
        planName: 'Starter',
        price: 4990,
      });

      await SubscriptionController.createCheckout(req, res);

      expect(mockGenerateCheckoutUrl).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', planSlug: 'starter' })
      );
      expect(res.json).toHaveBeenCalledWith({
        message: 'Checkout criado com sucesso',
        checkoutUrl: 'https://pay.kiwify.com.br/checkout',
        planName: 'Starter',
        price: 4990,
      });
    });

    it('returns 500 on checkout generation error', async () => {
      const req = makeReq({ body: { planSlug: 'starter' } });
      const res = makeRes();
      mockGenerateCheckoutUrl.mockRejectedValue(new Error('Kiwify API down'));

      await SubscriptionController.createCheckout(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

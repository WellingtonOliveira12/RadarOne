import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// HOISTED MOCKS
// ============================================================

const {
  mockPrisma,
  mockSendSubscriptionExpiredEmail,
  mockSendTrialExpiredEmail,
  mockCreateAlertFromType,
  mockLogError,
  mockLogSimpleError,
  mockLogSimpleWarning,
} = vi.hoisted(() => ({
  mockPrisma: {
    webhookLog: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    plan: {
      findFirst: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  mockSendSubscriptionExpiredEmail: vi.fn(),
  mockSendTrialExpiredEmail: vi.fn(),
  mockCreateAlertFromType: vi.fn(),
  mockLogError: vi.fn(),
  mockLogSimpleError: vi.fn(),
  mockLogSimpleWarning: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../../src/services/emailService', () => ({
  sendSubscriptionExpiredEmail: mockSendSubscriptionExpiredEmail,
  sendTrialExpiredEmail: mockSendTrialExpiredEmail,
}));
vi.mock('../../src/utils/loggerHelpers', () => ({
  logError: mockLogError,
  logSimpleError: mockLogSimpleError,
  logSimpleWarning: mockLogSimpleWarning,
  logInfo: vi.fn(),
  logWarning: vi.fn(),
}));
vi.mock('../../src/services/alertService', () => ({
  createAlertFromType: mockCreateAlertFromType,
}));
vi.mock('../../src/types/alerts', () => ({
  AlertType: {
    WEBHOOK_ERROR: 'WEBHOOK_ERROR',
  },
}));

// crypto is a built-in Node module — we DO need it for HMAC tests.
// We will set process.env.KIWIFY_WEBHOOK_SECRET in specific tests.

// Import AFTER mocks
import { WebhookController } from '../../src/controllers/webhook.controller';

// ============================================================
// HELPERS
// ============================================================

function makeRes(): any {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function makePayload(overrides: Partial<any> = {}): any {
  return {
    event: 'compra_aprovada',
    customer: { email: 'test@example.com', name: 'Test User' },
    product: { product_id: 'prod-1', product_name: 'Starter', product_type: 'subscription' },
    order: { order_id: 'order-1', status: 'paid', value: 4990, payment_method: 'credit_card', created_at: new Date().toISOString() },
    event_timestamp: new Date().toISOString(),
    ...overrides,
  };
}

const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
const mockPlan = {
  id: 'plan-1',
  name: 'Starter',
  slug: 'starter',
  billingPeriod: 'MONTHLY',
  isLifetime: false,
  maxAlertsPerDay: 50,
  kiwifyProductId: 'prod-1',
};
const mockSubscription = {
  id: 'sub-1',
  userId: 'user-1',
  planId: 'plan-1',
  status: 'ACTIVE',
  validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  plan: mockPlan,
  user: mockUser,
};

// ============================================================
// TESTS
// ============================================================

describe('WebhookController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.KIWIFY_WEBHOOK_SECRET;
    // Always succeed for webhookLog operations by default
    mockPrisma.webhookLog.create.mockResolvedValue({ id: 'log-1' });
    mockPrisma.webhookLog.updateMany.mockResolvedValue({ count: 1 });
    mockCreateAlertFromType.mockResolvedValue(undefined);
  });

  // ----------------------------------------------------------
  // handleKiwifyWebhook — Signature validation
  // ----------------------------------------------------------
  describe('signature validation', () => {
    it('skips signature validation when no x-kiwify-signature header is present', async () => {
      const payload = makePayload();
      const req: any = {
        headers: {},
        body: payload,
      };
      const res = makeRes();

      // Mock event handlers to avoid DB calls
      mockPrisma.user.findUnique.mockResolvedValue(null); // will short-circuit handlePurchaseApproved

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 401 when signature is present but invalid and secret is configured', async () => {
      process.env.KIWIFY_WEBHOOK_SECRET = 'my-super-secret';

      const payload = makePayload();
      const req: any = {
        headers: { 'x-kiwify-signature': 'invalid-signature' },
        body: payload,
      };
      const res = makeRes();

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid signature' });
    });

    it('skips validation (dev mode) when secret not configured and not production', async () => {
      delete process.env.KIWIFY_WEBHOOK_SECRET;
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const payload = makePayload({ event: 'compra_aprovada' });
      const req: any = {
        headers: { 'x-kiwify-signature': 'any-signature-should-pass' },
        body: payload,
      };
      const res = makeRes();
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      process.env.NODE_ENV = originalEnv;
    });

    it('rejects webhook in production when secret not configured', async () => {
      delete process.env.KIWIFY_WEBHOOK_SECRET;
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const payload = makePayload();
      const req: any = {
        headers: { 'x-kiwify-signature': 'some-sig' },
        body: payload,
      };
      const res = makeRes();

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      process.env.NODE_ENV = originalEnv;
    });

    it('validates HMAC correctly with matching signature', async () => {
      const crypto = await import('crypto');
      const secret = 'valid-webhook-secret';
      process.env.KIWIFY_WEBHOOK_SECRET = secret;

      const payload = makePayload({ event: 'compra_aprovada' });
      const rawBody = JSON.stringify(payload);
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(rawBody);
      const validSignature = hmac.digest('hex');

      const req: any = {
        headers: { 'x-kiwify-signature': validSignature },
        body: payload,
      };
      const res = makeRes();
      mockPrisma.user.findUnique.mockResolvedValue(null); // short circuit

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ----------------------------------------------------------
  // handleKiwifyWebhook — Event: compra_aprovada
  // ----------------------------------------------------------
  describe('event: compra_aprovada', () => {
    it('activates subscription when user and plan are found', async () => {
      const payload = makePayload({ event: 'compra_aprovada' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.plan.findFirst.mockResolvedValue(mockPlan);
      mockPrisma.subscription.findFirst.mockResolvedValue(null); // no existing subscription
      mockPrisma.subscription.create.mockResolvedValue({ id: 'new-sub-1' });

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            planId: 'plan-1',
            status: 'ACTIVE',
          }),
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('cancels existing subscription before creating new one', async () => {
      const payload = makePayload({ event: 'compra_aprovada' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      const existingSub = { id: 'old-sub-1', status: 'TRIAL' };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.plan.findFirst.mockResolvedValue(mockPlan);
      mockPrisma.subscription.findFirst.mockResolvedValue(existingSub);
      mockPrisma.subscription.update.mockResolvedValue({ ...existingSub, status: 'CANCELLED' });
      mockPrisma.subscription.create.mockResolvedValue({ id: 'new-sub-1' });

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'old-sub-1' },
          data: { status: 'CANCELLED' },
        })
      );
    });

    it('skips subscription creation when user not found', async () => {
      const payload = makePayload({ event: 'compra_aprovada' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('skips subscription creation when plan not found', async () => {
      const payload = makePayload({ event: 'compra_aprovada' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.plan.findFirst.mockResolvedValue(null);

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
    });

    it('sets validUntil +1 year for YEARLY billing plan', async () => {
      const yearlyPlan = { ...mockPlan, billingPeriod: 'YEARLY' };
      const payload = makePayload({ event: 'compra_aprovada' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.plan.findFirst.mockResolvedValue(yearlyPlan);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue({ id: 'new-sub' });

      const before = new Date();
      await WebhookController.handleKiwifyWebhook(req, res);

      const createCall = mockPrisma.subscription.create.mock.calls[0][0];
      const validUntil: Date = createCall.data.validUntil;
      expect(validUntil.getFullYear()).toBeGreaterThanOrEqual(before.getFullYear() + 1);
    });

    it('sets validUntil +6 months for SEMIANNUAL billing plan', async () => {
      const semiannualPlan = { ...mockPlan, billingPeriod: 'SEMIANNUAL' };
      const payload = makePayload({ event: 'compra_aprovada' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.plan.findFirst.mockResolvedValue(semiannualPlan);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue({ id: 'new-sub' });

      const before = new Date();
      await WebhookController.handleKiwifyWebhook(req, res);

      const createCall = mockPrisma.subscription.create.mock.calls[0][0];
      const validUntil: Date = createCall.data.validUntil;
      // 6 months from now should be > 5 months from now
      const fiveMonthsFromNow = new Date(before);
      fiveMonthsFromNow.setMonth(fiveMonthsFromNow.getMonth() + 5);
      expect(validUntil.getTime()).toBeGreaterThan(fiveMonthsFromNow.getTime());
    });
  });

  // ----------------------------------------------------------
  // handleKiwifyWebhook — Event: subscription_renewed
  // ----------------------------------------------------------
  describe('event: subscription_renewed', () => {
    it('extends subscription validUntil for renewal', async () => {
      const payload = makePayload({
        event: 'subscription_renewed',
        subscription: { subscription_id: 'kiwify-sub-1', status: 'active', started_at: new Date().toISOString() },
      });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      const currentValidUntil = new Date();
      mockPrisma.subscription.findFirst.mockResolvedValue({
        ...mockSubscription,
        externalSubId: 'kiwify-sub-1',
        validUntil: currentValidUntil,
        plan: mockPlan,
      });
      mockPrisma.subscription.update.mockResolvedValue({ id: 'sub-1' });

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACTIVE',
            queriesUsed: 0,
          }),
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('skips renewal when no subscription field in payload', async () => {
      const payload = makePayload({ event: 'subscription_renewed', subscription: undefined });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('skips renewal when subscription not found in DB', async () => {
      const payload = makePayload({
        event: 'subscription_renewed',
        subscription: { subscription_id: 'unknown-id', status: 'active', started_at: new Date().toISOString() },
      });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });

    it('extends validUntil by 1 year for YEARLY billing on renewal', async () => {
      const yearlyPlan = { ...mockPlan, billingPeriod: 'YEARLY' };
      const currentValidUntil = new Date('2026-06-01');
      const payload = makePayload({
        event: 'subscription_renewed',
        subscription: { subscription_id: 'kiwify-sub-1', status: 'active', started_at: new Date().toISOString() },
      });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.subscription.findFirst.mockResolvedValue({
        ...mockSubscription,
        externalSubId: 'kiwify-sub-1',
        validUntil: currentValidUntil,
        plan: yearlyPlan,
      });
      mockPrisma.subscription.update.mockResolvedValue({ id: 'sub-1' });

      await WebhookController.handleKiwifyWebhook(req, res);

      const updateCall = mockPrisma.subscription.update.mock.calls[0][0];
      const newValidUntil: Date = updateCall.data.validUntil;
      expect(newValidUntil.getFullYear()).toBe(2027);
    });
  });

  // ----------------------------------------------------------
  // handleKiwifyWebhook — Event: subscription_canceled
  // ----------------------------------------------------------
  describe('event: subscription_canceled', () => {
    it('cancels subscription and sends email', async () => {
      const payload = makePayload({
        event: 'subscription_canceled',
        subscription: { subscription_id: 'kiwify-sub-1', status: 'canceled', started_at: new Date().toISOString() },
      });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.subscription.findFirst.mockResolvedValue({
        ...mockSubscription,
        externalSubId: 'kiwify-sub-1',
        user: mockUser,
        plan: mockPlan,
      });
      mockPrisma.subscription.update.mockResolvedValue({ id: 'sub-1', status: 'CANCELLED' });
      mockSendSubscriptionExpiredEmail.mockResolvedValue(undefined);

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } })
      );
      expect(mockSendSubscriptionExpiredEmail).toHaveBeenCalledWith(
        'test@example.com',
        'Test User',
        'Starter'
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('skips when no subscription field in payload', async () => {
      const payload = makePayload({ event: 'subscription_canceled', subscription: undefined });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });

    it('skips when subscription not found in DB', async () => {
      const payload = makePayload({
        event: 'subscription_canceled',
        subscription: { subscription_id: 'ghost-id', status: 'canceled', started_at: new Date().toISOString() },
      });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });

    it('uses "Usuário" fallback when user has no name', async () => {
      const payload = makePayload({
        event: 'subscription_canceled',
        subscription: { subscription_id: 'kiwify-sub-1', status: 'canceled', started_at: new Date().toISOString() },
      });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.subscription.findFirst.mockResolvedValue({
        ...mockSubscription,
        user: { ...mockUser, name: null },
        plan: mockPlan,
      });
      mockPrisma.subscription.update.mockResolvedValue({ id: 'sub-1' });
      mockSendSubscriptionExpiredEmail.mockResolvedValue(undefined);

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockSendSubscriptionExpiredEmail).toHaveBeenCalledWith(
        'test@example.com',
        'Usuário',
        'Starter'
      );
    });
  });

  // ----------------------------------------------------------
  // handleKiwifyWebhook — Event: subscription_late
  // ----------------------------------------------------------
  describe('event: subscription_late', () => {
    it('marks subscription as PAST_DUE', async () => {
      const payload = makePayload({
        event: 'subscription_late',
        subscription: { subscription_id: 'kiwify-sub-1', status: 'late', started_at: new Date().toISOString() },
      });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.subscription.findFirst.mockResolvedValue({
        ...mockSubscription,
        externalSubId: 'kiwify-sub-1',
      });
      mockPrisma.subscription.update.mockResolvedValue({ id: 'sub-1', status: 'PAST_DUE' });

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PAST_DUE' } })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('skips when no subscription field in payload', async () => {
      const payload = makePayload({ event: 'subscription_late', subscription: undefined });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });

    it('skips when subscription not found', async () => {
      const payload = makePayload({
        event: 'subscription_late',
        subscription: { subscription_id: 'ghost', status: 'late', started_at: new Date().toISOString() },
      });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // handleKiwifyWebhook — Event: compra_reembolsada
  // ----------------------------------------------------------
  describe('event: compra_reembolsada', () => {
    it('cancels subscription and sends email on refund', async () => {
      const payload = makePayload({ event: 'compra_reembolsada' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.subscription.findFirst.mockResolvedValue({
        ...mockSubscription,
        kiwifyOrderId: 'order-1',
        user: mockUser,
        plan: mockPlan,
      });
      mockPrisma.subscription.update.mockResolvedValue({ id: 'sub-1', status: 'CANCELLED' });
      mockSendSubscriptionExpiredEmail.mockResolvedValue(undefined);

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } })
      );
      expect(mockSendSubscriptionExpiredEmail).toHaveBeenCalled();
    });

    it('skips when subscription not found for order', async () => {
      const payload = makePayload({ event: 'compra_reembolsada' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // handleKiwifyWebhook — Event: chargeback
  // ----------------------------------------------------------
  describe('event: chargeback', () => {
    it('suspends subscription and blocks user on chargeback', async () => {
      const payload = makePayload({ event: 'chargeback' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.subscription.findFirst.mockResolvedValue({
        ...mockSubscription,
        kiwifyOrderId: 'order-1',
        userId: 'user-1',
      });
      mockPrisma.subscription.update.mockResolvedValue({ id: 'sub-1', status: 'SUSPENDED' });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1', blocked: true });

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'SUSPENDED' } })
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { blocked: true } })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('skips when subscription not found for chargeback', async () => {
      const payload = makePayload({ event: 'chargeback' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // handleKiwifyWebhook — Unknown events
  // ----------------------------------------------------------
  describe('unknown events', () => {
    it('handles unknown event gracefully', async () => {
      const payload = makePayload({ event: 'carrinho_abandonado' as any });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  // ----------------------------------------------------------
  // handleKiwifyWebhook — Error handling
  // ----------------------------------------------------------
  describe('error handling', () => {
    it('returns 500 and creates admin alert on unhandled exception', async () => {
      const payload = makePayload({ event: 'compra_aprovada' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.webhookLog.create.mockRejectedValue(new Error('DB is down'));

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('still returns 500 when error logging itself fails', async () => {
      const payload = makePayload({ event: 'compra_aprovada' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.webhookLog.create.mockRejectedValue(new Error('DB is down'));
      mockPrisma.webhookLog.updateMany.mockRejectedValue(new Error('Also down'));

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('saves webhook log before processing event', async () => {
      const payload = makePayload({ event: 'compra_aprovada' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.webhookLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'compra_aprovada',
            processed: false,
          }),
        })
      );
    });

    it('marks webhook log as processed after successful handling', async () => {
      const payload = makePayload({ event: 'compra_aprovada' });
      const req: any = { headers: {}, body: payload };
      const res = makeRes();

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await WebhookController.handleKiwifyWebhook(req, res);

      expect(mockPrisma.webhookLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { processed: true },
        })
      );
    });
  });
});

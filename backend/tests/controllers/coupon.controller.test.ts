import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for CouponController
 *
 * Tests:
 * - validateCoupon: code validation, plan matching, VITALICIO allowlist, expiry/limit checks
 * - applyCoupon: auth guard, coupon lookup, usage tracking
 * - getCouponAnalytics: admin analytics aggregation
 * - redeemTrialUpgrade: full trial upgrade lifecycle
 */

// ============================================
// Mocks (hoisted)
// ============================================

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    coupon: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    couponValidation: {
      create: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    couponUsage: {
      create: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
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

vi.mock('../../src/errors/AppError', () => ({
  AppError: class AppError extends Error {
    constructor(
      public statusCode: number,
      public errorCode: string,
      message: string
    ) {
      super(message);
    }
  },
}));

import { Request, Response } from 'express';
import { CouponController } from '../../src/controllers/coupon.controller';

// ============================================
// Helpers
// ============================================

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

const MOCK_COUPON = {
  id: 'coupon-1',
  code: 'SAVE20',
  description: '20% off',
  discountType: 'PERCENT',
  discountValue: 20,
  isActive: true,
  expiresAt: null,
  maxUses: null,
  usedCount: 0,
  appliesToPlanId: null,
  purpose: 'DISCOUNT',
  durationDays: null,
  isLifetime: false,
  plan: null,
};

const MOCK_PLAN = {
  id: 'plan-starter',
  name: 'Starter',
  slug: 'starter',
  maxMonitors: 5,
};

// ============================================
// validateCoupon
// ============================================

describe('CouponController.validateCoupon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VITALICIO_ALLOWED_EMAILS;
  });

  it('should return 400 if code is missing', async () => {
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Código do cupom é obrigatório' });
  });

  it('should return 404 if coupon is not found', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue(null);

    const req = createMockReq({ body: { code: 'INVALID' } });
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ valid: false })
    );
  });

  it('should return 404 for VITALICIO coupon when user is not authenticated', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({ ...MOCK_COUPON, code: 'VITALICIO' });

    const req = createMockReq({ body: { code: 'VITALICIO' } });
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ valid: false })
    );
  });

  it('should return 404 for VITALICIO coupon when user is not in allowlist', async () => {
    process.env.VITALICIO_ALLOWED_EMAILS = 'allowed@example.com';
    mockPrisma.coupon.findFirst.mockResolvedValue({ ...MOCK_COUPON, code: 'VITALICIO' });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'notallowed@example.com' });

    const req = createMockReq({ body: { code: 'VITALICIO' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ valid: false })
    );
  });

  it('should proceed for VITALICIO coupon when user is in allowlist', async () => {
    process.env.VITALICIO_ALLOWED_EMAILS = 'allowed@example.com';
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      code: 'VITALICIO',
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'allowed@example.com' });
    mockPrisma.couponValidation.create.mockResolvedValue({});

    const req = createMockReq({ body: { code: 'VITALICIO' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    // Should not return 404 — coupon is valid
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ valid: true })
    );
  });

  it('should return 400 if coupon is inactive', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({ ...MOCK_COUPON, isActive: false });

    const req = createMockReq({ body: { code: 'SAVE20', planId: 'plan-1' } });
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Este cupom não está mais ativo' })
    );
  });

  it('should return 400 if coupon is expired', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      expiresAt: pastDate,
    });

    const req = createMockReq({ body: { code: 'SAVE20', planId: 'plan-1' } });
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Este cupom expirou' })
    );
  });

  it('should return 400 if coupon has reached max uses', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      maxUses: 10,
      usedCount: 10,
    });

    const req = createMockReq({ body: { code: 'SAVE20', planId: 'plan-1' } });
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Este cupom já atingiu o limite de usos' })
    );
  });

  it('should return 400 if coupon is generic and no planId/planSlug provided', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({ ...MOCK_COUPON });

    const req = createMockReq({ body: { code: 'SAVE20' } });
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('selecione um plano') })
    );
  });

  it('should return 404 if planId is provided but plan does not exist', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });
    mockPrisma.plan.findUnique.mockResolvedValue(null);

    const req = createMockReq({ body: { code: 'SAVE20', planId: 'nonexistent-plan' } });
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Plano não encontrado' })
    );
  });

  it('should return 400 if planId does not match coupon plan', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });
    mockPrisma.plan.findUnique.mockResolvedValue({ id: 'plan-pro', name: 'Pro', slug: 'pro' });

    const req = createMockReq({ body: { code: 'SAVE20', planId: 'plan-pro' } });
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('válido apenas para o plano') })
    );
  });

  it('should validate coupon by planSlug', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });
    mockPrisma.plan.findUnique.mockResolvedValue(MOCK_PLAN);
    mockPrisma.couponValidation.create.mockResolvedValue({});

    const req = createMockReq({ body: { code: 'SAVE20', planSlug: 'starter' } });
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ valid: true })
    );
  });

  it('should return valid coupon without plan restriction when planId provided', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({ ...MOCK_COUPON });
    mockPrisma.couponValidation.create.mockResolvedValue({});

    const req = createMockReq({ body: { code: 'SAVE20', planId: 'plan-starter' } });
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        valid: true,
        coupon: expect.objectContaining({ code: 'SAVE20' }),
        message: expect.stringContaining('Cupom válido'),
      })
    );
  });

  it('should track coupon validation in database', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({ ...MOCK_COUPON });
    mockPrisma.couponValidation.create.mockResolvedValue({});

    const req = createMockReq({ body: { code: 'SAVE20', planId: 'plan-starter' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(mockPrisma.couponValidation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          couponId: 'coupon-1',
          userId: 'user-1',
          converted: false,
        }),
      })
    );
  });

  it('should normalize coupon code (uppercase, trim, strip accents)', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({ ...MOCK_COUPON, code: 'SAVE20' });
    mockPrisma.couponValidation.create.mockResolvedValue({});

    const req = createMockReq({ body: { code: '  save20  ', planId: 'plan-1' } });
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    // findFirst should be called with the normalized code
    expect(mockPrisma.coupon.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code: expect.objectContaining({ equals: 'SAVE20' }),
        }),
      })
    );
  });

  it('should return 500 on unexpected database error', async () => {
    mockPrisma.coupon.findFirst.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({ body: { code: 'SAVE20' } });
    const res = createMockRes();

    await CouponController.validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao validar cupom' });
  });
});

// ============================================
// applyCoupon
// ============================================

describe('CouponController.applyCoupon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    const req = createMockReq({ body: { code: 'SAVE20' } });
    const res = createMockRes();

    await CouponController.applyCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Usuário não autenticado' });
  });

  it('should return 400 if code is missing', async () => {
    const req = createMockReq({ body: {} }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.applyCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Código do cupom é obrigatório' });
  });

  it('should return 404 if coupon is not found', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue(null);

    const req = createMockReq({ body: { code: 'INVALID' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.applyCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cupom inválido' });
  });

  it('should return 404 if coupon is inactive', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({ ...MOCK_COUPON, isActive: false });

    const req = createMockReq({ body: { code: 'SAVE20' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.applyCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cupom inválido' });
  });

  it('should create coupon usage and increment counter on success', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({ ...MOCK_COUPON });
    mockPrisma.couponUsage.create.mockResolvedValue({});
    mockPrisma.coupon.update.mockResolvedValue({});

    const req = createMockReq({ body: { code: 'SAVE20' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.applyCoupon(req, res);

    expect(mockPrisma.couponUsage.create).toHaveBeenCalledWith({
      data: { couponId: 'coupon-1', userId: 'user-1' },
    });
    expect(mockPrisma.coupon.update).toHaveBeenCalledWith({
      where: { id: 'coupon-1' },
      data: { usedCount: { increment: 1 } },
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it('should return 500 on unexpected error', async () => {
    mockPrisma.coupon.findFirst.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({ body: { code: 'SAVE20' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.applyCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao aplicar cupom' });
  });
});

// ============================================
// getCouponAnalytics
// ============================================

describe('CouponController.getCouponAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return analytics summary with zero values', async () => {
    mockPrisma.coupon.count.mockResolvedValue(0);
    mockPrisma.coupon.groupBy.mockResolvedValue([]);
    mockPrisma.couponValidation.count.mockResolvedValue(0);
    mockPrisma.couponValidation.groupBy.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const req = createMockReq({});
    const res = createMockRes();

    await CouponController.getCouponAnalytics(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: expect.objectContaining({
          totalActiveCoupons: 0,
          validationsLast7Days: 0,
          conversionRate: 0,
          couponsByPurpose: [],
        }),
        topCoupons: [],
        validationsByDay: [],
      })
    );
  });

  it('should compute conversionRate correctly', async () => {
    mockPrisma.coupon.count.mockResolvedValue(5);
    mockPrisma.coupon.groupBy.mockResolvedValue([]);
    // First call = validationsLast7Days, second = total, third = converted, fourth = abandoned
    mockPrisma.couponValidation.count
      .mockResolvedValueOnce(10) // last 7 days
      .mockResolvedValueOnce(20) // total
      .mockResolvedValueOnce(5)  // converted
      .mockResolvedValueOnce(3); // abandoned
    mockPrisma.couponValidation.groupBy.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const req = createMockReq({});
    const res = createMockRes();

    await CouponController.getCouponAnalytics(req, res);

    const response = (res.json as any).mock.calls[0][0];
    expect(response.summary.conversionRate).toBe(25); // 5/20 * 100 = 25
  });

  it('should include top coupons with their data', async () => {
    mockPrisma.coupon.count.mockResolvedValue(2);
    mockPrisma.coupon.groupBy.mockResolvedValue([
      { purpose: 'DISCOUNT', _count: 2 },
    ]);
    mockPrisma.couponValidation.count.mockResolvedValue(0);
    mockPrisma.couponValidation.groupBy.mockResolvedValue([
      { couponId: 'coupon-1', _count: 15 },
    ]);
    mockPrisma.coupon.findUnique.mockResolvedValue({
      id: 'coupon-1',
      code: 'TOP20',
      purpose: 'DISCOUNT',
    });
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const req = createMockReq({});
    const res = createMockRes();

    await CouponController.getCouponAnalytics(req, res);

    const response = (res.json as any).mock.calls[0][0];
    expect(response.topCoupons).toHaveLength(1);
    expect(response.topCoupons[0]).toMatchObject({
      code: 'TOP20',
      validations: 15,
      purpose: 'DISCOUNT',
    });
  });

  it('should handle deleted coupon in top list gracefully', async () => {
    mockPrisma.coupon.count.mockResolvedValue(0);
    mockPrisma.coupon.groupBy.mockResolvedValue([]);
    mockPrisma.couponValidation.count.mockResolvedValue(0);
    mockPrisma.couponValidation.groupBy.mockResolvedValue([
      { couponId: 'deleted-coupon', _count: 5 },
    ]);
    mockPrisma.coupon.findUnique.mockResolvedValue(null);
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const req = createMockReq({});
    const res = createMockRes();

    await CouponController.getCouponAnalytics(req, res);

    const response = (res.json as any).mock.calls[0][0];
    expect(response.topCoupons[0].code).toBe('Deletado');
    expect(response.topCoupons[0].purpose).toBe('UNKNOWN');
  });

  it('should return 500 on database error', async () => {
    mockPrisma.coupon.count.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({});
    const res = createMockRes();

    await CouponController.getCouponAnalytics(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao buscar analytics' });
  });
});

// ============================================
// redeemTrialUpgrade
// ============================================

describe('CouponController.redeemTrialUpgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VITALICIO_ALLOWED_EMAILS;
  });

  it('should return 401 if user is not authenticated', async () => {
    const req = createMockReq({ body: { code: 'TRIAL30' } });
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Usuário não autenticado' });
  });

  it('should return 400 if code is missing', async () => {
    const req = createMockReq({ body: {} }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Código do cupom é obrigatório' });
  });

  it('should return 404 if coupon not found', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue(null);

    const req = createMockReq({ body: { code: 'NOTFOUND' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ valid: false })
    );
  });

  it('should return 400 if coupon is not TRIAL_UPGRADE purpose', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      purpose: 'DISCOUNT',
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });

    const req = createMockReq({ body: { code: 'SAVE20' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('não é um cupom de upgrade') })
    );
  });

  it('should return 400 if coupon is inactive', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      purpose: 'TRIAL_UPGRADE',
      isActive: false,
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });

    const req = createMockReq({ body: { code: 'TRIAL30' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Este cupom não está mais ativo' })
    );
  });

  it('should return 400 if coupon is expired', async () => {
    const pastDate = new Date(Date.now() - 1000);
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      purpose: 'TRIAL_UPGRADE',
      expiresAt: pastDate,
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });

    const req = createMockReq({ body: { code: 'TRIAL30' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Este cupom expirou' })
    );
  });

  it('should return 400 if coupon has reached max uses', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      purpose: 'TRIAL_UPGRADE',
      maxUses: 5,
      usedCount: 5,
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });

    const req = createMockReq({ body: { code: 'TRIAL30' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Este cupom já atingiu o limite de usos' })
    );
  });

  it('should return 500 if coupon has invalid durationDays', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      purpose: 'TRIAL_UPGRADE',
      isLifetime: false,
      durationDays: null,
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });

    const req = createMockReq({ body: { code: 'TRIAL30' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Cupom mal configurado: duração inválida' })
    );
  });

  it('should return 400 if generic coupon requires planId but none provided', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      purpose: 'TRIAL_UPGRADE',
      durationDays: 30,
      appliesToPlanId: null,
      plan: null,
    });

    const req = createMockReq({ body: { code: 'TRIAL30' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('selecione um plano') })
    );
  });

  it('should return 404 if provided planId does not exist', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      purpose: 'TRIAL_UPGRADE',
      durationDays: 30,
      appliesToPlanId: null,
      plan: null,
    });
    mockPrisma.plan.findUnique.mockResolvedValue(null);

    const req = createMockReq({ body: { code: 'TRIAL30', planId: 'nonexistent' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Plano não encontrado' });
  });

  it('should successfully create a trial subscription with temp coupon and plan found by planId', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      purpose: 'TRIAL_UPGRADE',
      durationDays: 30,
      appliesToPlanId: null,
      plan: null,
    });
    mockPrisma.plan.findUnique.mockResolvedValue(MOCK_PLAN);
    mockPrisma.subscription.findFirst.mockResolvedValue(null);
    mockPrisma.subscription.create.mockResolvedValue({
      id: 'sub-1',
      plan: MOCK_PLAN,
    });
    mockPrisma.couponUsage.create.mockResolvedValue({});
    mockPrisma.coupon.update.mockResolvedValue({});

    const req = createMockReq({ body: { code: 'TRIAL30', planId: 'plan-starter' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        subscription: expect.objectContaining({
          planName: 'Starter',
          isLifetime: false,
          daysGranted: 30,
        }),
      })
    );
  });

  it('should create a lifetime subscription for VITALICIO coupon', async () => {
    process.env.VITALICIO_ALLOWED_EMAILS = 'vip@example.com';
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      code: 'VITALICIO',
      purpose: 'TRIAL_UPGRADE',
      isLifetime: true,
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'vip@example.com' });
    mockPrisma.subscription.findFirst.mockResolvedValue(null);
    mockPrisma.subscription.create.mockResolvedValue({
      id: 'sub-1',
      plan: MOCK_PLAN,
    });
    mockPrisma.couponUsage.create.mockResolvedValue({});
    mockPrisma.coupon.update.mockResolvedValue({});

    const req = createMockReq({ body: { code: 'VITALICIO' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.subscription.isLifetime).toBe(true);
    expect(body.subscription.endsAt).toBeNull();
    expect(body.subscription.daysGranted).toBeNull();
  });

  it('should return 200 idempotently if user already has the same lifetime subscription', async () => {
    // Use a non-VITALICIO code to avoid the allowlist check
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      code: 'LIFETIME50',
      purpose: 'TRIAL_UPGRADE',
      isLifetime: true,
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-existing',
      status: 'ACTIVE',
      planId: 'plan-starter',
      isLifetime: true,
      plan: MOCK_PLAN,
    });

    const req = createMockReq({ body: { code: 'LIFETIME50' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining('VITALÍCIO'),
      })
    );
    // Should NOT create a new subscription
    expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
  });

  it('should cancel existing ACTIVE non-lifetime subscription when upgrading to lifetime', async () => {
    // Use a non-VITALICIO code to avoid the allowlist check
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      code: 'LIFETIME99',
      purpose: 'TRIAL_UPGRADE',
      isLifetime: true,
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-existing',
      status: 'ACTIVE',
      planId: 'plan-starter',
      isLifetime: false,
      plan: MOCK_PLAN,
    });
    mockPrisma.subscription.update.mockResolvedValue({});
    mockPrisma.subscription.create.mockResolvedValue({
      id: 'sub-new',
      plan: MOCK_PLAN,
    });
    mockPrisma.couponUsage.create.mockResolvedValue({});
    mockPrisma.coupon.update.mockResolvedValue({});

    const req = createMockReq({ body: { code: 'LIFETIME99' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-existing' },
      data: { status: 'CANCELLED' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should return 400 if user already has active subscription for same plan', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      purpose: 'TRIAL_UPGRADE',
      durationDays: 30,
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-existing',
      status: 'ACTIVE',
      planId: 'plan-starter',
      isLifetime: false,
      plan: MOCK_PLAN,
    });

    const req = createMockReq({ body: { code: 'TRIAL30' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('já possui assinatura ativa') })
    );
  });

  it('should cancel old trial when new trial has longer duration', async () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now

    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      purpose: 'TRIAL_UPGRADE',
      durationDays: 30, // 30 days > current 5 days
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-trial',
      status: 'TRIAL',
      planId: 'plan-starter',
      isLifetime: false,
      trialEndsAt: futureDate,
      validUntil: futureDate,
      plan: MOCK_PLAN,
    });
    mockPrisma.subscription.update.mockResolvedValue({});
    mockPrisma.subscription.create.mockResolvedValue({
      id: 'sub-new',
      plan: MOCK_PLAN,
    });
    mockPrisma.couponUsage.create.mockResolvedValue({});
    mockPrisma.coupon.update.mockResolvedValue({});

    const req = createMockReq({ body: { code: 'TRIAL30' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-trial' },
      data: { status: 'CANCELLED' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should return 400 if new trial duration is not greater than existing trial', async () => {
    const farFutureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days from now

    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      purpose: 'TRIAL_UPGRADE',
      durationDays: 7, // 7 days < current 60 days
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-trial',
      status: 'TRIAL',
      planId: 'plan-starter',
      isLifetime: false,
      trialEndsAt: farFutureDate,
      validUntil: farFutureDate,
      plan: MOCK_PLAN,
    });

    const req = createMockReq({ body: { code: 'TRIAL7' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('prazo igual ou maior') })
    );
  });

  it('should return 500 on unexpected error', async () => {
    mockPrisma.coupon.findFirst.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({ body: { code: 'TRIAL30' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao resgatar cupom' });
  });

  it('should use plan tied to coupon when no planId provided (specific coupon)', async () => {
    mockPrisma.coupon.findFirst.mockResolvedValue({
      ...MOCK_COUPON,
      purpose: 'TRIAL_UPGRADE',
      durationDays: 30,
      appliesToPlanId: 'plan-starter',
      plan: MOCK_PLAN,
    });
    mockPrisma.subscription.findFirst.mockResolvedValue(null);
    mockPrisma.subscription.create.mockResolvedValue({
      id: 'sub-1',
      plan: MOCK_PLAN,
    });
    mockPrisma.couponUsage.create.mockResolvedValue({});
    mockPrisma.coupon.update.mockResolvedValue({});

    const req = createMockReq({ body: { code: 'TRIAL30' } }) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await CouponController.redeemTrialUpgrade(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planId: 'plan-starter',
          status: 'TRIAL',
        }),
      })
    );
  });
});

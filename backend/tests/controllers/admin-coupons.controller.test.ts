import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================
// Mocks (hoisted)
// ============================================

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      count: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    coupon: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    couponUsage: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
  } as any,
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

vi.mock('../../src/utils/auditLog', () => ({
  logAdminAction: vi.fn().mockResolvedValue({}),
  AuditAction: {
    COUPON_CREATED: 'COUPON_CREATED',
    COUPON_UPDATED: 'COUPON_UPDATED',
    COUPON_DELETED: 'COUPON_DELETED',
    COUPON_ACTIVATED: 'COUPON_ACTIVATED',
    COUPON_DEACTIVATED: 'COUPON_DEACTIVATED',
  },
  AuditTargetType: {
    USER: 'USER',
    SUBSCRIPTION: 'SUBSCRIPTION',
    COUPON: 'COUPON',
    MONITOR: 'MONITOR',
    SYSTEM: 'SYSTEM',
  },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

const { mockGenerateCSVCoupons, mockGetTimestampCoupons, mockCacheGet, mockCacheSet } = vi.hoisted(() => ({
  mockGenerateCSVCoupons: vi.fn(),
  mockGetTimestampCoupons: vi.fn(),
  mockCacheGet: vi.fn(),
  mockCacheSet: vi.fn(),
}));

vi.mock('../../src/services/exportService', () => ({
  generateCSV: mockGenerateCSVCoupons,
  getTimestamp: mockGetTimestampCoupons,
}));

// Mock cache used in getCouponAnalytics
vi.mock('../../src/utils/cache', () => ({
  cache: {
    get: mockCacheGet,
    set: mockCacheSet,
  },
}));

// Import AFTER mocks
import { AdminCouponsController } from '../../src/controllers/admin-coupons.controller';

// ============================================
// Helpers
// ============================================

function createMockReq(overrides: Partial<any> = {}): any {
  return {
    params: {},
    query: {},
    body: {},
    userId: 'admin-1',
    user: { id: 'admin-1', role: 'ADMIN' },
    get: vi.fn().mockReturnValue('test-agent'),
    file: undefined,
    ...overrides,
  };
}

function createMockRes(): any {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
    send: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

const fakeCoupon = {
  id: 'coupon-1',
  code: 'PROMO10',
  description: '10% off',
  purpose: 'DISCOUNT',
  discountType: 'PERCENTAGE',
  discountValue: 10,
  durationDays: null,
  isLifetime: false,
  maxUses: 100,
  usedCount: 5,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  isActive: true,
  appliesToPlanId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  plan: null,
};

// ============================================
// Tests
// ============================================

describe('AdminCouponsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set mock implementations after mockReset (vitest config: mockReset: true)
    mockGenerateCSVCoupons.mockReturnValue({ csv: 'id,code\n1,PROMO10', filename: 'cupons_2026-01-01.csv' });
    mockGetTimestampCoupons.mockReturnValue('2026-01-01');
    mockCacheGet.mockReturnValue(null); // default: cache miss
  });

  // ─────────────────────────────────────────
  // listCoupons
  // ─────────────────────────────────────────

  describe('listCoupons', () => {
    it('should return paginated coupons', async () => {
      const req = createMockReq({ query: { page: '1', limit: '10' } });
      const res = createMockRes();

      mockPrisma.coupon.findMany.mockResolvedValueOnce([fakeCoupon]);
      mockPrisma.coupon.count.mockResolvedValueOnce(1);

      await AdminCouponsController.listCoupons(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          coupons: [fakeCoupon],
          pagination: {
            total: 1,
            page: 1,
            limit: 10,
            totalPages: 1,
          },
        })
      );
    });

    it('should filter by status=active', async () => {
      const req = createMockReq({ query: { status: 'active' } });
      const res = createMockRes();

      mockPrisma.coupon.findMany.mockResolvedValueOnce([]);
      mockPrisma.coupon.count.mockResolvedValueOnce(0);

      await AdminCouponsController.listCoupons(req, res);

      expect(mockPrisma.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        })
      );
    });

    it('should filter by status=inactive', async () => {
      const req = createMockReq({ query: { status: 'inactive' } });
      const res = createMockRes();

      mockPrisma.coupon.findMany.mockResolvedValueOnce([]);
      mockPrisma.coupon.count.mockResolvedValueOnce(0);

      await AdminCouponsController.listCoupons(req, res);

      expect(mockPrisma.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: false }),
        })
      );
    });

    it('should filter by code and type', async () => {
      const req = createMockReq({ query: { code: 'promo', type: 'PERCENTAGE' } });
      const res = createMockRes();

      mockPrisma.coupon.findMany.mockResolvedValueOnce([]);
      mockPrisma.coupon.count.mockResolvedValueOnce(0);

      await AdminCouponsController.listCoupons(req, res);

      expect(mockPrisma.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            code: expect.objectContaining({ contains: 'PROMO', mode: 'insensitive' }),
            discountType: 'PERCENTAGE',
          }),
        })
      );
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      mockPrisma.coupon.findMany.mockRejectedValueOnce(new Error('DB error'));

      await AdminCouponsController.listCoupons(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao listar cupons' });
    });
  });

  // ─────────────────────────────────────────
  // createCoupon
  // ─────────────────────────────────────────

  describe('createCoupon', () => {
    const validBody = {
      code: 'SAVE20',
      description: '20% off',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      maxUses: 50,
    };

    it('should create a coupon successfully', async () => {
      const req = createMockReq({ body: validBody, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce(null); // code not in use
      mockPrisma.coupon.create.mockResolvedValueOnce({ ...fakeCoupon, code: 'SAVE20' });

      await AdminCouponsController.createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SAVE20' }));
    });

    it('should return 400 if code is missing', async () => {
      const req = createMockReq({ body: { ...validBody, code: undefined }, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });

      await AdminCouponsController.createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Campo obrigatório: code' });
    });

    it('should return 400 if DISCOUNT coupon is missing discountType', async () => {
      const req = createMockReq({
        body: { code: 'TEST', discountValue: 10 },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });

      await AdminCouponsController.createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Cupom de desconto requer: discountType, discountValue',
      });
    });

    it('should return 400 if code is shorter than 3 chars', async () => {
      const req = createMockReq({
        body: { code: 'AB', discountType: 'FIXED', discountValue: 1000 },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });

      await AdminCouponsController.createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Código deve ter pelo menos 3 caracteres' });
    });

    it('should return 400 if percentage discount > 100', async () => {
      const req = createMockReq({
        body: { code: 'TOOBIG', discountType: 'PERCENTAGE', discountValue: 150 },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });

      await AdminCouponsController.createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Desconto percentual não pode ser maior que 100%',
      });
    });

    it('should return 400 if discount value is 0 or negative', async () => {
      const req = createMockReq({
        body: { code: 'ZERO', discountType: 'FIXED', discountValue: 0 },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });

      await AdminCouponsController.createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Valor de desconto deve ser maior que 0' });
    });

    it('should return 400 if code already exists', async () => {
      const req = createMockReq({ body: validBody, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce({ id: 'existing', code: 'SAVE20' });

      await AdminCouponsController.createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Já existe um cupom com este código' });
    });

    it('should return 400 if plan does not exist', async () => {
      const req = createMockReq({
        body: { ...validBody, appliesToPlanId: 'nonexistent-plan' },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce(null);
      mockPrisma.plan.findUnique.mockResolvedValueOnce(null);

      await AdminCouponsController.createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Plano especificado não encontrado' });
    });

    it('should return 400 if expiresAt is in the past', async () => {
      const req = createMockReq({
        body: { ...validBody, expiresAt: new Date(Date.now() - 10000).toISOString() },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce(null);

      await AdminCouponsController.createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Data de expiração deve ser futura' });
    });

    it('should create a TRIAL_UPGRADE coupon', async () => {
      const req = createMockReq({
        body: {
          code: 'UPGRADE30',
          purpose: 'TRIAL_UPGRADE',
          durationDays: 30,
        },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce(null);
      mockPrisma.coupon.create.mockResolvedValueOnce({
        ...fakeCoupon,
        code: 'UPGRADE30',
        purpose: 'TRIAL_UPGRADE',
        durationDays: 30,
      });

      await AdminCouponsController.createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: 'TRIAL_UPGRADE', durationDays: 30 })
      );
    });

    it('should return 400 for TRIAL_UPGRADE coupon without valid durationDays', async () => {
      const req = createMockReq({
        body: {
          code: 'UPGRADE',
          purpose: 'TRIAL_UPGRADE',
          durationDays: 0,
        },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });

      await AdminCouponsController.createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Cupom de trial upgrade requer durationDays entre 1 e 60',
      });
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ body: validBody, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('DB error'));

      await AdminCouponsController.createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao criar cupom' });
    });
  });

  // ─────────────────────────────────────────
  // updateCoupon
  // ─────────────────────────────────────────

  describe('updateCoupon', () => {
    it('should update a coupon successfully', async () => {
      const req = createMockReq({
        params: { id: 'coupon-1' },
        body: { description: 'Updated description' },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce(fakeCoupon);
      mockPrisma.coupon.update.mockResolvedValueOnce({ ...fakeCoupon, description: 'Updated description' });

      await AdminCouponsController.updateCoupon(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Updated description' })
      );
    });

    it('should return 404 if coupon not found', async () => {
      const req = createMockReq({
        params: { id: 'nonexistent' },
        body: { description: 'X' },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce(null);

      await AdminCouponsController.updateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cupom não encontrado' });
    });

    it('should return 400 if discountValue is 0 for DISCOUNT coupon', async () => {
      const req = createMockReq({
        params: { id: 'coupon-1' },
        body: { discountValue: 0 },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce(fakeCoupon);

      await AdminCouponsController.updateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Valor de desconto deve ser maior que 0' });
    });

    it('should return 400 if percentage discount exceeds 100 in update', async () => {
      const req = createMockReq({
        params: { id: 'coupon-1' },
        body: { discountType: 'PERCENTAGE', discountValue: 110 },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce(fakeCoupon);

      await AdminCouponsController.updateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Desconto percentual não pode ser maior que 100%' });
    });

    it('should return 400 if plan does not exist in update', async () => {
      const req = createMockReq({
        params: { id: 'coupon-1' },
        body: { appliesToPlanId: 'bad-plan' },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce(fakeCoupon);
      mockPrisma.plan.findUnique.mockResolvedValueOnce(null);

      await AdminCouponsController.updateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Plano especificado não encontrado' });
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({
        params: { id: 'coupon-1' },
        body: { description: 'X' },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('DB error'));

      await AdminCouponsController.updateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao atualizar cupom' });
    });
  });

  // ─────────────────────────────────────────
  // toggleCouponStatus
  // ─────────────────────────────────────────

  describe('toggleCouponStatus', () => {
    it('should toggle coupon from active to inactive', async () => {
      const req = createMockReq({ params: { id: 'coupon-1' }, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce({ ...fakeCoupon, isActive: true });
      mockPrisma.coupon.update.mockResolvedValueOnce({ ...fakeCoupon, isActive: false });

      await AdminCouponsController.toggleCouponStatus(req, res);

      expect(mockPrisma.coupon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'coupon-1' },
          data: { isActive: false },
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false })
      );
    });

    it('should toggle coupon from inactive to active', async () => {
      const req = createMockReq({ params: { id: 'coupon-1' }, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce({ ...fakeCoupon, isActive: false });
      mockPrisma.coupon.update.mockResolvedValueOnce({ ...fakeCoupon, isActive: true });

      await AdminCouponsController.toggleCouponStatus(req, res);

      expect(mockPrisma.coupon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isActive: true },
        })
      );
    });

    it('should return 404 if coupon not found', async () => {
      const req = createMockReq({ params: { id: 'nonexistent' }, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce(null);

      await AdminCouponsController.toggleCouponStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cupom não encontrado' });
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ params: { id: 'coupon-1' }, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('DB error'));

      await AdminCouponsController.toggleCouponStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao alternar status do cupom' });
    });
  });

  // ─────────────────────────────────────────
  // deleteCoupon
  // ─────────────────────────────────────────

  describe('deleteCoupon', () => {
    it('should permanently delete coupon when it has no usages', async () => {
      const req = createMockReq({ params: { id: 'coupon-1' }, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce({
        ...fakeCoupon,
        _count: { usageLogs: 0 },
      });
      mockPrisma.coupon.delete.mockResolvedValueOnce({});

      await AdminCouponsController.deleteCoupon(req, res);

      expect(mockPrisma.coupon.delete).toHaveBeenCalledWith({ where: { id: 'coupon-1' } });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Cupom deletado permanentemente', deleted: true })
      );
    });

    it('should soft-delete (deactivate) coupon when it has usages', async () => {
      const req = createMockReq({ params: { id: 'coupon-1' }, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce({
        ...fakeCoupon,
        _count: { usageLogs: 5 },
      });
      mockPrisma.coupon.update.mockResolvedValueOnce({ ...fakeCoupon, isActive: false });

      await AdminCouponsController.deleteCoupon(req, res);

      expect(mockPrisma.coupon.delete).not.toHaveBeenCalled();
      expect(mockPrisma.coupon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'coupon-1' },
          data: { isActive: false },
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Cupom desativado (possui usos registrados)' })
      );
    });

    it('should return 404 if coupon not found', async () => {
      const req = createMockReq({ params: { id: 'nonexistent' }, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce(null);

      await AdminCouponsController.deleteCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cupom não encontrado' });
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ params: { id: 'coupon-1' }, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('DB error'));

      await AdminCouponsController.deleteCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao deletar cupom' });
    });
  });

  // ─────────────────────────────────────────
  // bulkToggleCoupons
  // ─────────────────────────────────────────

  describe('bulkToggleCoupons', () => {
    it('should activate multiple coupons', async () => {
      const req = createMockReq({
        body: { couponIds: ['coupon-1', 'coupon-2'], isActive: true },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.updateMany.mockResolvedValueOnce({ count: 2 });

      await AdminCouponsController.bulkToggleCoupons(req, res);

      expect(mockPrisma.coupon.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['coupon-1', 'coupon-2'] } },
        data: { isActive: true },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ count: 2 })
      );
    });

    it('should deactivate multiple coupons', async () => {
      const req = createMockReq({
        body: { couponIds: ['coupon-1'], isActive: false },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.updateMany.mockResolvedValueOnce({ count: 1 });

      await AdminCouponsController.bulkToggleCoupons(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: '1 cupons desativados com sucesso', count: 1 })
      );
    });

    it('should return 400 if couponIds is missing', async () => {
      const req = createMockReq({ body: { isActive: true }, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });

      await AdminCouponsController.bulkToggleCoupons(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'IDs de cupons são obrigatórios' });
    });

    it('should return 400 if couponIds is empty array', async () => {
      const req = createMockReq({ body: { couponIds: [], isActive: true }, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });

      await AdminCouponsController.bulkToggleCoupons(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'IDs de cupons são obrigatórios' });
    });

    it('should return 400 if isActive is not a boolean', async () => {
      const req = createMockReq({
        body: { couponIds: ['coupon-1'], isActive: 'yes' },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });

      await AdminCouponsController.bulkToggleCoupons(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'isActive deve ser um booleano' });
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({
        body: { couponIds: ['coupon-1'], isActive: true },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('DB error'));

      await AdminCouponsController.bulkToggleCoupons(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao alternar múltiplos cupons' });
    });
  });

  // ─────────────────────────────────────────
  // bulkDeleteCoupons
  // ─────────────────────────────────────────

  describe('bulkDeleteCoupons', () => {
    it('should delete unused coupons and deactivate used ones', async () => {
      const req = createMockReq({
        body: { couponIds: ['coupon-1', 'coupon-2', 'coupon-3'] },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });
      mockPrisma.coupon.findMany.mockResolvedValueOnce([
        { id: 'coupon-1', _count: { usageLogs: 0 } },
        { id: 'coupon-2', _count: { usageLogs: 3 } },
        { id: 'coupon-3', _count: { usageLogs: 0 } },
      ]);
      mockPrisma.coupon.deleteMany.mockResolvedValueOnce({ count: 2 });
      mockPrisma.coupon.updateMany.mockResolvedValueOnce({ count: 1 });

      await AdminCouponsController.bulkDeleteCoupons(req, res);

      expect(mockPrisma.coupon.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['coupon-1', 'coupon-3'] } },
      });
      expect(mockPrisma.coupon.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['coupon-2'] } },
        data: { isActive: false },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ deleted: 2, deactivated: 1 })
      );
    });

    it('should return 400 if couponIds is missing', async () => {
      const req = createMockReq({ body: {}, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });

      await AdminCouponsController.bulkDeleteCoupons(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'IDs de cupons são obrigatórios' });
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({
        body: { couponIds: ['coupon-1'] },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('DB error'));

      await AdminCouponsController.bulkDeleteCoupons(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao deletar múltiplos cupons' });
    });
  });

  // ─────────────────────────────────────────
  // exportCoupons
  // ─────────────────────────────────────────

  describe('exportCoupons', () => {
    it('should export coupons as CSV', async () => {
      const req = createMockReq({ query: {}, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ email: 'admin@test.com' });
      mockPrisma.coupon.findMany.mockResolvedValueOnce([
        {
          ...fakeCoupon,
          plan: { name: 'PRO', slug: 'pro' },
          _count: { usageLogs: 5 },
        },
      ]);

      await AdminCouponsController.exportCoupons(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename=')
      );
      expect(res.send).toHaveBeenCalled();
    });

    it('should filter by status, code, type in export', async () => {
      const req = createMockReq({
        query: { status: 'active', code: 'promo', type: 'PERCENTAGE' },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ email: 'admin@test.com' });
      mockPrisma.coupon.findMany.mockResolvedValueOnce([]);

      await AdminCouponsController.exportCoupons(req, res);

      expect(mockPrisma.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            discountType: 'PERCENTAGE',
            code: expect.objectContaining({ contains: 'PROMO' }),
          }),
        })
      );
    });

    it('should return 401 if admin not found', async () => {
      const req = createMockReq({ query: {}, userId: 'admin-999' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await AdminCouponsController.exportCoupons(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin não encontrado' });
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ query: {}, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('DB error'));

      await AdminCouponsController.exportCoupons(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao exportar cupons' });
    });
  });

  // ─────────────────────────────────────────
  // importCoupons
  // ─────────────────────────────────────────

  describe('importCoupons', () => {
    it('should return 400 if file is not provided', async () => {
      const req = createMockReq({ file: undefined, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ email: 'admin@test.com' });

      await AdminCouponsController.importCoupons(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Arquivo CSV não fornecido' });
    });

    it('should return 401 if admin not found', async () => {
      const req = createMockReq({ file: { buffer: Buffer.from('') }, userId: 'admin-999' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await AdminCouponsController.importCoupons(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin não encontrado' });
    });

    it('should import valid coupons and report errors for invalid ones', async () => {
      const csvContent = [
        'code,description,discountType,discountValue,maxUses,expiresAt,planSlug',
        'VALID10,Valid coupon,PERCENTAGE,10,100,2030-12-31,',
        'X,,PERCENTAGE,10,,,' // invalid: code too short
      ].join('\n');

      const req = createMockReq({
        userId: 'admin-1',
        file: { buffer: Buffer.from(csvContent, 'utf-8') },
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ email: 'admin@test.com' });
      mockPrisma.coupon.findUnique.mockResolvedValueOnce(null); // VALID10 not in use
      mockPrisma.coupon.create.mockResolvedValueOnce({ ...fakeCoupon, code: 'VALID10' });

      await AdminCouponsController.importCoupons(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.results.success).toContain('VALID10');
      expect(call.results.errors).toHaveLength(1);
      expect(call.results.errors[0].code).toBe('X');
    });

    it('should return 400 for empty CSV', async () => {
      const csvContent = 'code,description,discountType,discountValue,maxUses,expiresAt,planSlug\n';
      const req = createMockReq({
        userId: 'admin-1',
        file: { buffer: Buffer.from(csvContent, 'utf-8') },
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ email: 'admin@test.com' });

      await AdminCouponsController.importCoupons(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Arquivo CSV vazio' });
    });
  });

  // ─────────────────────────────────────────
  // getCouponAnalytics
  // ─────────────────────────────────────────

  describe('getCouponAnalytics', () => {
    it('should return analytics data', async () => {
      const req = createMockReq({
        query: { startDate: '2026-01-01', endDate: '2026-01-31', groupBy: 'day' },
      });
      const res = createMockRes();

      const fakeUsages = [
        {
          usedAt: new Date('2026-01-10'),
          coupon: {
            code: 'PROMO10',
            discountType: 'PERCENTAGE',
            discountValue: 10,
            purpose: 'DISCOUNT',
            durationDays: null,
          },
        },
        {
          usedAt: new Date('2026-01-15'),
          coupon: {
            code: 'SAVE50',
            discountType: 'FIXED',
            discountValue: 5000,
            purpose: 'DISCOUNT',
            durationDays: null,
          },
        },
      ];

      mockPrisma.couponUsage.findMany.mockResolvedValueOnce(fakeUsages);
      mockPrisma.coupon.count
        .mockResolvedValueOnce(10)   // totalCoupons
        .mockResolvedValueOnce(5)    // usedCoupons
        .mockResolvedValueOnce(8)    // activeCoupons
        .mockResolvedValueOnce(1)    // expiringSoon
        .mockResolvedValueOnce(3)    // percentageCoupons
        .mockResolvedValueOnce(7);   // fixedCoupons
      mockPrisma.coupon.findMany.mockResolvedValueOnce([]); // couponsWithLimit

      await AdminCouponsController.getCouponAnalytics(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.stats.totalCoupons).toBe(10);
      expect(call.stats.totalUsages).toBe(2);
      expect(call.timeSeries).toHaveLength(2);
      expect(call.topCoupons).toHaveLength(2);
      expect(call.typeDistribution).toHaveLength(2);
    });

    it('should return cached data if available', async () => {
      const cachedData = { stats: { totalCoupons: 99 }, period: {}, timeSeries: [], topCoupons: [], typeDistribution: [] };
      mockCacheGet.mockReturnValueOnce(cachedData);

      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await AdminCouponsController.getCouponAnalytics(req, res);

      expect(res.json).toHaveBeenCalledWith(cachedData);
      expect(mockPrisma.couponUsage.findMany).not.toHaveBeenCalled();
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      mockPrisma.couponUsage.findMany.mockRejectedValueOnce(new Error('DB error'));

      await AdminCouponsController.getCouponAnalytics(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao buscar analytics de cupons' });
    });
  });

  // ─────────────────────────────────────────
  // getCouponDetailedStats
  // ─────────────────────────────────────────

  describe('getCouponDetailedStats', () => {
    it('should return detailed stats for an existing coupon', async () => {
      const req = createMockReq({ params: { code: 'promo10' } });
      const res = createMockRes();

      const fakeUsagesData = [
        { usedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), userId: 'user-1', couponId: 'coupon-1' },
        { usedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), userId: 'user-2', couponId: 'coupon-1' },
      ];

      mockPrisma.coupon.findUnique.mockResolvedValueOnce({
        ...fakeCoupon,
        plan: null,
      });
      mockPrisma.couponUsage.findMany.mockResolvedValueOnce(fakeUsagesData);
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-1', email: 'user1@test.com', name: 'User One' },
        { id: 'user-2', email: 'user2@test.com', name: 'User Two' },
      ]);

      await AdminCouponsController.getCouponDetailedStats(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.coupon.code).toBe('PROMO10');
      expect(call.stats.totalUses).toBe(2);
      expect(call.stats.uniqueUsers).toBe(2);
      expect(call.topUsers).toHaveLength(2);
      expect(call.timeline).toBeDefined();
      expect(call.planDistribution).toBeDefined();
    });

    it('should return 404 if coupon not found', async () => {
      const req = createMockReq({ params: { code: 'nonexistent' } });
      const res = createMockRes();

      mockPrisma.coupon.findUnique.mockResolvedValueOnce(null);

      await AdminCouponsController.getCouponDetailedStats(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cupom não encontrado' });
    });

    it('should uppercase the code parameter when looking up', async () => {
      const req = createMockReq({ params: { code: 'promo10' } });
      const res = createMockRes();

      mockPrisma.coupon.findUnique.mockResolvedValueOnce({ ...fakeCoupon, plan: null });
      mockPrisma.couponUsage.findMany.mockResolvedValueOnce([]);
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      await AdminCouponsController.getCouponDetailedStats(req, res);

      expect(mockPrisma.coupon.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { code: 'PROMO10' },
        })
      );
    });

    it('should correctly calculate health status', async () => {
      const req = createMockReq({ params: { code: 'HOTCOUPON' } });
      const res = createMockRes();

      // 12 usages in the last 7 days -> EXCELLENT
      const recentUsages = Array.from({ length: 12 }, (_, i) => ({
        usedAt: new Date(Date.now() - i * 60 * 60 * 1000), // each 1 hour apart
        userId: `user-${i}`,
        couponId: 'coupon-1',
      }));

      mockPrisma.coupon.findUnique.mockResolvedValueOnce({ ...fakeCoupon, code: 'HOTCOUPON', plan: null });
      mockPrisma.couponUsage.findMany.mockResolvedValueOnce(recentUsages);
      mockPrisma.user.findMany.mockResolvedValueOnce(
        recentUsages.map((_, i) => ({ id: `user-${i}`, email: `u${i}@test.com`, name: `User ${i}` }))
      );

      await AdminCouponsController.getCouponDetailedStats(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.stats.healthStatus).toBe('EXCELLENT');
      expect(call.stats.healthStatusLabel).toBe('Excelente');
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ params: { code: 'PROMO10' } });
      const res = createMockRes();

      mockPrisma.coupon.findUnique.mockRejectedValueOnce(new Error('DB error'));

      await AdminCouponsController.getCouponDetailedStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao buscar estatísticas detalhadas do cupom' });
    });
  });
});

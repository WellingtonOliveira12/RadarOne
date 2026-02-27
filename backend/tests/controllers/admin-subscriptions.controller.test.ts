import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for AdminSubscriptionsController
 *
 * Tests:
 * - listSubscriptions: pagination, filters (status/planId/userId), success and error cases
 * - updateSubscription: success, admin not found, subscription not found, invalid status, error
 * - exportSubscriptions: success with CSV response, admin not found, filters applied, error
 */

// ============================================
// Mocks (hoisted)
// ============================================

const { mockPrisma, mockExportService } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    subscription: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    monitor: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  } as any,
  mockExportService: {
    generateCSV: vi.fn(),
    getTimestamp: vi.fn(),
    formatCurrency: vi.fn(),
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

vi.mock('../../src/utils/auditLog', () => ({
  logAdminAction: vi.fn().mockResolvedValue({}),
  AuditAction: {
    USER_BLOCKED: 'USER_BLOCKED',
    USER_UNBLOCKED: 'USER_UNBLOCKED',
    SUBSCRIPTION_UPDATED: 'SUBSCRIPTION_UPDATED',
    SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
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

vi.mock('../../src/services/exportService', () => ({
  generateCSV: mockExportService.generateCSV,
  getTimestamp: mockExportService.getTimestamp,
  formatCurrency: mockExportService.formatCurrency,
}));

// Import AFTER mocks
import { AdminSubscriptionsController } from '../../src/controllers/admin-subscriptions.controller';
import { logAdminAction } from '../../src/utils/auditLog';

// ============================================
// Helpers
// ============================================

function createMockReq(overrides: Partial<any> = {}): any {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    get: vi.fn().mockReturnValue('Mozilla/5.0'),
    userId: undefined,
    ...overrides,
  };
}

function createMockRes(): any {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return res;
}

// ============================================
// Fixtures
// ============================================

const MOCK_ADMIN = { email: 'admin@radarone.com' };

const MOCK_SUBSCRIPTION = {
  id: 'sub-1',
  userId: 'user-1',
  planId: 'plan-starter',
  status: 'ACTIVE',
  startDate: new Date('2025-01-01'),
  validUntil: new Date('2026-01-01'),
  isLifetime: false,
  isTrial: false,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const MOCK_SUBSCRIPTION_LIST = [
  {
    ...MOCK_SUBSCRIPTION,
    user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
    plan: { id: 'plan-starter', name: 'Starter', priceCents: 2990, maxMonitors: 5 },
  },
];

const MOCK_SUBSCRIPTION_UPDATED = {
  ...MOCK_SUBSCRIPTION,
  status: 'CANCELLED',
  user: { email: 'alice@example.com' },
  plan: { name: 'Starter' },
};

// ============================================
// listSubscriptions
// ============================================

describe('AdminSubscriptionsController.listSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return paginated subscriptions with default pagination', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue(MOCK_SUBSCRIPTION_LIST);
    mockPrisma.subscription.count.mockResolvedValue(1);

    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await AdminSubscriptionsController.listSubscriptions(req, res);

    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      subscriptions: MOCK_SUBSCRIPTION_LIST,
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('should apply pagination query params', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);
    mockPrisma.subscription.count.mockResolvedValue(100);

    const req = createMockReq({ query: { page: '2', limit: '25' } });
    const res = createMockRes();

    await AdminSubscriptionsController.listSubscriptions(req, res);

    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25 })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: { total: 100, page: 2, limit: 25, totalPages: 4 },
      })
    );
  });

  it('should filter by status', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);
    mockPrisma.subscription.count.mockResolvedValue(0);

    const req = createMockReq({ query: { status: 'ACTIVE' } });
    const res = createMockRes();

    await AdminSubscriptionsController.listSubscriptions(req, res);

    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' } })
    );
  });

  it('should filter by planId', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);
    mockPrisma.subscription.count.mockResolvedValue(0);

    const req = createMockReq({ query: { planId: 'plan-starter' } });
    const res = createMockRes();

    await AdminSubscriptionsController.listSubscriptions(req, res);

    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { planId: 'plan-starter' } })
    );
  });

  it('should filter by userId', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);
    mockPrisma.subscription.count.mockResolvedValue(0);

    const req = createMockReq({ query: { userId: 'user-1' } });
    const res = createMockRes();

    await AdminSubscriptionsController.listSubscriptions(req, res);

    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
  });

  it('should apply multiple filters together', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);
    mockPrisma.subscription.count.mockResolvedValue(0);

    const req = createMockReq({ query: { status: 'CANCELLED', planId: 'plan-pro', userId: 'user-5' } });
    const res = createMockRes();

    await AdminSubscriptionsController.listSubscriptions(req, res);

    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'CANCELLED', planId: 'plan-pro', userId: 'user-5' },
      })
    );
  });

  it('should calculate totalPages correctly with non-even division', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);
    mockPrisma.subscription.count.mockResolvedValue(21);

    const req = createMockReq({ query: { limit: '10' } });
    const res = createMockRes();

    await AdminSubscriptionsController.listSubscriptions(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({ totalPages: 3 }),
      })
    );
  });

  it('should include user and plan relations in the query', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);
    mockPrisma.subscription.count.mockResolvedValue(0);

    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await AdminSubscriptionsController.listSubscriptions(req, res);

    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          user: expect.any(Object),
          plan: expect.any(Object),
        }),
      })
    );
  });

  it('should return 500 on database error', async () => {
    mockPrisma.subscription.findMany.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await AdminSubscriptionsController.listSubscriptions(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao listar subscriptions' });
  });
});

// ============================================
// updateSubscription
// ============================================

describe('AdminSubscriptionsController.updateSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update subscription status successfully', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.subscription.findUnique.mockResolvedValue(MOCK_SUBSCRIPTION);
    mockPrisma.subscription.update.mockResolvedValue(MOCK_SUBSCRIPTION_UPDATED);

    const req = createMockReq({
      params: { id: 'sub-1' },
      body: { status: 'CANCELLED' },
      userId: 'admin-1',
    });
    const res = createMockRes();

    await AdminSubscriptionsController.updateSubscription(req, res);

    expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: { status: 'CANCELLED' },
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      message: 'Subscription atualizada com sucesso',
      subscription: MOCK_SUBSCRIPTION_UPDATED,
    });
  });

  it('should update validUntil date successfully', async () => {
    const newDate = '2027-01-01T00:00:00.000Z';
    const updatedSub = {
      ...MOCK_SUBSCRIPTION_UPDATED,
      validUntil: new Date(newDate),
    };
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.subscription.findUnique.mockResolvedValue(MOCK_SUBSCRIPTION);
    mockPrisma.subscription.update.mockResolvedValue(updatedSub);

    const req = createMockReq({
      params: { id: 'sub-1' },
      body: { validUntil: newDate },
      userId: 'admin-1',
    });
    const res = createMockRes();

    await AdminSubscriptionsController.updateSubscription(req, res);

    expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { validUntil: new Date(newDate) },
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Subscription atualizada com sucesso' })
    );
  });

  it('should update both status and validUntil simultaneously', async () => {
    const newDate = '2027-06-01T00:00:00.000Z';
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.subscription.findUnique.mockResolvedValue(MOCK_SUBSCRIPTION);
    mockPrisma.subscription.update.mockResolvedValue(MOCK_SUBSCRIPTION_UPDATED);

    const req = createMockReq({
      params: { id: 'sub-1' },
      body: { status: 'ACTIVE', validUntil: newDate },
      userId: 'admin-1',
    });
    const res = createMockRes();

    await AdminSubscriptionsController.updateSubscription(req, res);

    expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'ACTIVE', validUntil: new Date(newDate) },
      })
    );
  });

  it('should return 401 when admin is not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const req = createMockReq({
      params: { id: 'sub-1' },
      body: { status: 'ACTIVE' },
      userId: 'admin-1',
    });
    const res = createMockRes();

    await AdminSubscriptionsController.updateSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin não encontrado' });
  });

  it('should return 404 when subscription is not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    const req = createMockReq({
      params: { id: 'nonexistent' },
      body: { status: 'ACTIVE' },
      userId: 'admin-1',
    });
    const res = createMockRes();

    await AdminSubscriptionsController.updateSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Subscription não encontrada' });
  });

  it('should return 400 when status is invalid', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.subscription.findUnique.mockResolvedValue(MOCK_SUBSCRIPTION);

    const req = createMockReq({
      params: { id: 'sub-1' },
      body: { status: 'INVALID_STATUS' },
      userId: 'admin-1',
    });
    const res = createMockRes();

    await AdminSubscriptionsController.updateSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Status inválido' });
  });

  it('should accept all valid status values', async () => {
    const validStatuses = ['ACTIVE', 'CANCELLED', 'EXPIRED', 'PENDING'];

    for (const status of validStatuses) {
      vi.clearAllMocks();
      mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
      mockPrisma.subscription.findUnique.mockResolvedValue(MOCK_SUBSCRIPTION);
      mockPrisma.subscription.update.mockResolvedValue({ ...MOCK_SUBSCRIPTION_UPDATED, status });

      const req = createMockReq({
        params: { id: 'sub-1' },
        body: { status },
        userId: 'admin-1',
      });
      const res = createMockRes();

      await AdminSubscriptionsController.updateSubscription(req, res);

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Subscription atualizada com sucesso' })
      );
    }
  });

  it('should call logAdminAction with correct params after update', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.subscription.findUnique.mockResolvedValue(MOCK_SUBSCRIPTION);
    mockPrisma.subscription.update.mockResolvedValue(MOCK_SUBSCRIPTION_UPDATED);

    const req = createMockReq({
      params: { id: 'sub-1' },
      body: { status: 'CANCELLED' },
      userId: 'admin-1',
    });
    const res = createMockRes();

    await AdminSubscriptionsController.updateSubscription(req, res);

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        adminEmail: MOCK_ADMIN.email,
        action: 'SUBSCRIPTION_UPDATED',
        targetType: 'SUBSCRIPTION',
        targetId: 'sub-1',
        beforeData: { status: 'ACTIVE', validUntil: MOCK_SUBSCRIPTION.validUntil },
        afterData: { status: 'CANCELLED', validUntil: MOCK_SUBSCRIPTION_UPDATED.validUntil },
      })
    );
  });

  it('should return 500 on unexpected error', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({
      params: { id: 'sub-1' },
      body: { status: 'ACTIVE' },
      userId: 'admin-1',
    });
    const res = createMockRes();

    await AdminSubscriptionsController.updateSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao atualizar subscription' });
  });
});

// ============================================
// exportSubscriptions
// ============================================

describe('AdminSubscriptionsController.exportSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore exportService mock implementations after mockReset
    mockExportService.generateCSV.mockReturnValue({ csv: 'id,status\nsub-1,ACTIVE', filename: 'assinaturas_test.csv' });
    mockExportService.getTimestamp.mockReturnValue('20260101_1200');
    mockExportService.formatCurrency.mockImplementation((cents: number) => `R$ ${(cents / 100).toFixed(2)}`);
  });

  it('should return CSV file with correct headers', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.subscription.findMany.mockResolvedValue([
      {
        ...MOCK_SUBSCRIPTION,
        user: { name: 'Alice', email: 'alice@example.com' },
        plan: { name: 'Starter', priceCents: 2990 },
      },
    ]);

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    await AdminSubscriptionsController.exportSubscriptions(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment; filename=')
    );
    expect(res.send).toHaveBeenCalled();
  });

  it('should return 401 when admin is not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    await AdminSubscriptionsController.exportSubscriptions(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin não encontrado' });
  });

  it('should apply status filter in export', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.subscription.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: { status: 'ACTIVE' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminSubscriptionsController.exportSubscriptions(req, res);

    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' } })
    );
  });

  it('should apply planId filter in export', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.subscription.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: { planId: 'plan-pro' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminSubscriptionsController.exportSubscriptions(req, res);

    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { planId: 'plan-pro' } })
    );
  });

  it('should apply userId filter in export', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.subscription.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: { userId: 'user-42' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminSubscriptionsController.exportSubscriptions(req, res);

    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-42' } })
    );
  });

  it('should call generateCSV with correct subscription data shape', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    const subData = {
      id: 'sub-1',
      startDate: new Date('2025-01-01'),
      validUntil: new Date('2026-01-01'),
      status: 'ACTIVE',
      isLifetime: false,
      isTrial: false,
      createdAt: new Date('2025-01-01'),
      user: { name: 'Alice', email: 'alice@example.com' },
      plan: { name: 'Starter', priceCents: 2990 },
    };
    mockPrisma.subscription.findMany.mockResolvedValue([subData]);

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    const { generateCSV } = await import('../../src/services/exportService');
    await AdminSubscriptionsController.exportSubscriptions(req, res);

    expect(generateCSV).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sub-1',
          userName: 'Alice',
          userEmail: 'alice@example.com',
          planName: 'Starter',
          status: 'ACTIVE',
        }),
      ]),
      expect.any(Object),
      expect.any(String)
    );
  });

  it('should call logAdminAction with SUBSCRIPTIONS_EXPORTED action', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.subscription.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    await AdminSubscriptionsController.exportSubscriptions(req, res);

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SUBSCRIPTIONS_EXPORTED',
        adminId: 'admin-1',
      })
    );
  });

  it('should return 500 on unexpected error', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    await AdminSubscriptionsController.exportSubscriptions(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao exportar subscriptions' });
  });
});

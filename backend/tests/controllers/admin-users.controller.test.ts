import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for AdminUsersController
 *
 * Tests:
 * - listUsers: pagination, filters (status/role/email), success and error cases
 * - getUserDetails: found, not found, stats calculation, error case
 * - blockUser: success (with subscription/monitor cancellation), already blocked, admin not found, user not found, error
 * - unblockUser: success, already unblocked, admin not found, user not found, error
 * - exportUsers: success with CSV response, admin not found, error
 */

// ============================================
// Mocks (hoisted)
// ============================================

const { mockPrisma, mockExportService } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    subscription: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    monitor: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
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
    USER_UPDATED: 'USER_UPDATED',
    USER_DELETED: 'USER_DELETED',
    USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
    SUBSCRIPTION_UPDATED: 'SUBSCRIPTION_UPDATED',
    SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
    MONITOR_DEACTIVATED: 'MONITOR_DEACTIVATED',
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
import { AdminUsersController } from '../../src/controllers/admin-users.controller';
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

const MOCK_USER_LIST = [
  {
    id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'USER',
    isActive: true,
    blocked: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    cpfLast4: '1234',
    subscriptions: [
      {
        id: 'sub-1',
        status: 'ACTIVE',
        validUntil: new Date('2026-01-01'),
        plan: { name: 'Starter', priceCents: 2990 },
      },
    ],
    _count: { monitors: 3 },
  },
];

const MOCK_USER_DETAILS = {
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
  role: 'USER',
  isActive: true,
  blocked: false,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  cpfLast4: '1234',
  subscriptions: [
    { id: 'sub-1', status: 'ACTIVE', validUntil: new Date('2026-01-01'), createdAt: new Date(), updatedAt: new Date(), plan: { name: 'Starter', priceCents: 2990, maxMonitors: 5 } },
  ],
  monitors: [
    { id: 'mon-1', site: 'OLX', keywords: ['sofa'], active: true, createdAt: new Date(), lastCheckedAt: new Date() },
    { id: 'mon-2', site: 'OLX', keywords: ['mesa'], active: false, createdAt: new Date(), lastCheckedAt: null },
  ],
  usageLogs: [
    { id: 'log-1', action: 'LOGIN', createdAt: new Date() },
  ],
};

const MOCK_USER_WITH_RELATIONS = {
  id: 'user-1',
  email: 'alice@example.com',
  blocked: false,
  subscriptions: [{ id: 'sub-1', status: 'ACTIVE' }],
  monitors: [{ id: 'mon-1', active: true }],
};

// ============================================
// listUsers
// ============================================

describe('AdminUsersController.listUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return paginated users with default pagination', async () => {
    mockPrisma.user.findMany.mockResolvedValue(MOCK_USER_LIST);
    mockPrisma.user.count.mockResolvedValue(1);

    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await AdminUsersController.listUsers(req, res);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      users: MOCK_USER_LIST,
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('should apply pagination query params', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(50);

    const req = createMockReq({ query: { page: '3', limit: '10' } });
    const res = createMockRes();

    await AdminUsersController.listUsers(req, res);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: { total: 50, page: 3, limit: 10, totalPages: 5 },
      })
    );
  });

  it('should filter by status=blocked', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);

    const req = createMockReq({ query: { status: 'blocked' } });
    const res = createMockRes();

    await AdminUsersController.listUsers(req, res);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { blocked: true } })
    );
  });

  it('should filter by status=active', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);

    const req = createMockReq({ query: { status: 'active' } });
    const res = createMockRes();

    await AdminUsersController.listUsers(req, res);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { blocked: false } })
    );
  });

  it('should filter by role', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);

    const req = createMockReq({ query: { role: 'ADMIN' } });
    const res = createMockRes();

    await AdminUsersController.listUsers(req, res);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: 'ADMIN' } })
    );
  });

  it('should filter by email with insensitive contains', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);

    const req = createMockReq({ query: { email: 'alice' } });
    const res = createMockRes();

    await AdminUsersController.listUsers(req, res);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { contains: 'alice', mode: 'insensitive' } },
      })
    );
  });

  it('should apply multiple filters together', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);

    const req = createMockReq({ query: { status: 'active', role: 'USER', email: 'test' } });
    const res = createMockRes();

    await AdminUsersController.listUsers(req, res);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          blocked: false,
          role: 'USER',
          email: { contains: 'test', mode: 'insensitive' },
        },
      })
    );
  });

  it('should calculate totalPages correctly', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(45);

    const req = createMockReq({ query: { limit: '10' } });
    const res = createMockRes();

    await AdminUsersController.listUsers(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({ totalPages: 5 }),
      })
    );
  });

  it('should return 500 on database error', async () => {
    mockPrisma.user.findMany.mockRejectedValue(new Error('DB connection error'));

    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await AdminUsersController.listUsers(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao listar usuários' });
  });
});

// ============================================
// getUserDetails
// ============================================

describe('AdminUsersController.getUserDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return user details with computed stats', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER_DETAILS);

    const req = createMockReq({ params: { id: 'user-1' } });
    const res = createMockRes();

    await AdminUsersController.getUserDetails(req, res);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } })
    );
    expect(res.json).toHaveBeenCalledWith({
      user: MOCK_USER_DETAILS,
      stats: {
        totalMonitors: 2,
        activeMonitors: 1,
        totalSubscriptions: 1,
        activeSubscription: MOCK_USER_DETAILS.subscriptions[0],
      },
    });
  });

  it('should return stats with null activeSubscription when no ACTIVE subscription exists', async () => {
    const userNoActiveSub = {
      ...MOCK_USER_DETAILS,
      subscriptions: [
        { id: 'sub-x', status: 'EXPIRED', validUntil: null, createdAt: new Date(), updatedAt: new Date(), plan: { name: 'Starter', priceCents: 2990, maxMonitors: 5 } },
      ],
    };
    mockPrisma.user.findUnique.mockResolvedValue(userNoActiveSub);

    const req = createMockReq({ params: { id: 'user-1' } });
    const res = createMockRes();

    await AdminUsersController.getUserDetails(req, res);

    const response = (res.json as any).mock.calls[0][0];
    expect(response.stats.activeSubscription).toBeNull();
  });

  it('should return stats with zero monitors', async () => {
    const userNoMonitors = { ...MOCK_USER_DETAILS, monitors: [] };
    mockPrisma.user.findUnique.mockResolvedValue(userNoMonitors);

    const req = createMockReq({ params: { id: 'user-1' } });
    const res = createMockRes();

    await AdminUsersController.getUserDetails(req, res);

    const response = (res.json as any).mock.calls[0][0];
    expect(response.stats.totalMonitors).toBe(0);
    expect(response.stats.activeMonitors).toBe(0);
  });

  it('should return 404 when user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const req = createMockReq({ params: { id: 'non-existent' } });
    const res = createMockRes();

    await AdminUsersController.getUserDetails(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Usuário não encontrado' });
  });

  it('should return 500 on database error', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({ params: { id: 'user-1' } });
    const res = createMockRes();

    await AdminUsersController.getUserDetails(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao buscar detalhes do usuário' });
  });
});

// ============================================
// blockUser
// ============================================

describe('AdminUsersController.blockUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should block user and cancel subscriptions and monitors', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(MOCK_ADMIN) // admin lookup
      .mockResolvedValueOnce(MOCK_USER_WITH_RELATIONS); // user lookup

    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: { update: vi.fn() },
        subscription: { updateMany: vi.fn() },
        monitor: { updateMany: vi.fn() },
      };
      await fn(tx);
    });

    const req = createMockReq({ params: { id: 'user-1' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.blockUser(req, res);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Usuário bloqueado com sucesso',
        user: expect.objectContaining({ blocked: true }),
        actions: expect.objectContaining({
          subscriptionsCancelled: 1,
          monitorsDeactivated: 1,
        }),
      })
    );
  });

  it('should block user without subscriptions or monitors', async () => {
    const userNoRelations = { ...MOCK_USER_WITH_RELATIONS, subscriptions: [], monitors: [] };
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(MOCK_ADMIN)
      .mockResolvedValueOnce(userNoRelations);

    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: { update: vi.fn() },
        subscription: { updateMany: vi.fn() },
        monitor: { updateMany: vi.fn() },
      };
      await fn(tx);
    });

    const req = createMockReq({ params: { id: 'user-1' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.blockUser(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: { subscriptionsCancelled: 0, monitorsDeactivated: 0 },
      })
    );
  });

  it('should return 401 when admin is not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    const req = createMockReq({ params: { id: 'user-1' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.blockUser(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin não encontrado' });
  });

  it('should return 404 when user is not found', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(MOCK_ADMIN)
      .mockResolvedValueOnce(null);

    const req = createMockReq({ params: { id: 'nonexistent' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.blockUser(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Usuário não encontrado' });
  });

  it('should return 400 when user is already blocked', async () => {
    const blockedUser = { ...MOCK_USER_WITH_RELATIONS, blocked: true };
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(MOCK_ADMIN)
      .mockResolvedValueOnce(blockedUser);

    const req = createMockReq({ params: { id: 'user-1' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.blockUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Usuário já está bloqueado' });
  });

  it('should call logAdminAction with correct params on success', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(MOCK_ADMIN)
      .mockResolvedValueOnce(MOCK_USER_WITH_RELATIONS);

    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: { update: vi.fn() },
        subscription: { updateMany: vi.fn() },
        monitor: { updateMany: vi.fn() },
      };
      await fn(tx);
    });

    const req = createMockReq({ params: { id: 'user-1' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.blockUser(req, res);

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        adminEmail: MOCK_ADMIN.email,
        action: 'USER_BLOCKED',
        targetId: 'user-1',
      })
    );
  });

  it('should return 500 on unexpected error', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({ params: { id: 'user-1' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.blockUser(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao bloquear usuário' });
  });
});

// ============================================
// unblockUser
// ============================================

describe('AdminUsersController.unblockUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should unblock a blocked user successfully', async () => {
    const blockedUser = { id: 'user-1', email: 'alice@example.com', blocked: true };
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(MOCK_ADMIN) // admin lookup
      .mockResolvedValueOnce(blockedUser); // user lookup
    mockPrisma.user.update.mockResolvedValue({ ...blockedUser, blocked: false });

    const req = createMockReq({ params: { id: 'user-1' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.unblockUser(req, res);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { blocked: false },
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Usuário desbloqueado com sucesso',
        user: expect.objectContaining({ blocked: false }),
      })
    );
  });

  it('should return 401 when admin is not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    const req = createMockReq({ params: { id: 'user-1' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.unblockUser(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin não encontrado' });
  });

  it('should return 404 when user is not found', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(MOCK_ADMIN)
      .mockResolvedValueOnce(null);

    const req = createMockReq({ params: { id: 'nonexistent' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.unblockUser(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Usuário não encontrado' });
  });

  it('should return 400 when user is not blocked', async () => {
    const activeUser = { id: 'user-1', email: 'alice@example.com', blocked: false };
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(MOCK_ADMIN)
      .mockResolvedValueOnce(activeUser);

    const req = createMockReq({ params: { id: 'user-1' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.unblockUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Usuário não está bloqueado' });
  });

  it('should call logAdminAction with USER_UNBLOCKED action', async () => {
    const blockedUser = { id: 'user-1', email: 'alice@example.com', blocked: true };
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(MOCK_ADMIN)
      .mockResolvedValueOnce(blockedUser);
    mockPrisma.user.update.mockResolvedValue({ ...blockedUser, blocked: false });

    const req = createMockReq({ params: { id: 'user-1' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.unblockUser(req, res);

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_UNBLOCKED',
        targetId: 'user-1',
        beforeData: { blocked: true },
        afterData: { blocked: false },
      })
    );
  });

  it('should return 500 on unexpected error', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({ params: { id: 'user-1' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.unblockUser(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao desbloquear usuário' });
  });
});

// ============================================
// exportUsers
// ============================================

describe('AdminUsersController.exportUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore exportService mock implementations after mockReset
    mockExportService.generateCSV.mockReturnValue({ csv: 'id,name\n1,Test', filename: 'usuarios_test.csv' });
    mockExportService.getTimestamp.mockReturnValue('20260101_1200');
    mockExportService.formatCurrency.mockReturnValue('R$ 99,90');
  });

  it('should return CSV file with correct headers and content', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'USER',
        isActive: true,
        blocked: false,
        createdAt: new Date(),
        cpfLast4: '1234',
        subscriptions: [{ plan: { name: 'Starter' } }],
      },
    ]);

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.exportUsers(req, res);

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

    await AdminUsersController.exportUsers(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin não encontrado' });
  });

  it('should apply status=blocked filter in export', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: { status: 'blocked' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.exportUsers(req, res);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { blocked: true } })
    );
  });

  it('should apply status=active filter in export', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: { status: 'active' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.exportUsers(req, res);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { blocked: false } })
    );
  });

  it('should apply role and email filters in export', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: { role: 'ADMIN', email: 'test' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.exportUsers(req, res);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: 'ADMIN',
          email: { contains: 'test', mode: 'insensitive' },
        },
      })
    );
  });

  it('should use "Nenhum" as plan when user has no subscription', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'user-2',
        name: 'Bob',
        email: 'bob@example.com',
        role: 'USER',
        isActive: true,
        blocked: false,
        createdAt: new Date(),
        cpfLast4: null,
        subscriptions: [], // no subscription
      },
    ]);

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    // We verify the CSV generation is called with 'Nenhum' for currentPlan
    const { generateCSV } = await import('../../src/services/exportService');
    await AdminUsersController.exportUsers(req, res);

    expect(generateCSV).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ currentPlan: 'Nenhum' }),
      ]),
      expect.any(Object),
      expect.any(String)
    );
  });

  it('should call logAdminAction after export', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.exportUsers(req, res);

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USERS_EXPORTED',
        adminId: 'admin-1',
      })
    );
  });

  it('should return 500 on unexpected error', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    await AdminUsersController.exportUsers(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao exportar usuários' });
  });
});

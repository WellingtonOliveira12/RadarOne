import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for AdminMonitorsController
 *
 * Tests:
 * - listMonitors: pagination, filters (userId/site/active), success and error cases
 * - exportMonitors: success with CSV response, admin not found, filters applied, error
 * - getSiteHealth: success, service error
 */

// ============================================
// Mocks (hoisted)
// ============================================

const { mockPrisma, mockExportService } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
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
    MONITOR_DEACTIVATED: 'MONITOR_DEACTIVATED',
    MONITOR_DELETED: 'MONITOR_DELETED',
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

vi.mock('../../src/services/siteHealthService', () => ({
  SiteHealthService: {
    getSiteHealthSummary: vi.fn(),
  },
}));

// Import AFTER mocks
import { AdminMonitorsController } from '../../src/controllers/admin-monitors.controller';
import { logAdminAction } from '../../src/utils/auditLog';
import { SiteHealthService } from '../../src/services/siteHealthService';

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

const MOCK_MONITOR_LIST = [
  {
    id: 'mon-1',
    name: 'Sofa monitor',
    site: 'OLX',
    keywords: ['sofa', 'cadeira'],
    active: true,
    priceMin: 100,
    priceMax: 1000,
    lastCheckedAt: new Date('2026-01-01'),
    createdAt: new Date('2025-01-01'),
    userId: 'user-1',
    user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
  },
  {
    id: 'mon-2',
    name: 'Car monitor',
    site: 'WEBMOTORS',
    keywords: ['hb20'],
    active: false,
    priceMin: null,
    priceMax: null,
    lastCheckedAt: null,
    createdAt: new Date('2025-02-01'),
    userId: 'user-2',
    user: { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
  },
];

const MOCK_SITE_HEALTH = [
  {
    site: 'OLX',
    siteName: 'OLX',
    totalRunsLast24h: 100,
    successRate: 95.0,
    lastRunAt: new Date(),
    lastPageType: 'LIST',
    lastAdsFound: 10,
    consecutiveFailures: 0,
    avgDurationMs: 2500,
    activeMonitorsCount: 15,
    status: 'HEALTHY',
  },
  {
    site: 'FACEBOOK_MARKETPLACE',
    siteName: 'Facebook Marketplace',
    totalRunsLast24h: 0,
    successRate: 0,
    lastRunAt: null,
    lastPageType: null,
    lastAdsFound: 0,
    consecutiveFailures: 0,
    avgDurationMs: 0,
    activeMonitorsCount: 0,
    status: 'NO_DATA',
  },
];

// ============================================
// listMonitors
// ============================================

describe('AdminMonitorsController.listMonitors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return paginated monitors with default pagination', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue(MOCK_MONITOR_LIST);
    mockPrisma.monitor.count.mockResolvedValue(2);

    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await AdminMonitorsController.listMonitors(req, res);

    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      monitors: MOCK_MONITOR_LIST,
      pagination: { total: 2, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('should apply pagination query params', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitor.count.mockResolvedValue(50);

    const req = createMockReq({ query: { page: '2', limit: '15' } });
    const res = createMockRes();

    await AdminMonitorsController.listMonitors(req, res);

    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 15, take: 15 })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: { total: 50, page: 2, limit: 15, totalPages: 4 },
      })
    );
  });

  it('should filter by userId', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitor.count.mockResolvedValue(0);

    const req = createMockReq({ query: { userId: 'user-1' } });
    const res = createMockRes();

    await AdminMonitorsController.listMonitors(req, res);

    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
  });

  it('should filter by site with insensitive contains', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitor.count.mockResolvedValue(0);

    const req = createMockReq({ query: { site: 'olx' } });
    const res = createMockRes();

    await AdminMonitorsController.listMonitors(req, res);

    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { site: { contains: 'olx', mode: 'insensitive' } },
      })
    );
  });

  it('should filter active=true', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitor.count.mockResolvedValue(0);

    const req = createMockReq({ query: { active: 'true' } });
    const res = createMockRes();

    await AdminMonitorsController.listMonitors(req, res);

    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } })
    );
  });

  it('should filter active=false', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitor.count.mockResolvedValue(0);

    const req = createMockReq({ query: { active: 'false' } });
    const res = createMockRes();

    await AdminMonitorsController.listMonitors(req, res);

    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: false } })
    );
  });

  it('should not apply active filter when not in query', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitor.count.mockResolvedValue(0);

    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await AdminMonitorsController.listMonitors(req, res);

    // where should be empty object (no active filter)
    const callArgs = mockPrisma.monitor.findMany.mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty('active');
  });

  it('should apply multiple filters together', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitor.count.mockResolvedValue(0);

    const req = createMockReq({ query: { userId: 'user-5', site: 'facebook', active: 'true' } });
    const res = createMockRes();

    await AdminMonitorsController.listMonitors(req, res);

    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-5',
          site: { contains: 'facebook', mode: 'insensitive' },
          active: true,
        },
      })
    );
  });

  it('should include user relation in the query', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitor.count.mockResolvedValue(0);

    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await AdminMonitorsController.listMonitors(req, res);

    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          user: expect.any(Object),
        }),
      })
    );
  });

  it('should calculate totalPages correctly', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitor.count.mockResolvedValue(35);

    const req = createMockReq({ query: { limit: '10' } });
    const res = createMockRes();

    await AdminMonitorsController.listMonitors(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({ totalPages: 4 }),
      })
    );
  });

  it('should return 500 on database error', async () => {
    mockPrisma.monitor.findMany.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await AdminMonitorsController.listMonitors(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao listar monitores' });
  });
});

// ============================================
// exportMonitors
// ============================================

describe('AdminMonitorsController.exportMonitors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore exportService mock implementations after mockReset
    mockExportService.generateCSV.mockReturnValue({ csv: 'id,site\nmon-1,OLX', filename: 'monitores_test.csv' });
    mockExportService.getTimestamp.mockReturnValue('20260101_1200');
    mockExportService.formatCurrency.mockReturnValue('R$ 0,00');
  });

  it('should return CSV file with correct headers', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.monitor.findMany.mockResolvedValue(MOCK_MONITOR_LIST);

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    await AdminMonitorsController.exportMonitors(req, res);

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

    await AdminMonitorsController.exportMonitors(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin não encontrado' });
  });

  it('should apply userId filter in export', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.monitor.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: { userId: 'user-1' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminMonitorsController.exportMonitors(req, res);

    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
  });

  it('should apply site filter in export', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.monitor.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: { site: 'olx' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminMonitorsController.exportMonitors(req, res);

    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { site: { contains: 'olx', mode: 'insensitive' } },
      })
    );
  });

  it('should apply active=true filter in export', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.monitor.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: { active: 'true' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminMonitorsController.exportMonitors(req, res);

    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } })
    );
  });

  it('should apply active=false filter in export', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.monitor.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: { active: 'false' }, userId: 'admin-1' });
    const res = createMockRes();

    await AdminMonitorsController.exportMonitors(req, res);

    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: false } })
    );
  });

  it('should call generateCSV with correct monitor data shape', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.monitor.findMany.mockResolvedValue([MOCK_MONITOR_LIST[0]]);

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    const { generateCSV } = await import('../../src/services/exportService');
    await AdminMonitorsController.exportMonitors(req, res);

    expect(generateCSV).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'mon-1',
          userName: 'Alice',
          userEmail: 'alice@example.com',
          name: 'Sofa monitor',
          site: 'OLX',
          active: true,
          keywords: ['sofa', 'cadeira'],
          priceMin: 100,
          priceMax: 1000,
        }),
      ]),
      expect.any(Object),
      expect.any(String)
    );
  });

  it('should use empty string for null priceMin/priceMax/lastCheckedAt', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.monitor.findMany.mockResolvedValue([MOCK_MONITOR_LIST[1]]); // mon-2 has nulls

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    const { generateCSV } = await import('../../src/services/exportService');
    await AdminMonitorsController.exportMonitors(req, res);

    expect(generateCSV).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          priceMin: '',
          priceMax: '',
          lastCheckedAt: '',
        }),
      ]),
      expect.any(Object),
      expect.any(String)
    );
  });

  it('should call logAdminAction with MONITORS_EXPORTED action', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.monitor.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    await AdminMonitorsController.exportMonitors(req, res);

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MONITORS_EXPORTED',
        adminId: 'admin-1',
        targetType: 'MONITOR',
      })
    );
  });

  it('should include BOM character in CSV response', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_ADMIN);
    mockPrisma.monitor.findMany.mockResolvedValue([]);

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    await AdminMonitorsController.exportMonitors(req, res);

    const sendCall = (res.send as any).mock.calls[0][0];
    expect(sendCall).toMatch(/^\ufeff/);
  });

  it('should return 500 on unexpected error', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({ query: {}, userId: 'admin-1' });
    const res = createMockRes();

    await AdminMonitorsController.exportMonitors(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao exportar monitores' });
  });
});

// ============================================
// getSiteHealth
// ============================================

describe('AdminMonitorsController.getSiteHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return site health summary successfully', async () => {
    vi.mocked(SiteHealthService.getSiteHealthSummary).mockResolvedValue(MOCK_SITE_HEALTH as any);

    const req = createMockReq({});
    const res = createMockRes();

    await AdminMonitorsController.getSiteHealth(req, res);

    expect(SiteHealthService.getSiteHealthSummary).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith(MOCK_SITE_HEALTH);
  });

  it('should return health data with HEALTHY and NO_DATA statuses', async () => {
    vi.mocked(SiteHealthService.getSiteHealthSummary).mockResolvedValue(MOCK_SITE_HEALTH as any);

    const req = createMockReq({});
    const res = createMockRes();

    await AdminMonitorsController.getSiteHealth(req, res);

    const response = (res.json as any).mock.calls[0][0];
    expect(response).toHaveLength(2);
    expect(response[0].status).toBe('HEALTHY');
    expect(response[1].status).toBe('NO_DATA');
  });

  it('should return 500 when SiteHealthService throws', async () => {
    vi.mocked(SiteHealthService.getSiteHealthSummary).mockRejectedValue(
      new Error('Health service error')
    );

    const req = createMockReq({});
    const res = createMockRes();

    await AdminMonitorsController.getSiteHealth(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao buscar saude dos sites' });
  });

  it('should return empty array when no sites have data', async () => {
    vi.mocked(SiteHealthService.getSiteHealthSummary).mockResolvedValue([]);

    const req = createMockReq({});
    const res = createMockRes();

    await AdminMonitorsController.getSiteHealth(req, res);

    expect(res.json).toHaveBeenCalledWith([]);
  });
});

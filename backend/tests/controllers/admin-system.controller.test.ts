import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================
// Mocks (hoisted)
// ============================================

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    subscription: {
      groupBy: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    monitor: {
      count: vi.fn(),
    },
    webhookLog: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
    },
    coupon: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    jobRun: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    systemSetting: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    adminAlert: {
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    monitorLog: {
      count: vi.fn(),
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
    SYSTEM_SETTING_UPDATED: 'SYSTEM_SETTING_UPDATED',
    ALERT_MARKED_READ: 'ALERT_MARKED_READ',
    AUDIT_LOGS_EXPORTED: 'AUDIT_LOGS_EXPORTED',
    ALERTS_EXPORTED: 'ALERTS_EXPORTED',
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

const { mockGenerateCSV, mockGetTimestamp } = vi.hoisted(() => ({
  mockGenerateCSV: vi.fn(),
  mockGetTimestamp: vi.fn(),
}));

vi.mock('../../src/services/exportService', () => ({
  generateCSV: mockGenerateCSV,
  getTimestamp: mockGetTimestamp,
}));

// Import AFTER mocks
import { AdminSystemController } from '../../src/controllers/admin-system.controller';

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

// ============================================
// Tests
// ============================================

describe('AdminSystemController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set mock implementations after mockReset (vitest config: mockReset: true)
    mockGenerateCSV.mockReturnValue({ csv: 'id,action\n1,TEST', filename: 'export.csv' });
    mockGetTimestamp.mockReturnValue('2026-01-01');
  });

  // ─────────────────────────────────────────
  // getSystemStats
  // ─────────────────────────────────────────

  describe('getSystemStats', () => {
    it('should return system statistics successfully', async () => {
      const req = createMockReq();
      const res = createMockRes();

      mockPrisma.user.count.mockResolvedValueOnce(100)  // totalUsers
        .mockResolvedValueOnce(5)                        // blockedUsers
        .mockResolvedValueOnce(90);                      // activeUsers

      mockPrisma.subscription.groupBy
        .mockResolvedValueOnce([
          { status: 'ACTIVE', _count: 50 },
          { status: 'CANCELLED', _count: 10 },
        ])
        .mockResolvedValueOnce([
          { planId: 'plan-1', _count: 30 },
          { planId: 'plan-2', _count: 20 },
        ]);

      mockPrisma.monitor.count
        .mockResolvedValueOnce(200)  // totalMonitors
        .mockResolvedValueOnce(180); // activeMonitors

      mockPrisma.webhookLog.count.mockResolvedValueOnce(15);

      mockPrisma.coupon.count
        .mockResolvedValueOnce(40)  // totalCoupons
        .mockResolvedValueOnce(30)  // activeCoupons
        .mockResolvedValueOnce(20)  // usedCoupons
        .mockResolvedValueOnce(5);  // expiringCoupons

      mockPrisma.subscription.findMany.mockResolvedValueOnce([
        { plan: { priceCents: 2990 } },
        { plan: { priceCents: 4990 } },
      ]);

      mockPrisma.plan.findUnique
        .mockResolvedValueOnce({ id: 'plan-1', name: 'PRO', priceCents: 2990 })
        .mockResolvedValueOnce({ id: 'plan-2', name: 'STARTER', priceCents: 1990 });

      mockPrisma.coupon.findMany.mockResolvedValueOnce([
        {
          code: 'PROMO10',
          description: 'Promo',
          usedCount: 10,
          discountType: 'PERCENTAGE',
          discountValue: 10,
          _count: { usageLogs: 10 },
        },
      ]);

      await AdminSystemController.getSystemStats(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          users: {
            total: 100,
            active: 90,
            blocked: 5,
          },
          monitors: {
            total: 200,
            active: 180,
            inactive: 20,
          },
          webhooks: {
            last7Days: 15,
          },
          coupons: expect.objectContaining({
            total: 40,
            active: 30,
            inactive: 10,
            used: 20,
            expiringSoon: 5,
          }),
        })
      );
    });

    it('should return 500 on database error', async () => {
      const req = createMockReq();
      const res = createMockRes();

      mockPrisma.user.count.mockRejectedValueOnce(new Error('DB failure'));

      await AdminSystemController.getSystemStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao buscar estatísticas do sistema' });
    });
  });

  // ─────────────────────────────────────────
  // listWebhookLogs
  // ─────────────────────────────────────────

  describe('listWebhookLogs', () => {
    it('should return paginated webhook logs', async () => {
      const req = createMockReq({ query: { page: '1', limit: '10' } });
      const res = createMockRes();

      const fakeLogs = [
        {
          id: 'log-1',
          event: 'purchase.approved',
          createdAt: new Date(),
          processed: true,
          error: null,
          payload: '{"event":"purchase"}',
        },
      ];

      mockPrisma.webhookLog.findMany.mockResolvedValueOnce(fakeLogs);
      mockPrisma.webhookLog.count.mockResolvedValueOnce(1);

      await AdminSystemController.listWebhookLogs(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: {
            total: 1,
            page: 1,
            limit: 10,
            totalPages: 1,
          },
        })
      );
      const call = res.json.mock.calls[0][0];
      expect(call.logs).toHaveLength(1);
      expect(call.logs[0]).toHaveProperty('payloadSummary');
    });

    it('should filter by event and processed status', async () => {
      const req = createMockReq({ query: { event: 'purchase.approved', processed: 'true' } });
      const res = createMockRes();

      mockPrisma.webhookLog.findMany.mockResolvedValueOnce([]);
      mockPrisma.webhookLog.count.mockResolvedValueOnce(0);

      await AdminSystemController.listWebhookLogs(req, res);

      expect(mockPrisma.webhookLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { event: 'purchase.approved', processed: true },
        })
      );
    });

    it('should truncate long payloads in summary', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      const longPayload = 'x'.repeat(300);
      mockPrisma.webhookLog.findMany.mockResolvedValueOnce([
        {
          id: 'log-2',
          event: 'test',
          createdAt: new Date(),
          processed: false,
          error: null,
          payload: longPayload,
        },
      ]);
      mockPrisma.webhookLog.count.mockResolvedValueOnce(1);

      await AdminSystemController.listWebhookLogs(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.logs[0].payloadSummary).toHaveLength(203); // 200 chars + '...'
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      mockPrisma.webhookLog.findMany.mockRejectedValueOnce(new Error('DB error'));

      await AdminSystemController.listWebhookLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao listar logs de webhooks' });
    });
  });

  // ─────────────────────────────────────────
  // listJobRuns
  // ─────────────────────────────────────────

  describe('listJobRuns', () => {
    it('should return paginated job runs with stats', async () => {
      const req = createMockReq({ query: { page: '1', pageSize: '10' } });
      const res = createMockRes();

      const fakeRuns = [
        {
          id: 'run-1',
          jobName: 'checkTrialExpiring',
          status: 'SUCCESS',
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 500,
          processedCount: 5,
          successCount: 5,
          errorCount: 0,
          summary: 'OK',
          errorMessage: null,
          triggeredBy: 'cron',
          metadata: null,
        },
      ];

      mockPrisma.jobRun.findMany.mockResolvedValueOnce(fakeRuns);
      mockPrisma.jobRun.count.mockResolvedValueOnce(1);
      mockPrisma.jobRun.groupBy.mockResolvedValueOnce([
        { status: 'SUCCESS', _count: 5 },
        { status: 'FAILED', _count: 1 },
      ]);

      await AdminSystemController.listJobRuns(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.data).toHaveLength(1);
      expect(call.data[0].displayName).toBe('Verificar Trials Expirando');
      expect(call.stats.last7Days.success).toBe(5);
      expect(call.stats.last7Days.failed).toBe(1);
      expect(call.pagination.total).toBe(1);
    });

    it('should filter by jobName and status', async () => {
      const req = createMockReq({ query: { jobName: 'resetMonthlyQueries', status: 'SUCCESS' } });
      const res = createMockRes();

      mockPrisma.jobRun.findMany.mockResolvedValueOnce([]);
      mockPrisma.jobRun.count.mockResolvedValueOnce(0);
      mockPrisma.jobRun.groupBy.mockResolvedValueOnce([]);

      await AdminSystemController.listJobRuns(req, res);

      expect(mockPrisma.jobRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jobName: 'resetMonthlyQueries', status: 'SUCCESS' },
        })
      );
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      mockPrisma.jobRun.findMany.mockRejectedValueOnce(new Error('DB error'));

      await AdminSystemController.listJobRuns(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao listar execuções de jobs' });
    });
  });

  // ─────────────────────────────────────────
  // listAuditLogs
  // ─────────────────────────────────────────

  describe('listAuditLogs', () => {
    it('should return paginated audit logs', async () => {
      const req = createMockReq({ query: { page: '2', limit: '5' } });
      const res = createMockRes();

      mockPrisma.auditLog.findMany.mockResolvedValueOnce([
        { id: 'audit-1', action: 'USER_BLOCKED', adminEmail: 'admin@test.com', createdAt: new Date() },
      ]);
      mockPrisma.auditLog.count.mockResolvedValueOnce(6);

      await AdminSystemController.listAuditLogs(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: {
            total: 6,
            page: 2,
            limit: 5,
            totalPages: 2,
          },
        })
      );
    });

    it('should apply filters for adminId, action, targetType, startDate, endDate', async () => {
      const req = createMockReq({
        query: {
          adminId: 'admin-42',
          action: 'COUPON_CREATED',
          targetType: 'COUPON',
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        },
      });
      const res = createMockRes();

      mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
      mockPrisma.auditLog.count.mockResolvedValueOnce(0);

      await AdminSystemController.listAuditLogs(req, res);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            adminId: 'admin-42',
            action: 'COUPON_CREATED',
            targetType: 'COUPON',
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      mockPrisma.auditLog.findMany.mockRejectedValueOnce(new Error('DB error'));

      await AdminSystemController.listAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao listar audit logs' });
    });
  });

  // ─────────────────────────────────────────
  // listSettings
  // ─────────────────────────────────────────

  describe('listSettings', () => {
    it('should return all settings', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      const fakeSettings = [
        { key: 'maintenance_mode', value: 'false', category: 'GENERAL' },
        { key: 'max_monitors', value: '10', category: 'LIMITS' },
      ];
      mockPrisma.systemSetting.findMany.mockResolvedValueOnce(fakeSettings);

      await AdminSystemController.listSettings(req, res);

      expect(res.json).toHaveBeenCalledWith({ settings: fakeSettings });
    });

    it('should filter by category', async () => {
      const req = createMockReq({ query: { category: 'LIMITS' } });
      const res = createMockRes();

      mockPrisma.systemSetting.findMany.mockResolvedValueOnce([
        { key: 'max_monitors', value: '10', category: 'LIMITS' },
      ]);

      await AdminSystemController.listSettings(req, res);

      expect(mockPrisma.systemSetting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { category: 'LIMITS' },
        })
      );
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      mockPrisma.systemSetting.findMany.mockRejectedValueOnce(new Error('DB error'));

      await AdminSystemController.listSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao listar configurações do sistema' });
    });
  });

  // ─────────────────────────────────────────
  // updateSetting
  // ─────────────────────────────────────────

  describe('updateSetting', () => {
    it('should update an existing setting and return it', async () => {
      const req = createMockReq({
        params: { key: 'maintenance_mode' },
        body: { value: 'true' },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ email: 'admin@test.com' });
      mockPrisma.systemSetting.findUnique.mockResolvedValueOnce({
        key: 'maintenance_mode',
        value: 'false',
      });
      mockPrisma.systemSetting.upsert.mockResolvedValueOnce({
        key: 'maintenance_mode',
        value: 'true',
        updatedBy: 'admin-1',
      });

      await AdminSystemController.updateSetting(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Configuração atualizada com sucesso',
          setting: expect.objectContaining({ value: 'true' }),
        })
      );
    });

    it('should return 400 when value is missing (undefined)', async () => {
      const req = createMockReq({
        params: { key: 'maintenance_mode' },
        body: {},
        userId: 'admin-1',
      });
      const res = createMockRes();

      await AdminSystemController.updateSetting(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Valor é obrigatório' });
    });

    it('should return 401 when admin is not found', async () => {
      const req = createMockReq({
        params: { key: 'maintenance_mode' },
        body: { value: 'true' },
        userId: 'admin-999',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await AdminSystemController.updateSetting(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin não encontrado' });
    });

    it('should accept value of 0 (not treat as missing)', async () => {
      const req = createMockReq({
        params: { key: 'retry_count' },
        body: { value: 0 },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ email: 'admin@test.com' });
      mockPrisma.systemSetting.findUnique.mockResolvedValueOnce(null);
      mockPrisma.systemSetting.upsert.mockResolvedValueOnce({
        key: 'retry_count',
        value: '0',
        updatedBy: 'admin-1',
      });

      await AdminSystemController.updateSetting(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Configuração atualizada com sucesso' })
      );
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({
        params: { key: 'some_key' },
        body: { value: 'val' },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('DB error'));

      await AdminSystemController.updateSetting(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao atualizar configuração' });
    });
  });

  // ─────────────────────────────────────────
  // listAlerts
  // ─────────────────────────────────────────

  describe('listAlerts', () => {
    it('should return alerts with pagination and unread count', async () => {
      const req = createMockReq({ query: { limit: '10', offset: '0' } });
      const res = createMockRes();

      const fakeAlerts = [
        { id: 'alert-1', type: 'COUPON_EXPIRING', severity: 'WARNING', isRead: false, createdAt: new Date() },
      ];

      mockPrisma.adminAlert.findMany.mockResolvedValueOnce(fakeAlerts);
      mockPrisma.adminAlert.count
        .mockResolvedValueOnce(1)   // total
        .mockResolvedValueOnce(1);  // unreadCount

      await AdminSystemController.listAlerts(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          alerts: fakeAlerts,
          total: 1,
          unreadCount: 1,
          pagination: {
            limit: 10,
            offset: 0,
            hasMore: false,
          },
        })
      );
    });

    it('should filter by type, severity, and isRead', async () => {
      const req = createMockReq({ query: { type: 'COUPON_EXPIRING', severity: 'WARNING', isRead: 'false' } });
      const res = createMockRes();

      mockPrisma.adminAlert.findMany.mockResolvedValueOnce([]);
      mockPrisma.adminAlert.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      await AdminSystemController.listAlerts(req, res);

      expect(mockPrisma.adminAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: 'COUPON_EXPIRING', severity: 'WARNING', isRead: false },
        })
      );
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      mockPrisma.adminAlert.findMany.mockRejectedValueOnce(new Error('DB error'));

      await AdminSystemController.listAlerts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao listar alertas' });
    });
  });

  // ─────────────────────────────────────────
  // markAlertAsRead
  // ─────────────────────────────────────────

  describe('markAlertAsRead', () => {
    it('should mark alert as read and return it', async () => {
      const req = createMockReq({ params: { id: 'alert-1' }, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ email: 'admin@test.com' });
      mockPrisma.adminAlert.update.mockResolvedValueOnce({
        id: 'alert-1',
        type: 'COUPON_EXPIRING',
        severity: 'WARNING',
        isRead: true,
        readBy: 'admin-1',
        readAt: new Date(),
      });

      await AdminSystemController.markAlertAsRead(req, res);

      expect(mockPrisma.adminAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'alert-1' },
          data: expect.objectContaining({ isRead: true, readBy: 'admin-1' }),
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Alerta marcado como lido' })
      );
    });

    it('should return 401 when admin not found', async () => {
      const req = createMockReq({ params: { id: 'alert-1' }, userId: 'admin-999' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await AdminSystemController.markAlertAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin não encontrado' });
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ params: { id: 'alert-1' }, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('DB error'));

      await AdminSystemController.markAlertAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao marcar alerta como lido' });
    });
  });

  // ─────────────────────────────────────────
  // getUnreadAlertsCount
  // ─────────────────────────────────────────

  describe('getUnreadAlertsCount', () => {
    it('should return count of unread alerts', async () => {
      const req = createMockReq();
      const res = createMockRes();

      mockPrisma.adminAlert.count.mockResolvedValueOnce(7);

      await AdminSystemController.getUnreadAlertsCount(req, res);

      expect(res.json).toHaveBeenCalledWith({ count: 7 });
    });

    it('should return 500 on error', async () => {
      const req = createMockReq();
      const res = createMockRes();

      mockPrisma.adminAlert.count.mockRejectedValueOnce(new Error('DB error'));

      await AdminSystemController.getUnreadAlertsCount(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao obter contagem de alertas' });
    });
  });

  // ─────────────────────────────────────────
  // getTemporalStats
  // ─────────────────────────────────────────

  describe('getTemporalStats', () => {
    it('should return temporal stats for 7-day period', async () => {
      const req = createMockReq({ query: { period: '7' } });
      const res = createMockRes();

      // Set up all the parallel count calls (16 in Promise.all + 4 more after)
      mockPrisma.user.count
        .mockResolvedValueOnce(10)   // newUsersCurrentPeriod
        .mockResolvedValueOnce(8)    // newUsersPreviousPeriod
        .mockResolvedValueOnce(100)  // totalUsersCurrent
        .mockResolvedValueOnce(90);  // totalUsersPrevious

      mockPrisma.monitor.count
        .mockResolvedValueOnce(5)    // newMonitorsCurrentPeriod
        .mockResolvedValueOnce(3)    // newMonitorsPreviousPeriod
        .mockResolvedValueOnce(80)   // activeMonitorsCurrent
        .mockResolvedValueOnce(75);  // activeMonitorsPrevious

      mockPrisma.subscription.count
        .mockResolvedValueOnce(15)   // newSubscriptionsCurrentPeriod
        .mockResolvedValueOnce(12)   // newSubscriptionsPreviousPeriod
        .mockResolvedValueOnce(50)   // activeSubscriptionsCurrent
        .mockResolvedValueOnce(45)   // activeSubscriptionsPrevious
        .mockResolvedValueOnce(2)    // cancelledCurrentPeriod
        .mockResolvedValueOnce(3);   // cancelledPreviousPeriod

      mockPrisma.monitorLog.count
        .mockResolvedValueOnce(200)  // jobsCurrentPeriod
        .mockResolvedValueOnce(180)  // jobsPreviousPeriod
        .mockResolvedValueOnce(190)  // jobsSuccessCurrentPeriod
        .mockResolvedValueOnce(10)   // jobsFailureCurrentPeriod
        .mockResolvedValueOnce(170)  // jobsSuccessPreviousPeriod
        .mockResolvedValueOnce(10);  // jobsFailurePreviousPeriod

      await AdminSystemController.getTemporalStats(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.period).toBe(7);
      expect(call.users).toBeDefined();
      expect(call.monitors).toBeDefined();
      expect(call.subscriptions).toBeDefined();
      expect(call.jobs).toBeDefined();
      expect(call.users.current.total).toBe(100);
      expect(call.jobs.current.errorRate).toBeCloseTo(5);
    });

    it('should return 400 for invalid period', async () => {
      const req = createMockReq({ query: { period: '15' } });
      const res = createMockRes();

      await AdminSystemController.getTemporalStats(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Período inválido. Use 7, 30, 60 ou 90 dias.',
      });
    });

    it('should accept valid periods (30, 60, 90)', async () => {
      for (const period of ['30', '60', '90']) {
        vi.clearAllMocks();

        const req = createMockReq({ query: { period } });
        const res = createMockRes();

        // Mock all counts to return 0
        mockPrisma.user.count.mockResolvedValue(0);
        mockPrisma.monitor.count.mockResolvedValue(0);
        mockPrisma.subscription.count.mockResolvedValue(0);
        mockPrisma.monitorLog.count.mockResolvedValue(0);

        await AdminSystemController.getTemporalStats(req, res);

        expect(res.json).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalledWith(400);
      }
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ query: { period: '7' } });
      const res = createMockRes();

      mockPrisma.user.count.mockRejectedValueOnce(new Error('DB error'));

      await AdminSystemController.getTemporalStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao buscar estatísticas temporais' });
    });
  });

  // ─────────────────────────────────────────
  // exportAuditLogs
  // ─────────────────────────────────────────

  describe('exportAuditLogs', () => {
    it('should export audit logs as CSV', async () => {
      const req = createMockReq({ query: {}, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ email: 'admin@test.com' });
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([
        {
          id: 'log-1',
          adminEmail: 'admin@test.com',
          action: 'USER_BLOCKED',
          targetType: 'USER',
          targetId: 'user-1',
          ipAddress: '127.0.0.1',
          createdAt: new Date(),
        },
      ]);

      await AdminSystemController.exportAuditLogs(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename=')
      );
      expect(res.send).toHaveBeenCalled();
    });

    it('should return 401 when admin not found', async () => {
      const req = createMockReq({ query: {}, userId: 'admin-999' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await AdminSystemController.exportAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin não encontrado' });
    });

    it('should apply filters in export', async () => {
      const req = createMockReq({
        query: {
          action: 'COUPON_DELETED',
          targetType: 'COUPON',
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        },
        userId: 'admin-1',
      });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ email: 'admin@test.com' });
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);

      await AdminSystemController.exportAuditLogs(req, res);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: 'COUPON_DELETED',
            targetType: 'COUPON',
          }),
        })
      );
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ query: {}, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('DB error'));

      await AdminSystemController.exportAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao exportar audit logs' });
    });
  });

  // ─────────────────────────────────────────
  // exportAlerts
  // ─────────────────────────────────────────

  describe('exportAlerts', () => {
    it('should export alerts as CSV', async () => {
      const req = createMockReq({ query: {}, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ email: 'admin@test.com' });
      mockPrisma.adminAlert.findMany.mockResolvedValueOnce([
        {
          id: 'alert-1',
          type: 'COUPON_EXPIRING',
          severity: 'WARNING',
          title: 'Cupom expirando',
          message: 'Cupom X expira em 3 dias',
          source: 'cron',
          isRead: false,
          readBy: null,
          createdAt: new Date(),
        },
      ]);

      await AdminSystemController.exportAlerts(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(res.send).toHaveBeenCalled();
    });

    it('should return 401 when admin not found', async () => {
      const req = createMockReq({ query: {}, userId: 'admin-999' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await AdminSystemController.exportAlerts(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin não encontrado' });
    });

    it('should return 500 on error', async () => {
      const req = createMockReq({ query: {}, userId: 'admin-1' });
      const res = createMockRes();

      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('DB error'));

      await AdminSystemController.exportAlerts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao exportar alertas' });
    });
  });
});

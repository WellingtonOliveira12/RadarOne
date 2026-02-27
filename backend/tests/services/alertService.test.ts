import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for alertService — alert CRUD with deduplication
 *
 * Cases tested:
 * - createAlert: creates alert, deduplicates unread alerts of same type
 * - createAlertFromType: generates alert with default severity and message
 * - listAlerts: returns alerts with filters (type, severity, isRead)
 * - markAlertAsRead: marks alert as read with admin ID and timestamp
 * - getUnreadCount: returns count of unread alerts
 * - cleanupOldAlerts: deletes old read alerts (90 days)
 */

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    adminAlert: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
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

import {
  createAlert,
  createAlertFromType,
  listAlerts,
  markAlertAsRead,
  getUnreadCount,
  cleanupOldAlerts,
} from '../../src/services/alertService';

// ============================================
// FIXTURES
// ============================================

const MOCK_ALERT = {
  id: 'alert-123',
  type: 'JOB_FAILURE',
  severity: 'ERROR' as const,
  title: 'Job Failed',
  message: 'The scraping job failed.',
  source: 'monitor-runner',
  metadata: null,
  isRead: false,
  readBy: null,
  readAt: null,
  createdAt: new Date('2026-01-15'),
  updatedAt: new Date('2026-01-15'),
};

// ============================================
// createAlert
// ============================================

describe('createAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates alert when no duplicate exists', async () => {
    mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
    mockPrisma.adminAlert.create.mockResolvedValue(MOCK_ALERT);

    const result = await createAlert({
      type: 'JOB_FAILURE',
      severity: 'ERROR',
      title: 'Job Failed',
      message: 'The scraping job failed.',
      source: 'monitor-runner',
    });

    expect(result).toEqual(MOCK_ALERT);
    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith({
      data: {
        type: 'JOB_FAILURE',
        severity: 'ERROR',
        title: 'Job Failed',
        message: 'The scraping job failed.',
        source: 'monitor-runner',
        metadata: undefined,
      },
    });
  });

  it('returns null when duplicate unread alert exists (deduplication)', async () => {
    mockPrisma.adminAlert.findFirst.mockResolvedValue(MOCK_ALERT);

    const result = await createAlert({
      type: 'JOB_FAILURE',
      severity: 'ERROR',
      title: 'Job Failed',
      message: 'The scraping job failed.',
      source: 'monitor-runner',
    });

    expect(result).toBeNull();
    expect(mockPrisma.adminAlert.create).not.toHaveBeenCalled();
  });

  it('creates alert with CRITICAL severity', async () => {
    const criticalAlert = { ...MOCK_ALERT, severity: 'CRITICAL', type: 'SYSTEM_ERROR' };
    mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
    mockPrisma.adminAlert.create.mockResolvedValue(criticalAlert);

    const result = await createAlert({
      type: 'SYSTEM_ERROR',
      severity: 'CRITICAL',
      title: 'System Error',
      message: 'Critical system failure detected.',
    });

    expect(result?.severity).toBe('CRITICAL');
  });

  it('creates alert with WARNING severity', async () => {
    const warningAlert = { ...MOCK_ALERT, severity: 'WARNING', type: 'JOB_DELAYED' };
    mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
    mockPrisma.adminAlert.create.mockResolvedValue(warningAlert);

    const result = await createAlert({
      type: 'JOB_DELAYED',
      severity: 'WARNING',
      title: 'Job Delayed',
      message: 'Job is running late.',
    });

    expect(result?.severity).toBe('WARNING');
  });

  it('creates alert with INFO severity', async () => {
    const infoAlert = { ...MOCK_ALERT, severity: 'INFO', type: 'SUSPICIOUS_ACTIVITY' };
    mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
    mockPrisma.adminAlert.create.mockResolvedValue(infoAlert);

    const result = await createAlert({
      type: 'SUSPICIOUS_ACTIVITY',
      severity: 'INFO',
      title: 'Suspicious Activity',
      message: 'Unusual behavior detected.',
    });

    expect(result?.severity).toBe('INFO');
  });

  it('creates alert with metadata', async () => {
    const metadata = { jobName: 'scrape-ml', errorCode: 'TIMEOUT' };
    mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
    mockPrisma.adminAlert.create.mockResolvedValue({ ...MOCK_ALERT, metadata });

    const result = await createAlert({
      type: 'JOB_FAILURE',
      severity: 'ERROR',
      title: 'Job Failed',
      message: 'Timeout during scraping.',
      metadata,
    });

    expect(result?.metadata).toEqual(metadata);
    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata }),
    });
  });

  it('sets source to null when not provided', async () => {
    mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
    mockPrisma.adminAlert.create.mockResolvedValue({ ...MOCK_ALERT, source: null });

    await createAlert({
      type: 'JOB_FAILURE',
      severity: 'ERROR',
      title: 'Job Failed',
      message: 'Failure.',
    });

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: null }),
    });
  });

  it('throws when prisma create fails', async () => {
    mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
    mockPrisma.adminAlert.create.mockRejectedValue(new Error('DB error'));

    await expect(
      createAlert({
        type: 'JOB_FAILURE',
        severity: 'ERROR',
        title: 'Job Failed',
        message: 'Failure.',
      })
    ).rejects.toThrow('DB error');
  });
});

// ============================================
// createAlertFromType
// ============================================

describe('createAlertFromType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates alert with default severity for JOB_FAILURE (ERROR)', async () => {
    mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
    mockPrisma.adminAlert.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'alert-new', ...args.data, isRead: false })
    );

    await createAlertFromType('JOB_FAILURE', 'cron-job', { jobName: 'scrape-ml' });

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'JOB_FAILURE',
        severity: 'ERROR',
        source: 'cron-job',
      }),
    });
  });

  it('creates alert with default severity for SYSTEM_ERROR (CRITICAL)', async () => {
    mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
    mockPrisma.adminAlert.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'alert-new', ...args.data, isRead: false })
    );

    await createAlertFromType('SYSTEM_ERROR');

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'SYSTEM_ERROR',
        severity: 'CRITICAL',
      }),
    });
  });
});

// ============================================
// listAlerts
// ============================================

describe('listAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns alerts without filters (default limit 50)', async () => {
    const alerts = [MOCK_ALERT];
    mockPrisma.adminAlert.findMany.mockResolvedValue(alerts);
    mockPrisma.adminAlert.count
      .mockResolvedValueOnce(1)  // total
      .mockResolvedValueOnce(1); // unreadCount

    const result = await listAlerts();

    expect(result.alerts).toEqual(alerts);
    expect(result.total).toBe(1);
    expect(result.unreadCount).toBe(1);
    expect(mockPrisma.adminAlert.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip: 0,
    });
  });

  it('filters by type', async () => {
    mockPrisma.adminAlert.findMany.mockResolvedValue([]);
    mockPrisma.adminAlert.count.mockResolvedValue(0);

    await listAlerts({ type: 'JOB_FAILURE' });

    expect(mockPrisma.adminAlert.findMany).toHaveBeenCalledWith({
      where: { type: 'JOB_FAILURE' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip: 0,
    });
  });

  it('filters by severity', async () => {
    mockPrisma.adminAlert.findMany.mockResolvedValue([]);
    mockPrisma.adminAlert.count.mockResolvedValue(0);

    await listAlerts({ severity: 'CRITICAL' });

    expect(mockPrisma.adminAlert.findMany).toHaveBeenCalledWith({
      where: { severity: 'CRITICAL' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip: 0,
    });
  });

  it('filters by isRead', async () => {
    mockPrisma.adminAlert.findMany.mockResolvedValue([]);
    mockPrisma.adminAlert.count.mockResolvedValue(0);

    await listAlerts({ isRead: false });

    expect(mockPrisma.adminAlert.findMany).toHaveBeenCalledWith({
      where: { isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip: 0,
    });
  });

  it('respects limit and offset', async () => {
    mockPrisma.adminAlert.findMany.mockResolvedValue([]);
    mockPrisma.adminAlert.count.mockResolvedValue(0);

    await listAlerts({ limit: 10, offset: 20 });

    expect(mockPrisma.adminAlert.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      take: 10,
      skip: 20,
    });
  });
});

// ============================================
// markAlertAsRead
// ============================================

describe('markAlertAsRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks alert as read with admin ID and timestamp', async () => {
    const readAlert = {
      ...MOCK_ALERT,
      isRead: true,
      readBy: 'admin-1',
      readAt: new Date(),
    };
    mockPrisma.adminAlert.update.mockResolvedValue(readAlert);

    const result = await markAlertAsRead('alert-123', 'admin-1');

    expect(result.isRead).toBe(true);
    expect(result.readBy).toBe('admin-1');
    expect(mockPrisma.adminAlert.update).toHaveBeenCalledWith({
      where: { id: 'alert-123' },
      data: {
        isRead: true,
        readBy: 'admin-1',
        readAt: expect.any(Date),
      },
    });
  });

  it('throws when alert not found', async () => {
    mockPrisma.adminAlert.update.mockRejectedValue(new Error('Record not found'));

    await expect(markAlertAsRead('nonexistent', 'admin-1'))
      .rejects.toThrow('Record not found');
  });
});

// ============================================
// getUnreadCount
// ============================================

describe('getUnreadCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns count of unread alerts', async () => {
    mockPrisma.adminAlert.count.mockResolvedValue(5);

    const count = await getUnreadCount();

    expect(count).toBe(5);
    expect(mockPrisma.adminAlert.count).toHaveBeenCalledWith({
      where: { isRead: false },
    });
  });
});

// ============================================
// cleanupOldAlerts
// ============================================

describe('cleanupOldAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes read alerts older than 90 days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T00:00:00Z'));

    mockPrisma.adminAlert.deleteMany.mockResolvedValue({ count: 12 });

    const count = await cleanupOldAlerts();

    expect(count).toBe(12);
    expect(mockPrisma.adminAlert.deleteMany).toHaveBeenCalledWith({
      where: {
        isRead: true,
        createdAt: {
          lt: expect.any(Date),
        },
      },
    });

    // Verify the date is approximately 90 days before now
    const callArgs = mockPrisma.adminAlert.deleteMany.mock.calls[0][0];
    const cutoffDate = callArgs.where.createdAt.lt;
    const expectedDate = new Date('2026-01-15T00:00:00Z');
    expect(cutoffDate.getTime()).toBe(expectedDate.getTime());

    vi.useRealTimers();
  });

  it('returns 0 when prisma fails', async () => {
    mockPrisma.adminAlert.deleteMany.mockRejectedValue(new Error('DB error'));

    const count = await cleanupOldAlerts();

    expect(count).toBe(0);
  });
});

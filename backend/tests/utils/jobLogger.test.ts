import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for jobLogger utility — startJobRun, completeJobRun, failJobRun, withJobLogging, getJobDisplayName
 *
 * Cases tested:
 * - startJobRun: creates RUNNING record, returns ID
 * - startJobRun: re-throws on prisma error
 * - completeJobRun: updates with SUCCESS status and duration
 * - completeJobRun: sets PARTIAL when both success and errors exist
 * - completeJobRun: sets FAILED when only errors exist
 * - completeJobRun: creates alert when errors > 0
 * - completeJobRun: handles missing jobRun gracefully
 * - failJobRun: updates with FAILED status and error message
 * - failJobRun: creates critical alert
 * - failJobRun: handles missing jobRun gracefully
 * - withJobLogging: orchestrates start + complete on success
 * - withJobLogging: orchestrates start + fail on error, re-throws
 * - getJobDisplayName: returns friendly name for known jobs
 * - getJobDisplayName: returns raw name for unknown jobs
 */

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    jobRun: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    adminAlert: {
      findFirst: vi.fn(),
      create: vi.fn(),
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
  startJobRun,
  completeJobRun,
  failJobRun,
  withJobLogging,
  getJobDisplayName,
  JobNames,
} from '../../src/utils/jobLogger';
import { logInfo, logError, logWarning } from '../../src/utils/loggerHelpers';

describe('startJobRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a RUNNING job record and returns its ID', async () => {
    mockPrisma.jobRun.create.mockResolvedValue({ id: 'run-001' });

    const id = await startJobRun('checkTrialExpiring', 'SCHEDULER');

    expect(mockPrisma.jobRun.create).toHaveBeenCalledWith({
      data: {
        jobName: 'checkTrialExpiring',
        status: 'RUNNING',
        triggeredBy: 'SCHEDULER',
      },
    });
    expect(id).toBe('run-001');
  });

  it('defaults triggeredBy to SCHEDULER', async () => {
    mockPrisma.jobRun.create.mockResolvedValue({ id: 'run-002' });

    await startJobRun('resetMonthlyQueries');

    expect(mockPrisma.jobRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ triggeredBy: 'SCHEDULER' }),
    });
  });

  it('logs job start', async () => {
    mockPrisma.jobRun.create.mockResolvedValue({ id: 'run-003' });

    await startJobRun('checkTrialExpiring', 'MANUAL');

    expect(logInfo).toHaveBeenCalledWith(
      expect.stringContaining('checkTrialExpiring'),
      expect.objectContaining({ jobRunId: 'run-003' }),
    );
  });

  it('re-throws on prisma error', async () => {
    mockPrisma.jobRun.create.mockRejectedValue(new Error('DB down'));

    await expect(startJobRun('checkTrialExpiring')).rejects.toThrow('DB down');
    expect(logError).toHaveBeenCalled();
  });
});

describe('completeJobRun', () => {
  const startedAt = new Date('2026-02-27T10:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no recent alerts
    mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
    mockPrisma.adminAlert.create.mockResolvedValue({ id: 'alert-1' });
  });

  it('updates job with SUCCESS status when no errors', async () => {
    mockPrisma.jobRun.findUnique.mockResolvedValue({
      startedAt,
      jobName: 'checkTrialExpiring',
    });
    mockPrisma.jobRun.update.mockResolvedValue({});

    await completeJobRun('run-001', {
      processedCount: 10,
      successCount: 10,
      errorCount: 0,
      summary: 'All processed',
    });

    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: 'run-001' },
      data: expect.objectContaining({
        status: 'SUCCESS',
        processedCount: 10,
        successCount: 10,
        errorCount: 0,
        summary: 'All processed',
      }),
    });
  });

  it('sets PARTIAL status when both success and errors exist', async () => {
    mockPrisma.jobRun.findUnique.mockResolvedValue({
      startedAt,
      jobName: 'resetMonthlyQueries',
    });
    mockPrisma.jobRun.update.mockResolvedValue({});

    await completeJobRun('run-002', {
      processedCount: 10,
      successCount: 7,
      errorCount: 3,
    });

    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PARTIAL' }),
      }),
    );
  });

  it('sets FAILED status when only errors exist (successCount=0)', async () => {
    mockPrisma.jobRun.findUnique.mockResolvedValue({
      startedAt,
      jobName: 'checkCouponAlerts',
    });
    mockPrisma.jobRun.update.mockResolvedValue({});

    await completeJobRun('run-003', {
      processedCount: 5,
      successCount: 0,
      errorCount: 5,
    });

    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('calculates durationMs from startedAt', async () => {
    const now = new Date('2026-02-27T10:05:00Z'); // 5 min after start
    vi.setSystemTime(now);

    mockPrisma.jobRun.findUnique.mockResolvedValue({
      startedAt,
      jobName: 'checkTrialExpiring',
    });
    mockPrisma.jobRun.update.mockResolvedValue({});

    await completeJobRun('run-004', {
      processedCount: 1,
      successCount: 1,
      errorCount: 0,
    });

    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          durationMs: 5 * 60 * 1000, // 300000ms
        }),
      }),
    );

    vi.setSystemTime(vi.getRealSystemTime());
  });

  it('creates admin alert when errors > 0', async () => {
    mockPrisma.jobRun.findUnique.mockResolvedValue({
      startedAt,
      jobName: 'checkTrialExpiring',
    });
    mockPrisma.jobRun.update.mockResolvedValue({});

    await completeJobRun('run-005', {
      processedCount: 10,
      successCount: 8,
      errorCount: 2,
      summary: '2 errors occurred',
    });

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'JOB_FAILURE',
        severity: 'WARNING',
        source: 'job:checkTrialExpiring',
      }),
    });
  });

  it('does not create alert when no errors', async () => {
    mockPrisma.jobRun.findUnique.mockResolvedValue({
      startedAt,
      jobName: 'checkTrialExpiring',
    });
    mockPrisma.jobRun.update.mockResolvedValue({});

    await completeJobRun('run-006', {
      processedCount: 5,
      successCount: 5,
      errorCount: 0,
    });

    expect(mockPrisma.adminAlert.create).not.toHaveBeenCalled();
  });

  it('handles missing jobRun gracefully (logs warning, does not throw)', async () => {
    mockPrisma.jobRun.findUnique.mockResolvedValue(null);

    await expect(
      completeJobRun('nonexistent', {
        processedCount: 0,
        successCount: 0,
        errorCount: 0,
      }),
    ).resolves.toBeUndefined();

    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent'),
      expect.any(Object),
    );
    expect(mockPrisma.jobRun.update).not.toHaveBeenCalled();
  });

  it('skips alert creation if recent alert already exists', async () => {
    mockPrisma.jobRun.findUnique.mockResolvedValue({
      startedAt,
      jobName: 'checkTrialExpiring',
    });
    mockPrisma.jobRun.update.mockResolvedValue({});
    // Recent alert exists
    mockPrisma.adminAlert.findFirst.mockResolvedValue({ id: 'existing-alert' });

    await completeJobRun('run-007', {
      processedCount: 10,
      successCount: 5,
      errorCount: 5,
    });

    // findFirst was called (checking for recent alert)
    expect(mockPrisma.adminAlert.findFirst).toHaveBeenCalled();
    // create was NOT called (skipped because recent alert exists)
    expect(mockPrisma.adminAlert.create).not.toHaveBeenCalled();
  });
});

describe('failJobRun', () => {
  const startedAt = new Date('2026-02-27T10:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
    mockPrisma.adminAlert.create.mockResolvedValue({ id: 'alert-1' });
  });

  it('updates job with FAILED status and error message', async () => {
    mockPrisma.jobRun.findUnique.mockResolvedValue({
      startedAt,
      jobName: 'resetMonthlyQueries',
    });
    mockPrisma.jobRun.update.mockResolvedValue({});

    await failJobRun('run-100', 'Something broke');

    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: 'run-100' },
      data: expect.objectContaining({
        status: 'FAILED',
        errorMessage: 'Something broke',
      }),
    });
  });

  it('creates CRITICAL alert on failure', async () => {
    mockPrisma.jobRun.findUnique.mockResolvedValue({
      startedAt,
      jobName: 'resetMonthlyQueries',
    });
    mockPrisma.jobRun.update.mockResolvedValue({});

    await failJobRun('run-101', 'DB connection lost');

    expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'JOB_FAILURE',
        severity: 'CRITICAL',
        source: 'job:resetMonthlyQueries',
      }),
    });
  });

  it('handles missing jobRun gracefully', async () => {
    mockPrisma.jobRun.findUnique.mockResolvedValue(null);

    await expect(failJobRun('nonexistent', 'error')).resolves.toBeUndefined();

    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent'),
      expect.any(Object),
    );
    expect(mockPrisma.jobRun.update).not.toHaveBeenCalled();
  });

  it('logs error details', async () => {
    mockPrisma.jobRun.findUnique.mockResolvedValue({
      startedAt,
      jobName: 'checkCouponAlerts',
    });
    mockPrisma.jobRun.update.mockResolvedValue({});

    await failJobRun('run-102', 'Timeout exceeded');

    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('checkCouponAlerts'),
      expect.objectContaining({
        jobRunId: 'run-102',
        errorMessage: 'Timeout exceeded',
      }),
    );
  });
});

describe('withJobLogging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
    mockPrisma.adminAlert.create.mockResolvedValue({ id: 'alert-1' });
  });

  it('orchestrates startJobRun + completeJobRun on success', async () => {
    mockPrisma.jobRun.create.mockResolvedValue({ id: 'run-200' });
    mockPrisma.jobRun.findUnique.mockResolvedValue({
      startedAt: new Date(),
      jobName: 'checkTrialExpiring',
    });
    mockPrisma.jobRun.update.mockResolvedValue({});

    const jobFn = vi.fn().mockResolvedValue({
      processedCount: 3,
      successCount: 3,
      errorCount: 0,
      summary: 'All good',
    });

    await withJobLogging('checkTrialExpiring', 'SCHEDULER', jobFn);

    // startJobRun was called
    expect(mockPrisma.jobRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobName: 'checkTrialExpiring',
        status: 'RUNNING',
      }),
    });

    // completeJobRun was called
    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-200' },
        data: expect.objectContaining({ status: 'SUCCESS' }),
      }),
    );

    expect(jobFn).toHaveBeenCalledOnce();
  });

  it('orchestrates startJobRun + failJobRun on error, and re-throws', async () => {
    mockPrisma.jobRun.create.mockResolvedValue({ id: 'run-201' });
    mockPrisma.jobRun.findUnique.mockResolvedValue({
      startedAt: new Date(),
      jobName: 'resetMonthlyQueries',
    });
    mockPrisma.jobRun.update.mockResolvedValue({});

    const jobFn = vi.fn().mockRejectedValue(new Error('Boom'));

    await expect(
      withJobLogging('resetMonthlyQueries', 'MANUAL', jobFn),
    ).rejects.toThrow('Boom');

    // startJobRun was called
    expect(mockPrisma.jobRun.create).toHaveBeenCalled();

    // failJobRun was called (update with FAILED)
    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-201' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Boom',
        }),
      }),
    );
  });

  it('handles non-Error thrown values', async () => {
    mockPrisma.jobRun.create.mockResolvedValue({ id: 'run-202' });
    mockPrisma.jobRun.findUnique.mockResolvedValue({
      startedAt: new Date(),
      jobName: 'checkCouponAlerts',
    });
    mockPrisma.jobRun.update.mockResolvedValue({});

    const jobFn = vi.fn().mockRejectedValue('string error');

    await expect(
      withJobLogging('checkCouponAlerts', 'API', jobFn),
    ).rejects.toBe('string error');

    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorMessage: 'string error',
        }),
      }),
    );
  });
});

describe('getJobDisplayName', () => {
  it('returns friendly name for known jobs', () => {
    expect(getJobDisplayName('checkTrialExpiring')).toBe('Verificar Trials Expirando');
    expect(getJobDisplayName('checkSubscriptionExpired')).toBe('Verificar Assinaturas Expiradas');
    expect(getJobDisplayName('resetMonthlyQueries')).toBe('Reset Mensal de Queries');
    expect(getJobDisplayName('checkCouponAlerts')).toBe('Verificar Alertas de Cupons');
    expect(getJobDisplayName('checkTrialUpgradeExpiring')).toBe('Verificar Trial Upgrades Expirando');
    expect(getJobDisplayName('checkAbandonedCoupons')).toBe('Verificar Cupons Abandonados');
    expect(getJobDisplayName('checkSessionExpiring')).toBe('Verificar Sessões Expirando');
  });

  it('returns raw name for unknown jobs', () => {
    expect(getJobDisplayName('unknownJob')).toBe('unknownJob');
    expect(getJobDisplayName('anotherCustomJob')).toBe('anotherCustomJob');
  });
});

describe('JobNames constants', () => {
  it('contains all expected job names', () => {
    expect(JobNames.CHECK_TRIAL_EXPIRING).toBe('checkTrialExpiring');
    expect(JobNames.CHECK_SUBSCRIPTION_EXPIRED).toBe('checkSubscriptionExpired');
    expect(JobNames.RESET_MONTHLY_QUERIES).toBe('resetMonthlyQueries');
    expect(JobNames.CHECK_COUPON_ALERTS).toBe('checkCouponAlerts');
    expect(JobNames.CHECK_TRIAL_UPGRADE_EXPIRING).toBe('checkTrialUpgradeExpiring');
    expect(JobNames.CHECK_ABANDONED_COUPONS).toBe('checkAbandonedCoupons');
    expect(JobNames.CHECK_SESSION_EXPIRING).toBe('checkSessionExpiring');
  });
});

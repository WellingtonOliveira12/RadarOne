import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// HOISTED MOCKS
// ============================================================

const { mockPrisma, mockLogInfo, mockLogError } = vi.hoisted(() => ({
  mockPrisma: {
    subscription: {
      findMany: vi.fn(),
    },
    auditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  } as any,
  mockLogInfo: vi.fn(),
  mockLogError: vi.fn(),
}));

const { mockSendTrialUpgradeExpiringEmail } = vi.hoisted(() => ({
  mockSendTrialUpgradeExpiringEmail: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: mockLogInfo,
  logError: mockLogError,
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));
vi.mock('../../src/services/emailService', () => ({
  sendTrialUpgradeExpiringEmail: mockSendTrialUpgradeExpiringEmail,
}));

// Import AFTER mocks
import { checkTrialUpgradeExpiring } from '../../src/jobs/checkTrialUpgradeExpiring';

// ============================================================
// HELPERS
// ============================================================

function makeFutureDate(hoursFromNow: number): Date {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}

function makeSubscription(overrides: Partial<any> = {}): any {
  return {
    id: 'sub-1',
    status: 'TRIAL',
    externalProvider: 'COUPON_TRIAL_UPGRADE',
    isLifetime: false,
    trialEndsAt: makeFutureDate(24.5), // ~1 day
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
    },
    plan: {
      name: 'Pro',
      slug: 'pro',
    },
    ...overrides,
  };
}

// ============================================================
// TESTS
// ============================================================

describe('checkTrialUpgradeExpiring Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no recent audit log (allows email sending)
    mockPrisma.auditLog.findFirst.mockResolvedValue(null);
    // Default: auditLog.create succeeds
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it('returns zero counts when no subscriptions are expiring', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);

    const result = await checkTrialUpgradeExpiring();

    expect(result.processedCount).toBe(0);
    expect(result.successCount).toBe(0);
    expect(result.errorCount).toBe(0);
  });

  it('returns a properly structured JobRunResult', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);

    const result = await checkTrialUpgradeExpiring();

    expect(result).toHaveProperty('processedCount');
    expect(result).toHaveProperty('successCount');
    expect(result).toHaveProperty('errorCount');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('metadata');
  });

  it('queries 3 windows (1d, 3d, 7d)', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);

    await checkTrialUpgradeExpiring();

    expect(mockPrisma.subscription.findMany).toHaveBeenCalledTimes(3);
  });

  it('filters subscriptions with COUPON_TRIAL_UPGRADE provider', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);

    await checkTrialUpgradeExpiring();

    const firstCall = mockPrisma.subscription.findMany.mock.calls[0][0];
    expect(firstCall.where).toMatchObject({
      status: 'TRIAL',
      externalProvider: 'COUPON_TRIAL_UPGRADE',
      isLifetime: false,
    });
  });

  it('sends email for 1-day window subscription', async () => {
    const sub = makeSubscription({ id: 'sub-1d', trialEndsAt: makeFutureDate(24.5) });
    // First call (1d window) returns the subscription; other windows return empty
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([sub])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockSendTrialUpgradeExpiringEmail.mockResolvedValue({ success: true });

    const result = await checkTrialUpgradeExpiring();

    expect(mockSendTrialUpgradeExpiringEmail).toHaveBeenCalledWith(
      'user@example.com',
      'Pro',
      1,
      sub.trialEndsAt
    );
    expect(result.successCount).toBe(1);
    expect(result.processedCount).toBe(1);
  });

  it('sends email for 3-day window subscription', async () => {
    const sub = makeSubscription({ id: 'sub-3d', trialEndsAt: makeFutureDate(72.5) });
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sub])
      .mockResolvedValueOnce([]);
    mockSendTrialUpgradeExpiringEmail.mockResolvedValue({ success: true });

    await checkTrialUpgradeExpiring();

    expect(mockSendTrialUpgradeExpiringEmail).toHaveBeenCalledWith(
      'user@example.com',
      'Pro',
      3,
      sub.trialEndsAt
    );
  });

  it('sends email for 7-day window subscription', async () => {
    const sub = makeSubscription({ id: 'sub-7d', trialEndsAt: makeFutureDate(168.5) });
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sub]);
    mockSendTrialUpgradeExpiringEmail.mockResolvedValue({ success: true });

    await checkTrialUpgradeExpiring();

    expect(mockSendTrialUpgradeExpiringEmail).toHaveBeenCalledWith(
      'user@example.com',
      'Pro',
      7,
      sub.trialEndsAt
    );
  });

  it('skips subscription when recent notification already sent (12h dedup)', async () => {
    const sub = makeSubscription();
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([sub])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    // Simulate recent notification exists
    mockPrisma.auditLog.findFirst.mockResolvedValue({
      id: 'audit-1',
      action: 'NOTIFICATION_TRIAL_UPGRADE_EXPIRING',
      createdAt: new Date(),
    });

    const result = await checkTrialUpgradeExpiring();

    expect(mockSendTrialUpgradeExpiringEmail).not.toHaveBeenCalled();
    expect(result.successCount).toBe(0);
  });

  it('checks dedup with correct audit log filter', async () => {
    const sub = makeSubscription();
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([sub])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.auditLog.findFirst.mockResolvedValue(null);
    mockSendTrialUpgradeExpiringEmail.mockResolvedValue({ success: true });

    await checkTrialUpgradeExpiring();

    expect(mockPrisma.auditLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: 'NOTIFICATION_TRIAL_UPGRADE_EXPIRING',
          targetType: 'SUBSCRIPTION',
          targetId: sub.id,
        }),
      })
    );
  });

  it('creates audit log entry after successful email', async () => {
    const sub = makeSubscription();
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([sub])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockSendTrialUpgradeExpiringEmail.mockResolvedValue({ success: true });

    await checkTrialUpgradeExpiring();

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'NOTIFICATION_TRIAL_UPGRADE_EXPIRING',
          targetType: 'SUBSCRIPTION',
          targetId: sub.id,
          adminId: 'SYSTEM',
        }),
      })
    );
  });

  it('increments errorCount when email sending fails', async () => {
    const sub = makeSubscription();
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([sub])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockSendTrialUpgradeExpiringEmail.mockResolvedValue({ success: false, error: 'SMTP error' });

    const result = await checkTrialUpgradeExpiring();

    expect(result.errorCount).toBe(1);
    expect(result.successCount).toBe(0);
    expect(mockLogError).toHaveBeenCalledWith(
      'Erro ao enviar email',
      expect.objectContaining({ email: sub.user.email })
    );
  });

  it('increments errorCount when processing individual subscription throws', async () => {
    const sub = makeSubscription();
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([sub])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    // auditLog.findFirst throws an exception for this subscription
    mockPrisma.auditLog.findFirst.mockRejectedValue(new Error('DB error'));

    const result = await checkTrialUpgradeExpiring();

    expect(result.errorCount).toBe(1);
    expect(mockLogError).toHaveBeenCalledWith(
      'Erro ao processar subscription',
      expect.objectContaining({ subscriptionId: sub.id })
    );
  });

  it('continues processing remaining subscriptions after one fails', async () => {
    const sub1 = makeSubscription({ id: 'sub-fail', user: { id: 'u-1', email: 'fail@example.com', name: 'User 1' } });
    const sub2 = makeSubscription({ id: 'sub-ok', user: { id: 'u-2', email: 'ok@example.com', name: 'User 2' } });
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([sub1, sub2])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    // First sub: auditLog throws; second sub: works fine
    mockPrisma.auditLog.findFirst
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(null);
    mockSendTrialUpgradeExpiringEmail.mockResolvedValue({ success: true });

    const result = await checkTrialUpgradeExpiring();

    expect(result.processedCount).toBe(2);
    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(mockSendTrialUpgradeExpiringEmail).toHaveBeenCalledTimes(1);
  });

  it('processes subscriptions across multiple windows and accumulates counts', async () => {
    const sub1d = makeSubscription({ id: 'sub-1d' });
    const sub3d = makeSubscription({ id: 'sub-3d' });
    const sub7d = makeSubscription({ id: 'sub-7d' });
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([sub1d])
      .mockResolvedValueOnce([sub3d])
      .mockResolvedValueOnce([sub7d]);
    mockSendTrialUpgradeExpiringEmail.mockResolvedValue({ success: true });

    const result = await checkTrialUpgradeExpiring();

    expect(result.processedCount).toBe(3);
    expect(result.successCount).toBe(3);
    expect(mockSendTrialUpgradeExpiringEmail).toHaveBeenCalledTimes(3);
  });

  it('returns error result when database throws fatal error', async () => {
    mockPrisma.subscription.findMany.mockRejectedValue(new Error('Database unavailable'));

    const result = await checkTrialUpgradeExpiring();

    expect(result.errorCount).toBeGreaterThanOrEqual(1);
    expect(result.summary).toContain('Database unavailable');
    expect(result.metadata).toHaveProperty('error', 'Database unavailable');
    expect(mockLogError).toHaveBeenCalledWith(
      'Erro ao executar job',
      expect.objectContaining({ err: expect.any(Error) })
    );
  });

  it('summary string includes processed and success counts', async () => {
    const sub = makeSubscription();
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([sub])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockSendTrialUpgradeExpiringEmail.mockResolvedValue({ success: true });

    const result = await checkTrialUpgradeExpiring();

    expect(result.summary).toContain('1');
    expect(result.summary.toLowerCase()).toMatch(/trial|notifica/i);
  });

  it('notifications metadata contains sent emails with days info', async () => {
    const sub = makeSubscription({ id: 'sub-1d', trialEndsAt: makeFutureDate(24.5) });
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([sub])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockSendTrialUpgradeExpiringEmail.mockResolvedValue({ success: true });

    const result = await checkTrialUpgradeExpiring();

    expect(result.metadata?.notifications).toContainEqual({
      email: 'user@example.com',
      days: 1,
    });
  });

  it('does not create audit log when email fails', async () => {
    const sub = makeSubscription();
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([sub])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockSendTrialUpgradeExpiringEmail.mockResolvedValue({ success: false, error: 'SMTP timeout' });

    await checkTrialUpgradeExpiring();

    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

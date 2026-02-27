import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for checkAbandonedCoupons job
 *
 * Cases tested:
 * - Returns JobRunResult shape on success
 * - Sends 1st reminder email for validations older than 24h with no reminderSentAt
 * - Resolves recipient email/name from user when userId is set
 * - Uses validation.userEmail when no userId
 * - Skips validation when coupon is inactive or not found
 * - Skips validation when no email is available
 * - Sends push notification for 1st reminder when userId is available
 * - Marks reminderSentAt after 1st email
 * - Sends 2nd reminder email for validations older than 48h
 * - Marks secondReminderSentAt after 2nd email
 * - Formats discount as percentage string (PERCENTAGE type)
 * - Formats discount as R$ amount (FIXED type)
 * - Counts errorCount per individual failure and continues processing
 * - Captures exception via Sentry on fatal error
 * - Returns error result without throwing on fatal error
 */

// ============================================
// Mocks (hoisted)
// ============================================

const {
  mockPrisma,
  mockSendAbandonedCouponEmail,
  mockSendAbandonedCouponPush,
  mockCaptureJobException,
  mockRetryAsync,
} = vi.hoisted(() => ({
  mockPrisma: {
    couponValidation: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    coupon: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  } as any,
  mockSendAbandonedCouponEmail: vi.fn(),
  mockSendAbandonedCouponPush: vi.fn(),
  mockCaptureJobException: vi.fn(),
  mockRetryAsync: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

vi.mock('../../src/services/emailService', () => ({
  sendAbandonedCouponEmail: mockSendAbandonedCouponEmail,
}));

vi.mock('../../src/services/pushService', () => ({
  sendAbandonedCouponPush: mockSendAbandonedCouponPush,
}));

vi.mock('../../src/monitoring/sentry', () => ({
  captureJobException: mockCaptureJobException,
}));

vi.mock('../../src/utils/retry', () => ({
  retryAsync: mockRetryAsync,
}));

// Import AFTER mocks
import { checkAbandonedCoupons } from '../../src/jobs/checkAbandonedCoupons';

// ============================================
// Helpers
// ============================================

function makeValidation(overrides: Record<string, any> = {}) {
  return {
    id: 'val-1',
    couponId: 'coupon-1',
    purpose: 'DISCOUNT',
    converted: false,
    reminderSentAt: null,
    secondReminderSentAt: null,
    userEmail: 'user@test.com',
    userId: null,
    createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000), // 30h ago
    ...overrides,
  };
}

function makeCoupon(overrides: Record<string, any> = {}) {
  return {
    id: 'coupon-1',
    code: 'PROMO20',
    isActive: true,
    discountType: 'PERCENTAGE',
    discountValue: 20,
    description: 'Desconto especial',
    ...overrides,
  };
}

// ============================================
// Tests
// ============================================

describe('checkAbandonedCoupons Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: retryAsync executes the callback
    mockRetryAsync.mockImplementation(async (fn: () => Promise<any>) => {
      return await fn();
    });

    mockPrisma.couponValidation.update.mockResolvedValue({});
    mockSendAbandonedCouponEmail.mockResolvedValue(undefined);
    mockSendAbandonedCouponPush.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // Return shape
  // ============================================

  it('should return JobRunResult shape on empty data', async () => {
    mockPrisma.couponValidation.findMany.mockResolvedValue([]);

    const result = await checkAbandonedCoupons();

    expect(result).toMatchObject({
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      summary: expect.any(String),
      metadata: expect.objectContaining({
        firstRemindersSent: 0,
        secondRemindersSent: 0,
      }),
    });
  });

  // ============================================
  // 1st reminder
  // ============================================

  it('should send 1st reminder email for eligible validation', async () => {
    const validation = makeValidation({ userEmail: 'buyer@test.com', userId: null });
    const coupon = makeCoupon();

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation]) // 1st reminder candidates
      .mockResolvedValueOnce([]);           // 2nd reminder candidates

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);

    const result = await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponEmail).toHaveBeenCalledWith(
      'buyer@test.com',
      'Usuário',
      'PROMO20',
      '20%',
      'Desconto especial',
      false // first email
    );
    expect(result.metadata?.firstRemindersSent).toBe(1);
    expect(result.successCount).toBe(1);
  });

  it('should resolve email and name from user when userId is set', async () => {
    const validation = makeValidation({
      userId: 'user-abc',
      userEmail: 'fallback@test.com',
    });
    const coupon = makeCoupon();
    const user = { email: 'real@test.com', name: 'João Silva' };

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);
    mockPrisma.user.findUnique.mockResolvedValue(user);

    await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponEmail).toHaveBeenCalledWith(
      'real@test.com',
      'João Silva',
      expect.any(String),
      expect.any(String),
      expect.any(String),
      false
    );
  });

  it('should use validation.userEmail when userId is set but user not found', async () => {
    const validation = makeValidation({
      userId: 'user-missing',
      userEmail: 'valid@test.com',
    });
    const coupon = makeCoupon();

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponEmail).toHaveBeenCalledWith(
      'valid@test.com',
      'Usuário',
      expect.any(String),
      expect.any(String),
      expect.any(String),
      false
    );
  });

  it('should use "Usuário" as name when user.name is null', async () => {
    const validation = makeValidation({ userId: 'user-noname', userEmail: null });
    const coupon = makeCoupon();
    const user = { email: 'noname@test.com', name: null };

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);
    mockPrisma.user.findUnique.mockResolvedValue(user);

    await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponEmail).toHaveBeenCalledWith(
      'noname@test.com',
      'Usuário',
      expect.any(String),
      expect.any(String),
      expect.any(String),
      false
    );
  });

  it('should skip validation when coupon is not found', async () => {
    const validation = makeValidation();

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique.mockResolvedValue(null);

    const result = await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponEmail).not.toHaveBeenCalled();
    expect(result.successCount).toBe(0);
  });

  it('should skip validation when coupon is inactive', async () => {
    const validation = makeValidation();
    const inactiveCoupon = makeCoupon({ isActive: false });

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique.mockResolvedValue(inactiveCoupon);

    const result = await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponEmail).not.toHaveBeenCalled();
    expect(result.successCount).toBe(0);
  });

  it('should skip validation when no email is available', async () => {
    const validation = makeValidation({ userEmail: null, userId: null });
    const coupon = makeCoupon();

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);

    const result = await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponEmail).not.toHaveBeenCalled();
    expect(result.successCount).toBe(0);
  });

  it('should send push notification for 1st reminder when userId is provided', async () => {
    const validation = makeValidation({ userId: 'user-push', userEmail: null });
    const coupon = makeCoupon();
    const user = { email: 'push@test.com', name: 'Push User' };

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);
    mockPrisma.user.findUnique.mockResolvedValue(user);

    await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponPush).toHaveBeenCalledWith(
      'user-push',
      'PROMO20',
      '20%',
      false // first reminder
    );
  });

  it('should NOT send push notification when userId is null', async () => {
    const validation = makeValidation({ userId: null, userEmail: 'nopush@test.com' });
    const coupon = makeCoupon();

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);

    await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponPush).not.toHaveBeenCalled();
  });

  it('should mark reminderSentAt after sending 1st email', async () => {
    const validation = makeValidation({ id: 'val-mark', userEmail: 'mark@test.com' });
    const coupon = makeCoupon();

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);

    await checkAbandonedCoupons();

    expect(mockPrisma.couponValidation.update).toHaveBeenCalledWith({
      where: { id: 'val-mark' },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  // ============================================
  // 2nd reminder
  // ============================================

  it('should send 2nd reminder email for eligible validation (48h+, received 1st)', async () => {
    const validation = makeValidation({
      id: 'val-second',
      userEmail: 'second@test.com',
      reminderSentAt: new Date(Date.now() - 49 * 60 * 60 * 1000), // received 1st reminder 49h ago
      createdAt: new Date(Date.now() - 60 * 60 * 60 * 1000), // created 60h ago
    });
    const coupon = makeCoupon();

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([])          // no 1st reminder candidates
      .mockResolvedValueOnce([validation]); // 2nd reminder candidates

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);

    const result = await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponEmail).toHaveBeenCalledWith(
      'second@test.com',
      'Usuário',
      'PROMO20',
      '20%',
      'Desconto especial',
      true // second email (urgent)
    );
    expect(result.metadata?.secondRemindersSent).toBe(1);
  });

  it('should mark secondReminderSentAt after sending 2nd email', async () => {
    const validation = makeValidation({
      id: 'val-second-mark',
      userEmail: 'second-mark@test.com',
      reminderSentAt: new Date(),
    });
    const coupon = makeCoupon();

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([validation]);

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);

    await checkAbandonedCoupons();

    expect(mockPrisma.couponValidation.update).toHaveBeenCalledWith({
      where: { id: 'val-second-mark' },
      data: { secondReminderSentAt: expect.any(Date) },
    });
  });

  it('should send urgent push for 2nd reminder when userId is set', async () => {
    const validation = makeValidation({
      id: 'val-push2',
      userId: 'user-push2',
      userEmail: null,
      reminderSentAt: new Date(),
    });
    const coupon = makeCoupon();
    const user = { email: 'push2@test.com', name: 'Push2 User' };

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([validation]);

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);
    mockPrisma.user.findUnique.mockResolvedValue(user);

    await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponPush).toHaveBeenCalledWith(
      'user-push2',
      'PROMO20',
      '20%',
      true // second reminder (urgent)
    );
  });

  // ============================================
  // Discount formatting
  // ============================================

  it('should format discount as percentage string for PERCENTAGE type', async () => {
    const validation = makeValidation({ userEmail: 'pct@test.com' });
    const coupon = makeCoupon({ discountType: 'PERCENTAGE', discountValue: 15 });

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);

    await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponEmail).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      '15%',
      expect.any(String),
      false
    );
  });

  it('should format discount as R$ amount for non-PERCENTAGE type', async () => {
    const validation = makeValidation({ userEmail: 'fixed@test.com' });
    const coupon = makeCoupon({ discountType: 'FIXED', discountValue: 2999 }); // R$ 29.99

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);

    await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponEmail).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'R$ 29.99',
      expect.any(String),
      false
    );
  });

  it('should use coupon.description in email when available', async () => {
    const validation = makeValidation({ userEmail: 'desc@test.com' });
    const coupon = makeCoupon({ description: 'Oferta exclusiva de verão' });

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);

    await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponEmail).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'Oferta exclusiva de verão',
      false
    );
  });

  it('should use "Desconto especial" fallback when coupon has no description', async () => {
    const validation = makeValidation({ userEmail: 'nodesc@test.com' });
    const coupon = makeCoupon({ description: null });

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([validation])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique.mockResolvedValue(coupon);

    await checkAbandonedCoupons();

    expect(mockSendAbandonedCouponEmail).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'Desconto especial',
      false
    );
  });

  // ============================================
  // Error handling per item
  // ============================================

  it('should increment errorCount and continue processing when individual item fails', async () => {
    const val1 = makeValidation({ id: 'val-err1', userEmail: 'err1@test.com' });
    const val2 = makeValidation({ id: 'val-err2', userEmail: 'ok@test.com' });

    mockPrisma.couponValidation.findMany
      .mockResolvedValueOnce([val1, val2])
      .mockResolvedValueOnce([]);

    mockPrisma.coupon.findUnique
      .mockRejectedValueOnce(new Error('Coupon DB error')) // val1 fails
      .mockResolvedValueOnce(makeCoupon());                // val2 succeeds

    const result = await checkAbandonedCoupons();

    expect(result.errorCount).toBe(1);
    expect(result.successCount).toBe(1);
    expect(mockSendAbandonedCouponEmail).toHaveBeenCalledTimes(1);
  });

  // ============================================
  // Fatal error handling
  // ============================================

  it('should capture exception via Sentry on fatal error', async () => {
    const fatalError = new Error('retryAsync totally failed');
    mockRetryAsync.mockRejectedValue(fatalError);

    await checkAbandonedCoupons();

    expect(mockCaptureJobException).toHaveBeenCalledWith(
      fatalError,
      expect.objectContaining({ jobName: 'checkAbandonedCoupons' })
    );
  });

  it('should return error result on fatal error without throwing', async () => {
    mockRetryAsync.mockRejectedValue(new Error('Fatal DB error'));

    const result = await checkAbandonedCoupons();

    expect(result.errorCount).toBeGreaterThanOrEqual(1);
    expect(result.summary).toContain('Fatal DB error');
    await expect(checkAbandonedCoupons()).resolves.not.toThrow();
  });

  it('should call retryAsync with correct config', async () => {
    mockPrisma.couponValidation.findMany.mockResolvedValue([]);

    await checkAbandonedCoupons();

    expect(mockRetryAsync).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        retries: 3,
        delayMs: 1000,
        factor: 2,
        jobName: 'checkAbandonedCoupons',
      })
    );
  });
});

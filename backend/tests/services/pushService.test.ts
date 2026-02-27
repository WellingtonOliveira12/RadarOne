import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for pushService — Web Push notification management
 *
 * Cases tested:
 * - saveSubscription: creates new, updates existing, handles DB error
 * - removeSubscription: deletes by endpoint, handles DB error
 * - sendPushToUser: VAPID not configured, no subscriptions, sends successfully, removes expired (410), handles send error, outer catch
 * - sendAbandonedCouponPush: first reminder, second reminder payloads
 * - broadcastPush: sends to multiple users, aggregates sentCount
 */

// Hoist mocks so they run before any module import/evaluation
const { mockPrisma, mockWebPushSendNotification, mockWebPushSetVapidDetails } = vi.hoisted(() => {
  // Set VAPID keys so the module-level setVapidDetails block executes
  process.env.VAPID_PUBLIC_KEY = 'test-public-key';
  process.env.VAPID_PRIVATE_KEY = 'test-private-key';
  process.env.VAPID_SUBJECT = 'mailto:test@radarone.com.br';

  return {
    mockPrisma: {
      pushSubscription: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
        findMany: vi.fn(),
      },
    } as any,
    mockWebPushSendNotification: vi.fn(),
    mockWebPushSetVapidDetails: vi.fn(),
  };
});

vi.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: mockWebPushSetVapidDetails,
    sendNotification: mockWebPushSendNotification,
  },
}));

import {
  saveSubscription,
  removeSubscription,
  sendPushToUser,
  sendAbandonedCouponPush,
  broadcastPush,
} from '../../src/services/pushService';

// ============================================================
// Helper
// ============================================================

function makeSubscription(overrides: Record<string, any> = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    p256dh: 'p256dhkey',
    auth: 'authkey',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ============================================================
// saveSubscription
// ============================================================

describe('saveSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new subscription when endpoint does not exist', async () => {
    mockPrisma.pushSubscription.findUnique.mockResolvedValue(null);
    mockPrisma.pushSubscription.create.mockResolvedValue(makeSubscription());

    const result = await saveSubscription('user-1', 'https://endpoint', 'p256dh', 'auth');

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockPrisma.pushSubscription.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        endpoint: 'https://endpoint',
        p256dh: 'p256dh',
        auth: 'auth',
      },
    });
    expect(mockPrisma.pushSubscription.update).not.toHaveBeenCalled();
  });

  it('updates an existing subscription when endpoint already exists', async () => {
    mockPrisma.pushSubscription.findUnique.mockResolvedValue(makeSubscription());
    mockPrisma.pushSubscription.update.mockResolvedValue(makeSubscription());

    const result = await saveSubscription('user-1', 'https://endpoint', 'new-p256dh', 'new-auth');

    expect(result.success).toBe(true);
    expect(mockPrisma.pushSubscription.update).toHaveBeenCalledWith({
      where: { endpoint: 'https://endpoint' },
      data: {
        userId: 'user-1',
        p256dh: 'new-p256dh',
        auth: 'new-auth',
        updatedAt: expect.any(Date),
      },
    });
    expect(mockPrisma.pushSubscription.create).not.toHaveBeenCalled();
  });

  it('returns error when DB throws on create', async () => {
    mockPrisma.pushSubscription.findUnique.mockResolvedValue(null);
    mockPrisma.pushSubscription.create.mockRejectedValue(new Error('DB connection failed'));

    const result = await saveSubscription('user-1', 'https://endpoint', 'p256dh', 'auth');

    expect(result.success).toBe(false);
    expect(result.error).toBe('DB connection failed');
  });

  it('returns error when DB throws on update', async () => {
    mockPrisma.pushSubscription.findUnique.mockResolvedValue(makeSubscription());
    mockPrisma.pushSubscription.update.mockRejectedValue(new Error('Update failed'));

    const result = await saveSubscription('user-1', 'https://endpoint', 'p256dh', 'auth');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Update failed');
  });
});

// ============================================================
// removeSubscription
// ============================================================

describe('removeSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes subscription by endpoint', async () => {
    mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

    const result = await removeSubscription('https://endpoint');

    expect(result.success).toBe(true);
    expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://endpoint' },
    });
  });

  it('returns success even when no subscriptions deleted (count=0)', async () => {
    mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });

    const result = await removeSubscription('https://nonexistent');
    expect(result.success).toBe(true);
  });

  it('returns failure when DB throws', async () => {
    mockPrisma.pushSubscription.deleteMany.mockRejectedValue(new Error('DB error'));

    const result = await removeSubscription('https://endpoint');
    expect(result.success).toBe(false);
  });
});

// ============================================================
// sendPushToUser
// ============================================================

describe('sendPushToUser', () => {
  const originalVapidPublic = process.env.VAPID_PUBLIC_KEY;
  const originalVapidPrivate = process.env.VAPID_PRIVATE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore VAPID keys
    process.env.VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-private-key';
  });

  it('returns error when no subscriptions exist for user', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValue([]);

    const result = await sendPushToUser('user-1', { title: 'Test', body: 'Hello' });

    expect(result.success).toBe(true);
    expect(result.sentCount).toBe(0);
    expect(mockWebPushSendNotification).not.toHaveBeenCalled();
  });

  it('sends push notification to all subscriptions', async () => {
    const subs = [
      makeSubscription({ id: 'sub-1', endpoint: 'https://ep1' }),
      makeSubscription({ id: 'sub-2', endpoint: 'https://ep2' }),
    ];
    mockPrisma.pushSubscription.findMany.mockResolvedValue(subs);
    mockWebPushSendNotification.mockResolvedValue({});

    const payload = { title: 'New Ad!', body: 'Found a match', type: 'new_ad' as const };
    const result = await sendPushToUser('user-1', payload);

    expect(result.success).toBe(true);
    expect(result.sentCount).toBe(2);
    expect(mockWebPushSendNotification).toHaveBeenCalledTimes(2);
  });

  it('removes expired subscriptions on 410 status code', async () => {
    const subs = [
      makeSubscription({ id: 'sub-1', endpoint: 'https://ep1' }),
      makeSubscription({ id: 'sub-2', endpoint: 'https://ep2' }),
    ];
    mockPrisma.pushSubscription.findMany.mockResolvedValue(subs);
    mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

    // First sub succeeds, second gets 410 (gone)
    mockWebPushSendNotification
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));

    const result = await sendPushToUser('user-1', { title: 'Test', body: 'Body' });

    expect(result.sentCount).toBe(1);
    expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: { in: ['https://ep2'] } },
    });
  });

  it('counts sent as 0 when all subscriptions fail with non-410 errors', async () => {
    const subs = [makeSubscription({ endpoint: 'https://ep1' })];
    mockPrisma.pushSubscription.findMany.mockResolvedValue(subs);
    mockWebPushSendNotification.mockRejectedValue(Object.assign(new Error('Network error'), { statusCode: 500 }));

    const result = await sendPushToUser('user-1', { title: 'Test', body: 'Body' });

    expect(result.success).toBe(false);
    expect(result.sentCount).toBe(0);
    // Non-410 errors should NOT trigger subscription removal
    expect(mockPrisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });

  it('handles outer DB error gracefully', async () => {
    mockPrisma.pushSubscription.findMany.mockRejectedValue(new Error('DB error'));

    const result = await sendPushToUser('user-1', { title: 'Test', body: 'Body' });

    expect(result.success).toBe(false);
    expect(result.sentCount).toBe(0);
    expect(result.error).toBe('DB error');
  });

  it('sends correct JSON payload to web-push', async () => {
    const subs = [makeSubscription({ endpoint: 'https://ep1', p256dh: 'myp256dh', auth: 'myauth' })];
    mockPrisma.pushSubscription.findMany.mockResolvedValue(subs);
    mockWebPushSendNotification.mockResolvedValue({});

    const payload = { title: 'Test', body: 'Body', icon: '/icon.png', url: '/plans' };
    await sendPushToUser('user-1', payload);

    expect(mockWebPushSendNotification).toHaveBeenCalledWith(
      {
        endpoint: 'https://ep1',
        keys: { p256dh: 'myp256dh', auth: 'myauth' },
      },
      JSON.stringify(payload)
    );
  });
});

// ============================================================
// sendAbandonedCouponPush
// ============================================================

describe('sendAbandonedCouponPush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.pushSubscription.findMany.mockResolvedValue([
      makeSubscription({ endpoint: 'https://ep1' }),
    ]);
    mockWebPushSendNotification.mockResolvedValue({});
  });

  it('sends first reminder with correct title and body', async () => {
    await sendAbandonedCouponPush('user-1', 'PROMO10', '10%', false);

    const callArgs = mockWebPushSendNotification.mock.calls[0];
    const sentPayload = JSON.parse(callArgs[1]);

    expect(sentPayload.title).toBe('🎁 Cupom esperando por você!');
    expect(sentPayload.body).toContain('PROMO10');
    expect(sentPayload.body).toContain('10%');
    expect(sentPayload.type).toBe('coupon');
    expect(sentPayload.couponCode).toBe('PROMO10');
    expect(sentPayload.url).toContain('PROMO10');
  });

  it('sends second reminder with urgency title', async () => {
    await sendAbandonedCouponPush('user-1', 'LAST10', '15%', true);

    const callArgs = mockWebPushSendNotification.mock.calls[0];
    const sentPayload = JSON.parse(callArgs[1]);

    expect(sentPayload.title).toBe('⏰ Último aviso!');
    expect(sentPayload.body).toContain('LAST10');
    expect(sentPayload.body).toContain('15%');
    expect(sentPayload.body).toContain('expira em breve');
  });

  it('defaults isSecondReminder to false', async () => {
    await sendAbandonedCouponPush('user-1', 'CODE', '20%');

    const callArgs = mockWebPushSendNotification.mock.calls[0];
    const sentPayload = JSON.parse(callArgs[1]);

    expect(sentPayload.title).toBe('🎁 Cupom esperando por você!');
  });

  it('returns success with sentCount', async () => {
    const result = await sendAbandonedCouponPush('user-1', 'CODE', '5%');

    expect(result.success).toBe(true);
    expect(result.sentCount).toBeGreaterThan(0);
  });
});

// ============================================================
// broadcastPush
// ============================================================

describe('broadcastPush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends to all provided userIds', async () => {
    // Each user has 1 subscription
    mockPrisma.pushSubscription.findMany.mockResolvedValue([
      makeSubscription({ endpoint: 'https://ep1' }),
    ]);
    mockWebPushSendNotification.mockResolvedValue({});

    const result = await broadcastPush(['user-1', 'user-2', 'user-3'], {
      title: 'Broadcast',
      body: 'Hello everyone',
    });

    expect(result.totalSent).toBe(3);
    expect(result.success).toBe(true);
    // findMany called once per user
    expect(mockPrisma.pushSubscription.findMany).toHaveBeenCalledTimes(3);
  });

  it('returns success:false when no pushes were sent', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValue([]);

    const result = await broadcastPush(['user-1', 'user-2'], {
      title: 'Broadcast',
      body: 'Hello',
    });

    expect(result.success).toBe(false);
    expect(result.totalSent).toBe(0);
  });

  it('returns success:false for empty userIds array', async () => {
    const result = await broadcastPush([], { title: 'Broadcast', body: 'Hello' });

    expect(result.success).toBe(false);
    expect(result.totalSent).toBe(0);
    expect(mockPrisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('aggregates sentCount from multiple users with multiple devices', async () => {
    // user-1 has 2 devices, user-2 has 1 device
    mockPrisma.pushSubscription.findMany
      .mockResolvedValueOnce([
        makeSubscription({ id: 's1', endpoint: 'https://ep1' }),
        makeSubscription({ id: 's2', endpoint: 'https://ep2' }),
      ])
      .mockResolvedValueOnce([
        makeSubscription({ id: 's3', endpoint: 'https://ep3' }),
      ]);
    mockWebPushSendNotification.mockResolvedValue({});

    const result = await broadcastPush(['user-1', 'user-2'], { title: 'T', body: 'B' });

    expect(result.totalSent).toBe(3);
    expect(result.success).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// HOISTED MOCKS
// ============================================================

const {
  mockPrisma,
  mockGetUserTelegramAccount,
  mockSendTelegramMessage,
  mockSendNewListingEmail,
  mockLogInfo,
  mockLogError,
  mockLogWarning,
} = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    notificationLog: {
      create: vi.fn(),
    },
  } as any,
  mockGetUserTelegramAccount: vi.fn(),
  mockSendTelegramMessage: vi.fn(),
  mockSendNewListingEmail: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogError: vi.fn(),
  mockLogWarning: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../../src/services/telegramService', () => ({
  getUserTelegramAccount: mockGetUserTelegramAccount,
  sendTelegramMessage: mockSendTelegramMessage,
}));
vi.mock('../../src/services/emailService', () => ({
  sendNewListingEmail: mockSendNewListingEmail,
}));
vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: mockLogInfo,
  logError: mockLogError,
  logWarning: mockLogWarning,
  logSimpleInfo: vi.fn(),
}));

// Import AFTER mocks
import { notifyNewListing } from '../../src/services/notificationService';

// ============================================================
// FIXTURES
// ============================================================

const mockUser = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
};

const mockMonitor = {
  id: 'monitor-1',
  name: 'Monitor iPhone 15',
  userId: 'user-1',
} as any;

const mockListing = {
  title: 'iPhone 15 Pro Max 256GB',
  price: 5999.99,
  url: 'https://www.mercadolivre.com.br/item/12345',
};

const mockTelegramAccount = {
  chatId: '98765432',
  username: 'testuser',
  active: true,
};

// ============================================================
// TESTS
// ============================================================

describe('notifyNewListing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: notificationLog.create always succeeds
    mockPrisma.notificationLog.create.mockResolvedValue({});
  });

  it('logs warning and returns early when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await notifyNewListing('user-1', mockMonitor, mockListing);

    expect(mockLogWarning).toHaveBeenCalledWith(
      'User not found for notification',
      { userId: 'user-1' }
    );
    expect(result).toBeUndefined();
    expect(mockGetUserTelegramAccount).not.toHaveBeenCalled();
    expect(mockSendNewListingEmail).not.toHaveBeenCalled();
  });

  it('logs warning and returns when no notification channels are available', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, email: null });
    mockGetUserTelegramAccount.mockResolvedValue(null);

    const result = await notifyNewListing('user-1', mockMonitor, mockListing);

    expect(mockLogWarning).toHaveBeenCalledWith(
      'No notification channels available for user',
      { userId: 'user-1' }
    );
    expect(result).toBeUndefined();
  });

  it('sends telegram notification successfully', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, email: null });
    mockGetUserTelegramAccount.mockResolvedValue(mockTelegramAccount);
    mockSendTelegramMessage.mockResolvedValue({ success: true });

    await notifyNewListing('user-1', mockMonitor, mockListing);

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: '98765432' })
    );
    expect(mockLogInfo).toHaveBeenCalledWith(
      'Telegram notification sent successfully',
      expect.objectContaining({ userId: 'user-1', channel: 'telegram' })
    );
  });

  it('sends email notification successfully', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockGetUserTelegramAccount.mockResolvedValue(null);
    mockSendNewListingEmail.mockResolvedValue({ success: true });

    await notifyNewListing('user-1', mockMonitor, mockListing);

    expect(mockSendNewListingEmail).toHaveBeenCalledWith(
      'user@example.com',
      mockListing.title,
      mockListing.url
    );
    expect(mockLogInfo).toHaveBeenCalledWith(
      'Email notification sent successfully',
      expect.objectContaining({ userId: 'user-1', channel: 'email' })
    );
  });

  it('sends both telegram and email notifications when both available', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockGetUserTelegramAccount.mockResolvedValue(mockTelegramAccount);
    mockSendTelegramMessage.mockResolvedValue({ success: true });
    mockSendNewListingEmail.mockResolvedValue({ success: true });

    const result = await notifyNewListing('user-1', mockMonitor, mockListing);

    expect(mockSendTelegramMessage).toHaveBeenCalled();
    expect(mockSendNewListingEmail).toHaveBeenCalled();
    expect(result).toMatchObject({
      userId: 'user-1',
      totalChannels: 2,
      successCount: 2,
    });
  });

  it('logs notification to database on telegram success', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, email: null });
    mockGetUserTelegramAccount.mockResolvedValue(mockTelegramAccount);
    mockSendTelegramMessage.mockResolvedValue({ success: true });

    await notifyNewListing('user-1', mockMonitor, mockListing);

    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          channel: 'TELEGRAM',
          status: 'SUCCESS',
        }),
      })
    );
  });

  it('logs failed notification to database on telegram failure', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, email: null });
    mockGetUserTelegramAccount.mockResolvedValue(mockTelegramAccount);
    mockSendTelegramMessage.mockResolvedValue({ success: false });

    await notifyNewListing('user-1', mockMonitor, mockListing);

    expect(mockLogWarning).toHaveBeenCalledWith(
      'Telegram notification failed',
      expect.objectContaining({ userId: 'user-1', channel: 'telegram' })
    );
    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          channel: 'TELEGRAM',
          status: 'FAILED',
        }),
      })
    );
  });

  it('logs failed notification to database on email failure', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockGetUserTelegramAccount.mockResolvedValue(null);
    mockSendNewListingEmail.mockResolvedValue({ success: false });

    await notifyNewListing('user-1', mockMonitor, mockListing);

    expect(mockLogWarning).toHaveBeenCalledWith(
      'Email notification failed',
      expect.objectContaining({ userId: 'user-1', channel: 'email' })
    );
    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: 'EMAIL',
          status: 'FAILED',
        }),
      })
    );
  });

  it('handles telegram exception gracefully and logs error', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, email: null });
    mockGetUserTelegramAccount.mockResolvedValue(mockTelegramAccount);
    mockSendTelegramMessage.mockRejectedValue(new Error('Telegram API down'));

    await notifyNewListing('user-1', mockMonitor, mockListing);

    expect(mockLogError).toHaveBeenCalledWith(
      'Error sending Telegram notification',
      expect.objectContaining({ userId: 'user-1', channel: 'telegram' })
    );
    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: 'TELEGRAM',
          status: 'FAILED',
          error: 'Telegram API down',
        }),
      })
    );
  });

  it('handles email exception gracefully and logs error', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockGetUserTelegramAccount.mockResolvedValue(null);
    mockSendNewListingEmail.mockRejectedValue(new Error('SMTP timeout'));

    await notifyNewListing('user-1', mockMonitor, mockListing);

    expect(mockLogError).toHaveBeenCalledWith(
      'Error sending email notification',
      expect.objectContaining({ userId: 'user-1', channel: 'email' })
    );
    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: 'EMAIL',
          status: 'FAILED',
          error: 'SMTP timeout',
        }),
      })
    );
  });

  it('handles listing without price (shows "Não informado")', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockGetUserTelegramAccount.mockResolvedValue(mockTelegramAccount);
    mockSendTelegramMessage.mockResolvedValue({ success: true });
    mockSendNewListingEmail.mockResolvedValue({ success: true });

    const listingWithoutPrice = { title: 'Produto sem preço', url: 'https://example.com/item/1' };
    await notifyNewListing('user-1', mockMonitor, listingWithoutPrice);

    const telegramCall = mockSendTelegramMessage.mock.calls[0][0];
    expect(telegramCall.text).toContain('Não informado');
  });

  it('skips telegram when account has no chatId', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockGetUserTelegramAccount.mockResolvedValue({ chatId: null, username: 'testuser', active: true });
    mockSendNewListingEmail.mockResolvedValue({ success: true });

    await notifyNewListing('user-1', mockMonitor, mockListing);

    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
    expect(mockSendNewListingEmail).toHaveBeenCalled();
  });

  it('does not fail when notificationLog.create throws', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockGetUserTelegramAccount.mockResolvedValue(null);
    mockSendNewListingEmail.mockResolvedValue({ success: true });
    mockPrisma.notificationLog.create.mockRejectedValue(new Error('Log DB down'));

    // Should not throw — log failure is non-critical
    await expect(notifyNewListing('user-1', mockMonitor, mockListing)).resolves.not.toThrow();

    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to log notification',
      expect.any(Object)
    );
  });

  it('returns statistics with correct counts', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockGetUserTelegramAccount.mockResolvedValue(mockTelegramAccount);
    mockSendTelegramMessage.mockResolvedValue({ success: true });
    mockSendNewListingEmail.mockResolvedValue({ success: true });

    const result = await notifyNewListing('user-1', mockMonitor, mockListing);

    expect(result).toMatchObject({
      userId: 'user-1',
      totalChannels: 2,
      successCount: 2,
      results: expect.any(Array),
    });
    expect(result!.results).toHaveLength(2);
  });

  it('masks chatId in notification log (shows only last 4 digits)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, email: null });
    mockGetUserTelegramAccount.mockResolvedValue({ chatId: '12345678', username: 'user', active: true });
    mockSendTelegramMessage.mockResolvedValue({ success: true });

    await notifyNewListing('user-1', mockMonitor, mockListing);

    const logCall = mockPrisma.notificationLog.create.mock.calls[0][0];
    expect(logCall.data.target).toBe('***5678');
  });

  it('sanitizes email in log (shows only first char and domain)', async () => {
    const userWithEmail = { ...mockUser, email: 'wellington@example.com' };
    mockPrisma.user.findUnique.mockResolvedValue(userWithEmail);
    mockGetUserTelegramAccount.mockResolvedValue(null);
    mockSendNewListingEmail.mockResolvedValue({ success: true });

    await notifyNewListing('user-1', mockMonitor, mockListing);

    const logCall = mockPrisma.notificationLog.create.mock.calls[0][0];
    expect(logCall.data.target).toBe('w***@example.com');
  });
});

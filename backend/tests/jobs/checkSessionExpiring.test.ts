import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for checkSessionExpiring job
 *
 * Cases tested:
 * - Returns JobRunResult shape with zeros when no sessions found
 * - Filters out sessions notified in the last 24h
 * - Sends Telegram notification when telegramChatId is available and enabled
 * - Uses telegramAccounts fallback when notificationSettings.telegramChatId is null
 * - Skips Telegram when telegramEnabled is false
 * - Sends email notification when RESEND_API_KEY is set
 * - Skips email when RESEND_API_KEY is not set
 * - Counts errorCount when session processing throws
 * - Updates session metadata with lastExpirationNotifiedAt after notifying
 * - Returns error result on fatal DB error
 * - Correctly computes urgency string based on daysLeft
 */

// ============================================
// Mocks (hoisted)
// ============================================

const { mockPrisma, mockSendTelegramMessage, mockSendEmail } = vi.hoisted(() => ({
  mockPrisma: {
    userSession: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  } as any,
  mockSendTelegramMessage: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

vi.mock('../../src/services/telegramService', () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));

vi.mock('../../src/services/emailService', () => ({
  sendEmail: mockSendEmail,
}));

// Import AFTER mocks
import { checkSessionExpiring } from '../../src/jobs/checkSessionExpiring';

// ============================================
// Helpers
// ============================================

function makeSession(overrides: Record<string, any> = {}) {
  return {
    id: 'session-1',
    site: 'MERCADO_LIVRE',
    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    metadata: null,
    user: {
      id: 'user-1',
      email: 'user@test.com',
      notificationSettings: {
        telegramChatId: null,
        telegramEnabled: true,
      },
      telegramAccounts: [],
    },
    ...overrides,
  };
}

// ============================================
// Tests
// ============================================

describe('checkSessionExpiring Job', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.RESEND_API_KEY;

    mockPrisma.userSession.update.mockResolvedValue({});
    mockSendTelegramMessage.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // ============================================
  // Empty / base cases
  // ============================================

  it('should return zeros when no sessions are expiring', async () => {
    mockPrisma.userSession.findMany.mockResolvedValue([]);

    const result = await checkSessionExpiring();

    expect(result).toMatchObject({
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      summary: expect.any(String),
      metadata: expect.objectContaining({
        telegramsSent: 0,
        emailsSent: 0,
        totalExpiring: 0,
      }),
    });
  });

  // ============================================
  // 24h deduplication filter
  // ============================================

  it('should skip sessions that were notified less than 24h ago', async () => {
    const recentlyNotified = makeSession({
      metadata: {
        lastExpirationNotifiedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([recentlyNotified]);

    const result = await checkSessionExpiring();

    expect(result.processedCount).toBe(0);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('should process sessions notified more than 24h ago', async () => {
    const oldNotified = makeSession({
      metadata: {
        lastExpirationNotifiedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), // 26h ago
      },
      user: {
        id: 'user-2',
        email: 'user2@test.com',
        notificationSettings: { telegramChatId: 'chat-123', telegramEnabled: true },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([oldNotified]);

    const result = await checkSessionExpiring();

    expect(result.processedCount).toBe(1);
  });

  it('should process sessions with no previous notification metadata', async () => {
    const session = makeSession({
      metadata: null,
      user: {
        id: 'user-3',
        email: 'user3@test.com',
        notificationSettings: { telegramChatId: 'chat-456', telegramEnabled: true },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);

    const result = await checkSessionExpiring();

    expect(result.processedCount).toBe(1);
  });

  // ============================================
  // Telegram notifications
  // ============================================

  it('should send Telegram message when telegramChatId is available and enabled', async () => {
    const session = makeSession({
      user: {
        id: 'user-tg',
        email: 'tg@test.com',
        notificationSettings: { telegramChatId: 'chat-789', telegramEnabled: true },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);

    const result = await checkSessionExpiring();

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-789',
        text: expect.stringContaining('Sessão expirando'),
        parseMode: 'Markdown',
      })
    );
    expect(result.metadata?.telegramsSent).toBe(1);
    expect(result.successCount).toBe(1);
  });

  it('should use telegramAccounts[0].chatId as fallback when notificationSettings.telegramChatId is null', async () => {
    const session = makeSession({
      user: {
        id: 'user-fallback',
        email: 'fallback@test.com',
        notificationSettings: { telegramChatId: null, telegramEnabled: true },
        telegramAccounts: [{ chatId: 'fallback-chat-id' }],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);

    await checkSessionExpiring();

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'fallback-chat-id' })
    );
  });

  it('should skip Telegram when telegramEnabled is false', async () => {
    const session = makeSession({
      user: {
        id: 'user-notg',
        email: 'notg@test.com',
        notificationSettings: { telegramChatId: 'chat-000', telegramEnabled: false },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);

    await checkSessionExpiring();

    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it('should skip Telegram when no chatId is available', async () => {
    const session = makeSession({
      user: {
        id: 'user-nochat',
        email: 'nochat@test.com',
        notificationSettings: { telegramChatId: null, telegramEnabled: true },
        telegramAccounts: [], // no fallback either
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);

    await checkSessionExpiring();

    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it('should continue processing when Telegram send fails', async () => {
    const session = makeSession({
      user: {
        id: 'user-tg-fail',
        email: 'tgfail@test.com',
        notificationSettings: { telegramChatId: 'chat-fail', telegramEnabled: true },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);
    mockSendTelegramMessage.mockRejectedValue(new Error('Telegram API error'));

    const result = await checkSessionExpiring();

    // Should not throw, should update metadata (session was attempted)
    expect(mockPrisma.userSession.update).toHaveBeenCalled();
    expect(result.errorCount).toBe(0); // telegram error is caught internally, not counted as session error
  });

  // ============================================
  // Email notifications
  // ============================================

  it('should send email when RESEND_API_KEY is configured', async () => {
    process.env.RESEND_API_KEY = 'test-api-key';

    const session = makeSession({
      user: {
        id: 'user-email',
        email: 'email@test.com',
        notificationSettings: { telegramChatId: null, telegramEnabled: false },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);

    const result = await checkSessionExpiring();

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'email@test.com',
        subject: expect.any(String),
        html: expect.any(String),
      })
    );
    expect(result.metadata?.emailsSent).toBe(1);
    expect(result.successCount).toBe(1);
  });

  it('should NOT send email when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY;

    const session = makeSession({
      user: {
        id: 'user-noemail',
        email: 'noemail@test.com',
        notificationSettings: { telegramChatId: null, telegramEnabled: false },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);

    const result = await checkSessionExpiring();

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result.metadata?.emailsSent).toBe(0);
  });

  it('should continue processing when email send fails', async () => {
    process.env.RESEND_API_KEY = 'test-key';

    const session = makeSession({
      user: {
        id: 'user-emailfail',
        email: 'emailfail@test.com',
        notificationSettings: { telegramChatId: null, telegramEnabled: false },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);
    mockSendEmail.mockRejectedValue(new Error('Email service down'));

    const result = await checkSessionExpiring();

    expect(mockPrisma.userSession.update).toHaveBeenCalled();
    // Email error is caught internally, but session itself may not be counted as notified
    expect(result.errorCount).toBe(0);
  });

  // ============================================
  // Metadata update
  // ============================================

  it('should update session metadata with lastExpirationNotifiedAt after notifying', async () => {
    const session = makeSession({
      metadata: { someOtherField: 'value' },
      user: {
        id: 'user-meta',
        email: 'meta@test.com',
        notificationSettings: { telegramChatId: 'chat-meta', telegramEnabled: true },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);

    await checkSessionExpiring();

    expect(mockPrisma.userSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: {
        metadata: expect.objectContaining({
          someOtherField: 'value',
          lastExpirationNotifiedAt: expect.any(String),
        }),
      },
    });
  });

  // ============================================
  // Urgency text
  // ============================================

  it('should use URGENTE label when daysLeft <= 1', async () => {
    const session = makeSession({
      expiresAt: new Date(Date.now() + 18 * 60 * 60 * 1000), // 18h = 1 day
      user: {
        id: 'user-urgent',
        email: 'urgent@test.com',
        notificationSettings: { telegramChatId: 'chat-urgent', telegramEnabled: true },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);

    await checkSessionExpiring();

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('URGENTE'),
      })
    );
  });

  it('should use Atenção label when daysLeft is 2', async () => {
    const session = makeSession({
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // exactly 2 days
      user: {
        id: 'user-atencao',
        email: 'atencao@test.com',
        notificationSettings: { telegramChatId: 'chat-atencao', telegramEnabled: true },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);

    await checkSessionExpiring();

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Atenção'),
      })
    );
  });

  // ============================================
  // Site name resolution
  // ============================================

  it('should use friendly site name in notification message', async () => {
    const session = makeSession({
      site: 'FACEBOOK_MARKETPLACE',
      user: {
        id: 'user-fb',
        email: 'fb@test.com',
        notificationSettings: { telegramChatId: 'chat-fb', telegramEnabled: true },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);

    await checkSessionExpiring();

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Facebook Marketplace'),
      })
    );
  });

  it('should fall back to raw site string when site name is unknown', async () => {
    const session = makeSession({
      site: 'UNKNOWN_SITE_XYZ',
      user: {
        id: 'user-unknown-site',
        email: 'unknown@test.com',
        notificationSettings: { telegramChatId: 'chat-unk', telegramEnabled: true },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([session]);

    await checkSessionExpiring();

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('UNKNOWN_SITE_XYZ'),
      })
    );
  });

  // ============================================
  // Error handling
  // ============================================

  it('should count errorCount when session processing throws', async () => {
    const badSession = makeSession({
      user: {
        id: 'user-throw',
        email: 'throw@test.com',
        notificationSettings: { telegramChatId: 'chat-throw', telegramEnabled: true },
        telegramAccounts: [],
      },
    });

    mockPrisma.userSession.findMany.mockResolvedValue([badSession]);
    mockPrisma.userSession.update.mockRejectedValue(new Error('Update failed'));
    mockSendTelegramMessage.mockResolvedValue(undefined); // telegram succeeds

    const result = await checkSessionExpiring();

    expect(result.errorCount).toBe(1);
  });

  it('should return error result when DB query throws fatally', async () => {
    mockPrisma.userSession.findMany.mockRejectedValue(new Error('DB unavailable'));

    const result = await checkSessionExpiring();

    expect(result.errorCount).toBeGreaterThanOrEqual(1);
    expect(result.summary).toContain('DB unavailable');
  });

  it('should always resolve and never throw', async () => {
    mockPrisma.userSession.findMany.mockRejectedValue(new Error('Fatal'));

    await expect(checkSessionExpiring()).resolves.not.toThrow();
  });
});

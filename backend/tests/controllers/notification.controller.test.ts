import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// HOISTED MOCKS
// ============================================================

const {
  mockPrisma,
  mockGenerateLinkCode,
  mockSendTelegramMessage,
  mockGetChatIdForUser,
  mockSendWelcomeEmail,
  mockLogInfo,
  mockLogError,
} = vi.hoisted(() => ({
  mockPrisma: {
    notificationSettings: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    notificationLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
  mockGenerateLinkCode: vi.fn(),
  mockSendTelegramMessage: vi.fn(),
  mockGetChatIdForUser: vi.fn(),
  mockSendWelcomeEmail: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../../src/services/telegramService', () => ({
  generateLinkCode: mockGenerateLinkCode,
  sendTelegramMessage: mockSendTelegramMessage,
  getChatIdForUser: mockGetChatIdForUser,
}));
vi.mock('../../src/services/emailService', () => ({
  sendWelcomeEmail: mockSendWelcomeEmail,
}));
vi.mock('../../src/constants/telegram', () => ({
  TELEGRAM_BOT_USERNAME: 'RadarOneAlertaBot',
}));
vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: mockLogInfo,
  logError: mockLogError,
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

// Import AFTER mocks
import { NotificationController } from '../../src/controllers/notification.controller';
import { getNotificationHistory } from '../../src/controllers/notificationController';

// ============================================================
// HELPERS
// ============================================================

function makeReq(overrides: Partial<any> = {}): any {
  return {
    userId: 'user-1',
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}

function makeRes(): any {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

const mockSettings = {
  userId: 'user-1',
  emailEnabled: true,
  telegramEnabled: false,
  telegramUsername: null,
  telegramChatId: null,
  updatedAt: new Date('2026-01-01'),
};

// ============================================================
// TESTS
// ============================================================

describe('NotificationController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default NODE_ENV
    process.env.NODE_ENV = 'test';
  });

  // ----------------------------------------------------------
  // getSettings
  // ----------------------------------------------------------
  describe('getSettings', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined });
      const res = makeRes();

      await NotificationController.getSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Não autenticado' });
    });

    it('returns existing settings', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.notificationSettings.findUnique.mockResolvedValue(mockSettings);

      await NotificationController.getSettings(req, res);

      expect(mockPrisma.notificationSettings.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(res.json).toHaveBeenCalledWith({
        emailEnabled: true,
        telegramEnabled: false,
        telegramUsername: null,
        telegramChatId: null, // null because telegramChatId is null
        updatedAt: mockSettings.updatedAt,
      });
    });

    it('creates default settings when none exist', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.notificationSettings.findUnique.mockResolvedValue(null);
      mockPrisma.notificationSettings.create.mockResolvedValue(mockSettings);

      await NotificationController.getSettings(req, res);

      expect(mockPrisma.notificationSettings.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          emailEnabled: true,
          telegramEnabled: false,
          telegramUsername: null,
          telegramChatId: null,
        },
      });
      expect(res.json).toHaveBeenCalled();
    });

    it('masks real telegramChatId with "linked"', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.notificationSettings.findUnique.mockResolvedValue({
        ...mockSettings,
        telegramChatId: '12345678',
      });

      await NotificationController.getSettings(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.telegramChatId).toBe('linked');
    });

    it('returns 500 on service error', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.notificationSettings.findUnique.mockRejectedValue(new Error('DB down'));

      await NotificationController.getSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Erro ao buscar configurações de notificação' })
      );
    });
  });

  // ----------------------------------------------------------
  // updateSettings
  // ----------------------------------------------------------
  describe('updateSettings', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, body: { emailEnabled: true } });
      const res = makeRes();

      await NotificationController.updateSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 when both channels are disabled', async () => {
      const req = makeReq({ body: { emailEnabled: false, telegramEnabled: false } });
      const res = makeRes();

      await NotificationController.updateSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Pelo menos 1 canal de notificação deve estar ativo' })
      );
    });

    it('returns 400 for invalid telegram username format', async () => {
      const req = makeReq({
        body: { emailEnabled: true, telegramEnabled: true, telegramUsername: 'ab' }, // too short
      });
      const res = makeRes();

      await NotificationController.updateSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Telegram username inválido' })
      );
    });

    it('updates existing settings', async () => {
      const req = makeReq({ body: { emailEnabled: true, telegramEnabled: false } });
      const res = makeRes();
      const updatedSettings = { ...mockSettings, emailEnabled: true };

      mockPrisma.notificationSettings.findUnique.mockResolvedValue(mockSettings);
      mockPrisma.notificationSettings.update.mockResolvedValue(updatedSettings);

      await NotificationController.updateSettings(req, res);

      expect(mockPrisma.notificationSettings.update).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Configurações atualizadas com sucesso' })
      );
    });

    it('creates settings when none exist', async () => {
      const req = makeReq({ body: { emailEnabled: true, telegramEnabled: false } });
      const res = makeRes();

      mockPrisma.notificationSettings.findUnique.mockResolvedValue(null);
      mockPrisma.notificationSettings.create.mockResolvedValue(mockSettings);

      await NotificationController.updateSettings(req, res);

      expect(mockPrisma.notificationSettings.create).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Configurações atualizadas com sucesso' })
      );
    });

    it('normalizes telegram username by adding @ prefix', async () => {
      const req = makeReq({
        body: { emailEnabled: true, telegramEnabled: true, telegramUsername: 'validuser123' },
      });
      const res = makeRes();
      const updatedSettings = { ...mockSettings, telegramEnabled: true, telegramUsername: '@validuser123' };

      mockPrisma.notificationSettings.findUnique.mockResolvedValue(mockSettings);
      mockPrisma.notificationSettings.update.mockResolvedValue(updatedSettings);

      await NotificationController.updateSettings(req, res);

      expect(mockPrisma.notificationSettings.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ telegramUsername: '@validuser123' }),
        })
      );
    });

    it('keeps @ prefix when already present', async () => {
      const req = makeReq({
        body: { emailEnabled: true, telegramEnabled: true, telegramUsername: '@validuser123' },
      });
      const res = makeRes();
      const updatedSettings = { ...mockSettings, telegramEnabled: true, telegramUsername: '@validuser123' };

      mockPrisma.notificationSettings.findUnique.mockResolvedValue(mockSettings);
      mockPrisma.notificationSettings.update.mockResolvedValue(updatedSettings);

      await NotificationController.updateSettings(req, res);

      expect(mockPrisma.notificationSettings.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ telegramUsername: '@validuser123' }),
        })
      );
    });

    it('sets telegramUsername to null when empty string provided', async () => {
      const req = makeReq({
        body: { emailEnabled: true, telegramEnabled: false, telegramUsername: '' },
      });
      const res = makeRes();

      mockPrisma.notificationSettings.findUnique.mockResolvedValue(mockSettings);
      mockPrisma.notificationSettings.update.mockResolvedValue(mockSettings);

      await NotificationController.updateSettings(req, res);

      expect(mockPrisma.notificationSettings.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ telegramUsername: null }),
        })
      );
    });

    it('returns 500 on service error', async () => {
      const req = makeReq({ body: { emailEnabled: true } });
      const res = makeRes();
      mockPrisma.notificationSettings.findUnique.mockRejectedValue(new Error('DB down'));

      await NotificationController.updateSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----------------------------------------------------------
  // testEmail
  // ----------------------------------------------------------
  describe('testEmail', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined });
      const res = makeRes();

      await NotificationController.testEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 404 when user not found', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await NotificationController.testEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Usuário não encontrado' });
    });

    it('sends test email successfully', async () => {
      const req = makeReq();
      const res = makeRes();
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockSendWelcomeEmail.mockResolvedValue({ success: true });

      await NotificationController.testEmail(req, res);

      expect(mockSendWelcomeEmail).toHaveBeenCalledWith('test@example.com', 'Test User');
      expect(res.json).toHaveBeenCalledWith({
        message: 'Email de teste enviado com sucesso!',
        to: 'test@example.com',
        service: 'Resend',
      });
    });

    it('returns 500 when email sending fails', async () => {
      const req = makeReq();
      const res = makeRes();
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockSendWelcomeEmail.mockResolvedValue({ success: false, error: 'SMTP unavailable' });

      await NotificationController.testEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Erro ao enviar email de teste',
        message: 'SMTP unavailable',
      });
    });

    it('returns 500 on service exception', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.user.findUnique.mockRejectedValue(new Error('DB crash'));

      await NotificationController.testEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----------------------------------------------------------
  // generateTelegramLinkCode
  // ----------------------------------------------------------
  describe('generateTelegramLinkCode', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined });
      const res = makeRes();

      await NotificationController.generateTelegramLinkCode(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('generates link code successfully', async () => {
      const req = makeReq();
      const res = makeRes();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      mockGenerateLinkCode.mockResolvedValue({ code: 'LINK-ABC123', expiresAt });

      await NotificationController.generateTelegramLinkCode(req, res);

      expect(mockGenerateLinkCode).toHaveBeenCalledWith('user-1');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'LINK-ABC123',
          expiresAt,
          botUsername: '@RadarOneAlertaBot',
          instructions: expect.arrayContaining([
            expect.stringContaining('RadarOneAlertaBot'),
          ]),
        })
      );
    });

    it('returns 500 on service error', async () => {
      const req = makeReq();
      const res = makeRes();
      mockGenerateLinkCode.mockRejectedValue(new Error('Service error'));

      await NotificationController.generateTelegramLinkCode(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----------------------------------------------------------
  // testTelegram
  // ----------------------------------------------------------
  describe('testTelegram', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined });
      const res = makeRes();

      await NotificationController.testTelegram(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 when telegram is not linked', async () => {
      const req = makeReq();
      const res = makeRes();
      mockGetChatIdForUser.mockResolvedValue(null);

      await NotificationController.testTelegram(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Telegram não vinculado' })
      );
    });

    it('sends test telegram message successfully', async () => {
      const req = makeReq();
      const res = makeRes();
      mockGetChatIdForUser.mockResolvedValue('12345678');
      mockSendTelegramMessage.mockResolvedValue({ success: true, messageId: 42 });

      await NotificationController.testTelegram(req, res);

      expect(mockSendTelegramMessage).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: '12345678' })
      );
      expect(res.json).toHaveBeenCalledWith({
        message: 'Mensagem de teste enviada com sucesso',
        messageId: 42,
      });
    });

    it('returns 500 when telegram message sending fails', async () => {
      const req = makeReq();
      const res = makeRes();
      mockGetChatIdForUser.mockResolvedValue('12345678');
      mockSendTelegramMessage.mockResolvedValue({
        success: false,
        error: 'Chat not found',
      });

      await NotificationController.testTelegram(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Erro ao enviar mensagem de teste',
        message: 'Chat not found',
      });
    });

    it('returns 500 on service exception', async () => {
      const req = makeReq();
      const res = makeRes();
      mockGetChatIdForUser.mockRejectedValue(new Error('Telegram API down'));

      await NotificationController.testTelegram(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

// ============================================================
// getNotificationHistory (functional controller)
// ============================================================

describe('getNotificationHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if userId is missing', async () => {
    const req = makeReq({ userId: undefined, query: {} });
    const res = makeRes();

    await getNotificationHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Usuário não autenticado' });
  });

  it('returns paginated notification history with defaults', async () => {
    const notifications = [
      {
        id: 'notif-1',
        channel: 'EMAIL',
        title: 'New listing',
        message: 'Found a match',
        target: 'test@example.com',
        status: 'SUCCESS',
        error: null,
        createdAt: new Date('2026-01-01'),
      },
    ];

    mockPrisma.notificationLog.findMany.mockResolvedValue(notifications);
    mockPrisma.notificationLog.count.mockResolvedValue(1);

    const req = makeReq({ query: {} });
    const res = makeRes();

    await getNotificationHistory(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: notifications,
        pagination: expect.objectContaining({
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasMore: false,
        }),
      })
    );
  });

  it('filters by userId', async () => {
    mockPrisma.notificationLog.findMany.mockResolvedValue([]);
    mockPrisma.notificationLog.count.mockResolvedValue(0);

    const req = makeReq({ query: {} });
    const res = makeRes();

    await getNotificationHistory(req, res);

    expect(mockPrisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
    expect(mockPrisma.notificationLog.count).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('caps limit at 100', async () => {
    mockPrisma.notificationLog.findMany.mockResolvedValue([]);
    mockPrisma.notificationLog.count.mockResolvedValue(0);

    const req = makeReq({ query: { limit: '999' } });
    const res = makeRes();

    await getNotificationHistory(req, res);

    expect(mockPrisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it('computes correct skip for page 2', async () => {
    mockPrisma.notificationLog.findMany.mockResolvedValue([]);
    mockPrisma.notificationLog.count.mockResolvedValue(25);

    const req = makeReq({ query: { page: '2', limit: '10' } });
    const res = makeRes();

    await getNotificationHistory(req, res);

    expect(mockPrisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.hasMore).toBe(true); // 3 pages total, on page 2
  });

  it('normalizes page=0 to page 1', async () => {
    mockPrisma.notificationLog.findMany.mockResolvedValue([]);
    mockPrisma.notificationLog.count.mockResolvedValue(0);

    const req = makeReq({ query: { page: '0' } });
    const res = makeRes();

    await getNotificationHistory(req, res);

    expect(mockPrisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 })
    );
  });

  it('returns 500 on database error', async () => {
    mockPrisma.notificationLog.findMany.mockRejectedValue(new Error('DB crash'));
    mockPrisma.notificationLog.count.mockRejectedValue(new Error('DB crash'));

    const req = makeReq({ query: {} });
    const res = makeRes();

    await getNotificationHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Erro ao buscar histórico de notificações',
    });
  });
});

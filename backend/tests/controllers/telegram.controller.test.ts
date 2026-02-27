import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for TelegramController
 *
 * Tests:
 * - generateConnectToken: auth guard, token generation
 * - getStatus: auth guard, status lookup
 * - disconnect: auth guard, disconnect logic
 * - configureWebhook: admin-only, webhook setup
 * - webhookHealth: admin-only, health diagnostics
 * - diagnose: admin-only, diagnose endpoint
 * - reconfigureWebhook: admin-only, full reconfiguration flow
 * - pingWebhook: admin-only, internal test
 * - handleWebhook: secret validation, message routing
 */

// ============================================
// Mocks (hoisted)
// ============================================

const {
  mockPrismaUser,
  mockGenerateConnectToken,
  mockGetTelegramStatus,
  mockDisconnectTelegram,
  mockProcessStartCommand,
  mockProcessWebhookMessage,
  mockValidateWebhookSecret,
  mockGetWebhookInfo,
  mockSetTelegramWebhook,
  mockGetBotInfo,
  mockDiagnoseTelegram,
  mockGetExpectedWebhookUrl,
} = vi.hoisted(() => ({
  mockPrismaUser: {
    findUnique: vi.fn(),
  },
  mockGenerateConnectToken: vi.fn(),
  mockGetTelegramStatus: vi.fn(),
  mockDisconnectTelegram: vi.fn(),
  mockProcessStartCommand: vi.fn(),
  mockProcessWebhookMessage: vi.fn(),
  mockValidateWebhookSecret: vi.fn(),
  mockGetWebhookInfo: vi.fn(),
  mockSetTelegramWebhook: vi.fn(),
  mockGetBotInfo: vi.fn(),
  mockDiagnoseTelegram: vi.fn(),
  mockGetExpectedWebhookUrl: vi.fn(),
}));

// Mock the server module (telegram controller uses dynamic import('../server'))
vi.mock('../../src/server', () => ({
  prisma: {
    user: mockPrismaUser,
  },
}));

vi.mock('../../src/services/telegramService', () => ({
  generateConnectToken: mockGenerateConnectToken,
  getTelegramStatus: mockGetTelegramStatus,
  disconnectTelegram: mockDisconnectTelegram,
  processStartCommand: mockProcessStartCommand,
  processWebhookMessage: mockProcessWebhookMessage,
  validateWebhookSecret: mockValidateWebhookSecret,
  getWebhookInfo: mockGetWebhookInfo,
  setTelegramWebhook: mockSetTelegramWebhook,
  getBotInfo: mockGetBotInfo,
  diagnoseTelegram: mockDiagnoseTelegram,
  getExpectedWebhookUrl: mockGetExpectedWebhookUrl,
}));

vi.mock('../../src/constants/telegram', () => ({
  TELEGRAM_BOT_USERNAME: 'RadarOneAlertaBot',
}));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

import { Request, Response } from 'express';
import { TelegramController } from '../../src/controllers/telegram.controller';

// ============================================
// Helpers
// ============================================

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    method: 'POST',
    path: '/api/telegram',
    ip: '127.0.0.1',
    get: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

const MOCK_ADMIN_USER = { id: 'admin-1', role: 'ADMIN' };
const MOCK_REGULAR_USER = { id: 'user-1', role: 'USER' };

// ============================================
// generateConnectToken
// ============================================

describe('TelegramController.generateConnectToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    const req = createMockReq({});
    const res = createMockRes();

    await TelegramController.generateConnectToken(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Não autenticado' });
  });

  it('should return connect token on success', async () => {
    const futureDate = new Date(Date.now() + 10 * 60 * 1000);
    mockGenerateConnectToken.mockResolvedValue({
      connectUrl: 'https://t.me/RadarOneAlertaBot?start=TOKEN123',
      token: 'TOKEN123',
      expiresAt: futureDate,
    });

    const req = createMockReq({}) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await TelegramController.generateConnectToken(req, res);

    expect(mockGenerateConnectToken).toHaveBeenCalledWith('user-1');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        connectUrl: 'https://t.me/RadarOneAlertaBot?start=TOKEN123',
        token: 'TOKEN123',
        expiresAt: futureDate,
        botUsername: 'RadarOneAlertaBot',
      })
    );
  });

  it('should return 500 on service error', async () => {
    mockGenerateConnectToken.mockRejectedValue(new Error('Service error'));

    const req = createMockReq({}) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await TelegramController.generateConnectToken(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao gerar token de conexão' });
  });
});

// ============================================
// getStatus
// ============================================

describe('TelegramController.getStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    const req = createMockReq({});
    const res = createMockRes();

    await TelegramController.getStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Não autenticado' });
  });

  it('should return status from service', async () => {
    const statusData = {
      connected: true,
      username: '@testuser',
      chatId: '12345',
    };
    mockGetTelegramStatus.mockResolvedValue(statusData);

    const req = createMockReq({}) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await TelegramController.getStatus(req, res);

    expect(mockGetTelegramStatus).toHaveBeenCalledWith('user-1');
    expect(res.json).toHaveBeenCalledWith(statusData);
  });

  it('should return 500 on service error', async () => {
    mockGetTelegramStatus.mockRejectedValue(new Error('Service error'));

    const req = createMockReq({}) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await TelegramController.getStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao buscar status da conexão' });
  });
});

// ============================================
// disconnect
// ============================================

describe('TelegramController.disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    const req = createMockReq({});
    const res = createMockRes();

    await TelegramController.disconnect(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Não autenticado' });
  });

  it('should disconnect and return success', async () => {
    mockDisconnectTelegram.mockResolvedValue({ success: true });

    const req = createMockReq({}) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await TelegramController.disconnect(req, res);

    expect(mockDisconnectTelegram).toHaveBeenCalledWith('user-1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Telegram desconectado com sucesso',
    });
  });

  it('should return 500 if disconnect fails', async () => {
    mockDisconnectTelegram.mockResolvedValue({
      success: false,
      error: 'Could not disconnect',
    });

    const req = createMockReq({}) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await TelegramController.disconnect(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Could not disconnect' });
  });

  it('should return 500 on thrown error', async () => {
    mockDisconnectTelegram.mockRejectedValue(new Error('Service error'));

    const req = createMockReq({}) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await TelegramController.disconnect(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao desconectar Telegram' });
  });
});

// ============================================
// configureWebhook (admin)
// ============================================

describe('TelegramController.configureWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-123';
    process.env.BACKEND_BASE_URL = 'https://api.radarone.com.br';
  });

  it('should return 401 if user is not authenticated', async () => {
    const req = createMockReq({});
    const res = createMockRes();

    await TelegramController.configureWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 403 if user is not admin', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_REGULAR_USER);

    const req = createMockReq({}) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await TelegramController.configureWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Acesso negado. Apenas administradores.' })
    );
  });

  it('should return 403 if user is not found', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.configureWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return 500 if TELEGRAM_WEBHOOK_SECRET is not set', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.configureWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'TELEGRAM_WEBHOOK_SECRET não configurado' })
    );
  });

  it('should return 500 if setTelegramWebhook fails', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);
    mockSetTelegramWebhook.mockResolvedValue({ success: false, error: 'API error' });

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.configureWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Erro ao configurar webhook' })
    );
  });

  it('should return success when webhook is configured and matches', async () => {
    const expectedUrl = 'https://api.radarone.com.br/api/telegram/webhook?secret=test-secret-123';
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);
    mockSetTelegramWebhook.mockResolvedValue({ success: true });
    mockGetWebhookInfo.mockResolvedValue({
      success: true,
      url: expectedUrl,
      pendingUpdateCount: 0,
      lastErrorMessage: null,
    });

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.configureWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Webhook configurado com sucesso',
      })
    );
  });

  it('should return partial success when webhook is set but URL does not match', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);
    mockSetTelegramWebhook.mockResolvedValue({ success: true });
    mockGetWebhookInfo.mockResolvedValue({
      success: true,
      url: 'https://different-url.com/webhook',
      pendingUpdateCount: 0,
    });

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.configureWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Webhook configurado mas validação falhou',
      })
    );
  });

  it('should return 500 on thrown error', async () => {
    mockPrismaUser.findUnique.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.configureWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao configurar webhook' });
  });
});

// ============================================
// webhookHealth (admin)
// ============================================

describe('TelegramController.webhookHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token-123';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-123';
    process.env.BACKEND_BASE_URL = 'https://api.radarone.com.br';
  });

  it('should return 401 if user is not authenticated', async () => {
    const req = createMockReq({});
    const res = createMockRes();

    await TelegramController.webhookHealth(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 403 if user is not admin', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_REGULAR_USER);

    const req = createMockReq({}) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await TelegramController.webhookHealth(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return health data for admin with webhook OK', async () => {
    const expectedUrl = 'https://api.radarone.com.br/api/telegram/webhook?secret=test-secret-123';
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);
    mockGetWebhookInfo.mockResolvedValue({
      success: true,
      url: expectedUrl,
      hasCustomCertificate: false,
      pendingUpdateCount: 0,
      lastErrorDate: null,
      lastErrorMessage: null,
      maxConnections: 40,
      ipAddress: '1.2.3.4',
      error: null,
    });

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.webhookHealth(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body).toHaveProperty('local');
    expect(body).toHaveProperty('telegram');
    expect(body).toHaveProperty('diagnostics');
    expect(body.diagnostics.webhookMatches).toBe(true);
    expect(body.diagnostics.status).toContain('OK');
  });

  it('should report WARNING when webhook URL does not match', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);
    mockGetWebhookInfo.mockResolvedValue({
      success: true,
      url: 'https://different.com/webhook',
      pendingUpdateCount: 0,
    });

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.webhookHealth(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.diagnostics.webhookMatches).toBe(false);
    expect(body.diagnostics.status).toContain('WARNING');
  });

  it('should report ERROR when webhook is not configured', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);
    mockGetWebhookInfo.mockResolvedValue({
      success: false,
      url: null,
      pendingUpdateCount: 0,
    });

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.webhookHealth(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.diagnostics.webhookMatches).toBe(false);
    expect(body.diagnostics.status).toContain('ERROR');
  });

  it('should return 500 on thrown error', async () => {
    mockPrismaUser.findUnique.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.webhookHealth(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================
// diagnose (admin)
// ============================================

describe('TelegramController.diagnose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    const req = createMockReq({});
    const res = createMockRes();

    await TelegramController.diagnose(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 403 if user is not admin', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_REGULAR_USER);

    const req = createMockReq({}) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await TelegramController.diagnose(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should call diagnoseTelegram without targetUserId when not specified', async () => {
    const diagnoseResult = { ok: true, data: [] };
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);
    mockDiagnoseTelegram.mockResolvedValue(diagnoseResult);

    const req = createMockReq({ query: {} }) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.diagnose(req, res);

    expect(mockDiagnoseTelegram).toHaveBeenCalledWith(undefined);
    expect(res.json).toHaveBeenCalledWith(diagnoseResult);
  });

  it('should pass targetUserId to diagnoseTelegram when specified', async () => {
    const diagnoseResult = { ok: true, userId: 'target-user-1' };
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);
    mockDiagnoseTelegram.mockResolvedValue(diagnoseResult);

    const req = createMockReq({ query: { userId: 'target-user-1' } }) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.diagnose(req, res);

    expect(mockDiagnoseTelegram).toHaveBeenCalledWith('target-user-1');
    expect(res.json).toHaveBeenCalledWith(diagnoseResult);
  });

  it('should return 500 on thrown error', async () => {
    mockPrismaUser.findUnique.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.diagnose(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================
// reconfigureWebhook (admin)
// ============================================

describe('TelegramController.reconfigureWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-123';
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token-123';
    process.env.BACKEND_BASE_URL = 'https://api.radarone.com.br';
    mockGetExpectedWebhookUrl.mockReturnValue(
      'https://api.radarone.com.br/api/telegram/webhook?secret=test-secret-123'
    );
  });

  it('should return 401 if user is not authenticated', async () => {
    const req = createMockReq({});
    const res = createMockRes();

    await TelegramController.reconfigureWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 403 if user is not admin', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_REGULAR_USER);

    const req = createMockReq({}) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await TelegramController.reconfigureWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return 500 if TELEGRAM_WEBHOOK_SECRET is not set', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.reconfigureWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'TELEGRAM_WEBHOOK_SECRET não configurado' })
    );
  });

  it('should return 500 if TELEGRAM_BOT_TOKEN is not set', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.reconfigureWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'TELEGRAM_BOT_TOKEN não configurado' })
    );
  });

  it('should return 500 if getBotInfo fails (invalid token)', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);
    mockGetBotInfo.mockResolvedValue({
      success: false,
      error: 'Unauthorized',
      errorCode: 401,
    });

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.reconfigureWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'TELEGRAM_BOT_TOKEN inválido' })
    );
  });

  it('should return 500 if setTelegramWebhook fails', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);
    mockGetBotInfo.mockResolvedValue({ success: true, username: 'RadarOneAlertaBot', id: 123, isBot: true });
    mockGetWebhookInfo.mockResolvedValue({ success: false, url: null, pendingUpdateCount: 0 });
    mockSetTelegramWebhook.mockResolvedValue({ success: false, error: 'API error' });

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.reconfigureWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Erro ao configurar webhook' })
    );
  });

  it('should reconfigure webhook successfully', async () => {
    const webhookUrl = 'https://api.radarone.com.br/api/telegram/webhook?secret=test-secret-123';
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);
    mockGetBotInfo.mockResolvedValue({
      success: true,
      username: 'RadarOneAlertaBot',
      id: 123,
      isBot: true,
    });
    mockGetWebhookInfo
      .mockResolvedValueOnce({ success: false, url: null, pendingUpdateCount: 0 }) // before
      .mockResolvedValueOnce({ success: true, url: webhookUrl, pendingUpdateCount: 0 }); // after
    mockSetTelegramWebhook.mockResolvedValue({ success: true });

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.reconfigureWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Webhook reconfigurado com sucesso',
        bot: expect.objectContaining({ username: 'RadarOneAlertaBot' }),
      })
    );
  });

  it('should return partial success if webhook is set but validation fails', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);
    mockGetBotInfo.mockResolvedValue({
      success: true,
      username: 'RadarOneAlertaBot',
      id: 123,
      isBot: true,
    });
    mockGetWebhookInfo
      .mockResolvedValueOnce({ success: false, url: null, pendingUpdateCount: 0 })
      .mockResolvedValueOnce({ success: true, url: 'https://different.com/webhook', pendingUpdateCount: 0 });
    mockSetTelegramWebhook.mockResolvedValue({ success: true });

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.reconfigureWebhook(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toContain('validação falhou');
  });

  it('should return 500 on thrown error', async () => {
    mockPrismaUser.findUnique.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.reconfigureWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================
// pingWebhook (admin)
// ============================================

describe('TelegramController.pingWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-abc';
  });

  it('should return 401 if user is not authenticated', async () => {
    const req = createMockReq({});
    const res = createMockRes();

    await TelegramController.pingWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 403 if user is not admin', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_REGULAR_USER);

    const req = createMockReq({}) as any;
    req.userId = 'user-1';
    const res = createMockRes();

    await TelegramController.pingWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return ping result with secret validation tests', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_ADMIN_USER);
    // validateWebhookSecret is called with 4 different args
    mockValidateWebhookSecret
      .mockReturnValueOnce(true)   // validQuery (correct secret)
      .mockReturnValueOnce(false)  // invalidQuery (wrong-secret)
      .mockReturnValueOnce(false)  // undefinedQuery
      .mockReturnValueOnce(false); // emptyQuery

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.pingWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Ping interno do webhook executado',
        tests: expect.objectContaining({
          secretValidation: expect.objectContaining({
            validSecret: true,
            invalidSecret: false,
            result: 'OK',
          }),
          messageParsing: expect.objectContaining({
            regexMatch: true,
            extractedCode: 'RADAR-TEST12',
          }),
          routing: expect.objectContaining({
            secretConfigured: true,
            secretLength: 'test-secret-abc'.length,
          }),
        }),
      })
    );
  });

  it('should return 500 on thrown error', async () => {
    mockPrismaUser.findUnique.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({}) as any;
    req.userId = 'admin-1';
    const res = createMockRes();

    await TelegramController.pingWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================
// handleWebhook
// ============================================

describe('TelegramController.handleWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
  });

  it('should return 401 if secret is invalid', async () => {
    mockValidateWebhookSecret.mockReturnValue(false);

    const req = createMockReq({
      query: { secret: 'wrong-secret' },
      body: {},
    }) as any;
    req.get = vi.fn().mockReturnValue(undefined);
    const res = createMockRes();

    await TelegramController.handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should return 200 ok for non-message update (callback_query)', async () => {
    mockValidateWebhookSecret.mockReturnValue(true);

    const req = createMockReq({
      query: { secret: 'test-secret' },
      body: { callback_query: { id: '123', data: 'action' } },
    }) as any;
    req.get = vi.fn().mockReturnValue(undefined);
    const res = createMockRes();

    await TelegramController.handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('should process /start command and return 200 on success', async () => {
    mockValidateWebhookSecret.mockReturnValue(true);
    mockProcessStartCommand.mockResolvedValue({ success: true });

    const req = createMockReq({
      query: { secret: 'test-secret' },
      body: {
        message: {
          message_id: 1,
          from: { id: 111, first_name: 'Test', username: 'testuser' },
          chat: { id: 222, type: 'private' },
          text: '/start RADAR-TOKEN123',
          date: Math.floor(Date.now() / 1000),
        },
      },
    }) as any;
    req.get = vi.fn().mockReturnValue(undefined);
    const res = createMockRes();

    await TelegramController.handleWebhook(req, res);

    expect(mockProcessStartCommand).toHaveBeenCalledWith(
      '222',
      'RADAR-TOKEN123',
      111,
      'testuser',
      'Test'
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('should return 200 even when /start command fails', async () => {
    mockValidateWebhookSecret.mockReturnValue(true);
    mockProcessStartCommand.mockResolvedValue({ success: false, error: 'Token expired' });

    const req = createMockReq({
      query: { secret: 'test-secret' },
      body: {
        message: {
          message_id: 1,
          from: { id: 111, first_name: 'Test', username: 'testuser' },
          chat: { id: 222, type: 'private' },
          text: '/start EXPIRED-TOKEN',
          date: Math.floor(Date.now() / 1000),
        },
      },
    }) as any;
    req.get = vi.fn().mockReturnValue(undefined);
    const res = createMockRes();

    await TelegramController.handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, error: 'Token expired' });
  });

  it('should process regular RADAR code message on success', async () => {
    mockValidateWebhookSecret.mockReturnValue(true);
    mockProcessWebhookMessage.mockResolvedValue({ success: true });

    const req = createMockReq({
      query: { secret: 'test-secret' },
      body: {
        message: {
          message_id: 2,
          from: { id: 333, first_name: 'Bob', username: 'bob' },
          chat: { id: 444, type: 'private' },
          text: 'RADAR-ABC123',
          date: Math.floor(Date.now() / 1000),
        },
      },
    }) as any;
    req.get = vi.fn().mockReturnValue(undefined);
    const res = createMockRes();

    await TelegramController.handleWebhook(req, res);

    expect(mockProcessWebhookMessage).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('should return 200 even when processWebhookMessage fails', async () => {
    mockValidateWebhookSecret.mockReturnValue(true);
    mockProcessWebhookMessage.mockResolvedValue({ success: false, error: 'Code not found' });

    const req = createMockReq({
      query: { secret: 'test-secret' },
      body: {
        message: {
          message_id: 2,
          from: { id: 333, first_name: 'Bob', username: 'bob' },
          chat: { id: 444, type: 'private' },
          text: 'RADAR-INVALID',
          date: Math.floor(Date.now() / 1000),
        },
      },
    }) as any;
    req.get = vi.fn().mockReturnValue(undefined);
    const res = createMockRes();

    await TelegramController.handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, error: 'Code not found' });
  });

  it('should accept secret from x-telegram-secret header', async () => {
    mockValidateWebhookSecret.mockReturnValue(true);

    const req = createMockReq({
      query: {},
      body: { callback_query: {} },
    }) as any;
    req.get = vi.fn().mockImplementation((header: string) => {
      if (header === 'x-telegram-secret') return 'test-secret';
      return undefined;
    });
    const res = createMockRes();

    await TelegramController.handleWebhook(req, res);

    // Should validate with the header secret
    expect(mockValidateWebhookSecret).toHaveBeenCalledWith('test-secret');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should accept secret from x-telegram-bot-api-secret-token header', async () => {
    mockValidateWebhookSecret.mockReturnValue(true);

    const req = createMockReq({
      query: {},
      body: { callback_query: {} },
    }) as any;
    req.get = vi.fn().mockImplementation((header: string) => {
      if (header === 'x-telegram-bot-api-secret-token') return 'test-secret';
      return undefined;
    });
    const res = createMockRes();

    await TelegramController.handleWebhook(req, res);

    expect(mockValidateWebhookSecret).toHaveBeenCalledWith('test-secret');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should return 200 with error on thrown exception (always respond to Telegram)', async () => {
    mockValidateWebhookSecret.mockReturnValue(true);
    mockProcessWebhookMessage.mockRejectedValue(new Error('Unexpected failure'));

    const req = createMockReq({
      query: { secret: 'test-secret' },
      body: {
        message: {
          message_id: 3,
          from: { id: 555, first_name: 'Error', username: 'err' },
          chat: { id: 666, type: 'private' },
          text: 'RADAR-ERROR1',
          date: Math.floor(Date.now() / 1000),
        },
      },
    }) as any;
    req.get = vi.fn().mockReturnValue(undefined);
    const res = createMockRes();

    await TelegramController.handleWebhook(req, res);

    // Must return 200 even on error so Telegram doesn't retry
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: 'Unexpected failure' })
    );
  });
});

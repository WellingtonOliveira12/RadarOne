import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Testes de integração para telegramService
 *
 * Casos testados:
 * SISTEMA DE TOKENS (ATUAL):
 * - ✅ Deve gerar token de conexão e invalidar tokens pendentes anteriores
 * - ✅ Deve vincular Telegram com sucesso na primeira vez
 * - ✅ Deve desvincular e re-vincular com sucesso (cenário principal)
 * - ✅ Deve ser idempotente (mesmo chatId, mesmo usuário)
 * - ✅ Deve rejeitar token já usado
 * - ✅ Deve rejeitar token expirado
 * - ✅ Deve rejeitar chatId já vinculado a outro usuário
 * - ✅ Deve limpar vínculos antigos ao criar novo
 *
 * SISTEMA LEGADO (RADAR-XXXXXX):
 * - ✅ Deve gerar código RADAR e vincular com sucesso
 * - ✅ Deve criar TelegramAccount para consistência
 * - ✅ Deve rejeitar chatId já vinculado a outro usuário
 *
 * DESVINCULAÇÃO:
 * - ✅ Deve limpar completamente TelegramAccount, NotificationSettings e tokens pendentes
 */

// Mock do Prisma usando vi.hoisted()
const { mockPrisma } = vi.hoisted(() => {
  const mockPrismaUser = {
    findUnique: vi.fn(),
  };

  const mockPrismaTelegramAccount = {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  };

  const mockPrismaNotificationSettings = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };

  const mockPrismaTelegramConnectToken = {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };

  const mockPrisma = {
    user: mockPrismaUser,
    telegramAccount: mockPrismaTelegramAccount,
    notificationSettings: mockPrismaNotificationSettings,
    telegramConnectToken: mockPrismaTelegramConnectToken,
  } as any;

  return { mockPrisma };
});

// Mock do sendTelegramMessage
const { mockSendTelegramMessage } = vi.hoisted(() => ({
  mockSendTelegramMessage: vi.fn().mockResolvedValue({ success: true, messageId: 123 }),
}));

// Aplicar mocks antes de importar o service
vi.mock('../../src/server', () => ({
  prisma: mockPrisma,
}));

vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { ok: true, result: { message_id: 123 } } }),
  },
}));

// Importar service após os mocks
import {
  generateConnectToken,
  processStartCommand,
  disconnectTelegram,
  generateLinkCode,
  processWebhookMessage,
  getTelegramStatus,
} from '../../src/services/telegramService';

describe('TelegramService - Sistema de Tokens', () => {
  const mockUserId = 'user-123';
  const mockChatId = '987654321';
  const mockUsername = 'testuser';
  const mockUser = {
    id: mockUserId,
    name: 'Test User',
    email: 'test@example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateConnectToken', () => {
    it('deve gerar token de conexão e invalidar tokens pendentes anteriores', async () => {
      // Arrange
      mockPrisma.telegramConnectToken.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.telegramConnectToken.create.mockResolvedValue({
        id: 'token-123',
        userId: mockUserId,
        token: 'abc123xyz456',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
      });

      // Act
      const result = await generateConnectToken(mockUserId);

      // Assert
      expect(mockPrisma.telegramConnectToken.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUserId, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      expect(mockPrisma.telegramConnectToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUserId,
          token: expect.any(String),
          status: 'PENDING',
          expiresAt: expect.any(Date),
        }),
      });
      expect(result.connectUrl).toContain('t.me/RadarOneAlertaBot?start=connect_');
      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('processStartCommand - Vinculação', () => {
    it('deve vincular Telegram com sucesso na primeira vez', async () => {
      // Arrange
      const token = 'abc123xyz456';
      const tokenRecord = {
        id: 'token-123',
        userId: mockUserId,
        token,
        status: 'PENDING' as const,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
      };

      mockPrisma.telegramConnectToken.findUnique.mockResolvedValue(tokenRecord);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.telegramAccount.findUnique.mockResolvedValue(null); // Não existe outro vínculo
      mockPrisma.telegramAccount.findFirst.mockResolvedValue(null); // Não existe vínculo do usuário
      mockPrisma.telegramAccount.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.telegramAccount.create.mockResolvedValue({
        id: 'account-123',
        userId: mockUserId,
        chatId: mockChatId,
        username: `@${mockUsername}`,
        active: true,
        linkedAt: new Date(),
      });
      mockPrisma.notificationSettings.upsert.mockResolvedValue({} as any);
      mockPrisma.telegramConnectToken.update.mockResolvedValue({} as any);

      // Act
      const result = await processStartCommand(mockChatId, `connect_${token}`, 123456, mockUsername, 'Test');

      // Assert
      expect(result.success).toBe(true);
      expect(mockPrisma.telegramAccount.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          chatId: mockChatId,
          username: `@${mockUsername}`,
          active: true,
        },
      });
      expect(mockPrisma.notificationSettings.upsert).toHaveBeenCalled();
      expect(mockPrisma.telegramConnectToken.update).toHaveBeenCalledWith({
        where: { id: tokenRecord.id },
        data: { status: 'USED', usedAt: expect.any(Date) },
      });
    });

    it('deve ser idempotente (mesmo chatId, mesmo usuário)', async () => {
      // Arrange
      const token = 'abc123xyz456';
      const tokenRecord = {
        id: 'token-123',
        userId: mockUserId,
        token,
        status: 'PENDING' as const,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
      };

      const existingAccount = {
        id: 'account-123',
        userId: mockUserId,
        chatId: mockChatId,
        username: `@${mockUsername}`,
        active: true,
        linkedAt: new Date(),
      };

      mockPrisma.telegramConnectToken.findUnique.mockResolvedValue(tokenRecord);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.telegramAccount.findUnique.mockResolvedValue(existingAccount); // Já existe vínculo
      mockPrisma.telegramAccount.update.mockResolvedValue(existingAccount);
      mockPrisma.telegramConnectToken.update.mockResolvedValue({} as any);

      // Act
      const result = await processStartCommand(mockChatId, `connect_${token}`, 123456, mockUsername, 'Test');

      // Assert
      expect(result.success).toBe(true);
      expect(mockPrisma.telegramAccount.create).not.toHaveBeenCalled(); // Não cria novo
      expect(mockPrisma.telegramConnectToken.update).toHaveBeenCalledWith({
        where: { id: tokenRecord.id },
        data: { status: 'USED', usedAt: expect.any(Date) },
      });
    });

    it('deve rejeitar token já usado', async () => {
      // Arrange
      const token = 'abc123xyz456';
      const tokenRecord = {
        id: 'token-123',
        userId: mockUserId,
        token,
        status: 'USED' as const,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date(),
        usedAt: new Date(),
      };

      mockPrisma.telegramConnectToken.findUnique.mockResolvedValue(tokenRecord);

      // Act
      const result = await processStartCommand(mockChatId, `connect_${token}`, 123456, mockUsername, 'Test');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token já usado');
      expect(mockPrisma.telegramAccount.create).not.toHaveBeenCalled();
    });

    it('deve rejeitar token expirado', async () => {
      // Arrange
      const token = 'abc123xyz456';
      const tokenRecord = {
        id: 'token-123',
        userId: mockUserId,
        token,
        status: 'PENDING' as const,
        expiresAt: new Date(Date.now() - 1000), // Expirado
        createdAt: new Date(),
        usedAt: null,
      };

      mockPrisma.telegramConnectToken.findUnique.mockResolvedValue(tokenRecord);
      mockPrisma.telegramConnectToken.update.mockResolvedValue({} as any);

      // Act
      const result = await processStartCommand(mockChatId, `connect_${token}`, 123456, mockUsername, 'Test');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token expirado');
      expect(mockPrisma.telegramConnectToken.update).toHaveBeenCalledWith({
        where: { id: tokenRecord.id },
        data: { status: 'EXPIRED' },
      });
    });

    it('deve rejeitar chatId já vinculado a outro usuário', async () => {
      // Arrange
      const token = 'abc123xyz456';
      const tokenRecord = {
        id: 'token-123',
        userId: mockUserId,
        token,
        status: 'PENDING' as const,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
      };

      const existingAccount = {
        id: 'account-456',
        userId: 'other-user-789', // Outro usuário
        chatId: mockChatId,
        username: '@otheruser',
        active: true,
        linkedAt: new Date(),
      };

      mockPrisma.telegramConnectToken.findUnique.mockResolvedValue(tokenRecord);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.telegramAccount.findUnique.mockResolvedValue(existingAccount); // Já vinculado a outro usuário

      // Act
      const result = await processStartCommand(mockChatId, `connect_${token}`, 123456, mockUsername, 'Test');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Telegram já vinculado a outra conta');
      expect(mockPrisma.telegramAccount.create).not.toHaveBeenCalled();
    });

    it('deve limpar vínculos antigos ao criar novo', async () => {
      // Arrange
      const token = 'abc123xyz456';
      const oldChatId = '111111111';
      const newChatId = '222222222';

      const tokenRecord = {
        id: 'token-123',
        userId: mockUserId,
        token,
        status: 'PENDING' as const,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
      };

      mockPrisma.telegramConnectToken.findUnique.mockResolvedValue(tokenRecord);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.telegramAccount.findUnique.mockResolvedValue(null); // Novo chatId não está em uso
      mockPrisma.telegramAccount.findFirst.mockResolvedValue(null); // Mas usuário pode ter vínculo antigo
      mockPrisma.telegramAccount.deleteMany.mockResolvedValue({ count: 1 }); // Remove vínculo antigo
      mockPrisma.telegramAccount.create.mockResolvedValue({
        id: 'account-new',
        userId: mockUserId,
        chatId: newChatId,
        username: `@${mockUsername}`,
        active: true,
        linkedAt: new Date(),
      });
      mockPrisma.notificationSettings.upsert.mockResolvedValue({} as any);
      mockPrisma.telegramConnectToken.update.mockResolvedValue({} as any);

      // Act
      const result = await processStartCommand(newChatId, `connect_${token}`, 123456, mockUsername, 'Test');

      // Assert
      expect(result.success).toBe(true);
      expect(mockPrisma.telegramAccount.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(mockPrisma.telegramAccount.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          chatId: newChatId,
          username: `@${mockUsername}`,
          active: true,
        },
      });
    });
  });

  describe('processStartCommand - Re-vinculação (Cenário Principal)', () => {
    it('deve desvincular e re-vincular com sucesso', async () => {
      // PASSO 1: Vincular inicialmente
      const token1 = 'token-first';
      const tokenRecord1 = {
        id: 'token-1',
        userId: mockUserId,
        token: token1,
        status: 'PENDING' as const,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
      };

      mockPrisma.telegramConnectToken.findUnique.mockResolvedValue(tokenRecord1);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.telegramAccount.findUnique.mockResolvedValue(null);
      mockPrisma.telegramAccount.findFirst.mockResolvedValue(null);
      mockPrisma.telegramAccount.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.telegramAccount.create.mockResolvedValue({
        id: 'account-1',
        userId: mockUserId,
        chatId: mockChatId,
        username: `@${mockUsername}`,
        active: true,
        linkedAt: new Date(),
      });
      mockPrisma.notificationSettings.upsert.mockResolvedValue({} as any);
      mockPrisma.telegramConnectToken.update.mockResolvedValue({} as any);

      const result1 = await processStartCommand(mockChatId, `connect_${token1}`, 123456, mockUsername, 'Test');
      expect(result1.success).toBe(true);

      // PASSO 2: Desvincular
      mockPrisma.telegramAccount.findFirst.mockResolvedValue({
        id: 'account-1',
        userId: mockUserId,
        chatId: mockChatId,
        username: `@${mockUsername}`,
        active: true,
        linkedAt: new Date(),
      });
      mockPrisma.telegramAccount.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.notificationSettings.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.telegramConnectToken.updateMany.mockResolvedValue({ count: 0 });

      const resultDisconnect = await disconnectTelegram(mockUserId);
      expect(resultDisconnect.success).toBe(true);

      // PASSO 3: Re-vincular com novo token
      const token2 = 'token-second';
      const tokenRecord2 = {
        id: 'token-2',
        userId: mockUserId,
        token: token2,
        status: 'PENDING' as const,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
      };

      mockPrisma.telegramConnectToken.findUnique.mockResolvedValue(tokenRecord2);
      mockPrisma.telegramAccount.findUnique.mockResolvedValue(null); // Não existe mais (foi deletado)
      mockPrisma.telegramAccount.findFirst.mockResolvedValue(null);
      mockPrisma.telegramAccount.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.telegramAccount.create.mockResolvedValue({
        id: 'account-2',
        userId: mockUserId,
        chatId: mockChatId,
        username: `@${mockUsername}`,
        active: true,
        linkedAt: new Date(),
      });

      const result2 = await processStartCommand(mockChatId, `connect_${token2}`, 123456, mockUsername, 'Test');

      // Assert
      expect(result2.success).toBe(true);
      expect(mockPrisma.telegramAccount.create).toHaveBeenCalledTimes(2); // Uma vez no primeiro link, outra no re-link
    });
  });

  describe('disconnectTelegram', () => {
    it('deve limpar completamente TelegramAccount, NotificationSettings e tokens pendentes', async () => {
      // Arrange
      const existingAccount = {
        id: 'account-123',
        userId: mockUserId,
        chatId: mockChatId,
        username: `@${mockUsername}`,
        active: true,
        linkedAt: new Date(),
      };

      mockPrisma.telegramAccount.findFirst.mockResolvedValue(existingAccount);
      mockPrisma.telegramAccount.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.notificationSettings.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.telegramConnectToken.updateMany.mockResolvedValue({ count: 2 }); // Invalida 2 tokens pendentes

      // Act
      const result = await disconnectTelegram(mockUserId);

      // Assert
      expect(result.success).toBe(true);
      expect(mockPrisma.telegramAccount.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(mockPrisma.notificationSettings.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          telegramEnabled: false,
          telegramChatId: null,
          telegramUsername: null,
          telegramLinkCode: null,
          telegramLinkExpiresAt: null,
        },
      });
      expect(mockPrisma.telegramConnectToken.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUserId, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
    });
  });

  describe('getTelegramStatus', () => {
    it('deve retornar connected=true quando há TelegramAccount ativo', async () => {
      // Arrange
      const account = {
        id: 'account-123',
        userId: mockUserId,
        chatId: mockChatId,
        username: `@${mockUsername}`,
        active: true,
        linkedAt: new Date('2026-01-01'),
      };

      mockPrisma.telegramAccount.findFirst.mockResolvedValue(account);

      // Act
      const result = await getTelegramStatus(mockUserId);

      // Assert
      expect(result.connected).toBe(true);
      expect(result.chatId).toBe(mockChatId);
      expect(result.username).toBe(`@${mockUsername}`);
      expect(result.connectedAt).toEqual(account.linkedAt);
    });

    it('deve retornar connected=false quando não há TelegramAccount', async () => {
      // Arrange
      mockPrisma.telegramAccount.findFirst.mockResolvedValue(null);

      // Act
      const result = await getTelegramStatus(mockUserId);

      // Assert
      expect(result.connected).toBe(false);
      expect(result.chatId).toBeUndefined();
      expect(result.username).toBeUndefined();
    });
  });
});

describe('TelegramService - Sistema Legado (RADAR-XXXXXX)', () => {
  const mockUserId = 'user-legado';
  const mockChatId = '111222333';
  const mockUsername = 'legacyuser';
  const mockUser = {
    id: mockUserId,
    name: 'Legacy User',
    email: 'legacy@example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateLinkCode', () => {
    it('deve gerar código RADAR-XXXXXX e salvar em NotificationSettings', async () => {
      // Arrange
      mockPrisma.notificationSettings.upsert.mockResolvedValue({
        id: 'settings-123',
        userId: mockUserId,
        emailEnabled: true,
        telegramEnabled: false,
        telegramLinkCode: 'RADAR-ABC123',
        telegramLinkExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        telegramChatId: null,
        telegramUsername: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await generateLinkCode(mockUserId);

      // Assert
      expect(result.code).toMatch(/^RADAR-[A-Z0-9]{6}$/);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockPrisma.notificationSettings.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: expect.objectContaining({
          userId: mockUserId,
          telegramLinkCode: expect.stringMatching(/^RADAR-[A-Z0-9]{6}$/),
          telegramLinkExpiresAt: expect.any(Date),
        }),
        update: expect.objectContaining({
          telegramLinkCode: expect.stringMatching(/^RADAR-[A-Z0-9]{6}$/),
          telegramLinkExpiresAt: expect.any(Date),
        }),
      });
    });
  });

  describe('processWebhookMessage', () => {
    it('deve vincular com código RADAR e criar TelegramAccount', async () => {
      // Arrange
      const code = 'RADAR-XYZ789';
      const message = {
        chat: { id: 111222333 },
        from: { username: mockUsername },
        text: code,
      };

      const settings = {
        id: 'settings-123',
        userId: mockUserId,
        telegramLinkCode: code,
        telegramLinkExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        telegramEnabled: false,
        telegramChatId: null,
        telegramUsername: null,
        emailEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: mockUser,
      };

      mockPrisma.notificationSettings.findFirst.mockResolvedValue(settings);
      mockPrisma.telegramAccount.findUnique.mockResolvedValue(null); // chatId disponível
      mockPrisma.telegramAccount.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.telegramAccount.create.mockResolvedValue({
        id: 'account-legado',
        userId: mockUserId,
        chatId: mockChatId,
        username: `@${mockUsername}`,
        active: true,
        linkedAt: new Date(),
      });
      mockPrisma.notificationSettings.update.mockResolvedValue({} as any);

      // Act
      const result = await processWebhookMessage(message);

      // Assert
      expect(result.success).toBe(true);
      expect(mockPrisma.telegramAccount.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          chatId: mockChatId,
          username: `@${mockUsername}`,
          active: true,
        },
      });
      expect(mockPrisma.notificationSettings.update).toHaveBeenCalledWith({
        where: { id: settings.id },
        data: {
          telegramChatId: mockChatId,
          telegramEnabled: true,
          telegramUsername: `@${mockUsername}`,
          telegramLinkCode: null,
          telegramLinkExpiresAt: null,
        },
      });
    });

    it('deve rejeitar código expirado', async () => {
      // Arrange
      const code = 'RADAR-EXPIRED';
      const message = {
        chat: { id: 111222333 },
        from: { username: mockUsername },
        text: code,
      };

      mockPrisma.notificationSettings.findFirst.mockResolvedValue(null); // Código não encontrado ou expirado

      // Act
      const result = await processWebhookMessage(message);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Código não encontrado ou expirado');
      expect(mockPrisma.telegramAccount.create).not.toHaveBeenCalled();
    });

    it('deve rejeitar chatId já vinculado a outro usuário', async () => {
      // Arrange
      const code = 'RADAR-CONFLICT';
      const message = {
        chat: { id: 111222333 },
        from: { username: mockUsername },
        text: code,
      };

      const settings = {
        id: 'settings-123',
        userId: mockUserId,
        telegramLinkCode: code,
        telegramLinkExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        telegramEnabled: false,
        telegramChatId: null,
        telegramUsername: null,
        emailEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: mockUser,
      };

      const existingAccount = {
        id: 'account-other',
        userId: 'other-user-999', // Outro usuário
        chatId: mockChatId,
        username: '@otheruser',
        active: true,
        linkedAt: new Date(),
      };

      mockPrisma.notificationSettings.findFirst.mockResolvedValue(settings);
      mockPrisma.telegramAccount.findUnique.mockResolvedValue(existingAccount); // Já vinculado

      // Act
      const result = await processWebhookMessage(message);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Telegram já vinculado a outra conta');
      expect(mockPrisma.telegramAccount.create).not.toHaveBeenCalled();
    });

    it('deve enviar mensagem de ajuda para texto inválido', async () => {
      // Arrange
      const message = {
        chat: { id: 111222333 },
        from: { username: mockUsername },
        text: 'texto qualquer sem código',
      };

      // Act
      const result = await processWebhookMessage(message);

      // Assert
      expect(result.success).toBe(true); // Retorna sucesso mas não vincula
      expect(mockPrisma.notificationSettings.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.telegramAccount.create).not.toHaveBeenCalled();
    });
  });
});

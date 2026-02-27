import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// HOISTED MOCKS
// ============================================================

const { mockPrisma, mockLogInfo, mockLogError } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    telegramAccount: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  } as any,
  mockLogInfo: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: mockLogInfo,
  logError: mockLogError,
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

// Import AFTER mocks
import { UserController } from '../../src/controllers/user.controller';

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

const mockUser = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  phone: '11999999999',
  cpfLast4: '1234',
  role: 'USER',
  isActive: true,
  blocked: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  subscriptions: [],
  telegramAccounts: [],
};

// ============================================================
// TESTS
// ============================================================

describe('UserController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // getMe
  // ----------------------------------------------------------
  describe('getMe', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined });
      const res = makeRes();

      await UserController.getMe(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Não autenticado' });
    });

    it('returns 404 when user not found', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await UserController.getMe(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Usuário não encontrado' });
    });

    it('returns user data successfully', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await UserController.getMe(req, res);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
        })
      );
      expect(res.json).toHaveBeenCalledWith({ user: mockUser });
    });

    it('selects correct fields (never cpfEncrypted)', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await UserController.getMe(req, res);

      const call = mockPrisma.user.findUnique.mock.calls[0][0];
      expect(call.select).toHaveProperty('cpfLast4', true);
      expect(call.select).not.toHaveProperty('cpfEncrypted');
    });

    it('includes active subscriptions with plan details', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        subscriptions: [
          {
            id: 'sub-1',
            status: 'ACTIVE',
            plan: { id: 'plan-1', name: 'Pro', slug: 'pro', maxMonitors: 10, maxSites: 5, maxAlertsPerDay: 50, checkInterval: 15 },
          },
        ],
      });

      await UserController.getMe(req, res);

      const call = mockPrisma.user.findUnique.mock.calls[0][0];
      expect(call.select.subscriptions.where.status.in).toContain('ACTIVE');
      expect(call.select.subscriptions.where.status.in).toContain('TRIAL');
    });

    it('returns 500 on database error', async () => {
      const req = makeReq();
      const res = makeRes();
      mockPrisma.user.findUnique.mockRejectedValue(new Error('DB down'));

      await UserController.getMe(req, res);

      expect(mockLogError).toHaveBeenCalledWith(
        'Erro ao buscar dados do usuário',
        expect.objectContaining({ err: expect.any(Error) })
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao buscar dados' });
    });
  });

  // ----------------------------------------------------------
  // updateNotifications
  // ----------------------------------------------------------
  describe('updateNotifications', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined });
      const res = makeRes();

      await UserController.updateNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Não autenticado' });
    });

    it('updates existing telegram account when found', async () => {
      const req = makeReq({
        body: { telegramChatId: '12345', telegramUsername: 'testuser' },
      });
      const res = makeRes();

      const existingTelegramAccount = { id: 'tg-1', userId: 'user-1', chatId: '99999', username: 'olduser', active: true };
      mockPrisma.telegramAccount.findFirst.mockResolvedValue(existingTelegramAccount);
      mockPrisma.telegramAccount.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await UserController.updateNotifications(req, res);

      expect(mockPrisma.telegramAccount.update).toHaveBeenCalledWith({
        where: { id: 'tg-1' },
        data: { chatId: '12345', username: 'testuser' },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Preferências de notificação atualizadas com sucesso' })
      );
    });

    it('creates new telegram account when none exists', async () => {
      const req = makeReq({
        body: { telegramChatId: '12345', telegramUsername: 'newuser' },
      });
      const res = makeRes();

      mockPrisma.telegramAccount.findFirst.mockResolvedValue(null);
      mockPrisma.telegramAccount.create.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await UserController.updateNotifications(req, res);

      expect(mockPrisma.telegramAccount.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          chatId: '12345',
          username: 'newuser',
          active: true,
        },
      });
    });

    it('skips telegram logic when neither chatId nor username provided', async () => {
      const req = makeReq({ body: {} });
      const res = makeRes();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await UserController.updateNotifications(req, res);

      expect(mockPrisma.telegramAccount.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.telegramAccount.create).not.toHaveBeenCalled();
      expect(mockPrisma.telegramAccount.update).not.toHaveBeenCalled();
    });

    it('skips telegram logic when only chatId is provided (no username)', async () => {
      const req = makeReq({ body: { telegramChatId: '12345' } });
      const res = makeRes();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await UserController.updateNotifications(req, res);

      expect(mockPrisma.telegramAccount.findFirst).not.toHaveBeenCalled();
    });

    it('returns updated user with telegram accounts', async () => {
      const req = makeReq({ body: {} });
      const res = makeRes();
      const updatedUser = {
        ...mockUser,
        telegramAccounts: [{ id: 'tg-1', chatId: '12345', username: 'user', active: true, linkedAt: new Date() }],
      };
      mockPrisma.user.findUnique.mockResolvedValue(updatedUser);

      await UserController.updateNotifications(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: 'Preferências de notificação atualizadas com sucesso',
        user: updatedUser,
      });
    });

    it('returns 500 on database error', async () => {
      const req = makeReq({ body: {} });
      const res = makeRes();
      mockPrisma.user.findUnique.mockRejectedValue(new Error('DB crash'));

      await UserController.updateNotifications(req, res);

      expect(mockLogError).toHaveBeenCalledWith(
        'Erro ao atualizar notificações',
        expect.objectContaining({ err: expect.any(Error) })
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao atualizar preferências' });
    });
  });

  // ----------------------------------------------------------
  // updateProfile
  // ----------------------------------------------------------
  describe('updateProfile', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, body: { name: 'New Name' } });
      const res = makeRes();

      await UserController.updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Não autenticado' });
    });

    it('returns 400 when no fields to update', async () => {
      const req = makeReq({ body: {} });
      const res = makeRes();

      await UserController.updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Nenhum campo para atualizar' });
    });

    it('updates name only when only name provided', async () => {
      const req = makeReq({ body: { name: 'Updated Name' } });
      const res = makeRes();
      const updatedUser = { ...mockUser, name: 'Updated Name' };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      await UserController.updateProfile(req, res);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { name: 'Updated Name' },
        })
      );
      expect(res.json).toHaveBeenCalledWith({
        message: 'Perfil atualizado com sucesso',
        user: updatedUser,
      });
    });

    it('updates phone only when only phone provided', async () => {
      const req = makeReq({ body: { phone: '11988887777' } });
      const res = makeRes();
      const updatedUser = { ...mockUser, phone: '11988887777' };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      await UserController.updateProfile(req, res);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { phone: '11988887777' },
        })
      );
    });

    it('updates both name and phone when both provided', async () => {
      const req = makeReq({ body: { name: 'New Name', phone: '11977776666' } });
      const res = makeRes();
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, name: 'New Name', phone: '11977776666' });

      await UserController.updateProfile(req, res);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'New Name', phone: '11977776666' },
        })
      );
    });

    it('allows phone to be explicitly set to empty string (clearing phone)', async () => {
      // phone !== undefined should include it, even if empty
      const req = makeReq({ body: { phone: '' } });
      const res = makeRes();
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, phone: '' });

      await UserController.updateProfile(req, res);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { phone: '' },
        })
      );
    });

    it('does not include phone in update when phone is not in body', async () => {
      const req = makeReq({ body: { name: 'New Name' } });
      const res = makeRes();
      mockPrisma.user.update.mockResolvedValue(mockUser);

      await UserController.updateProfile(req, res);

      const call = mockPrisma.user.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('phone');
    });

    it('returns 500 on database error', async () => {
      const req = makeReq({ body: { name: 'New Name' } });
      const res = makeRes();
      mockPrisma.user.update.mockRejectedValue(new Error('DB crash'));

      await UserController.updateProfile(req, res);

      expect(mockLogError).toHaveBeenCalledWith(
        'Erro ao atualizar perfil',
        expect.objectContaining({ err: expect.any(Error) })
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao atualizar perfil' });
    });
  });
});

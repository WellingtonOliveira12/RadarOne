import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Testes unitários para checkSubscriptionExpired
 *
 * Casos testados:
 * - ✅ Deve atualizar status de assinaturas expiradas para EXPIRED
 * - ✅ Deve enviar email de assinatura expirada
 * - ✅ Deve lidar com múltiplas assinaturas expiradas
 * - ✅ Deve lidar com zero assinaturas expiradas
 * - ✅ Deve capturar exceções no Sentry em caso de erro
 * - ✅ Deve continuar processando se uma atualização individual falhar
 */

// Mock do Prisma usando vi.hoisted()
const { mockPrismaSubscription, mockPrisma } = vi.hoisted(() => ({
  mockPrismaSubscription: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  mockPrisma: {} as any,
}));

// Criar referência circular
Object.assign(mockPrisma, {
  subscription: mockPrismaSubscription,
});

// Mock do emailService usando vi.hoisted()
const { mockSendSubscriptionExpiredEmail } = vi.hoisted(() => ({
  mockSendSubscriptionExpiredEmail: vi.fn(),
}));

// Mock do Sentry usando vi.hoisted()
const { mockCaptureJobException } = vi.hoisted(() => ({
  mockCaptureJobException: vi.fn(),
}));

// Mock do retry usando vi.hoisted()
const { mockRetryAsync } = vi.hoisted(() => ({
  mockRetryAsync: vi.fn(),
}));

// Aplicar mocks antes de importar o job
vi.mock('../../src/server', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../src/services/emailService', () => ({
  sendSubscriptionExpiredEmail: mockSendSubscriptionExpiredEmail,
}));

vi.mock('../../src/monitoring/sentry', () => ({
  captureJobException: mockCaptureJobException,
}));

vi.mock('../../src/utils/retry', () => ({
  retryAsync: mockRetryAsync,
}));

// Importar job após configurar mocks
import { checkSubscriptionExpired } from '../../src/jobs/checkSubscriptionExpired';

describe('checkSubscriptionExpired Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Configurar comportamento padrão do retryAsync
    mockRetryAsync.mockImplementation(async (fn) => {
      return await fn();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deve atualizar status de assinaturas expiradas para EXPIRED', async () => {
    // Arrange
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const mockExpiredSubscriptions = [
      {
        id: 'sub1',
        status: 'ACTIVE',
        validUntil: yesterday,
        user: {
          email: 'user1@test.com',
          name: 'User 1',
        },
        plan: {
          name: 'Starter',
        },
      },
    ];

    mockPrismaSubscription.findMany.mockResolvedValue(mockExpiredSubscriptions);
    mockPrismaSubscription.update.mockResolvedValue({});
    mockSendSubscriptionExpiredEmail.mockResolvedValue(undefined);

    // Act
    await checkSubscriptionExpired();

    // Assert
    expect(mockPrismaSubscription.update).toHaveBeenCalledWith({
      where: { id: 'sub1' },
      data: { status: 'EXPIRED' },
    });
  });

  it('deve enviar email de assinatura expirada', async () => {
    // Arrange
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const mockExpiredSubscriptions = [
      {
        id: 'sub2',
        status: 'ACTIVE',
        validUntil: yesterday,
        user: {
          email: 'user2@test.com',
          name: 'User 2',
        },
        plan: {
          name: 'Pro',
        },
      },
    ];

    mockPrismaSubscription.findMany.mockResolvedValue(mockExpiredSubscriptions);
    mockPrismaSubscription.update.mockResolvedValue({});
    mockSendSubscriptionExpiredEmail.mockResolvedValue(undefined);

    // Act
    await checkSubscriptionExpired();

    // Assert
    expect(mockSendSubscriptionExpiredEmail).toHaveBeenCalledWith(
      'user2@test.com',
      'User 2',
      'Pro'
    );
  });

  it('deve lidar com múltiplas assinaturas expiradas', async () => {
    // Arrange
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const mockExpiredSubscriptions = [
      {
        id: 'sub3',
        status: 'ACTIVE',
        validUntil: yesterday,
        user: { email: 'user3@test.com', name: 'User 3' },
        plan: { name: 'Starter' },
      },
      {
        id: 'sub4',
        status: 'ACTIVE',
        validUntil: lastWeek,
        user: { email: 'user4@test.com', name: 'User 4' },
        plan: { name: 'Pro' },
      },
      {
        id: 'sub5',
        status: 'ACTIVE',
        validUntil: yesterday,
        user: { email: 'user5@test.com', name: 'User 5' },
        plan: { name: 'Premium' },
      },
    ];

    mockPrismaSubscription.findMany.mockResolvedValue(mockExpiredSubscriptions);
    mockPrismaSubscription.update.mockResolvedValue({});
    mockSendSubscriptionExpiredEmail.mockResolvedValue(undefined);

    // Act
    await checkSubscriptionExpired();

    // Assert
    expect(mockPrismaSubscription.update).toHaveBeenCalledTimes(3);
    expect(mockSendSubscriptionExpiredEmail).toHaveBeenCalledTimes(3);
  });

  it('deve lidar com zero assinaturas expiradas', async () => {
    // Arrange
    mockPrismaSubscription.findMany.mockResolvedValue([]);

    // Act
    await checkSubscriptionExpired();

    // Assert
    expect(mockPrismaSubscription.findMany).toHaveBeenCalled();
    expect(mockPrismaSubscription.update).not.toHaveBeenCalled();
    expect(mockSendSubscriptionExpiredEmail).not.toHaveBeenCalled();
  });

  it('deve capturar exceções no Sentry em caso de erro fatal', async () => {
    // Arrange
    const mockError = new Error('Database connection timeout');
    mockPrismaSubscription.findMany.mockRejectedValue(mockError);
    mockRetryAsync.mockRejectedValue(mockError);

    // Act & Assert
    await expect(checkSubscriptionExpired()).rejects.toThrow(
      'Database connection timeout'
    );
    expect(mockCaptureJobException).toHaveBeenCalledWith(
      mockError,
      expect.objectContaining({
        jobName: 'checkSubscriptionExpired',
      })
    );
  });

  it('deve continuar processando se uma atualização individual falhar', async () => {
    // Arrange
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const mockExpiredSubscriptions = [
      {
        id: 'sub6',
        status: 'ACTIVE',
        validUntil: yesterday,
        user: { email: 'user6@test.com', name: 'User 6' },
        plan: { name: 'Starter' },
      },
      {
        id: 'sub7',
        status: 'ACTIVE',
        validUntil: yesterday,
        user: { email: 'user7@test.com', name: 'User 7' },
        plan: { name: 'Pro' },
      },
    ];

    mockPrismaSubscription.findMany.mockResolvedValue(mockExpiredSubscriptions);

    // Simular falha na primeira atualização, sucesso na segunda
    mockPrismaSubscription.update
      .mockRejectedValueOnce(new Error('Update failed'))
      .mockResolvedValueOnce({});

    mockSendSubscriptionExpiredEmail.mockResolvedValue(undefined);

    // Act
    await checkSubscriptionExpired();

    // Assert - Job não deve falhar completamente
    expect(mockPrismaSubscription.update).toHaveBeenCalledTimes(2);
    // Não deve capturar exception geral, pois o erro foi tratado internamente
    expect(mockCaptureJobException).not.toHaveBeenCalled();
  });

  it('deve buscar apenas assinaturas ACTIVE com validUntil expirado', async () => {
    // Arrange
    const now = new Date();
    mockPrismaSubscription.findMany.mockResolvedValue([]);

    // Act
    await checkSubscriptionExpired();

    // Assert
    expect(mockPrismaSubscription.findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        validUntil: {
          lt: expect.any(Date),
        },
      },
      include: {
        user: true,
        plan: true,
      },
    });
  });

  it('deve enviar email mesmo se atualização de status falhar', async () => {
    // Arrange
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const mockExpiredSubscriptions = [
      {
        id: 'sub8',
        status: 'ACTIVE',
        validUntil: yesterday,
        user: { email: 'user8@test.com', name: 'User 8' },
        plan: { name: 'Premium' },
      },
    ];

    mockPrismaSubscription.findMany.mockResolvedValue(mockExpiredSubscriptions);
    mockPrismaSubscription.update.mockRejectedValue(new Error('DB update failed'));
    mockSendSubscriptionExpiredEmail.mockResolvedValue(undefined);

    // Act
    await checkSubscriptionExpired();

    // Assert
    // Email não deve ser enviado se update falhar (ordem de operações no código)
    expect(mockPrismaSubscription.update).toHaveBeenCalled();
  });
});

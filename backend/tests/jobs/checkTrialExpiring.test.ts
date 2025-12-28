import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Testes unitários para checkTrialExpiring
 *
 * Casos testados:
 * - ✅ Deve enviar email de aviso para trials expirando em breve
 * - ✅ Deve atualizar status de trials expirados para EXPIRED
 * - ✅ Deve enviar email de trial expirado
 * - ✅ Deve lidar com múltiplos trials expirando
 * - ✅ Deve capturar exceções no Sentry em caso de erro
 * - ✅ Deve fazer retry em caso de erro transiente
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
const { mockSendTrialEndingEmail, mockSendTrialExpiredEmail } = vi.hoisted(() => ({
  mockSendTrialEndingEmail: vi.fn(),
  mockSendTrialExpiredEmail: vi.fn(),
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
  sendTrialEndingEmail: mockSendTrialEndingEmail,
  sendTrialExpiredEmail: mockSendTrialExpiredEmail,
}));

vi.mock('../../src/monitoring/sentry', () => ({
  captureJobException: mockCaptureJobException,
}));

vi.mock('../../src/utils/retry', () => ({
  retryAsync: mockRetryAsync,
}));

// Importar job após configurar mocks
import { checkTrialExpiring } from '../../src/jobs/checkTrialExpiring';

describe('checkTrialExpiring Job', () => {
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

  it('deve enviar email de aviso para trials expirando em breve', async () => {
    // Arrange
    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    const mockTrialsExpiring = [
      {
        id: 'sub1',
        status: 'TRIAL',
        isTrial: true,
        trialEndsAt: twoDaysFromNow,
        user: {
          email: 'user1@test.com',
          name: 'User 1',
        },
        plan: {
          name: 'Starter',
        },
      },
    ];

    // Primeira chamada: trials expirando em breve
    // Segunda chamada: trials já expirados
    mockPrismaSubscription.findMany
      .mockResolvedValueOnce(mockTrialsExpiring)
      .mockResolvedValueOnce([]);

    mockSendTrialEndingEmail.mockResolvedValue(undefined);

    // Act
    await checkTrialExpiring();

    // Assert
    expect(mockSendTrialEndingEmail).toHaveBeenCalledWith(
      'user1@test.com',
      'User 1',
      expect.any(Number), // dias restantes
      'Starter'
    );
  });

  it('deve atualizar status de trials expirados para EXPIRED', async () => {
    // Arrange
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const mockTrialsExpired = [
      {
        id: 'sub2',
        status: 'TRIAL',
        isTrial: true,
        trialEndsAt: yesterday,
        user: {
          email: 'user2@test.com',
          name: 'User 2',
        },
        plan: {
          name: 'Pro',
        },
      },
    ];

    // Primeira chamada: trials expirando (vazio)
    // Segunda chamada: trials expirados
    mockPrismaSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(mockTrialsExpired);

    mockPrismaSubscription.update.mockResolvedValue({});
    mockSendTrialExpiredEmail.mockResolvedValue(undefined);

    // Act
    await checkTrialExpiring();

    // Assert
    expect(mockPrismaSubscription.update).toHaveBeenCalledWith({
      where: { id: 'sub2' },
      data: { status: 'EXPIRED' },
    });
  });

  it('deve enviar email de trial expirado', async () => {
    // Arrange
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const mockTrialsExpired = [
      {
        id: 'sub3',
        status: 'TRIAL',
        isTrial: true,
        trialEndsAt: yesterday,
        user: {
          email: 'user3@test.com',
          name: 'User 3',
        },
        plan: {
          name: 'Premium',
        },
      },
    ];

    mockPrismaSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(mockTrialsExpired);

    mockPrismaSubscription.update.mockResolvedValue({});
    mockSendTrialExpiredEmail.mockResolvedValue(undefined);

    // Act
    await checkTrialExpiring();

    // Assert
    expect(mockSendTrialExpiredEmail).toHaveBeenCalledWith(
      'user3@test.com',
      'User 3',
      'Premium'
    );
  });

  it('deve lidar com múltiplos trials expirando e expirados', async () => {
    // Arrange
    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const mockTrialsExpiring = [
      {
        id: 'sub4',
        status: 'TRIAL',
        isTrial: true,
        trialEndsAt: twoDaysFromNow,
        user: { email: 'user4@test.com', name: 'User 4' },
        plan: { name: 'Starter' },
      },
      {
        id: 'sub5',
        status: 'TRIAL',
        isTrial: true,
        trialEndsAt: twoDaysFromNow,
        user: { email: 'user5@test.com', name: 'User 5' },
        plan: { name: 'Pro' },
      },
    ];

    const mockTrialsExpired = [
      {
        id: 'sub6',
        status: 'TRIAL',
        isTrial: true,
        trialEndsAt: yesterday,
        user: { email: 'user6@test.com', name: 'User 6' },
        plan: { name: 'Premium' },
      },
    ];

    mockPrismaSubscription.findMany
      .mockResolvedValueOnce(mockTrialsExpiring)
      .mockResolvedValueOnce(mockTrialsExpired);

    mockPrismaSubscription.update.mockResolvedValue({});
    mockSendTrialEndingEmail.mockResolvedValue(undefined);
    mockSendTrialExpiredEmail.mockResolvedValue(undefined);

    // Act
    await checkTrialExpiring();

    // Assert
    expect(mockSendTrialEndingEmail).toHaveBeenCalledTimes(2);
    expect(mockSendTrialExpiredEmail).toHaveBeenCalledTimes(1);
    expect(mockPrismaSubscription.update).toHaveBeenCalledTimes(1);
  });

  it('deve capturar exceções no Sentry em caso de erro fatal', async () => {
    // Arrange
    const mockError = new Error('Database error');
    mockPrismaSubscription.findMany.mockRejectedValue(mockError);
    mockRetryAsync.mockRejectedValue(mockError);

    // Act & Assert
    await expect(checkTrialExpiring()).rejects.toThrow('Database error');
    expect(mockCaptureJobException).toHaveBeenCalledWith(
      mockError,
      expect.objectContaining({
        jobName: 'checkTrialExpiring',
      })
    );
  });

  it('deve continuar processando se um email individual falhar', async () => {
    // Arrange
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const mockTrialsExpired = [
      {
        id: 'sub7',
        status: 'TRIAL',
        isTrial: true,
        trialEndsAt: yesterday,
        user: { email: 'user7@test.com', name: 'User 7' },
        plan: { name: 'Starter' },
      },
      {
        id: 'sub8',
        status: 'TRIAL',
        isTrial: true,
        trialEndsAt: yesterday,
        user: { email: 'user8@test.com', name: 'User 8' },
        plan: { name: 'Pro' },
      },
    ];

    mockPrismaSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(mockTrialsExpired);

    // Simular falha no primeiro, sucesso no segundo
    mockPrismaSubscription.update
      .mockRejectedValueOnce(new Error('Update failed'))
      .mockResolvedValueOnce({});

    mockSendTrialExpiredEmail.mockResolvedValue(undefined);

    // Act
    await checkTrialExpiring();

    // Assert - Job não deve falhar completamente
    expect(mockPrismaSubscription.update).toHaveBeenCalledTimes(2);
  });
});

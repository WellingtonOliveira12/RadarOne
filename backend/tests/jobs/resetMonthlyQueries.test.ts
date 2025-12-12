import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Testes unitários para resetMonthlyQueries
 *
 * Casos testados:
 * - ✅ Deve resetar queries de assinaturas ativas com sucesso
 * - ✅ Deve lidar com zero assinaturas ativas
 * - ✅ Deve criar log de auditoria no webhookLog
 * - ✅ Deve enviar email de relatório para admin
 * - ✅ Deve capturar exceções no Sentry em caso de erro
 * - ✅ Deve fazer retry em caso de erro transiente
 */

// Mock do Prisma usando vi.hoisted()
const { mockPrismaSubscription, mockPrismaWebhookLog, mockPrisma } = vi.hoisted(() => ({
  mockPrismaSubscription: {
    updateMany: vi.fn(),
  },
  mockPrismaWebhookLog: {
    create: vi.fn(),
  },
  mockPrisma: {} as any,
}));

// Criar referência circular
Object.assign(mockPrisma, {
  subscription: mockPrismaSubscription,
  webhookLog: mockPrismaWebhookLog,
});

// Mock do emailService usando vi.hoisted()
const { mockSendMonthlyQueriesResetReport } = vi.hoisted(() => ({
  mockSendMonthlyQueriesResetReport: vi.fn(),
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
  sendMonthlyQueriesResetReport: mockSendMonthlyQueriesResetReport,
}));

vi.mock('../../src/monitoring/sentry', () => ({
  captureJobException: mockCaptureJobException,
}));

vi.mock('../../src/utils/retry', () => ({
  retryAsync: mockRetryAsync,
}));

// Importar job após configurar mocks
import { resetMonthlyQueries } from '../../src/jobs/resetMonthlyQueries';

describe('resetMonthlyQueries Job', () => {
  beforeEach(() => {
    // Resetar todos os mocks antes de cada teste
    vi.clearAllMocks();

    // Configurar comportamento padrão do retryAsync (executar a função diretamente)
    mockRetryAsync.mockImplementation(async (fn) => {
      return await fn();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deve resetar queries de assinaturas ativas com sucesso', async () => {
    // Arrange
    const mockResult = { count: 10 };
    mockPrismaSubscription.updateMany.mockResolvedValue(mockResult);
    mockPrismaWebhookLog.create.mockResolvedValue({});
    mockSendMonthlyQueriesResetReport.mockResolvedValue(undefined);

    // Act
    await resetMonthlyQueries();

    // Assert
    expect(mockRetryAsync).toHaveBeenCalledOnce();
    expect(mockPrismaSubscription.updateMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      data: { queriesUsed: 0 },
    });
    expect(mockSendMonthlyQueriesResetReport).toHaveBeenCalledWith(
      expect.objectContaining({
        totalUpdated: 10,
        runAt: expect.any(Date),
      })
    );
    expect(mockPrismaWebhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'MONTHLY_QUERIES_RESET',
          processed: true,
          error: null,
        }),
      })
    );
  });

  it('deve lidar com zero assinaturas ativas', async () => {
    // Arrange
    const mockResult = { count: 0 };
    mockPrismaSubscription.updateMany.mockResolvedValue(mockResult);
    mockPrismaWebhookLog.create.mockResolvedValue({});
    mockSendMonthlyQueriesResetReport.mockResolvedValue(undefined);

    // Act
    await resetMonthlyQueries();

    // Assert
    expect(mockPrismaSubscription.updateMany).toHaveBeenCalled();
    expect(mockSendMonthlyQueriesResetReport).toHaveBeenCalledWith(
      expect.objectContaining({
        totalUpdated: 0,
      })
    );
    expect(mockPrismaWebhookLog.create).toHaveBeenCalled();
  });

  it('deve criar log de auditoria mesmo se email falhar', async () => {
    // Arrange
    const mockResult = { count: 5 };
    mockPrismaSubscription.updateMany.mockResolvedValue(mockResult);
    mockPrismaWebhookLog.create.mockResolvedValue({});
    mockSendMonthlyQueriesResetReport.mockRejectedValue(
      new Error('Email service unavailable')
    );

    // Act
    await resetMonthlyQueries();

    // Assert
    expect(mockPrismaWebhookLog.create).toHaveBeenCalled();
    // Não deve lançar erro, apenas logar
    expect(mockCaptureJobException).not.toHaveBeenCalled();
  });

  it('deve capturar exceções no Sentry em caso de erro fatal', async () => {
    // Arrange
    const mockError = new Error('Database connection failed');
    mockPrismaSubscription.updateMany.mockRejectedValue(mockError);

    // Simular retryAsync lançando erro após falhas
    mockRetryAsync.mockRejectedValue(mockError);

    // Act & Assert
    await expect(resetMonthlyQueries()).rejects.toThrow('Database connection failed');
    expect(mockCaptureJobException).toHaveBeenCalledWith(
      mockError,
      expect.objectContaining({
        jobName: 'resetMonthlyQueries',
      })
    );
  });

  it('deve chamar retryAsync com configuração correta', async () => {
    // Arrange
    const mockResult = { count: 3 };
    mockPrismaSubscription.updateMany.mockResolvedValue(mockResult);
    mockPrismaWebhookLog.create.mockResolvedValue({});
    mockSendMonthlyQueriesResetReport.mockResolvedValue(undefined);

    // Act
    await resetMonthlyQueries();

    // Assert - verificar que retryAsync foi chamado com os parâmetros corretos
    expect(mockRetryAsync).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        retries: 3,
        delayMs: 1000,
        factor: 2,
        jobName: 'resetMonthlyQueries',
      })
    );
  });

  it('deve incluir timezone e executedAt no payload do webhookLog', async () => {
    // Arrange
    const mockResult = { count: 7 };
    mockPrismaSubscription.updateMany.mockResolvedValue(mockResult);
    mockPrismaWebhookLog.create.mockResolvedValue({});
    mockSendMonthlyQueriesResetReport.mockResolvedValue(undefined);

    // Act
    await resetMonthlyQueries();

    // Assert
    expect(mockPrismaWebhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'MONTHLY_QUERIES_RESET',
          payload: expect.objectContaining({
            timezone: 'America/Sao_Paulo',
            executedAt: expect.any(String),
            updatedCount: 7,
            status: 'SUCCESS',
          }),
        }),
      })
    );
  });
});

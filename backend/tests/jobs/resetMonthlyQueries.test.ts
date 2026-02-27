import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Testes unitários para resetMonthlyQueries
 *
 * Casos testados:
 * - ✅ Deve resetar queries de assinaturas ativas com sucesso
 * - ✅ Deve lidar com zero assinaturas ativas
 * - ✅ Deve enviar email de relatório para admin
 * - ✅ Deve capturar exceções no Sentry em caso de erro
 * - ✅ Deve fazer retry em caso de erro transiente
 */

// Mock do Prisma usando vi.hoisted()
const { mockPrismaSubscription, mockPrisma } = vi.hoisted(() => ({
  mockPrismaSubscription: {
    updateMany: vi.fn(),
  },
  mockPrisma: {} as any,
}));

// Criar referência circular
Object.assign(mockPrisma, {
  subscription: mockPrismaSubscription,
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
vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
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
    mockSendMonthlyQueriesResetReport.mockResolvedValue(undefined);

    // Act
    const result = await resetMonthlyQueries();

    // Assert
    expect(mockRetryAsync).toHaveBeenCalledOnce();
    expect(mockPrismaSubscription.updateMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      data: { queriesUsed: 0 },
    });
    expect(mockSendMonthlyQueriesResetReport).toHaveBeenCalledWith(
      'admin@radarone.com',
      10
    );
    expect(result.processedCount).toBe(10);
    expect(result.successCount).toBe(10);
    expect(result.errorCount).toBe(0);
  });

  it('deve lidar com zero assinaturas ativas', async () => {
    // Arrange
    const mockResult = { count: 0 };
    mockPrismaSubscription.updateMany.mockResolvedValue(mockResult);
    mockSendMonthlyQueriesResetReport.mockResolvedValue(undefined);

    // Act
    const result = await resetMonthlyQueries();

    // Assert
    expect(mockPrismaSubscription.updateMany).toHaveBeenCalled();
    expect(mockSendMonthlyQueriesResetReport).toHaveBeenCalledWith(
      'admin@radarone.com',
      0
    );
    expect(result.processedCount).toBe(0);
    expect(result.successCount).toBe(0);
  });

  it('deve continuar com sucesso mesmo se email de relatório falhar', async () => {
    // Arrange
    const mockResult = { count: 5 };
    mockPrismaSubscription.updateMany.mockResolvedValue(mockResult);
    mockSendMonthlyQueriesResetReport.mockRejectedValue(
      new Error('Email service unavailable')
    );

    // Act
    const result = await resetMonthlyQueries();

    // Assert - Job principal foi bem-sucedido apesar do email falhar
    expect(result.processedCount).toBe(5);
    expect(result.successCount).toBe(5);
    expect(result.errorCount).toBe(0);
    // Não deve capturar exception, pois o job principal teve sucesso
    expect(mockCaptureJobException).not.toHaveBeenCalled();
  });

  it('deve capturar exceções no Sentry em caso de erro fatal', async () => {
    // Arrange
    const mockError = new Error('Database connection failed');
    mockPrismaSubscription.updateMany.mockRejectedValue(mockError);

    // Simular retryAsync lançando erro após falhas
    mockRetryAsync.mockRejectedValue(mockError);

    // Act
    const result = await resetMonthlyQueries();

    // Assert - Job now returns error result instead of throwing
    expect(result.errorCount).toBe(1);
    expect(result.summary).toContain('Database connection failed');
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

  it('deve incluir metadata com subscriptionsReset e executedAt no resultado', async () => {
    // Arrange
    const mockResult = { count: 7 };
    mockPrismaSubscription.updateMany.mockResolvedValue(mockResult);
    mockSendMonthlyQueriesResetReport.mockResolvedValue(undefined);

    // Act
    const result = await resetMonthlyQueries();

    // Assert
    expect(result.metadata).toEqual(
      expect.objectContaining({
        subscriptionsReset: 7,
        executedAt: expect.any(String),
        emailSent: true,
      })
    );
  });
});

import { prisma } from '../lib/prisma';
import { sendMonthlyQueriesResetReport } from '../services/emailService';
import { captureJobException } from '../monitoring/sentry';
import { retryAsync } from '../utils/retry';
import { JobRunResult } from './checkTrialExpiring';
import { logInfo, logError, logSimpleInfo } from '../utils/loggerHelpers';

/**
 * Job: Reset mensal de queries
 *
 * COMO EXECUTAR:
 * - Manualmente: npx ts-node src/jobs/resetMonthlyQueries.ts
 * - Cron: Roda automaticamente no dia 1 de cada mês às 3h (America/Sao_Paulo)
 *
 * COMPORTAMENTO:
 * - Reseta o contador queriesUsed para 0 em todas as assinaturas ATIVAS
 * - Apenas assinaturas com status ACTIVE são afetadas
 * - Assinaturas TRIAL, EXPIRED, CANCELLED, etc. NÃO são resetadas
 * - Possui retry automático em caso de falhas transientes
 *
 * RETORNO: Agora retorna um objeto padronizado para logging
 */

async function resetMonthlyQueries(): Promise<JobRunResult> {
  logSimpleInfo('Iniciando reset mensal de queries...');

  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  let emailSent = false;

  try {
    const now = new Date();

    // Envolver operação principal com retry
    const result = await retryAsync(async () => {
      logInfo('Data de execução', { date: now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) });

      // Reset de queries apenas para assinaturas ATIVAS
      const updateResult = await prisma.subscription.updateMany({
        where: {
          status: 'ACTIVE',
        },
        data: {
          queriesUsed: 0,
        },
      });

      return updateResult;
    }, {
      retries: 3,
      delayMs: 1000,
      factor: 2,
      jobName: 'resetMonthlyQueries'
    });

    processedCount = result.count;
    successCount = result.count;

    logSimpleInfo('Reset mensal concluído com sucesso!');
    logInfo('Assinaturas atualizadas', { count: result.count });

    // Log adicional para auditoria
    if (result.count === 0) {
      logInfo('Nenhuma assinatura ativa encontrada para resetar.', {});
    }

    // Enviar e-mail de relatório para o admin
    try {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@radarone.com';
      await sendMonthlyQueriesResetReport(adminEmail, result.count);
      logSimpleInfo('E-mail de relatório enviado com sucesso');
      emailSent = true;
    } catch (emailError: any) {
      logError('Falha ao enviar e-mail de relatório', { err: emailError.message });
      // Não incrementa errorCount porque o job principal foi bem-sucedido
    }

    return {
      processedCount,
      successCount,
      errorCount,
      summary: `Reset mensal concluído. ${result.count} assinaturas atualizadas.`,
      metadata: {
        subscriptionsReset: result.count,
        executedAt: now.toISOString(),
        emailSent,
      }
    };

  } catch (error) {
    logError('Erro ao resetar queries mensais', { err: error });
    // Enviar exceção para o Sentry
    captureJobException(error, { jobName: 'resetMonthlyQueries' });

    return {
      processedCount,
      successCount,
      errorCount: 1,
      summary: `Erro ao resetar queries: ${error instanceof Error ? error.message : String(error)}`,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      }
    };
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  resetMonthlyQueries()
    .then((result) => {
      logInfo('Job finalizado', result as unknown as Record<string, unknown>);
      process.exit(result.errorCount > 0 ? 1 : 0);
    })
    .catch((err) => {
      logError('Job falhou', { err });
      process.exit(1);
    });
}

export { resetMonthlyQueries };

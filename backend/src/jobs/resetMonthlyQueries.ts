import { prisma } from '../server';
import { sendMonthlyQueriesResetReport } from '../services/emailService';
import { captureJobException } from '../monitoring/sentry';
import { retryAsync } from '../utils/retry';

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
 */

async function resetMonthlyQueries() {
  console.log('[RESET_QUERIES_JOB] 🔄 Iniciando reset mensal de queries...');

  try {
    const now = new Date();

    // Envolver operação principal com retry
    const result = await retryAsync(async () => {
      console.log(`[RESET_QUERIES_JOB] 📅 Data de execução: ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

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

    console.log(`[RESET_QUERIES_JOB] ✅ Reset mensal concluído com sucesso!`);
    console.log(`[RESET_QUERIES_JOB] 📊 Assinaturas atualizadas: ${result.count}`);

    // Log adicional para auditoria
    if (result.count === 0) {
      console.log('[RESET_QUERIES_JOB] ⚠️  Nenhuma assinatura ativa encontrada para resetar.');
    }

    // Enviar e-mail de relatório para o admin
    try {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@radarone.com';
      await sendMonthlyQueriesResetReport(adminEmail, result.count);
      console.log('[RESET_QUERIES_JOB] 📧 E-mail de relatório enviado com sucesso');
    } catch (emailError: any) {
      console.error('[RESET_QUERIES_JOB] ⚠️  Falha ao enviar e-mail de relatório:', emailError.message);
      // Não re-lançar o erro para não quebrar o job
    }

    // Registrar execução na tabela de auditoria
    try {
      await prisma.webhookLog.create({
        data: {
          event: 'MONTHLY_QUERIES_RESET',
          payload: {
            executedAt: now.toISOString(),
            updatedCount: result.count,
            status: 'SUCCESS',
            timezone: 'America/Sao_Paulo'
          },
          processed: true,
          error: null
        }
      });
      console.log('[RESET_QUERIES_JOB] 📝 Registro de auditoria criado');
    } catch (auditError: any) {
      console.error('[RESET_QUERIES_JOB] ⚠️  Falha ao criar registro de auditoria:', auditError.message);
      // Não re-lançar o erro para não quebrar o job
    }

  } catch (error) {
    console.error('[RESET_QUERIES_JOB] ❌ Erro ao resetar queries mensais:', error);
    // Enviar exceção para o Sentry
    captureJobException(error, { jobName: 'resetMonthlyQueries' });
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  resetMonthlyQueries()
    .then(() => {
      console.log('[RESET_QUERIES_JOB] Job finalizado com sucesso');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[RESET_QUERIES_JOB] Job falhou:', err);
      process.exit(1);
    });
}

export { resetMonthlyQueries };

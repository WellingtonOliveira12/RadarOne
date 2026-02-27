import { prisma } from '../lib/prisma';
import { logInfo, logError, logWarning } from './loggerHelpers';

/**
 * Tipos de Jobs Agendados
 */
export const JobNames = {
  CHECK_TRIAL_EXPIRING: 'checkTrialExpiring',
  CHECK_SUBSCRIPTION_EXPIRED: 'checkSubscriptionExpired',
  RESET_MONTHLY_QUERIES: 'resetMonthlyQueries',
  CHECK_COUPON_ALERTS: 'checkCouponAlerts',
  CHECK_TRIAL_UPGRADE_EXPIRING: 'checkTrialUpgradeExpiring',
  CHECK_ABANDONED_COUPONS: 'checkAbandonedCoupons',
  CHECK_SESSION_EXPIRING: 'checkSessionExpiring',
} as const;

export type JobName = typeof JobNames[keyof typeof JobNames];

/**
 * Status possíveis de um Job
 */
export type JobRunStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'TIMEOUT';

/**
 * Resultado de um Job
 */
export interface JobResult {
  processedCount: number;
  successCount: number;
  errorCount: number;
  summary?: string;
  metadata?: Record<string, any>;
}

/**
 * Inicia o registro de uma execução de job
 *
 * @param jobName Nome do job
 * @param triggeredBy Como foi disparado (SCHEDULER, MANUAL, API)
 * @returns ID do registro criado
 */
export async function startJobRun(
  jobName: JobName,
  triggeredBy: 'SCHEDULER' | 'MANUAL' | 'API' = 'SCHEDULER'
): Promise<string> {
  try {
    const jobRun = await prisma.jobRun.create({
      data: {
        jobName,
        status: 'RUNNING',
        triggeredBy,
      },
    });

    logInfo(`[JOB] 🚀 Job iniciado: ${jobName}`, { jobRunId: jobRun.id });

    return jobRun.id;
  } catch (error) {
    logError(`[JOB] Erro ao registrar início do job ${jobName}`, { err: String(error) });
    throw error;
  }
}

/**
 * Finaliza o registro de uma execução de job com sucesso
 *
 * @param jobRunId ID do registro
 * @param result Resultado da execução
 */
export async function completeJobRun(
  jobRunId: string,
  result: JobResult
): Promise<void> {
  try {
    const startedRun = await prisma.jobRun.findUnique({
      where: { id: jobRunId },
      select: { startedAt: true, jobName: true },
    });

    if (!startedRun) {
      logWarning(`[JOB] JobRun não encontrado: ${jobRunId}`, {});
      return;
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedRun.startedAt.getTime();

    // Determinar status baseado nos erros
    let status: JobRunStatus = 'SUCCESS';
    if (result.errorCount > 0 && result.successCount > 0) {
      status = 'PARTIAL';
    } else if (result.errorCount > 0 && result.successCount === 0) {
      status = 'FAILED';
    }

    await prisma.jobRun.update({
      where: { id: jobRunId },
      data: {
        status,
        completedAt,
        durationMs,
        processedCount: result.processedCount,
        successCount: result.successCount,
        errorCount: result.errorCount,
        summary: result.summary,
        metadata: result.metadata,
      },
    });

    logInfo(`[JOB] ✅ Job concluído: ${startedRun.jobName}`, {
      jobRunId,
      status,
      durationMs,
      processedCount: result.processedCount,
      successCount: result.successCount,
      errorCount: result.errorCount,
    });

    // Se houve erros, criar alerta administrativo
    if (result.errorCount > 0) {
      await createJobAlert(
        startedRun.jobName,
        status,
        result.errorCount,
        result.summary,
        jobRunId
      );
    }
  } catch (error) {
    logError(`[JOB] Erro ao finalizar job ${jobRunId}`, { err: String(error) });
  }
}

/**
 * Marca um job como falho
 *
 * @param jobRunId ID do registro
 * @param errorMessage Mensagem de erro
 */
export async function failJobRun(
  jobRunId: string,
  errorMessage: string
): Promise<void> {
  try {
    const startedRun = await prisma.jobRun.findUnique({
      where: { id: jobRunId },
      select: { startedAt: true, jobName: true },
    });

    if (!startedRun) {
      logWarning(`[JOB] JobRun não encontrado: ${jobRunId}`, {});
      return;
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedRun.startedAt.getTime();

    await prisma.jobRun.update({
      where: { id: jobRunId },
      data: {
        status: 'FAILED',
        completedAt,
        durationMs,
        errorMessage,
      },
    });

    logError(`[JOB] ❌ Job falhou: ${startedRun.jobName}`, {
      jobRunId,
      errorMessage,
      durationMs,
    });

    // Criar alerta crítico
    await createJobAlert(
      startedRun.jobName,
      'FAILED',
      1,
      errorMessage,
      jobRunId
    );
  } catch (error) {
    logError(`[JOB] Erro ao registrar falha do job ${jobRunId}`, { err: String(error) });
  }
}

/**
 * Cria um alerta administrativo para problemas em jobs
 */
async function createJobAlert(
  jobName: string,
  status: JobRunStatus,
  errorCount: number,
  summary: string | undefined,
  jobRunId: string
): Promise<void> {
  try {
    // Verificar se já existe alerta recente (últimas 2 horas) para evitar spam
    const recentAlert = await prisma.adminAlert.findFirst({
      where: {
        type: 'JOB_FAILURE',
        source: `job:${jobName}`,
        createdAt: {
          gte: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      },
    });

    if (recentAlert) {
      logInfo(`[JOB] Alerta recente já existe para ${jobName}, pulando...`, {});
      return;
    }

    const severity = status === 'FAILED' ? 'CRITICAL' : 'WARNING';
    const title =
      status === 'FAILED'
        ? `Job "${getJobDisplayName(jobName)}" falhou completamente`
        : `Job "${getJobDisplayName(jobName)}" concluiu com ${errorCount} erro(s)`;

    await prisma.adminAlert.create({
      data: {
        type: 'JOB_FAILURE',
        severity,
        title,
        message:
          summary ||
          `O job ${jobName} ${
            status === 'FAILED' ? 'falhou' : 'teve problemas'
          }. Verifique os logs para mais detalhes.`,
        source: `job:${jobName}`,
        metadata: {
          jobRunId,
          jobName,
          status,
          errorCount,
        },
      },
    });

    logInfo(`[JOB] 🔔 Alerta criado para job com problema: ${jobName}`, {
      severity,
    });
  } catch (error) {
    logError(`[JOB] Erro ao criar alerta para job ${jobName}`, { err: String(error) });
  }
}

/**
 * Retorna nome amigável do job
 */
export function getJobDisplayName(jobName: string): string {
  const names: Record<string, string> = {
    checkTrialExpiring: 'Verificar Trials Expirando',
    checkSubscriptionExpired: 'Verificar Assinaturas Expiradas',
    resetMonthlyQueries: 'Reset Mensal de Queries',
    checkCouponAlerts: 'Verificar Alertas de Cupons',
    checkTrialUpgradeExpiring: 'Verificar Trial Upgrades Expirando',
    checkAbandonedCoupons: 'Verificar Cupons Abandonados',
    checkSessionExpiring: 'Verificar Sessões Expirando',
  };
  return names[jobName] || jobName;
}

/**
 * Helper para executar um job com logging automático
 *
 * @example
 * await withJobLogging('checkTrialExpiring', 'SCHEDULER', async () => {
 *   const result = await checkTrialExpiring();
 *   return {
 *     processedCount: result.total,
 *     successCount: result.success,
 *     errorCount: result.errors,
 *     summary: `Processados ${result.total} trials`,
 *   };
 * });
 */
export async function withJobLogging(
  jobName: JobName,
  triggeredBy: 'SCHEDULER' | 'MANUAL' | 'API',
  fn: () => Promise<JobResult>
): Promise<void> {
  const jobRunId = await startJobRun(jobName, triggeredBy);

  try {
    const result = await fn();
    await completeJobRun(jobRunId, result);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    await failJobRun(jobRunId, errorMessage);
    throw error; // Re-throw para que o caller saiba que falhou
  }
}

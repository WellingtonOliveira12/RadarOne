import { prisma } from '../lib/prisma';
import { sendTrialEndingEmail, sendTrialExpiredEmail } from '../services/emailService';
import { captureJobException } from '../monitoring/sentry';
import { retryAsync } from '../utils/retry';
import { logInfo, logError, logSimpleInfo } from '../utils/loggerHelpers';

/**
 * Resultado padronizado de um job
 */
export interface JobRunResult {
  processedCount: number;
  successCount: number;
  errorCount: number;
  summary?: string;
  metadata?: Record<string, any>;
}

/**
 * Job: Verificar trials expirando e expirados
 *
 * COMO EXECUTAR:
 * - Manualmente: npx ts-node src/jobs/checkTrialExpiring.ts
 * - Cron: Agendar para rodar diariamente às 9h
 * - Possui retry automático em caso de falhas transientes
 *
 * RETORNO: Agora retorna um objeto padronizado para logging
 */

const DAYS_BEFORE_WARNING = 3; // Avisar 3 dias antes de expirar

async function checkTrialExpiring(): Promise<JobRunResult> {
  logSimpleInfo('Verificando trials expirando...');

  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  let expiringSoonCount = 0;
  let expiredCount = 0;
  const emailsSent: string[] = [];

  try {
    // Envolver operação principal com retry
    await retryAsync(async () => {
      const now = new Date();
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(now.getDate() + DAYS_BEFORE_WARNING);

      // 1. Buscar trials que estão expirando em 3 dias (ignorar vitalícios)
      const trialsExpiringSoon = await prisma.subscription.findMany({
        where: {
          status: 'TRIAL',
          isTrial: true,
          isLifetime: false, // Nunca notificar vitalícios
          trialEndsAt: {
            gte: now,
            lte: threeDaysFromNow
          }
        },
        include: {
          user: true,
          plan: true
        }
      });

      logInfo('Trials expirando em breve', { count: trialsExpiringSoon.length });
      expiringSoonCount = trialsExpiringSoon.length;
      processedCount += trialsExpiringSoon.length;

      // Enviar e-mails de aviso
      for (const subscription of trialsExpiringSoon) {
        const daysRemaining = Math.ceil(
          (subscription.trialEndsAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysRemaining > 0 && daysRemaining <= DAYS_BEFORE_WARNING) {
          try {
            await sendTrialEndingEmail(
              subscription.user.email,
              subscription.user.name || 'Usuário',
              daysRemaining,
              subscription.plan.name
            );
            logInfo('E-mail de trial terminando enviado', { email: subscription.user.email });
            successCount++;
            emailsSent.push(`trial_ending:${subscription.user.email}`);
          } catch (err) {
            logError('Erro ao enviar e-mail', { email: subscription.user.email, err });
            errorCount++;
          }
        }
      }

      // 2. Buscar trials que já expiraram (mas ainda estão marcados como TRIAL, ignorar vitalícios)
      const trialsExpired = await prisma.subscription.findMany({
        where: {
          status: 'TRIAL',
          isTrial: true,
          isLifetime: false, // Nunca expirar vitalícios
          trialEndsAt: {
            lt: now
          }
        },
        include: {
          user: true,
          plan: true
        }
      });

      logInfo('Trials expirados', { count: trialsExpired.length });
      expiredCount = trialsExpired.length;
      processedCount += trialsExpired.length;

      // Atualizar status e enviar e-mail
      for (const subscription of trialsExpired) {
        try {
          // Atualizar status para EXPIRED
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'EXPIRED' }
          });

          // Enviar e-mail de trial expirado
          await sendTrialExpiredEmail(
            subscription.user.email,
            subscription.user.name || 'Usuário',
            subscription.plan.name
          );

          logInfo('Trial expirado - Status atualizado e e-mail enviado', { email: subscription.user.email });
          successCount++;
          emailsSent.push(`trial_expired:${subscription.user.email}`);
        } catch (err) {
          logError('Erro ao processar trial expirado', { subscriptionId: subscription.id, err });
          errorCount++;
        }
      }

      logSimpleInfo('Verificação de trials concluída!');
    }, {
      retries: 3,
      delayMs: 1000,
      factor: 2,
      jobName: 'checkTrialExpiring'
    });

    return {
      processedCount,
      successCount,
      errorCount,
      summary: `Trials expirando em breve: ${expiringSoonCount}, Trials expirados: ${expiredCount}, E-mails enviados: ${successCount}, Erros: ${errorCount}`,
      metadata: {
        expiringSoonCount,
        expiredCount,
        emailsSent,
      }
    };

  } catch (error) {
    logError('Erro ao verificar trials', { err: error });
    captureJobException(error, { jobName: 'checkTrialExpiring' });

    return {
      processedCount,
      successCount,
      errorCount: errorCount + 1,
      summary: `Erro ao verificar trials: ${error instanceof Error ? error.message : String(error)}`,
      metadata: {
        expiringSoonCount,
        expiredCount,
        emailsSent,
        error: error instanceof Error ? error.message : String(error),
      }
    };
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  checkTrialExpiring()
    .then((result) => {
      logInfo('Job finalizado', result as unknown as Record<string, unknown>);
      process.exit(result.errorCount > 0 ? 1 : 0);
    })
    .catch((err) => {
      logError('Job falhou', { err });
      process.exit(1);
    });
}

export { checkTrialExpiring };

import { prisma } from '../lib/prisma';
import { sendSubscriptionExpiredEmail } from '../services/emailService';
import { captureJobException } from '../monitoring/sentry';
import { retryAsync } from '../utils/retry';
import { JobRunResult } from './checkTrialExpiring';
import { logInfo, logError, logSimpleInfo } from '../utils/loggerHelpers';

/**
 * Job: Verificar assinaturas pagas expiradas
 *
 * COMO EXECUTAR:
 * - Manualmente: npx ts-node src/jobs/checkSubscriptionExpired.ts
 * - Cron: Agendar para rodar diariamente às 10h
 * - Possui retry automático em caso de falhas transientes
 *
 * RETORNO: Agora retorna um objeto padronizado para logging
 */

async function checkSubscriptionExpired(): Promise<JobRunResult> {
  logSimpleInfo('Verificando assinaturas expiradas...');

  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  const emailsSent: string[] = [];

  try {
    // Envolver operação principal com retry
    await retryAsync(async () => {
      const now = new Date();

      // Buscar assinaturas ATIVAS que já expiraram (validUntil < now)
      // Ignorar assinaturas vitalícias (isLifetime=true)
      const subscriptionsExpired = await prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          isLifetime: false,
          validUntil: {
            lt: now
          }
        },
        include: {
          user: true,
          plan: true
        }
      });

      logInfo('Assinaturas expiradas', { count: subscriptionsExpired.length });
      processedCount = subscriptionsExpired.length;

      // Processar cada assinatura expirada
      for (const subscription of subscriptionsExpired) {
        try {
          // Atualizar status para EXPIRED
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'EXPIRED' }
          });

          // Enviar e-mail de assinatura expirada
          await sendSubscriptionExpiredEmail(
            subscription.user.email,
            subscription.user.name || 'Usuário',
            subscription.plan.name
          );

          logInfo('Assinatura expirada - Status atualizado e e-mail enviado', { email: subscription.user.email });
          successCount++;
          emailsSent.push(subscription.user.email);
        } catch (err) {
          logError('Erro ao processar assinatura expirada', { subscriptionId: subscription.id, err });
          errorCount++;
        }
      }

      logSimpleInfo('Verificação de assinaturas concluída!');
    }, {
      retries: 3,
      delayMs: 1000,
      factor: 2,
      jobName: 'checkSubscriptionExpired'
    });

    return {
      processedCount,
      successCount,
      errorCount,
      summary: `Assinaturas expiradas: ${processedCount}, E-mails enviados: ${successCount}, Erros: ${errorCount}`,
      metadata: {
        emailsSent,
      }
    };

  } catch (error) {
    logError('Erro ao verificar assinaturas expiradas', { err: error });
    captureJobException(error, { jobName: 'checkSubscriptionExpired' });

    return {
      processedCount,
      successCount,
      errorCount: errorCount + 1,
      summary: `Erro ao verificar assinaturas: ${error instanceof Error ? error.message : String(error)}`,
      metadata: {
        emailsSent,
        error: error instanceof Error ? error.message : String(error),
      }
    };
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  checkSubscriptionExpired()
    .then((result) => {
      logInfo('Job finalizado', result as unknown as Record<string, unknown>);
      process.exit(result.errorCount > 0 ? 1 : 0);
    })
    .catch((err) => {
      logError('Job falhou', { err });
      process.exit(1);
    });
}

export { checkSubscriptionExpired };

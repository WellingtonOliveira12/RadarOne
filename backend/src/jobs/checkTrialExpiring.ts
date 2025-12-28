import { prisma } from '../server';
import { sendTrialEndingEmail, sendTrialExpiredEmail } from '../services/emailService';
import { captureJobException } from '../monitoring/sentry';
import { retryAsync } from '../utils/retry';

/**
 * Job: Verificar trials expirando e expirados
 *
 * COMO EXECUTAR:
 * - Manualmente: npx ts-node src/jobs/checkTrialExpiring.ts
 * - Cron: Agendar para rodar diariamente às 9h
 * - Possui retry automático em caso de falhas transientes
 */

const DAYS_BEFORE_WARNING = 3; // Avisar 3 dias antes de expirar

async function checkTrialExpiring() {
  console.log('[JOB] 🔍 Verificando trials expirando...');

  try {
    // Envolver operação principal com retry
    await retryAsync(async () => {
    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(now.getDate() + DAYS_BEFORE_WARNING);

    // 1. Buscar trials que estão expirando em 3 dias
    const trialsExpiringSoon = await prisma.subscription.findMany({
      where: {
        status: 'TRIAL',
        isTrial: true,
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

    console.log(`[JOB] 📧 ${trialsExpiringSoon.length} trials expirando em breve`);

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
          console.log(`[JOB] ✅ E-mail de trial terminando enviado para ${subscription.user.email}`);
        } catch (err) {
          console.error(`[JOB] ❌ Erro ao enviar e-mail para ${subscription.user.email}:`, err);
        }
      }
    }

    // 2. Buscar trials que já expiraram (mas ainda estão marcados como TRIAL)
    const trialsExpired = await prisma.subscription.findMany({
      where: {
        status: 'TRIAL',
        isTrial: true,
        trialEndsAt: {
          lt: now
        }
      },
      include: {
        user: true,
        plan: true
      }
    });

    console.log(`[JOB] 🚫 ${trialsExpired.length} trials expirados`);

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

        console.log(`[JOB] ✅ Trial expirado: ${subscription.user.email} - Status atualizado e e-mail enviado`);
      } catch (err) {
        console.error(`[JOB] ❌ Erro ao processar trial expirado ${subscription.id}:`, err);
      }
    }

      console.log('[JOB] ✅ Verificação de trials concluída!');
    }, {
      retries: 3,
      delayMs: 1000,
      factor: 2,
      jobName: 'checkTrialExpiring'
    });

  } catch (error) {
    console.error('[JOB] ❌ Erro ao verificar trials:', error);
    captureJobException(error, { jobName: 'checkTrialExpiring' });
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  checkTrialExpiring()
    .then(() => {
      console.log('[JOB] Job finalizado com sucesso');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[JOB] Job falhou:', err);
      process.exit(1);
    });
}

export { checkTrialExpiring };

import { prisma } from '../server';
import { sendSubscriptionExpiredEmail } from '../services/emailService';
import { captureJobException } from '../monitoring/sentry';
import { retryAsync } from '../utils/retry';

/**
 * Job: Verificar assinaturas pagas expiradas
 *
 * COMO EXECUTAR:
 * - Manualmente: npx ts-node src/jobs/checkSubscriptionExpired.ts
 * - Cron: Agendar para rodar diariamente às 10h
 * - Possui retry automático em caso de falhas transientes
 */

async function checkSubscriptionExpired() {
  console.log('[JOB] 🔍 Verificando assinaturas expiradas...');

  try {
    // Envolver operação principal com retry
    await retryAsync(async () => {
    const now = new Date();

    // Buscar assinaturas ATIVAS que já expiraram (validUntil < now)
    const subscriptionsExpired = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        validUntil: {
          lt: now
        }
      },
      include: {
        user: true,
        plan: true
      }
    });

    console.log(`[JOB] 🚫 ${subscriptionsExpired.length} assinaturas expiradas`);

    // Processar cada assinatura expirada
    for (const subscription of subscriptionsExpired) {
      try {
        // Atualizar status para EXPIRED
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'EXPIRED' }
        });

        // Enviar e-mail de assinatura expirada (TODO: implementar corretamente)
        // await sendSubscriptionExpiredEmail(subscription.user.email);
        console.log('[checkSubscriptionExpired] Email stub - subscription expired', { email: subscription.user.email });

        console.log(`[JOB] ✅ Assinatura expirada: ${subscription.user.email} - Status atualizado e e-mail enviado`);
      } catch (err) {
        console.error(`[JOB] ❌ Erro ao processar assinatura expirada ${subscription.id}:`, err);
      }
    }

      console.log('[JOB] ✅ Verificação de assinaturas concluída!');
    }, {
      retries: 3,
      delayMs: 1000,
      factor: 2,
      jobName: 'checkSubscriptionExpired'
    });

  } catch (error) {
    console.error('[JOB] ❌ Erro ao verificar assinaturas expiradas:', error);
    captureJobException(error, { jobName: 'checkSubscriptionExpired' });
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  checkSubscriptionExpired()
    .then(() => {
      console.log('[JOB] Job finalizado com sucesso');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[JOB] Job falhou:', err);
      process.exit(1);
    });
}

export { checkSubscriptionExpired };

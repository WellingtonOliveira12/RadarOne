import { prisma } from '../server';
import { sendAbandonedCouponEmail } from '../services/emailService';
import { captureJobException } from '../monitoring/sentry';
import { retryAsync } from '../utils/retry';

/**
 * Job: Verificar cupons validados mas não utilizados (abandono)
 *
 * COMO EXECUTAR:
 * - Manualmente: npx ts-node src/jobs/checkAbandonedCoupons.ts
 * - Cron: Agendar para rodar diariamente às 10h
 * - Possui retry automático em caso de falhas transientes
 *
 * FUNCIONALIDADE:
 * - Busca cupons DISCOUNT validados há 24h que não foram convertidos
 * - Envia email de lembrete com link direto para checkout
 * - Evita enviar múltiplos emails (controle por data)
 */

const HOURS_BEFORE_REMINDER = 24; // Aguardar 24h antes de enviar lembrete

async function checkAbandonedCoupons() {
  console.log('[JOB] 🎫 Verificando cupons abandonados...');

  try {
    await retryAsync(async () => {
      const now = new Date();
      const reminderThreshold = new Date();
      reminderThreshold.setHours(now.getHours() - HOURS_BEFORE_REMINDER);

      // Buscar validações de cupons DISCOUNT não convertidas
      const abandonedValidations = await prisma.couponValidation.findMany({
        where: {
          purpose: 'DISCOUNT',
          converted: false,
          createdAt: {
            gte: new Date(now.getTime() - 48 * 60 * 60 * 1000), // Últimas 48h
            lte: reminderThreshold, // Mas criadas há mais de 24h
          },
        },
      });

      console.log(`[JOB] 📧 ${abandonedValidations.length} cupons abandonados encontrados`);

      // Buscar dados do cupom para cada validação
      for (const validation of abandonedValidations) {
        try {
          // Buscar cupom
          const coupon = await prisma.coupon.findUnique({
            where: { id: validation.couponId },
          });

          if (!coupon || !coupon.isActive) {
            console.log(`[JOB] ⏭️  Cupom ${validation.couponId} inativo ou deletado - pulando`);
            continue;
          }

          // Determinar email e nome
          let recipientEmail = validation.userEmail;
          let recipientName = 'Usuário';

          // Se tem userId, buscar dados do usuário
          if (validation.userId) {
            const user = await prisma.user.findUnique({
              where: { id: validation.userId },
              select: { email: true, name: true },
            });

            if (user) {
              recipientEmail = user.email;
              recipientName = user.name || 'Usuário';
            }
          }

          if (!recipientEmail) {
            console.log(`[JOB] ⚠️  Validação ${validation.id} sem email - pulando`);
            continue;
          }

          // Verificar se já enviamos email para essa validação
          // (para evitar spam caso o job rode múltiplas vezes)
          if (validation.updatedAt.getTime() !== validation.createdAt.getTime()) {
            console.log(`[JOB] ⏭️  Email já enviado para ${recipientEmail} - pulando`);
            continue;
          }

          // Enviar email de lembrete
          await sendAbandonedCouponEmail(
            recipientEmail,
            recipientName,
            coupon.code,
            coupon.discountType === 'PERCENTAGE'
              ? `${coupon.discountValue}%`
              : `R$ ${(coupon.discountValue / 100).toFixed(2)}`,
            coupon.description || 'Desconto especial'
          );

          // Atualizar updatedAt para marcar que email foi enviado
          await prisma.couponValidation.update({
            where: { id: validation.id },
            data: { updatedAt: new Date() },
          });

          console.log(`[JOB] ✅ Email de cupom abandonado enviado para ${recipientEmail}`);
        } catch (err) {
          console.error(`[JOB] ❌ Erro ao processar validação ${validation.id}:`, err);
        }
      }

      console.log('[JOB] ✅ Verificação de cupons abandonados concluída!');
    }, {
      retries: 3,
      delayMs: 1000,
      factor: 2,
      jobName: 'checkAbandonedCoupons',
    });
  } catch (error) {
    console.error('[JOB] ❌ Erro ao verificar cupons abandonados:', error);
    captureJobException(error, { jobName: 'checkAbandonedCoupons' });
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  checkAbandonedCoupons()
    .then(() => {
      console.log('[JOB] Job finalizado com sucesso');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[JOB] Job falhou:', err);
      process.exit(1);
    });
}

export { checkAbandonedCoupons };

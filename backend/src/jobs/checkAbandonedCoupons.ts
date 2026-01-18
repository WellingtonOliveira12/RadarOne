import { prisma } from '../lib/prisma';
import { sendAbandonedCouponEmail } from '../services/emailService';
import { sendAbandonedCouponPush } from '../services/pushService';
import { captureJobException } from '../monitoring/sentry';
import { retryAsync } from '../utils/retry';

/**
 * Job: Verificar cupons validados mas não utilizados (abandono) - RETARGETING AVANÇADO
 *
 * COMO EXECUTAR:
 * - Manualmente: npx ts-node src/jobs/checkAbandonedCoupons.ts
 * - Cron: Agendar para rodar diariamente às 10h
 * - Possui retry automático em caso de falhas transientes
 *
 * FUNCIONALIDADE:
 * - 1º EMAIL: Busca cupons DISCOUNT validados há 24h+ que não foram convertidos e não receberam email
 * - 2º EMAIL: Busca cupons validados há 48h+ que receberam 1º email mas ainda não converteram
 * - Controle de envio via campos reminderSentAt e secondReminderSentAt
 * - Link direto para checkout com cupom pré-aplicado
 */

const HOURS_BEFORE_FIRST_REMINDER = 24; // 1º lembrete após 24h
const HOURS_BEFORE_SECOND_REMINDER = 48; // 2º lembrete após 48h

async function checkAbandonedCoupons() {
  console.log('[JOB] 🎫 Verificando cupons abandonados (retargeting avançado)...');

  try {
    await retryAsync(async () => {
      const now = new Date();
      const firstReminderThreshold = new Date(now.getTime() - HOURS_BEFORE_FIRST_REMINDER * 60 * 60 * 1000);
      const secondReminderThreshold = new Date(now.getTime() - HOURS_BEFORE_SECOND_REMINDER * 60 * 60 * 1000);

      // ========== ETAPA 1: PRIMEIRO EMAIL (24h) ==========
      const firstReminderCandidates = await prisma.couponValidation.findMany({
        where: {
          purpose: 'DISCOUNT',
          converted: false,
          reminderSentAt: null, // Ainda não recebeu 1º email
          createdAt: {
            lte: firstReminderThreshold, // Criado há mais de 24h
          },
        },
      });

      console.log(`[JOB] 📧 ${firstReminderCandidates.length} candidatos para 1º email (24h)`);

      for (const validation of firstReminderCandidates) {
        try {
          const coupon = await prisma.coupon.findUnique({
            where: { id: validation.couponId },
          });

          if (!coupon || !coupon.isActive) {
            console.log(`[JOB] ⏭️  Cupom ${validation.couponId} inativo - pulando`);
            continue;
          }

          // Determinar email e nome
          let recipientEmail = validation.userEmail;
          let recipientName = 'Usuário';

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

          // Calcular valor do desconto formatado
          const discountText = coupon.discountType === 'PERCENTAGE'
            ? `${coupon.discountValue}%`
            : `R$ ${(coupon.discountValue / 100).toFixed(2)}`;

          // Enviar 1º email
          await sendAbandonedCouponEmail(
            recipientEmail,
            recipientName,
            coupon.code,
            discountText,
            coupon.description || 'Desconto especial',
            false // primeiro email
          );

          // Enviar push notification se usuário tem userId
          if (validation.userId) {
            await sendAbandonedCouponPush(
              validation.userId,
              coupon.code,
              discountText,
              false // primeiro lembrete
            );
            console.log(`[JOB] 📱 Push enviado para userId ${validation.userId}`);
          }

          // Marcar reminderSentAt
          await prisma.couponValidation.update({
            where: { id: validation.id },
            data: { reminderSentAt: new Date() },
          });

          console.log(`[JOB] ✅ 1º email enviado para ${recipientEmail} (cupom: ${coupon.code})`);
        } catch (err) {
          console.error(`[JOB] ❌ Erro ao processar 1º email validação ${validation.id}:`, err);
        }
      }

      // ========== ETAPA 2: SEGUNDO EMAIL (48h) ==========
      const secondReminderCandidates = await prisma.couponValidation.findMany({
        where: {
          purpose: 'DISCOUNT',
          converted: false,
          reminderSentAt: { not: null }, // Já recebeu 1º email
          secondReminderSentAt: null, // Ainda não recebeu 2º email
          createdAt: {
            lte: secondReminderThreshold, // Criado há mais de 48h
          },
        },
      });

      console.log(`[JOB] 📧 ${secondReminderCandidates.length} candidatos para 2º email (48h)`);

      for (const validation of secondReminderCandidates) {
        try {
          const coupon = await prisma.coupon.findUnique({
            where: { id: validation.couponId },
          });

          if (!coupon || !coupon.isActive) {
            console.log(`[JOB] ⏭️  Cupom ${validation.couponId} inativo - pulando`);
            continue;
          }

          // Determinar email e nome
          let recipientEmail = validation.userEmail;
          let recipientName = 'Usuário';

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

          // Calcular valor do desconto formatado
          const discountText = coupon.discountType === 'PERCENTAGE'
            ? `${coupon.discountValue}%`
            : `R$ ${(coupon.discountValue / 100).toFixed(2)}`;

          // Enviar 2º email (mais urgente)
          await sendAbandonedCouponEmail(
            recipientEmail,
            recipientName,
            coupon.code,
            discountText,
            coupon.description || 'Desconto especial',
            true // segundo email (urgente)
          );

          // Enviar push notification se usuário tem userId
          if (validation.userId) {
            await sendAbandonedCouponPush(
              validation.userId,
              coupon.code,
              discountText,
              true // segundo lembrete (urgente)
            );
            console.log(`[JOB] 📱 Push de 2º lembrete enviado para userId ${validation.userId}`);
          }

          // Marcar secondReminderSentAt
          await prisma.couponValidation.update({
            where: { id: validation.id },
            data: { secondReminderSentAt: new Date() },
          });

          console.log(`[JOB] ✅ 2º email enviado para ${recipientEmail} (cupom: ${coupon.code})`);
        } catch (err) {
          console.error(`[JOB] ❌ Erro ao processar 2º email validação ${validation.id}:`, err);
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

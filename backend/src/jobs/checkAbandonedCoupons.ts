import { prisma } from '../lib/prisma';
import { sendAbandonedCouponEmail } from '../services/emailService';
import { sendAbandonedCouponPush } from '../services/pushService';
import { captureJobException } from '../monitoring/sentry';
import { retryAsync } from '../utils/retry';
import { JobRunResult } from './checkTrialExpiring';
import { logInfo, logError, logSimpleInfo } from '../utils/loggerHelpers';

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
 *
 * RETORNO: Agora retorna um objeto padronizado para logging
 */

const HOURS_BEFORE_FIRST_REMINDER = 24; // 1º lembrete após 24h
const HOURS_BEFORE_SECOND_REMINDER = 48; // 2º lembrete após 48h

async function checkAbandonedCoupons(): Promise<JobRunResult> {
  logSimpleInfo('Verificando cupons abandonados (retargeting avançado)...');

  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  let firstRemindersSent = 0;
  let secondRemindersSent = 0;

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

      logInfo('Candidatos para 1º email (24h)', { count: firstReminderCandidates.length });
      processedCount += firstReminderCandidates.length;

      for (const validation of firstReminderCandidates) {
        try {
          const coupon = await prisma.coupon.findUnique({
            where: { id: validation.couponId },
          });

          if (!coupon || !coupon.isActive) {
            logInfo('Cupom inativo - pulando', { couponId: validation.couponId });
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
            logInfo('Validação sem email - pulando', { validationId: validation.id });
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
            logInfo('Push enviado', { userId: validation.userId });
          }

          // Marcar reminderSentAt
          await prisma.couponValidation.update({
            where: { id: validation.id },
            data: { reminderSentAt: new Date() },
          });

          logInfo('1º email enviado', { email: recipientEmail, couponCode: coupon.code });
          successCount++;
          firstRemindersSent++;
        } catch (err) {
          logError('Erro ao processar 1º email validação', { validationId: validation.id, err });
          errorCount++;
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

      logInfo('Candidatos para 2º email (48h)', { count: secondReminderCandidates.length });
      processedCount += secondReminderCandidates.length;

      for (const validation of secondReminderCandidates) {
        try {
          const coupon = await prisma.coupon.findUnique({
            where: { id: validation.couponId },
          });

          if (!coupon || !coupon.isActive) {
            logInfo('Cupom inativo - pulando', { couponId: validation.couponId });
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
            logInfo('Validação sem email - pulando', { validationId: validation.id });
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
            logInfo('Push de 2º lembrete enviado', { userId: validation.userId });
          }

          // Marcar secondReminderSentAt
          await prisma.couponValidation.update({
            where: { id: validation.id },
            data: { secondReminderSentAt: new Date() },
          });

          logInfo('2º email enviado', { email: recipientEmail, couponCode: coupon.code });
          successCount++;
          secondRemindersSent++;
        } catch (err) {
          logError('Erro ao processar 2º email validação', { validationId: validation.id, err });
          errorCount++;
        }
      }

      logSimpleInfo('Verificação de cupons abandonados concluída!');
    }, {
      retries: 3,
      delayMs: 1000,
      factor: 2,
      jobName: 'checkAbandonedCoupons',
    });

    return {
      processedCount,
      successCount,
      errorCount,
      summary: `Cupons abandonados: 1º lembrete=${firstRemindersSent}, 2º lembrete=${secondRemindersSent}, Erros=${errorCount}`,
      metadata: {
        firstRemindersSent,
        secondRemindersSent,
      }
    };

  } catch (error) {
    logError('Erro ao verificar cupons abandonados', { err: error });
    captureJobException(error, { jobName: 'checkAbandonedCoupons' });

    return {
      processedCount,
      successCount,
      errorCount: errorCount + 1,
      summary: `Erro ao verificar cupons abandonados: ${error instanceof Error ? error.message : String(error)}`,
      metadata: {
        firstRemindersSent,
        secondRemindersSent,
        error: error instanceof Error ? error.message : String(error),
      }
    };
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  checkAbandonedCoupons()
    .then((result) => {
      logInfo('Job finalizado', result as unknown as Record<string, unknown>);
      process.exit(result.errorCount > 0 ? 1 : 0);
    })
    .catch((err) => {
      logError('Job falhou', { err });
      process.exit(1);
    });
}

export { checkAbandonedCoupons };

import { prisma } from '../lib/prisma';
import { sendTrialUpgradeExpiringEmail } from '../services/emailService';
import { JobRunResult } from './checkTrialExpiring';

/**
 * FASE: Cupons de Upgrade
 *
 * Job que verifica trial upgrades (subscriptions criadas por cupons) expirando
 * e envia emails de notificação para os usuários.
 *
 * AGENDAMENTO: Diariamente às 12h
 *
 * LÓGICA:
 * 1. Busca subscriptions TRIAL criadas por cupons (externalProvider=COUPON_TRIAL_UPGRADE)
 * 2. Filtra as que vão expirar em 1, 3 ou 7 dias
 * 3. Envia email de notificação para o usuário
 * 4. Registra log de envio para não duplicar emails
 *
 * RETORNO: Agora retorna um objeto padronizado para logging
 */
export async function checkTrialUpgradeExpiring(): Promise<JobRunResult> {
  console.log('[checkTrialUpgradeExpiring] 🔍 Verificando trial upgrades expirando...');

  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  const notifications: { email: string; days: number }[] = [];

  try {
    const now = new Date();

    // Definir janelas de notificação (1 dia, 3 dias, 7 dias)
    const windows = [
      { days: 1, startHours: 24, endHours: 25 }, // Entre 24h e 25h (1 dia)
      { days: 3, startHours: 72, endHours: 73 }, // Entre 72h e 73h (3 dias)
      { days: 7, startHours: 168, endHours: 169 }, // Entre 168h e 169h (7 dias)
    ];

    for (const window of windows) {
      const startDate = new Date(now.getTime() + window.startHours * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() + window.endHours * 60 * 60 * 1000);

      // Buscar subscriptions TRIAL criadas por cupons que expiram nesta janela (ignorar vitalícios)
      const expiringSubscriptions = await prisma.subscription.findMany({
        where: {
          status: 'TRIAL',
          externalProvider: 'COUPON_TRIAL_UPGRADE',
          isLifetime: false, // Nunca notificar vitalícios
          trialEndsAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          plan: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      });

      console.log(
        `[checkTrialUpgradeExpiring] 📧 Encontradas ${expiringSubscriptions.length} subscriptions expirando em ${window.days} ${window.days === 1 ? 'dia' : 'dias'}`
      );

      processedCount += expiringSubscriptions.length;

      // Enviar emails
      for (const subscription of expiringSubscriptions) {
        try {
          // Verificar se já enviamos notificação para este usuário recentemente
          // (para evitar spam se o job rodar múltiplas vezes no mesmo dia)
          const recentNotification = await prisma.auditLog.findFirst({
            where: {
              action: 'NOTIFICATION_TRIAL_UPGRADE_EXPIRING',
              targetType: 'SUBSCRIPTION',
              targetId: subscription.id,
              createdAt: {
                gte: new Date(now.getTime() - 12 * 60 * 60 * 1000), // Últimas 12h
              },
            },
          });

          if (recentNotification) {
            console.log(
              `[checkTrialUpgradeExpiring] ⏭️  Notificação já enviada recentemente para ${subscription.user.email}, pulando...`
            );
            continue;
          }

          // Enviar email
          const result = await sendTrialUpgradeExpiringEmail(
            subscription.user.email,
            subscription.plan.name,
            window.days,
            subscription.trialEndsAt!
          );

          if (result.success) {
            console.log(
              `[checkTrialUpgradeExpiring] ✅ Email enviado para ${subscription.user.email} (${subscription.plan.name}, expira em ${window.days} ${window.days === 1 ? 'dia' : 'dias'})`
            );

            // Registrar no audit log
            await prisma.auditLog.create({
              data: {
                action: 'NOTIFICATION_TRIAL_UPGRADE_EXPIRING',
                targetType: 'SUBSCRIPTION',
                targetId: subscription.id,
                adminId: 'SYSTEM',
                adminEmail: 'system@radarone.com',
                beforeData: null,
                afterData: {
                  userEmail: subscription.user.email,
                  planName: subscription.plan.name,
                  daysRemaining: window.days,
                  expiresAt: subscription.trialEndsAt,
                },
                ipAddress: 'SYSTEM_JOB',
                userAgent: 'CronJob:checkTrialUpgradeExpiring',
              },
            });

            successCount++;
            notifications.push({ email: subscription.user.email, days: window.days });
          } else {
            console.error(
              `[checkTrialUpgradeExpiring] ❌ Erro ao enviar email para ${subscription.user.email}:`,
              result.error
            );
            errorCount++;
          }
        } catch (error: any) {
          console.error(
            `[checkTrialUpgradeExpiring] ❌ Erro ao processar subscription ${subscription.id}:`,
            error.message
          );
          errorCount++;
        }
      }
    }

    console.log(
      `[checkTrialUpgradeExpiring] ✅ Job concluído. Total de notificações enviadas: ${successCount}`
    );

    return {
      processedCount,
      successCount,
      errorCount,
      summary: `Trial upgrades verificados: ${processedCount}, Notificações enviadas: ${successCount}, Erros: ${errorCount}`,
      metadata: {
        notifications,
      }
    };

  } catch (error) {
    console.error('[checkTrialUpgradeExpiring] ❌ Erro ao executar job:', error);

    return {
      processedCount,
      successCount,
      errorCount: errorCount + 1,
      summary: `Erro ao verificar trial upgrades: ${error instanceof Error ? error.message : String(error)}`,
      metadata: {
        notifications,
        error: error instanceof Error ? error.message : String(error),
      }
    };
  }
}

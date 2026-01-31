import { prisma } from '../lib/prisma';
import { sendTelegramMessage } from '../services/telegramService';
import { sendEmail } from '../services/emailService';
import { JobRunResult } from './checkTrialExpiring';
import { logInfo, logError } from '../utils/loggerHelpers';

/**
 * Job: Verificar Sessões Expirando
 *
 * Executa diariamente para:
 * - Notificar usuários cujas sessões expiram em 3 dias ou menos
 * - Evitar interrupções no monitoramento
 *
 * Notifica via:
 * - Telegram (se configurado)
 * - Email (se Resend configurado)
 *
 * RETORNO: Agora retorna um objeto padronizado para logging
 */

interface ExpiringSession {
  id: string;
  site: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    notificationSettings: {
      telegramChatId: string | null;
      telegramEnabled: boolean;
    } | null;
    telegramAccounts: Array<{ chatId: string }>;
  };
}

export async function checkSessionExpiring(): Promise<JobRunResult> {
  logInfo('Iniciando verificação de sessões expirando...', {});

  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  let telegramsSent = 0;
  let emailsSent = 0;

  try {
    // Data limite: 3 dias a partir de agora
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + 3);

    // Buscar sessões ACTIVE que expiram em até 3 dias
    const expiringSessions = await prisma.userSession.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          lte: warningDate,
          gt: new Date(), // Ainda não expirou
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            notificationSettings: {
              select: {
                telegramChatId: true,
                telegramEnabled: true,
              },
            },
            telegramAccounts: {
              select: { chatId: true },
              take: 1,
            },
          },
        },
      },
    }) as unknown as (ExpiringSession & { metadata: any })[];

    // Filtrar sessões que não foram notificadas nas últimas 24h
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const sessionsToNotify = expiringSessions.filter((session) => {
      const lastNotified = session.metadata?.lastExpirationNotifiedAt;
      if (!lastNotified) return true;
      return new Date(lastNotified) < twentyFourHoursAgo;
    });

    logInfo('Encontradas sessões expirando', {
      totalExpiring: expiringSessions.length,
      toNotify: sessionsToNotify.length
    });
    processedCount = sessionsToNotify.length;

    for (const session of sessionsToNotify) {
      try {
        const daysLeft = Math.ceil(
          (session.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        const siteName = getSiteName(session.site);
        const urgency = daysLeft <= 1 ? 'URGENTE' : daysLeft <= 2 ? 'Atenção' : 'Aviso';

        let sessionNotified = false;

        // Tentar notificar por Telegram
        const telegramChatId =
          session.user.notificationSettings?.telegramChatId ||
          session.user.telegramAccounts?.[0]?.chatId;

        const telegramEnabled = session.user.notificationSettings?.telegramEnabled !== false;

        if (telegramChatId && telegramEnabled) {
          try {
            const message =
              `⚠️ *${urgency}: Sessão expirando*\n\n` +
              `Sua sessão do *${siteName}* expira em *${daysLeft} dia${daysLeft > 1 ? 's' : ''}*.\n\n` +
              `Para continuar monitorando anúncios, reconecte sua conta:\n` +
              `👉 https://radarone.com.br/connections\n\n` +
              `_Dica: Reconecte antes de expirar para evitar interrupções._`;

            await sendTelegramMessage({ chatId: telegramChatId, text: message, parseMode: 'Markdown' });
            telegramsSent++;
            sessionNotified = true;

            logInfo('Telegram enviado', { userId: session.user.id, site: session.site });
          } catch (telegramError) {
            logError('Erro ao enviar Telegram', {
              userId: session.user.id,
              err: telegramError
            });
          }
        }

        // Tentar notificar por Email (se Resend estiver configurado)
        if (session.user.email && process.env.RESEND_API_KEY) {
          try {
            await sendEmail({
              to: session.user.email,
              subject: `${urgency}: Sua sessão do ${siteName} expira em ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: ${daysLeft <= 1 ? '#dc2626' : '#f59e0b'};">
                    ⚠️ ${urgency}: Sessão expirando
                  </h2>

                  <p>Olá!</p>

                  <p>
                    Sua sessão do <strong>${siteName}</strong> expira em
                    <strong>${daysLeft} dia${daysLeft > 1 ? 's' : ''}</strong>.
                  </p>

                  <p>
                    Para continuar monitorando anúncios sem interrupções,
                    reconecte sua conta antes que a sessão expire.
                  </p>

                  <div style="margin: 24px 0;">
                    <a href="https://radarone.com.br/connections"
                       style="background-color: #3b82f6; color: white; padding: 12px 24px;
                              text-decoration: none; border-radius: 6px; font-weight: bold;">
                      Reconectar conta
                    </a>
                  </div>

                  <p style="color: #6b7280; font-size: 14px;">
                    <strong>Dica:</strong> Reconecte antes de expirar para evitar
                    que seus monitores fiquem pausados.
                  </p>

                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

                  <p style="color: #9ca3af; font-size: 12px;">
                    Este é um email automático do RadarOne.
                  </p>
                </div>
              `,
            });

            emailsSent++;
            if (!sessionNotified) {
              sessionNotified = true;
            }

            logInfo('Email enviado', { email: session.user.email, site: session.site });
          } catch (emailError) {
            logError('Erro ao enviar email', {
              email: session.user.email,
              err: emailError
            });
          }
        }

        if (sessionNotified) {
          successCount++;
        }

        // Atualizar metadata com data da última notificação para evitar spam
        const currentMetadata = (session as any).metadata || {};
        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            metadata: {
              ...currentMetadata,
              lastExpirationNotifiedAt: new Date().toISOString(),
            },
          },
        });
      } catch (sessionError) {
        logError('Erro ao processar sessão', {
          sessionId: session.id,
          err: sessionError
        });
        errorCount++;
      }
    }

    logInfo('Concluído', {
      sessionsNotified: successCount,
      totalProcessed: sessionsToNotify.length
    });

    return {
      processedCount,
      successCount,
      errorCount,
      summary: `Sessões verificadas: ${processedCount}, Notificadas: ${successCount} (${telegramsSent} Telegram, ${emailsSent} Email), Erros: ${errorCount}`,
      metadata: {
        telegramsSent,
        emailsSent,
        totalExpiring: expiringSessions.length,
      }
    };

  } catch (error) {
    logError('Erro geral', { err: error });

    return {
      processedCount,
      successCount,
      errorCount: errorCount + 1,
      summary: `Erro ao verificar sessões: ${error instanceof Error ? error.message : String(error)}`,
      metadata: {
        telegramsSent,
        emailsSent,
        error: error instanceof Error ? error.message : String(error),
      }
    };
  }
}

/**
 * Retorna o nome amigável do site
 */
function getSiteName(site: string): string {
  const siteNames: Record<string, string> = {
    MERCADO_LIVRE: 'Mercado Livre',
    OLX: 'OLX',
    WEBMOTORS: 'Webmotors',
    ICARROS: 'iCarros',
    ZAP_IMOVEIS: 'ZAP Imóveis',
    VIVA_REAL: 'VivaReal',
    IMOVELWEB: 'ImovelWeb',
    SUPERBID: 'Superbid',
    VIP_LEILOES: 'VIP Leilões',
    SODRE_SANTORO: 'Sodré Santoro',
  };

  return siteNames[site] || site;
}

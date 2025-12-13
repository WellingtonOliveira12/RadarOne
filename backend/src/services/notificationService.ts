import { prisma } from '../server';
import { getUserTelegramAccount, sendTelegramMessage } from './telegramService';
import { sendNewListingEmail } from './emailService';
import { Monitor, NotificationChannel, NotificationStatus } from '@prisma/client';
import logger from '../logger';

/**
 * Serviço de Notificações
 * Estratégia: SEMPRE enviar Telegram E Email (ambos, não fallback)
 */

/**
 * Sanitiza email para logs (oculta parte do email)
 */
function sanitizeEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.charAt(0)}***@${domain}`;
}

/**
 * Mascara chatId do Telegram (mostra apenas os 4 últimos dígitos)
 */
function maskChatId(chatId: string): string {
  if (chatId.length <= 4) return '***';
  return `***${chatId.slice(-4)}`;
}

/**
 * Registra uma notificação no histórico (não quebra o fluxo se falhar)
 */
async function logNotification(
  userId: string,
  channel: NotificationChannel,
  title: string,
  message: string,
  target: string,
  status: NotificationStatus,
  error?: string
) {
  try {
    await prisma.notificationLog.create({
      data: {
        userId,
        channel,
        title,
        message: message.substring(0, 500), // Limita tamanho da mensagem
        target,
        status,
        error: error?.substring(0, 1000) // Limita tamanho do erro
      }
    });
  } catch (err) {
    // Não quebrar o fluxo se o log falhar
    logger.error({ err, userId, channel }, 'Failed to log notification');
  }
}

export interface ListingPayload {
  title: string;
  price?: number;
  url: string;
  rawData?: any;
}

export async function notifyNewListing(
  userId: string,
  monitor: Monitor,
  listing: ListingPayload
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    logger.warn({ userId }, 'User not found for notification');
    return;
  }

  const priceText = listing.price ? `R$ ${listing.price.toFixed(2)}` : 'Não informado';

  // Mensagem para Telegram (HTML)
  const telegramMessage =
    `🔔 <b>Novo anúncio encontrado!</b>\n\n` +
    `📌 Monitor: ${monitor.name}\n` +
    `📝 ${listing.title}\n` +
    `💰 Preço: ${priceText}\n` +
    `🔗 <a href="${listing.url}">Ver anúncio</a>`;

  // Array para Promise.allSettled
  const notificationPromises: Promise<any>[] = [];

  // 1. Telegram (se disponível)
  const telegram = await getUserTelegramAccount(userId);
  if (telegram && telegram.active) {
    notificationPromises.push(
      sendTelegramMessage(telegram.chatId, telegramMessage)
        .then(async (sent) => {
          if (sent) {
            logger.info({ userId, channel: 'telegram' }, 'Telegram notification sent successfully');
            await logNotification(
              userId,
              NotificationChannel.TELEGRAM,
              `Novo anúncio: ${listing.title}`,
              telegramMessage,
              maskChatId(telegram.chatId),
              NotificationStatus.SUCCESS
            );
          } else {
            logger.warn({ userId, channel: 'telegram' }, 'Telegram notification failed');
            await logNotification(
              userId,
              NotificationChannel.TELEGRAM,
              `Novo anúncio: ${listing.title}`,
              telegramMessage,
              maskChatId(telegram.chatId),
              NotificationStatus.FAILED,
              'Falha ao enviar mensagem pelo Telegram'
            );
          }
          return { channel: 'telegram', sent };
        })
        .catch(async (err) => {
          logger.error({ err, userId, channel: 'telegram' }, 'Error sending Telegram notification');
          await logNotification(
            userId,
            NotificationChannel.TELEGRAM,
            `Novo anúncio: ${listing.title}`,
            telegramMessage,
            maskChatId(telegram.chatId),
            NotificationStatus.FAILED,
            err.message || String(err)
          );
          return { channel: 'telegram', sent: false, error: err };
        })
    );
  }

  // 2. E-mail (SEMPRE, se user tiver email)
  if (user.email) {
    const emailSubject = `Novo anúncio: ${listing.title}`;
    const emailMessage = `Monitor: ${monitor.name}\nTítulo: ${listing.title}\nPreço: ${priceText}\nURL: ${listing.url}`;

    notificationPromises.push(
      sendNewListingEmail(
        user.email,
        user.name,
        monitor.name,
        listing.title,
        listing.price,
        listing.url
      )
        .then(async (sent) => {
          if (sent) {
            logger.info({ userId, channel: 'email', email: sanitizeEmail(user.email) }, 'Email notification sent successfully');
            await logNotification(
              userId,
              NotificationChannel.EMAIL,
              emailSubject,
              emailMessage,
              sanitizeEmail(user.email),
              NotificationStatus.SUCCESS
            );
          } else {
            logger.warn({ userId, channel: 'email', email: sanitizeEmail(user.email) }, 'Email notification failed');
            await logNotification(
              userId,
              NotificationChannel.EMAIL,
              emailSubject,
              emailMessage,
              sanitizeEmail(user.email),
              NotificationStatus.FAILED,
              'Falha ao enviar email'
            );
          }
          return { channel: 'email', sent };
        })
        .catch(async (err) => {
          logger.error({ err, userId, channel: 'email', email: sanitizeEmail(user.email) }, 'Error sending email notification');
          await logNotification(
            userId,
            NotificationChannel.EMAIL,
            emailSubject,
            emailMessage,
            sanitizeEmail(user.email),
            NotificationStatus.FAILED,
            err.message || String(err)
          );
          return { channel: 'email', sent: false, error: err };
        })
    );
  }

  // Executar todas as notificações em paralelo
  if (notificationPromises.length === 0) {
    logger.warn({ userId }, 'No notification channels available for user');
    return;
  }

  const results = await Promise.allSettled(notificationPromises);

  // Log dos resultados
  const successCount = results.filter((r) => r.status === 'fulfilled').length;
  logger.info({ userId, successCount, totalChannels: results.length }, 'Notifications sent');

  // Opcional: retornar estatísticas
  return {
    userId,
    totalChannels: results.length,
    successCount,
    results
  };
}

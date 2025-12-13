import { prisma } from '../server';
import { getUserTelegramAccount, sendTelegramMessage } from './telegramService';
import { sendNewListingEmail } from './emailService';
import { Monitor } from '@prisma/client';

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
    console.warn('[NOTIFY] Usuário não encontrado:', userId);
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
        .then((sent) => {
          if (sent) {
            console.log('[NOTIFY] ✅ Telegram enviado para user', userId);
          } else {
            console.log('[NOTIFY] ❌ Telegram falhou para user', userId);
          }
          return { channel: 'telegram', sent };
        })
        .catch((err) => {
          console.error('[NOTIFY] Erro ao enviar Telegram:', err);
          return { channel: 'telegram', sent: false, error: err };
        })
    );
  }

  // 2. E-mail (SEMPRE, se user tiver email)
  if (user.email) {
    notificationPromises.push(
      sendNewListingEmail(
        user.email,
        user.name,
        monitor.name,
        listing.title,
        listing.price,
        listing.url
      )
        .then((sent) => {
          if (sent) {
            console.log('[NOTIFY] ✅ Email enviado para', sanitizeEmail(user.email));
          } else {
            console.log('[NOTIFY] ❌ Email falhou para', sanitizeEmail(user.email));
          }
          return { channel: 'email', sent };
        })
        .catch((err) => {
          console.error('[NOTIFY] Erro ao enviar Email:', err);
          return { channel: 'email', sent: false, error: err };
        })
    );
  }

  // Executar todas as notificações em paralelo
  if (notificationPromises.length === 0) {
    console.warn('[NOTIFY] Nenhum canal de notificação disponível para user', userId);
    return;
  }

  const results = await Promise.allSettled(notificationPromises);

  // Log dos resultados
  const successCount = results.filter((r) => r.status === 'fulfilled').length;
  console.log(`[NOTIFY] Notificações enviadas: ${successCount}/${results.length} canais`);

  // Opcional: retornar estatísticas
  return {
    userId,
    totalChannels: results.length,
    successCount,
    results
  };
}

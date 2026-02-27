/**
 * Push Notification Service
 *
 * Responsável por:
 * - Gerenciar subscriptions de usuários
 * - Enviar notificações push via Web Push API
 * - Lidar com subscriptions expiradas
 */

import webPush from 'web-push';
import { prisma } from '../lib/prisma';
import { logInfo, logError, logWarning } from '../utils/loggerHelpers';

// Configurar VAPID keys
// Gerar com: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contato@radarone.com.br';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  logInfo('PushService: VAPID configured', {});
} else {
  logWarning('PushService: VAPID keys not configured - push notifications disabled', {});
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  couponCode?: string;
  type?: 'new_ad' | 'coupon' | 'system';
}

/**
 * Salvar ou atualizar subscription de push para um usuário
 */
export async function saveSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verificar se subscription já existe
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint },
    });

    if (existing) {
      await prisma.pushSubscription.update({
        where: { endpoint },
        data: {
          userId,
          p256dh,
          auth,
          updatedAt: new Date(),
        },
      });

      logInfo('PushService: Subscription updated', { userId });
    } else {
      await prisma.pushSubscription.create({
        data: {
          userId,
          endpoint,
          p256dh,
          auth,
        },
      });

      logInfo('PushService: New subscription created', { userId });
    }

    return { success: true };
  } catch (error: any) {
    logError('PushService: Error saving subscription', { err: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Remover subscription de um usuário
 */
export async function removeSubscription(endpoint: string): Promise<{ success: boolean }> {
  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint },
    });

    logInfo('PushService: Subscription removed', {});
    return { success: true };
  } catch (error) {
    logError('PushService: Error removing subscription', { err: String(error) });
    return { success: false };
  }
}

/**
 * Enviar notificação push para um usuário específico
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ success: boolean; sentCount: number; error?: string }> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    logWarning('PushService: Push disabled - VAPID keys not configured', {});
    return { success: false, sentCount: 0, error: 'VAPID keys não configuradas' };
  }

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      logInfo('PushService: No active subscriptions for user', { userId });
      return { success: true, sentCount: 0 };
    }

    logInfo('PushService: Sending push', { userId, deviceCount: subscriptions.length });

    let sentCount = 0;
    const failedEndpoints: string[] = [];

    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        await webPush.sendNotification(pushSubscription, JSON.stringify(payload));
        sentCount++;
      } catch (error: any) {
        logError('PushService: Error sending push to device', { err: error.message });

        if (error.statusCode === 410) {
          logInfo('PushService: Subscription expired, removing', {});
          failedEndpoints.push(sub.endpoint);
        }
      }
    }

    if (failedEndpoints.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: {
          endpoint: { in: failedEndpoints },
        },
      });
      logInfo('PushService: Expired subscriptions removed', { count: failedEndpoints.length });
    }

    return { success: sentCount > 0, sentCount };
  } catch (error: any) {
    logError('PushService: Error sending push', { err: error.message });
    return { success: false, sentCount: 0, error: error.message };
  }
}

/**
 * Enviar notificação de cupom abandonado
 */
export async function sendAbandonedCouponPush(
  userId: string,
  couponCode: string,
  discountText: string,
  isSecondReminder: boolean = false
): Promise<{ success: boolean; sentCount: number; error?: string }> {
  const payload: PushPayload = {
    title: isSecondReminder ? '⏰ Último aviso!' : '🎁 Cupom esperando por você!',
    body: isSecondReminder
      ? `Seu cupom ${couponCode} com ${discountText} de desconto expira em breve!`
      : `Você tem um cupom ${couponCode} com ${discountText} de desconto. Use agora!`,
    icon: '/icons/coupon-192.png',
    url: `/plans?coupon=${couponCode}`,
    couponCode,
    type: 'coupon',
  };

  return sendPushToUser(userId, payload);
}

/**
 * Broadcast: Enviar notificação para múltiplos usuários
 */
export async function broadcastPush(
  userIds: string[],
  payload: PushPayload
): Promise<{ success: boolean; totalSent: number }> {
  logInfo('PushService: Broadcasting push', { userCount: userIds.length });

  let totalSent = 0;

  for (const userId of userIds) {
    const result = await sendPushToUser(userId, payload);
    totalSent += result.sentCount;
  }

  logInfo('PushService: Broadcast complete', { totalSent });
  return { success: totalSent > 0, totalSent };
}

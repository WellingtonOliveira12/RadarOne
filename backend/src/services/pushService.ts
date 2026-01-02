/**
 * Push Notification Service
 *
 * Responsável por:
 * - Gerenciar subscriptions de usuários
 * - Enviar notificações push via Web Push API
 * - Lidar com subscriptions expiradas
 */

import webPush from 'web-push';
import { prisma } from '../server';

// Configurar VAPID keys
// Gerar com: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contato@radarone.com.br';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('[PushService] VAPID configurado');
} else {
  console.warn('[PushService] VAPID keys não configuradas - push notifications desabilitadas');
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  couponCode?: string;
  type?: 'coupon_reminder' | 'new_listing' | 'trial_expiring' | 'general';
  requireInteraction?: boolean;
  tag?: string;
}

/**
 * Salvar subscription de um usuário
 */
export async function saveSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verificar se já existe subscription com este endpoint
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint },
    });

    if (existing) {
      // Atualizar subscription existente
      await prisma.pushSubscription.update({
        where: { endpoint },
        data: {
          userId,
          p256dh,
          auth,
          updatedAt: new Date(),
        },
      });

      console.log(`[PushService] Subscription atualizada: ${endpoint.substring(0, 50)}...`);
    } else {
      // Criar nova subscription
      await prisma.pushSubscription.create({
        data: {
          userId,
          endpoint,
          p256dh,
          auth,
        },
      });

      console.log(`[PushService] Nova subscription criada: ${endpoint.substring(0, 50)}...`);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[PushService] Erro ao salvar subscription:', error);
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

    console.log(`[PushService] Subscription removida: ${endpoint.substring(0, 50)}...`);
    return { success: true };
  } catch (error) {
    console.error('[PushService] Erro ao remover subscription:', error);
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
    console.warn('[PushService] Push desabilitado - VAPID keys não configuradas');
    return { success: false, sentCount: 0, error: 'VAPID keys não configuradas' };
  }

  try {
    // Buscar todas as subscriptions do usuário
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      console.log(`[PushService] Usuário ${userId} não tem subscriptions ativas`);
      return { success: true, sentCount: 0 };
    }

    console.log(`[PushService] Enviando push para ${subscriptions.length} device(s) do usuário ${userId}`);

    let sentCount = 0;
    const failedEndpoints: string[] = [];

    // Enviar para cada subscription
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
        console.log(`[PushService] ✅ Push enviado: ${sub.endpoint.substring(0, 50)}...`);
      } catch (error: any) {
        console.error(`[PushService] ❌ Erro ao enviar push:`, error);

        // Se subscription expirou (410 Gone), remover do banco
        if (error.statusCode === 410) {
          console.log(`[PushService] Subscription expirada, removendo: ${sub.endpoint.substring(0, 50)}...`);
          failedEndpoints.push(sub.endpoint);
        }
      }
    }

    // Remover subscriptions expiradas
    if (failedEndpoints.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: {
          endpoint: { in: failedEndpoints },
        },
      });
      console.log(`[PushService] ${failedEndpoints.length} subscription(s) expirada(s) removida(s)`);
    }

    return { success: sentCount > 0, sentCount };
  } catch (error: any) {
    console.error('[PushService] Erro ao enviar push:', error);
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
): Promise<{ success: boolean; sentCount: number }> {
  const title = isSecondReminder
    ? '⏰ ÚLTIMA CHANCE - Seu cupom expira em breve!'
    : '💰 Não esqueça seu cupom de desconto!';

  const body = isSecondReminder
    ? `Cupom ${couponCode} (${discountText} OFF) - Esta é sua última chance!`
    : `Você validou o cupom ${couponCode} (${discountText} de desconto) mas ainda não finalizou a compra!`;

  const payload: PushPayload = {
    title,
    body,
    icon: '/favicon.ico',
    url: `/plans?coupon=${couponCode}`,
    couponCode,
    type: 'coupon_reminder',
    requireInteraction: isSecondReminder,
    tag: `coupon-${couponCode}`,
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
  console.log(`[PushService] Broadcasting push para ${userIds.length} usuário(s)`);

  let totalSent = 0;

  for (const userId of userIds) {
    const result = await sendPushToUser(userId, payload);
    totalSent += result.sentCount;
  }

  console.log(`[PushService] Broadcast concluído: ${totalSent} notificação(ões) enviada(s)`);
  return { success: totalSent > 0, totalSent };
}

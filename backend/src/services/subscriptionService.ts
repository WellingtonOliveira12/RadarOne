import { prisma } from '../server';
import { Subscription, Plan } from '@prisma/client';

/**
 * Serviço de Subscription - Fonte Canônica
 *
 * IMPORTANTE: Este serviço é a ÚNICA fonte de verdade para determinar
 * qual subscription válida um usuário possui.
 *
 * REGRAS DE PRIORIDADE (em ordem):
 * 1. Subscription VITALÍCIA (isLifetime=true) e ACTIVE → SEMPRE válida
 * 2. Subscription ACTIVE com validUntil >= now
 * 3. Subscription TRIAL com trialEndsAt >= now
 * 4. Caso contrário: SEM subscription válida
 */

export interface SubscriptionWithPlan extends Subscription {
  plan: Plan;
}

/**
 * Retorna a subscription VÁLIDA do usuário (ou null se não houver)
 *
 * Esta é a ÚNICA função que deve ser usada para determinar se um usuário
 * tem acesso premium. Use em:
 * - GET /subscriptions/my
 * - Middleware de autenticação (checkTrialExpired)
 * - Qualquer lugar que precise validar acesso premium
 */
export async function getCurrentSubscriptionForUser(
  userId: string
): Promise<SubscriptionWithPlan | null> {
  const now = new Date();

  // Buscar TODAS as subscriptions do usuário (ordenadas por prioridade)
  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId,
      status: {
        in: ['ACTIVE', 'TRIAL'], // Ignorar CANCELLED, EXPIRED, SUSPENDED, PAST_DUE
      },
    },
    include: { plan: true },
    orderBy: [
      { isLifetime: 'desc' }, // Vitalícias primeiro
      { status: 'asc' },      // ACTIVE antes de TRIAL (A < T alfabeticamente)
      { createdAt: 'desc' },  // Mais recente primeiro
    ],
  });

  if (subscriptions.length === 0) {
    return null;
  }

  // Aplicar regras de prioridade
  for (const subscription of subscriptions) {
    // REGRA 1: Vitalícia + ACTIVE → SEMPRE válida (ignora datas)
    if (subscription.isLifetime && subscription.status === 'ACTIVE') {
      return subscription;
    }

    // REGRA 2: ACTIVE com validUntil válido
    if (subscription.status === 'ACTIVE') {
      if (!subscription.validUntil || subscription.validUntil >= now) {
        return subscription;
      }
      // Se chegou aqui, validUntil expirou → pular para próxima
      continue;
    }

    // REGRA 3: TRIAL com trialEndsAt válido (ou vitalício)
    if (subscription.status === 'TRIAL') {
      // TRIAL vitalício (edge case, mas possível)
      if (subscription.isLifetime) {
        return subscription;
      }

      // TRIAL com data válida
      if (subscription.trialEndsAt && subscription.trialEndsAt >= now) {
        return subscription;
      }

      // TRIAL sem data (edge case) → considerar válido
      if (!subscription.trialEndsAt) {
        return subscription;
      }

      // Se chegou aqui, trial expirou → pular para próxima
      continue;
    }
  }

  // Nenhuma subscription válida encontrada
  return null;
}

/**
 * Verifica se o usuário tem subscription válida (boolean simples)
 * Útil para guards rápidos
 */
export async function hasValidSubscription(userId: string): Promise<boolean> {
  const subscription = await getCurrentSubscriptionForUser(userId);
  return subscription !== null;
}

/**
 * Cancela todas as subscriptions ACTIVE/TRIAL antigas do usuário
 * Útil antes de criar uma nova subscription (ex: ao aplicar cupom)
 */
export async function cancelOldSubscriptions(userId: string): Promise<number> {
  const result = await prisma.subscription.updateMany({
    where: {
      userId,
      status: { in: ['ACTIVE', 'TRIAL'] },
    },
    data: { status: 'CANCELLED' },
  });

  return result.count;
}

import { prisma } from '../server';

/**
 * Serviço de Planos - RadarOne
 *
 * Gerencia lógica de validação de limites de planos
 */

export type PlanLimits = {
  maxMonitors: number | null; // null = ilimitado
  multiSite: boolean;         // true = pode usar vários sites
};

/**
 * Retorna os limites de um plano com base no código/slug
 *
 * Regras:
 * - STARTER: 1 monitor, 1 site
 * - STANDARD: 5 monitores, 1 site
 * - PRO: 10 monitores, 1 site
 * - MASTER: monitores ilimitados, 1 site
 * - ULTRA: monitores ilimitados, múltiplos sites
 * - LIFETIME: monitores ilimitados, múltiplos sites
 */
export function getPlanLimits(planCode: string): PlanLimits {
  const code = planCode.toUpperCase();

  switch (code) {
    case 'STARTER':
      return { maxMonitors: 1, multiSite: false };

    case 'STANDARD':
      return { maxMonitors: 5, multiSite: false };

    case 'PRO':
      return { maxMonitors: 10, multiSite: false };

    case 'MASTER':
      return { maxMonitors: null, multiSite: false };

    case 'ULTRA':
    case 'LIFETIME':
      return { maxMonitors: null, multiSite: true };

    default:
      // Plano desconhecido = usa limites mais restritivos
      return { maxMonitors: 1, multiSite: false };
  }
}

/**
 * Busca o plano ativo do usuário e retorna seus limites
 *
 * TODO: Integrar com o sistema de billing/Kiwify quando estiver pronto
 * Por enquanto, busca a assinatura ativa mais recente
 */
export async function getUserPlanLimits(userId: string): Promise<PlanLimits> {
  try {
    // Busca assinatura ativa do usuário
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        plan: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!subscription || !subscription.plan) {
      // Usuário sem plano ativo = usa limites mais restritivos
      console.warn(`User ${userId} has no active subscription. Using default limits.`);
      return { maxMonitors: 1, multiSite: false };
    }

    // Retorna limites baseado no slug do plano
    return getPlanLimits(subscription.plan.slug);
  } catch (error) {
    console.error('Error fetching user plan limits:', error);
    // Em caso de erro, retorna limites mais restritivos por segurança
    return { maxMonitors: 1, multiSite: false };
  }
}

/**
 * Busca informações do plano ativo do usuário
 *
 * Retorna o plano completo ou null se não tiver assinatura ativa
 */
export async function getUserActivePlan(userId: string) {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        plan: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return subscription?.plan || null;
  } catch (error) {
    console.error('Error fetching user active plan:', error);
    return null;
  }
}

/**
 * Verifica se o usuário pode criar mais monitores
 *
 * @returns { canCreate: boolean, reason?: string, currentCount: number, limit: number | null }
 */
export async function canUserCreateMonitor(userId: string): Promise<{
  canCreate: boolean;
  reason?: string;
  currentCount: number;
  limit: number | null;
}> {
  const limits = await getUserPlanLimits(userId);

  // Conta monitores ativos do usuário
  const currentCount = await prisma.monitor.count({
    where: {
      userId,
      active: true,
    },
  });

  // Se limite é null = ilimitado
  if (limits.maxMonitors === null) {
    return {
      canCreate: true,
      currentCount,
      limit: null,
    };
  }

  // Verifica se já atingiu o limite
  if (currentCount >= limits.maxMonitors) {
    return {
      canCreate: false,
      reason: `Você atingiu o limite de monitores do seu plano. Seu plano permite ${limits.maxMonitors} monitor(es) ativo(s). Faça upgrade do seu plano para criar mais.`,
      currentCount,
      limit: limits.maxMonitors,
    };
  }

  return {
    canCreate: true,
    currentCount,
    limit: limits.maxMonitors,
  };
}

/**
 * Verifica se o usuário pode usar um determinado site
 *
 * Se multiSite = false, verifica se já tem monitores em outro site
 *
 * @returns { canUse: boolean, reason?: string, currentSite?: string }
 */
export async function canUserUseSite(
  userId: string,
  requestedSite: string
): Promise<{
  canUse: boolean;
  reason?: string;
  currentSite?: string;
}> {
  const limits = await getUserPlanLimits(userId);

  // Se multiSite = true, pode usar qualquer site
  if (limits.multiSite) {
    return { canUse: true };
  }

  // Busca monitores existentes do usuário
  const existingMonitors = await prisma.monitor.findMany({
    where: { userId },
    select: { site: true },
    distinct: ['site'],
  });

  // Se não tem monitores ainda, pode usar qualquer site
  if (existingMonitors.length === 0) {
    return { canUse: true };
  }

  // Pega o site do primeiro monitor
  const currentSite = existingMonitors[0].site;

  // Se está tentando usar o mesmo site, ok
  if (currentSite === requestedSite) {
    return { canUse: true };
  }

  // Tentando usar site diferente mas plano não permite
  return {
    canUse: false,
    reason: `Seu plano permite monitores apenas para um único site. Você já possui monitores para ${currentSite}. Faça upgrade para o plano Ultra ou Vitalício para usar múltiplos sites.`,
    currentSite,
  };
}

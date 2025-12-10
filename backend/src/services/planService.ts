import { prisma } from '../server';

export type PlanLimits = {
  maxMonitors: number;
  maxSites: number;
  maxAlertsPerDay: number;
  multiSite: boolean;
};

export async function getUserPlanLimits(userId: string): Promise<PlanLimits> {
  try {
    const isDevelopment = process.env.NODE_ENV !== 'production';

    if (isDevelopment) {
      return {
        maxMonitors: 50,
        maxSites: 10,
        maxAlertsPerDay: 999,
        multiSite: true
      };
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'TRIAL'] },
        OR: [
          { validUntil: null },
          { validUntil: { gte: new Date() } }
        ]
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' }
    });

    if (subscription?.plan) {
      return {
        maxMonitors: subscription.plan.maxMonitors,
        maxSites: subscription.plan.maxSites,
        maxAlertsPerDay: subscription.plan.maxAlertsPerDay,
        multiSite: subscription.plan.maxSites > 1
      };
    }

    const freePlan = await prisma.plan.findUnique({ where: { slug: 'free' } });

    if (freePlan) {
      return {
        maxMonitors: freePlan.maxMonitors,
        maxSites: freePlan.maxSites,
        maxAlertsPerDay: freePlan.maxAlertsPerDay,
        multiSite: freePlan.maxSites > 1
      };
    }

    return { maxMonitors: 1, maxSites: 1, maxAlertsPerDay: 3, multiSite: false };
  } catch (error) {
    console.error('[PLAN] Erro:', error);
    return { maxMonitors: 1, maxSites: 1, maxAlertsPerDay: 3, multiSite: false };
  }
}

export async function canUserCreateMonitor(userId: string): Promise<{
  canCreate: boolean;
  reason?: string;
  currentCount: number;
  limit: number;
}> {
  const limits = await getUserPlanLimits(userId);

  const currentCount = await prisma.monitor.count({
    where: { userId, active: true }
  });

  if (currentCount >= limits.maxMonitors) {
    return {
      canCreate: false,
      reason: `Limite de ${limits.maxMonitors} monitores atingido. Faça upgrade.`,
      currentCount,
      limit: limits.maxMonitors
    };
  }

  return { canCreate: true, currentCount, limit: limits.maxMonitors };
}

export async function canUserUseSite(userId: string, requestedSite: string): Promise<{
  canUse: boolean;
  reason?: string;
}> {
  const limits = await getUserPlanLimits(userId);

  if (limits.multiSite) {
    return { canUse: true };
  }

  const existingMonitors = await prisma.monitor.findMany({
    where: { userId },
    select: { site: true },
    distinct: ['site']
  });

  if (existingMonitors.length === 0) {
    return { canUse: true };
  }

  const currentSite = existingMonitors[0].site;

  if (currentSite === requestedSite) {
    return { canUse: true };
  }

  return {
    canUse: false,
    reason: `Seu plano permite apenas um site (${currentSite}). Faça upgrade.`
  };
}

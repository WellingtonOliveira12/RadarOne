import { prisma } from '../server';
import { logInfo, logWarning } from '../utils/loggerHelpers';

/**
 * Job: Verificar Cupons que Precisam de Alertas
 *
 * Executa verificações diárias em cupons ativos e cria alertas automáticos para:
 * 1. Cupons expirando em 3 dias ou menos
 * 2. Cupons próximos do limite de usos (>80% usado)
 *
 * Alertas são criados na tabela AdminAlert para visualização no painel /admin/alerts
 */

export async function checkCouponAlerts() {
  logInfo('[JOB] Iniciando verificação de alertas de cupons...', {});

  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // ============================================
    // 1. CUPONS EXPIRANDO EM 3 DIAS
    // ============================================
    const expiringCoupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        expiresAt: {
          gte: now,
          lte: threeDaysFromNow,
        },
      },
      include: {
        plan: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            usageLogs: true,
          },
        },
      },
    });

    logInfo(`[JOB] Encontrados ${expiringCoupons.length} cupons expirando em 3 dias`, {});

    for (const coupon of expiringCoupons) {
      // Verificar se já existe alerta recente (últimas 24h) para evitar duplicatas
      const existingAlert = await prisma.adminAlert.findFirst({
        where: {
          type: 'COUPON_EXPIRING_SOON',
          source: `coupon:${coupon.id}`,
          createdAt: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Últimas 24h
          },
        },
      });

      if (existingAlert) {
        logInfo(`[JOB] Alerta já existe para cupom ${coupon.code}, pulando...`, {});
        continue;
      }

      const daysUntilExpiration = Math.ceil(
        (new Date(coupon.expiresAt!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      await prisma.adminAlert.create({
        data: {
          type: 'COUPON_EXPIRING_SOON',
          severity: daysUntilExpiration <= 1 ? 'CRITICAL' : 'WARNING',
          title: `Cupom "${coupon.code}" expirando em breve`,
          message: `O cupom "${coupon.code}" irá expirar em ${daysUntilExpiration} dia(s). ${
            coupon.plan ? `Plano: ${coupon.plan.name}` : 'Aplicável a todos os planos'
          }. Total de usos: ${coupon._count.usageLogs}${
            coupon.maxUses ? ` / ${coupon.maxUses}` : ''
          }.`,
          source: `coupon:${coupon.id}`,
          metadata: {
            couponId: coupon.id,
            couponCode: coupon.code,
            expiresAt: coupon.expiresAt,
            daysUntilExpiration,
            usedCount: coupon._count.usageLogs,
            maxUses: coupon.maxUses,
            planName: coupon.plan?.name || null,
          },
        },
      });

      logInfo(`[JOB] ✅ Alerta criado para cupom expirando: ${coupon.code}`, {});
    }

    // ============================================
    // 2. CUPONS PRÓXIMOS DO LIMITE DE USOS (>80%)
    // ============================================
    const couponsWithLimit = await prisma.coupon.findMany({
      where: {
        isActive: true,
        maxUses: {
          not: null,
        },
      },
      include: {
        plan: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            usageLogs: true,
          },
        },
      },
    });

    logInfo(`[JOB] Verificando ${couponsWithLimit.length} cupons com limite de usos`, {});

    const nearLimitCoupons = couponsWithLimit.filter((coupon) => {
      if (!coupon.maxUses) return false;
      const usagePercentage = (coupon._count.usageLogs / coupon.maxUses) * 100;
      return usagePercentage >= 80;
    });

    logInfo(`[JOB] Encontrados ${nearLimitCoupons.length} cupons próximos do limite (>80%)`, {});

    for (const coupon of nearLimitCoupons) {
      // Verificar se já existe alerta recente (últimas 24h)
      const existingAlert = await prisma.adminAlert.findFirst({
        where: {
          type: 'COUPON_USAGE_LIMIT_NEAR',
          source: `coupon:${coupon.id}`,
          createdAt: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          },
        },
      });

      if (existingAlert) {
        logInfo(`[JOB] Alerta de limite já existe para cupom ${coupon.code}, pulando...`, {});
        continue;
      }

      const usagePercentage = Math.round((coupon._count.usageLogs / coupon.maxUses!) * 100);
      const remainingUses = coupon.maxUses! - coupon._count.usageLogs;

      await prisma.adminAlert.create({
        data: {
          type: 'COUPON_USAGE_LIMIT_NEAR',
          severity: usagePercentage >= 95 ? 'CRITICAL' : 'WARNING',
          title: `Cupom "${coupon.code}" próximo do limite de usos`,
          message: `O cupom "${coupon.code}" está com ${usagePercentage}% de usos (${coupon._count.usageLogs} / ${coupon.maxUses}). Restam apenas ${remainingUses} uso(s). ${
            coupon.plan ? `Plano: ${coupon.plan.name}` : 'Aplicável a todos os planos'
          }.`,
          source: `coupon:${coupon.id}`,
          metadata: {
            couponId: coupon.id,
            couponCode: coupon.code,
            usedCount: coupon._count.usageLogs,
            maxUses: coupon.maxUses,
            usagePercentage,
            remainingUses,
            planName: coupon.plan?.name || null,
          },
        },
      });

      logInfo(`[JOB] ✅ Alerta criado para cupom próximo do limite: ${coupon.code} (${usagePercentage}%)`, {});
    }

    // ============================================
    // RESUMO DO JOB
    // ============================================
    const totalAlerts = expiringCoupons.length + nearLimitCoupons.length;

    logInfo(`[JOB] ✅ Verificação de cupons concluída`, {});
    logInfo(`[JOB]    📅 Cupons expirando: ${expiringCoupons.length}`, {});
    logInfo(`[JOB]    📊 Cupons próximos do limite: ${nearLimitCoupons.length}`, {});
    logInfo(`[JOB]    🔔 Total de alertas verificados: ${totalAlerts}`, {});

    return {
      success: true,
      expiringCount: expiringCoupons.length,
      nearLimitCount: nearLimitCoupons.length,
      totalAlerts,
    };
  } catch (error) {
    logWarning('[JOB] ❌ Erro ao verificar cupons para alertas:', error);
    throw error;
  }
}

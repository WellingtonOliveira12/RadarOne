import { prisma } from '../lib/prisma';
import { logInfo, logWarning } from '../utils/loggerHelpers';
import { JobRunResult } from './checkTrialExpiring';

/**
 * Job: Verificar Cupons que Precisam de Alertas
 *
 * Executa verificações diárias em cupons ativos e cria alertas automáticos para:
 * 1. Cupons expirando em 3 dias ou menos
 * 2. Cupons próximos do limite de usos (>80% usado)
 *
 * Alertas são criados na tabela AdminAlert para visualização no painel /admin/alerts
 *
 * RETORNO: Agora retorna JobRunResult padronizado para compatibilidade com scheduler
 */

export async function checkCouponAlerts(): Promise<JobRunResult> {
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
    // 3. CUPONS POPULARES/VIRAIS (>10 usos em 24h)
    // ============================================
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Buscar usos de cupons nas últimas 24h agrupados por cupom
    const recentUsages = await prisma.couponUsage.findMany({
      where: {
        usedAt: {
          gte: twentyFourHoursAgo,
        },
      },
      include: {
        coupon: {
          select: {
            id: true,
            code: true,
            isActive: true,
            maxUses: true,
            usedCount: true,
            plan: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    // Agrupar por cupom
    const usagesByCoupon: Record<string, { coupon: any; count: number }> = {};
    for (const usage of recentUsages) {
      const couponId = usage.couponId;
      if (!usagesByCoupon[couponId]) {
        usagesByCoupon[couponId] = {
          coupon: usage.coupon,
          count: 0,
        };
      }
      usagesByCoupon[couponId].count += 1;
    }

    // Filtrar cupons com >10 usos em 24h (limite configurável)
    const POPULAR_THRESHOLD = 10;
    const popularCoupons = Object.values(usagesByCoupon).filter(
      (item) => item.count >= POPULAR_THRESHOLD && item.coupon.isActive
    );

    logInfo(`[JOB] Encontrados ${popularCoupons.length} cupons populares (>${POPULAR_THRESHOLD} usos em 24h)`, {});

    for (const { coupon, count } of popularCoupons) {
      // Verificar se já existe alerta recente (últimas 24h)
      const existingAlert = await prisma.adminAlert.findFirst({
        where: {
          type: 'COUPON_HIGH_USAGE',
          source: `coupon:${coupon.id}`,
          createdAt: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          },
        },
      });

      if (existingAlert) {
        logInfo(`[JOB] Alerta de cupom popular já existe para ${coupon.code}, pulando...`, {});
        continue;
      }

      // Calcular taxa de uso (usos em 24h / maxUses total)
      const usageRate = coupon.maxUses
        ? ((count / coupon.maxUses) * 100).toFixed(2)
        : 'ilimitado';

      await prisma.adminAlert.create({
        data: {
          type: 'COUPON_HIGH_USAGE',
          severity: count >= 50 ? 'CRITICAL' : count >= 20 ? 'WARNING' : 'INFO',
          title: `Cupom "${coupon.code}" com alto volume de usos`,
          message: `O cupom "${coupon.code}" teve ${count} usos nas últimas 24 horas, indicando alta popularidade. ${
            coupon.plan ? `Plano: ${coupon.plan.name}` : 'Aplicável a todos os planos'
          }. ${
            coupon.maxUses
              ? `Total usado: ${coupon.usedCount} / ${coupon.maxUses} (${usageRate}%)`
              : 'Sem limite de usos'
          }. Considere: aumentar maxUses, monitorar fraude, ou analisar ROI.`,
          source: `coupon:${coupon.id}`,
          metadata: {
            couponId: coupon.id,
            couponCode: coupon.code,
            usesLast24h: count,
            totalUsedCount: coupon.usedCount,
            maxUses: coupon.maxUses,
            planName: coupon.plan?.name || null,
          },
        },
      });

      logInfo(`[JOB] ✅ Alerta criado para cupom popular: ${coupon.code} (${count} usos em 24h)`, {});
    }

    // ============================================
    // RESUMO DO JOB
    // ============================================
    const totalAlerts = expiringCoupons.length + nearLimitCoupons.length + popularCoupons.length;
    const alertsCreated = expiringCoupons.length + nearLimitCoupons.length + popularCoupons.length;

    logInfo(`[JOB] ✅ Verificação de cupons concluída`, {});
    logInfo(`[JOB]    📅 Cupons expirando: ${expiringCoupons.length}`, {});
    logInfo(`[JOB]    📊 Cupons próximos do limite: ${nearLimitCoupons.length}`, {});
    logInfo(`[JOB]    🔥 Cupons populares: ${popularCoupons.length}`, {});
    logInfo(`[JOB]    🔔 Total de alertas verificados: ${totalAlerts}`, {});

    // Retorna formato padronizado JobRunResult
    return {
      processedCount: totalAlerts,
      successCount: alertsCreated,
      errorCount: 0,
      summary: `Cupons verificados: ${expiringCoupons.length} expirando, ${nearLimitCoupons.length} próximos do limite, ${popularCoupons.length} populares`,
      metadata: {
        expiringCount: expiringCoupons.length,
        nearLimitCount: nearLimitCoupons.length,
        popularCount: popularCoupons.length,
        totalAlerts,
      },
    };
  } catch (error) {
    logWarning('[JOB] ❌ Erro ao verificar cupons para alertas', { err: String(error) });

    // Retorna formato padronizado mesmo em caso de erro
    return {
      processedCount: 0,
      successCount: 0,
      errorCount: 1,
      summary: `Erro ao verificar cupons: ${error instanceof Error ? error.message : String(error)}`,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

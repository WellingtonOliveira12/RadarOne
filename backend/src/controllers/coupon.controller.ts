import { Request, Response } from 'express';
import { prisma } from '../server';
import { AppError } from '../errors/AppError';

/**
 * Controller de Cupons
 * MVP: Validação de cupons (sem aplicação real pois checkout é externo)
 * FASE UPGRADE: Resgate de cupons de trial upgrade
 */

export class CouponController {
  /**
   * POST /api/coupons/validate
   * Valida se um cupom é válido
   */
  static async validateCoupon(req: Request, res: Response): Promise<void> {
    try {
      const { code, planSlug } = req.body;

      if (!code) {
        res.status(400).json({ error: 'Código do cupom é obrigatório' });
        return;
      }

      // Buscar cupom
      const coupon = await prisma.coupon.findUnique({
        where: { code: code.toUpperCase() },
        include: {
          plan: true
        }
      });

      // Cupom não encontrado
      if (!coupon) {
        res.status(404).json({
          valid: false,
          error: 'Cupom inválido ou não encontrado'
        });
        return;
      }

      // Cupom inativo
      if (!coupon.isActive) {
        res.status(400).json({
          valid: false,
          error: 'Este cupom não está mais ativo'
        });
        return;
      }

      // Cupom expirado
      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        res.status(400).json({
          valid: false,
          error: 'Este cupom expirou'
        });
        return;
      }

      // Cupom atingiu limite de usos
      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        res.status(400).json({
          valid: false,
          error: 'Este cupom já atingiu o limite de usos'
        });
        return;
      }

      // Verificar se cupom é específico para um plano
      if (coupon.appliesToPlanId && planSlug) {
        const plan = await prisma.plan.findUnique({
          where: { slug: planSlug }
        });

        if (plan && plan.id !== coupon.appliesToPlanId) {
          res.status(400).json({
            valid: false,
            error: `Este cupom é válido apenas para o plano ${coupon.plan?.name || 'específico'}`
          });
          return;
        }
      }

      // Rastrear validação (para analytics e notificações de abandono)
      // Buscar userId do request (pode ser undefined se não autenticado)
      const userId = (req as any).userId;
      const userEmail = (req as any).userEmail; // Se disponível no middleware

      await prisma.couponValidation.create({
        data: {
          couponId: coupon.id,
          userId: userId || null,
          userEmail: userEmail || null,
          purpose: coupon.purpose || 'DISCOUNT',
          location: 'plans_page', // ou extrair do body se necessário
          converted: false, // Inicialmente não convertido
        },
      });

      // Cupom válido! Retornar informações
      res.json({
        valid: true,
        coupon: {
          code: coupon.code,
          description: coupon.description,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          purpose: coupon.purpose || 'DISCOUNT', // Retornar purpose (null tratado como DISCOUNT)
          appliesToPlan: coupon.plan?.name || 'Qualquer plano'
        },
        message: 'Cupom válido! O desconto será aplicado no checkout.'
      });

    } catch (error) {
      console.error('Erro ao validar cupom:', error);
      res.status(500).json({ error: 'Erro ao validar cupom' });
    }
  }

  /**
   * POST /api/coupons/apply
   * Registra uso de cupom (para fins de tracking)
   * NOTA: Não aplica desconto real pois checkout é externo (Kiwify)
   */
  static async applyCoupon(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.body;
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ error: 'Usuário não autenticado' });
        return;
      }

      if (!code) {
        res.status(400).json({ error: 'Código do cupom é obrigatório' });
        return;
      }

      // Buscar cupom
      const coupon = await prisma.coupon.findUnique({
        where: { code: code.toUpperCase() }
      });

      if (!coupon || !coupon.isActive) {
        res.status(404).json({ error: 'Cupom inválido' });
        return;
      }

      // Registrar uso
      await prisma.couponUsage.create({
        data: {
          couponId: coupon.id,
          userId: userId
        }
      });

      // Incrementar contador
      await prisma.coupon.update({
        where: { id: coupon.id },
        data: {
          usedCount: {
            increment: 1
          }
        }
      });

      res.json({
        success: true,
        message: 'Cupom aplicado com sucesso! O desconto será refletido no checkout.'
      });

    } catch (error) {
      console.error('Erro ao aplicar cupom:', error);
      res.status(500).json({ error: 'Erro ao aplicar cupom' });
    }
  }

  /**
   * GET /api/coupons/analytics
   * Retorna analytics de cupons em tempo real (admin only)
   */
  static async getCouponAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const now = new Date();
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // 1. Total de cupons ativos
      const totalActiveCoupons = await prisma.coupon.count({
        where: { isActive: true }
      });

      // 2. Cupons por tipo (DISCOUNT vs TRIAL_UPGRADE)
      const couponsByPurpose = await prisma.coupon.groupBy({
        by: ['purpose'],
        where: { isActive: true },
        _count: true
      });

      // 3. Validações últimos 7 dias
      const validationsLast7Days = await prisma.couponValidation.count({
        where: {
          createdAt: { gte: last7Days }
        }
      });

      // 4. Taxa de conversão (validações → convertidas)
      const totalValidations = await prisma.couponValidation.count();
      const convertedValidations = await prisma.couponValidation.count({
        where: { converted: true }
      });
      const conversionRate = totalValidations > 0
        ? ((convertedValidations / totalValidations) * 100).toFixed(2)
        : '0.00';

      // 5. Cupons abandonados (últimas 24h)
      const abandonedCoupons = await prisma.couponValidation.count({
        where: {
          converted: false,
          createdAt: { gte: last24Hours }
        }
      });

      // 6. Top 5 cupons mais validados
      const topCoupons = await prisma.couponValidation.groupBy({
        by: ['couponId'],
        _count: true,
        orderBy: {
          _count: {
            couponId: 'desc'
          }
        },
        take: 5
      });

      // Buscar dados dos cupons top
      const topCouponsWithData = await Promise.all(
        topCoupons.map(async (item) => {
          const coupon = await prisma.coupon.findUnique({
            where: { id: item.couponId }
          });
          return {
            code: coupon?.code || 'Deletado',
            validations: item._count,
            purpose: coupon?.purpose || 'UNKNOWN'
          };
        })
      );

      // 7. Validações por dia (últimos 7 dias)
      const validationsByDay = await prisma.$queryRaw`
        SELECT
          DATE(created_at) as date,
          COUNT(*)::int as count,
          SUM(CASE WHEN converted = true THEN 1 ELSE 0 END)::int as converted
        FROM coupon_validations
        WHERE created_at >= ${last7Days}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `;

      res.json({
        summary: {
          totalActiveCoupons,
          validationsLast7Days,
          conversionRate: parseFloat(conversionRate),
          abandonedCoupons,
          couponsByPurpose: couponsByPurpose.map(g => ({
            purpose: g.purpose || 'DISCOUNT',
            count: g._count
          }))
        },
        topCoupons: topCouponsWithData,
        validationsByDay
      });

    } catch (error) {
      console.error('Erro ao buscar analytics de cupons:', error);
      res.status(500).json({ error: 'Erro ao buscar analytics' });
    }
  }

  /**
   * POST /api/coupons/redeem-trial-upgrade
   * Resgata cupom de TRIAL_UPGRADE (libera plano premium por X dias)
   *
   * Regras:
   * - Usuário deve estar autenticado
   * - Cupom deve ser ativo, não expirado, dentro de maxUses
   * - Cupom deve ter purpose=TRIAL_UPGRADE
   * - Não permite downgrade (se já é premium ativo)
   * - Não permite stacking: se já tem trial/upgrade ativo, aceita apenas se novo prazo for maior
   */
  static async redeemTrialUpgrade(req: Request, res: Response): Promise<void> {
    try {
      const { code, planId } = req.body;
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ error: 'Usuário não autenticado' });
        return;
      }

      if (!code) {
        res.status(400).json({ error: 'Código do cupom é obrigatório' });
        return;
      }

      // 1. Buscar e validar cupom
      const coupon = await prisma.coupon.findUnique({
        where: { code: code.trim().toUpperCase() },
        include: { plan: true }
      });

      if (!coupon) {
        res.status(404).json({
          valid: false,
          error: 'Cupom inválido ou não encontrado'
        });
        return;
      }

      // Validar se é cupom de trial upgrade
      if (coupon.purpose !== 'TRIAL_UPGRADE') {
        res.status(400).json({
          valid: false,
          error: 'Este cupom não é um cupom de upgrade de teste. Use-o no checkout para obter desconto.'
        });
        return;
      }

      // Cupom inativo
      if (!coupon.isActive) {
        res.status(400).json({
          valid: false,
          error: 'Este cupom não está mais ativo'
        });
        return;
      }

      // Cupom expirado
      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        res.status(400).json({
          valid: false,
          error: 'Este cupom expirou'
        });
        return;
      }

      // Cupom atingiu limite de usos
      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        res.status(400).json({
          valid: false,
          error: 'Este cupom já atingiu o limite de usos'
        });
        return;
      }

      // Validar durationDays
      if (!coupon.durationDays || coupon.durationDays < 1 || coupon.durationDays > 60) {
        res.status(500).json({
          error: 'Cupom mal configurado: duração inválida'
        });
        return;
      }

      // 2. Determinar plano alvo
      let targetPlan = null;
      if (coupon.appliesToPlanId) {
        // Cupom amarra plano específico
        targetPlan = coupon.plan;
      } else if (planId) {
        // Plano fornecido pelo usuário
        targetPlan = await prisma.plan.findUnique({
          where: { id: planId }
        });
      } else {
        res.status(400).json({
          error: 'Plano alvo não especificado e cupom não amarra plano específico'
        });
        return;
      }

      if (!targetPlan) {
        res.status(404).json({ error: 'Plano não encontrado' });
        return;
      }

      // 3. Verificar subscription atual do usuário
      const currentSubscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: { in: ['ACTIVE', 'TRIAL'] }
        },
        include: { plan: true },
        orderBy: { createdAt: 'desc' }
      });

      // Regra: não permitir downgrade (se já tem plano ativo igual ou superior)
      // Simplificação: checar apenas se já é o mesmo plano e está ACTIVE
      if (currentSubscription && currentSubscription.status === 'ACTIVE' && currentSubscription.planId === targetPlan.id) {
        res.status(400).json({
          error: `Você já possui assinatura ativa do plano ${targetPlan.name}. Este cupom não pode ser usado.`
        });
        return;
      }

      // Regra de stacking: se já tem trial/upgrade ativo, verificar data
      const now = new Date();
      const newEndDate = new Date(now.getTime() + coupon.durationDays * 24 * 60 * 60 * 1000);

      if (currentSubscription && currentSubscription.status === 'TRIAL') {
        // Já tem trial ativo
        const currentEndDate = currentSubscription.trialEndsAt || currentSubscription.validUntil;

        if (currentEndDate && newEndDate <= currentEndDate) {
          res.status(400).json({
            error: 'Você já possui um trial/upgrade ativo com prazo igual ou maior. Não é possível acumular cupons.'
          });
          return;
        }

        // Se chegou aqui, o novo prazo é maior - permitir e cancelar o atual
        await prisma.subscription.update({
          where: { id: currentSubscription.id },
          data: { status: 'CANCELLED' }
        });
      }

      // 4. Criar nova subscription de trial upgrade
      const newSubscription = await prisma.subscription.create({
        data: {
          userId,
          planId: targetPlan.id,
          status: 'TRIAL',
          isTrial: true,
          trialEndsAt: newEndDate,
          validUntil: newEndDate,
          queriesLimit: targetPlan.maxMonitors * 100, // Limite generoso
          externalProvider: 'COUPON_TRIAL_UPGRADE'
        },
        include: {
          plan: true
        }
      });

      // 5. Registrar uso do cupom
      await prisma.couponUsage.create({
        data: {
          couponId: coupon.id,
          userId
        }
      });

      // Incrementar contador
      await prisma.coupon.update({
        where: { id: coupon.id },
        data: {
          usedCount: { increment: 1 }
        }
      });

      // 6. Retornar sucesso
      res.status(200).json({
        success: true,
        message: `Cupom aplicado! Você ganhou acesso ao plano ${targetPlan.name} até ${newEndDate.toLocaleDateString('pt-BR')}.`,
        subscription: {
          id: newSubscription.id,
          planName: targetPlan.name,
          planSlug: targetPlan.slug,
          endsAt: newEndDate,
          daysGranted: coupon.durationDays
        }
      });

    } catch (error) {
      console.error('Erro ao resgatar cupom de trial upgrade:', error);
      res.status(500).json({ error: 'Erro ao resgatar cupom' });
    }
  }
}

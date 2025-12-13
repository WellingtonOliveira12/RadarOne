import { Request, Response } from 'express';
import { prisma } from '../server';

/**
 * Controller de Cupons
 * MVP: Validação de cupons (sem aplicação real pois checkout é externo)
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

      // Cupom válido! Retornar informações
      res.json({
        valid: true,
        coupon: {
          code: coupon.code,
          description: coupon.description,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
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
}

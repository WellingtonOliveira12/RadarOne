import { Request, Response } from 'express';
import { prisma } from '../server';
import { startTrialForUser } from '../services/billingService';
import { generateCheckoutUrl } from '../services/kiwifyService';

/**
 * Controller de Assinaturas
 */
export class SubscriptionController {
  /**
   * Retorna a assinatura ativa do usuário autenticado
   * GET /api/subscriptions/my
   */
  static async getMySubscription(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      // Buscar subscription ativa
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: { in: ['ACTIVE', 'TRIAL'] }
        },
        include: {
          plan: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              priceCents: true,
              billingPeriod: true,
              maxMonitors: true,
              maxSites: true,
              maxAlertsPerDay: true,
              checkInterval: true,
              isRecommended: true,
              isLifetime: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (!subscription) {
        res.status(404).json({ error: 'Nenhuma assinatura ativa encontrada' });
        return;
      }

      // Calcular dias restantes
      const now = new Date();
      let daysRemaining = 0;
      let expiresAt: Date | null = null;

      if (subscription.status === 'TRIAL' && subscription.trialEndsAt) {
        expiresAt = subscription.trialEndsAt;
        const diffTime = expiresAt.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      } else if (subscription.validUntil) {
        expiresAt = subscription.validUntil;
        const diffTime = expiresAt.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      // Contar monitores criados
      const monitorCount = await prisma.monitor.count({
        where: {
          userId,
          active: true
        }
      });

      // Montar resposta
      const response = {
        subscription: {
          id: subscription.id,
          status: subscription.status,
          startDate: subscription.startDate,
          validUntil: subscription.validUntil,
          trialEndsAt: subscription.trialEndsAt,
          isLifetime: subscription.isLifetime,
          isTrial: subscription.isTrial,
          createdAt: subscription.createdAt,
          plan: subscription.plan
        },
        usage: {
          monitorsCreated: monitorCount,
          monitorsLimit: subscription.plan.maxMonitors,
          canCreateMore: monitorCount < subscription.plan.maxMonitors
        },
        timeRemaining: {
          daysRemaining: Math.max(0, daysRemaining),
          expiresAt,
          isExpired: daysRemaining <= 0
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Erro ao buscar assinatura:', error);
      res.status(500).json({ error: 'Erro ao buscar assinatura' });
    }
  }

  /**
   * Inicia um trial para o usuário
   * POST /api/subscriptions/start-trial
   */
  static async startTrial(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { planSlug } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!planSlug) {
        res.status(400).json({ error: 'planSlug é obrigatório' });
        return;
      }

      // Verificar se já tem trial ativo
      const existingTrial = await prisma.subscription.findFirst({
        where: {
          userId,
          status: { in: ['ACTIVE', 'TRIAL'] }
        }
      });

      if (existingTrial) {
        res.status(409).json({
          error: 'Você já possui uma assinatura ativa',
          subscription: existingTrial
        });
        return;
      }

      // Criar trial
      const subscription = await startTrialForUser(userId, planSlug);

      res.status(201).json({
        message: 'Trial iniciado com sucesso',
        subscription
      });
    } catch (error) {
      console.error('Erro ao iniciar trial:', error);
      res.status(500).json({ error: 'Erro ao iniciar trial' });
    }
  }

  /**
   * Troca o plano do usuário (upgrade/downgrade)
   * POST /api/subscriptions/change-plan
   */
  static async changePlan(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { planSlug } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!planSlug) {
        res.status(400).json({ error: 'planSlug é obrigatório' });
        return;
      }

      // Buscar plano novo
      const newPlan = await prisma.plan.findUnique({
        where: { slug: planSlug }
      });

      if (!newPlan) {
        res.status(404).json({ error: 'Plano não encontrado' });
        return;
      }

      // Buscar subscription atual
      const currentSubscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: { in: ['ACTIVE', 'TRIAL'] }
        },
        include: {
          plan: true
        }
      });

      if (currentSubscription) {
        // Cancelar subscription atual
        await prisma.subscription.update({
          where: { id: currentSubscription.id },
          data: {
            status: 'CANCELLED'
          }
        });
      }

      // Criar nova subscription (pode ser trial ou ativa)
      const newSubscription = await startTrialForUser(userId, planSlug);

      res.json({
        message: 'Plano alterado com sucesso',
        oldPlan: currentSubscription?.plan.name,
        newPlan: newPlan.name,
        subscription: newSubscription
      });
    } catch (error) {
      console.error('Erro ao trocar plano:', error);
      res.status(500).json({ error: 'Erro ao trocar plano' });
    }
  }

  /**
   * Cancela a assinatura do usuário
   * POST /api/subscriptions/cancel
   */
  static async cancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      // Buscar subscription ativa
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: { in: ['ACTIVE', 'TRIAL'] }
        }
      });

      if (!subscription) {
        res.status(404).json({ error: 'Nenhuma assinatura ativa encontrada' });
        return;
      }

      // Cancelar
      const canceledSubscription = await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'CANCELLED'
        },
        include: {
          plan: true
        }
      });

      res.json({
        message: 'Assinatura cancelada com sucesso',
        subscription: canceledSubscription
      });
    } catch (error) {
      console.error('Erro ao cancelar assinatura:', error);
      res.status(500).json({ error: 'Erro ao cancelar assinatura' });
    }
  }

  /**
   * Cria uma sessão de checkout (Kiwify)
   * POST /api/subscriptions/create-checkout
   */
  static async createCheckout(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { planSlug } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!planSlug) {
        res.status(400).json({ error: 'planSlug é obrigatório' });
        return;
      }

      // Gerar URL de checkout
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const checkoutData = await generateCheckoutUrl({
        userId,
        planSlug,
        successUrl: `${frontendUrl}/checkout/success`,
        cancelUrl: `${frontendUrl}/plans`,
      });

      res.json({
        message: 'Checkout criado com sucesso',
        checkoutUrl: checkoutData.checkoutUrl,
        planName: checkoutData.planName,
        price: checkoutData.price,
      });
    } catch (error: any) {
      console.error('Erro ao criar checkout:', error);
      res.status(500).json({ error: error.message || 'Erro ao criar checkout' });
    }
  }
}

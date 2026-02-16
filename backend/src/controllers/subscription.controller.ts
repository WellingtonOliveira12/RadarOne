import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { startTrialForUser } from '../services/billingService';
import { generateCheckoutUrl } from '../services/kiwifyService';
import { getCurrentSubscriptionForUser } from '../services/subscriptionService';
import { logInfo, logError } from '../utils/loggerHelpers';
import { ErrorCodes } from '../constants/errorCodes';

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

      logInfo('Buscando subscription do usuário', { userId });

      // FONTE CANÔNICA: Usar subscriptionService para determinar subscription válida
      const subscription = await getCurrentSubscriptionForUser(userId);

      // Se não houver subscription, verificar trial implícito baseado em user.createdAt
      if (!subscription) {
        logInfo('Usuário sem subscription, verificando trial de 7 dias', { userId });

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { createdAt: true }
        });

        if (!user) {
          res.status(404).json({ error: 'Usuário não encontrado' });
          return;
        }

        // Calcular se está dentro do trial de 7 dias
        const now = new Date();
        const trialEndDate = new Date(user.createdAt);
        trialEndDate.setDate(trialEndDate.getDate() + 7);

        const diffTime = trialEndDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const isExpired = daysRemaining <= 0;

        // Buscar plano Free (deve ser o padrão para trial)
        const freePlan = await prisma.plan.findFirst({
          where: { slug: 'free' }
        });

        if (!freePlan) {
          logError('Plano Free não encontrado no banco', {});
          res.status(500).json({ error: 'Plano Free não configurado' });
          return;
        }

        res.status(200).json({
          subscription: {
            id: 'trial-implicit',
            status: isExpired ? 'EXPIRED' : 'TRIAL',
            startDate: user.createdAt,
            validUntil: trialEndDate,
            trialEndsAt: trialEndDate,
            isLifetime: false,
            isTrial: !isExpired,
            createdAt: user.createdAt,
            plan: freePlan
          },
          usage: {
            monitorsCreated: 0,
            monitorsLimit: freePlan.maxMonitors,
            canCreateMore: !isExpired && 0 < freePlan.maxMonitors
          },
          timeRemaining: {
            daysRemaining: Math.max(0, daysRemaining),
            expiresAt: trialEndDate,
            isExpired
          }
        });
        return;
      }

      // Se chegou aqui, subscription é válida (a função canônica já validou)
      const now = new Date();

      // Calcular dias restantes
      let daysRemaining = 0;
      let expiresAt: Date | null = null;
      let isExpired = false;

      // Vitalício → sem expiração
      if (subscription.isLifetime) {
        daysRemaining = -1; // Convenção: -1 = ilimitado
        expiresAt = null;
        isExpired = false;
      }
      // TRIAL com data de expiração
      else if (subscription.status === 'TRIAL' && subscription.trialEndsAt) {
        expiresAt = subscription.trialEndsAt;
        const diffTime = expiresAt.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        isExpired = daysRemaining <= 0;
      }
      // ACTIVE com validUntil
      else if (subscription.validUntil) {
        expiresAt = subscription.validUntil;
        const diffTime = expiresAt.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        isExpired = daysRemaining <= 0;
      }

      // Contar monitores criados
      const monitorCount = await prisma.monitor.count({
        where: {
          userId,
          active: true
        }
      });

      // Contar sites distintos
      const distinctSites = await prisma.monitor.findMany({
        where: { userId, active: true },
        select: { site: true },
        distinct: ['site']
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
          canCreateMore: monitorCount < subscription.plan.maxMonitors,
          uniqueSitesCount: distinctSites.length
        },
        timeRemaining: {
          daysRemaining: subscription.isLifetime ? -1 : Math.max(0, daysRemaining),
          expiresAt,
          isExpired
        }
      };

      res.json(response);
    } catch (error) {
      logError('Erro ao buscar assinatura', { err: error });
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

      // Usar função canônica para verificar assinatura válida (respeita datas)
      const existingSubscription = await getCurrentSubscriptionForUser(userId);

      if (existingSubscription) {
        // Idempotência: se já tem trial ativo no mesmo plano, retornar 200 com a assinatura existente
        if (existingSubscription.status === 'TRIAL' && existingSubscription.plan.slug === planSlug) {
          logInfo('[TRIAL] Trial já ativo, retornando existente (idempotente)', { userId, planSlug });
          res.status(200).json({
            message: 'Seu trial já está ativo',
            errorCode: ErrorCodes.TRIAL_ALREADY_ACTIVE,
            subscription: existingSubscription
          });
          return;
        }

        // Assinatura ativa de outro tipo (paga ou trial de outro plano)
        logInfo('[TRIAL] Bloqueado: usuário já possui assinatura ativa', {
          userId,
          existingStatus: existingSubscription.status,
          existingPlan: existingSubscription.plan.slug
        });
        res.status(409).json({
          error: 'Você já possui uma assinatura ativa.',
          errorCode: ErrorCodes.SUBSCRIPTION_ALREADY_ACTIVE,
          subscription: existingSubscription
        });
        return;
      }

      // Sem assinatura válida — criar trial
      const subscription = await startTrialForUser(userId, planSlug);

      logInfo('[TRIAL] Trial iniciado com sucesso', { userId, planSlug });

      res.status(201).json({
        message: 'Trial iniciado com sucesso',
        subscription
      });
    } catch (error) {
      logError('Erro ao iniciar trial', { err: error });
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
      logError('Erro ao trocar plano', { err: error });
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
      logError('Erro ao cancelar assinatura', { err: error });
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
      const { planSlug, couponCode } = req.body; // FASE: Cupons de Desconto

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!planSlug) {
        res.status(400).json({ error: 'planSlug é obrigatório' });
        return;
      }

      // FASE: Cupons de Desconto - Validar cupom se fornecido
      // NOTA: Validação apenas, aplicação real depende da API Kiwify
      if (couponCode) {
        const { prisma } = await import('../server');

        const coupon = await prisma.coupon.findUnique({
          where: { code: couponCode.trim().toUpperCase() },
        });

        if (!coupon || !coupon.isActive) {
          res.status(400).json({ error: 'Cupom inválido ou inativo' });
          return;
        }

        if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
          res.status(400).json({ error: 'Cupom expirado' });
          return;
        }

        if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
          res.status(400).json({ error: 'Cupom atingiu o limite de usos' });
          return;
        }

        // Verificar se cupom é de DISCOUNT (não TRIAL_UPGRADE)
        if (coupon.purpose === 'TRIAL_UPGRADE') {
          res.status(400).json({
            error: 'Este cupom é de trial upgrade. Use-o na página /plans, não no checkout.',
          });
          return;
        }

        logInfo('Cupom validado', { couponCode, discountType: coupon.discountType, discountValue: coupon.discountValue });
      }

      // Gerar URL de checkout
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const checkoutData = await generateCheckoutUrl({
        userId,
        planSlug,
        couponCode: couponCode?.trim().toUpperCase(), // FASE: Cupons de Desconto
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
      logError('Erro ao criar checkout', { err: error });
      res.status(500).json({ error: error.message || 'Erro ao criar checkout' });
    }
  }
}

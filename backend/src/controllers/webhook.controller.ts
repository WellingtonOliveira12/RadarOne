import { Request, Response } from 'express';
import { prisma } from '../server';
import crypto from 'crypto';
import {
  KiwifyWebhookPayload,
  KIWIFY_STATUS_MAP,
  KIWIFY_SUBSCRIPTION_STATUS_MAP,
} from '../types/kiwify';
import { sendSubscriptionExpiredEmail, sendTrialExpiredEmail } from '../services/emailService';
import logger from '../logger';

/**
 * Webhook Controller - Processa eventos da Kiwify
 *
 * Eventos suportados:
 * - compra_aprovada: Ativa assinatura
 * - subscription_renewed: Renova assinatura
 * - subscription_canceled: Cancela assinatura
 * - subscription_late: Marca como atrasada
 * - compra_reembolsada: Reembolso
 * - chargeback: Chargeback
 */
export class WebhookController {
  /**
   * Valida a assinatura HMAC do webhook
   * Documentação: https://docs.kiwify.com.br/api-reference/webhooks/create
   */
  private static validateSignature(payload: string, signature: string): boolean {
    const secret = process.env.KIWIFY_WEBHOOK_SECRET;

    if (!secret) {
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        logger.error('KIWIFY_WEBHOOK_SECRET not configured in production - REJECTING webhook');
        return false; // Em produção, REJEITAR sem secret
      }
      logger.warn('KIWIFY_WEBHOOK_SECRET not configured - skipping validation (dev only)');
      return true; // Em dev, aceitar sem validação
    }

    try {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const calculatedSignature = hmac.digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(calculatedSignature)
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to validate webhook signature');
      return false;
    }
  }

  /**
   * Processa webhook da Kiwify
   * POST /api/webhooks/kiwify
   */
  static async handleKiwifyWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-kiwify-signature'] as string;
      const payload: KiwifyWebhookPayload = req.body;

      console.log('[WEBHOOK] Recebido evento:', payload.event);

      // 1. Validar signature (HMAC)
      if (signature) {
        const rawBody = JSON.stringify(req.body);
        const isValid = WebhookController.validateSignature(rawBody, signature);

        if (!isValid) {
          console.error('[WEBHOOK] Signature inválida');
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      }

      // 2. Salvar log do webhook
      await prisma.webhookLog.create({
        data: {
          event: payload.event,
          payload: payload as any,
          processed: false,
        },
      });

      // 3. Processar evento baseado no tipo
      switch (payload.event) {
        case 'compra_aprovada':
          await WebhookController.handlePurchaseApproved(payload);
          break;

        case 'subscription_renewed':
          await WebhookController.handleSubscriptionRenewed(payload);
          break;

        case 'subscription_canceled':
          await WebhookController.handleSubscriptionCanceled(payload);
          break;

        case 'subscription_late':
          await WebhookController.handleSubscriptionLate(payload);
          break;

        case 'compra_reembolsada':
          await WebhookController.handlePurchaseRefunded(payload);
          break;

        case 'chargeback':
          await WebhookController.handleChargeback(payload);
          break;

        default:
          console.log('[WEBHOOK] Evento não tratado:', payload.event);
      }

      // 4. Marcar webhook como processado
      await prisma.webhookLog.updateMany({
        where: {
          event: payload.event,
          createdAt: {
            gte: new Date(Date.now() - 5000), // Últimos 5 segundos
          },
        },
        data: {
          processed: true,
        },
      });

      // 5. Responder 200 OK
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('[WEBHOOK] Erro ao processar webhook:', error);

      // Salvar erro no log
      try {
        await prisma.webhookLog.updateMany({
          where: {
            event: req.body.event,
            processed: false,
            createdAt: {
              gte: new Date(Date.now() - 5000),
            },
          },
          data: {
            error: error.message,
            processed: true,
          },
        });
      } catch (logError) {
        console.error('[WEBHOOK] Erro ao salvar erro no log:', logError);
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Handler: Compra Aprovada
   * Ativa a assinatura do usuário
   *
   * IMPORTANTE: A Kiwify cobra o pagamento IMEDIATAMENTE. Não há trial gratuito antes da cobrança.
   * A assinatura é criada como ACTIVE porque o pagamento já foi processado.
   * O período de 7 dias é de GARANTIA (possibilidade de estorno), não de trial.
   */
  private static async handlePurchaseApproved(payload: KiwifyWebhookPayload): Promise<void> {
    console.log('[WEBHOOK] Processando compra aprovada:', payload.order.order_id);

    // 1. Buscar usuário pelo email
    const user = await prisma.user.findUnique({
      where: { email: payload.customer.email },
    });

    if (!user) {
      console.error('[WEBHOOK] Usuário não encontrado:', payload.customer.email);
      return;
    }

    // 2. Buscar plano pelo product_id (deve estar mapeado no kiwifyProductId)
    const plan = await prisma.plan.findFirst({
      where: { kiwifyProductId: payload.product.product_id },
    });

    if (!plan) {
      console.error('[WEBHOOK] Plano não encontrado para product_id:', payload.product.product_id);
      return;
    }

    // 3. Verificar se já existe subscription ativa
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
    });

    // 4. Cancelar subscription existente se houver
    if (existingSubscription) {
      await prisma.subscription.update({
        where: { id: existingSubscription.id },
        data: { status: 'CANCELLED' },
      });
      console.log('[WEBHOOK] Subscription anterior cancelada:', existingSubscription.id);
    }

    // 5. Calcular validUntil baseado no período de cobrança
    const validUntil = new Date();
    if (plan.billingPeriod === 'MONTHLY') {
      validUntil.setMonth(validUntil.getMonth() + 1);
    } else if (plan.billingPeriod === 'YEARLY') {
      validUntil.setFullYear(validUntil.getFullYear() + 1);
    } else if (plan.billingPeriod === 'SEMIANNUAL') {
      validUntil.setMonth(validUntil.getMonth() + 6);
    }

    // 6. Criar nova subscription ACTIVE
    const newSubscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        validUntil,
        queriesLimit: plan.maxAlertsPerDay,
        queriesUsed: 0,
        isTrial: false,
        isLifetime: plan.isLifetime,
        externalProvider: 'KIWIFY',
        externalSubId: payload.subscription?.subscription_id,
        kiwifyOrderId: payload.order.order_id,
        kiwifyCustomerId: payload.customer.email,
      },
    });

    console.log('[WEBHOOK] ✅ Subscription ativada:', newSubscription.id);
    console.log('[WEBHOOK] Plano:', plan.name, '| Valid até:', validUntil.toISOString());
  }

  /**
   * Handler: Assinatura Renovada
   * Estende a data de validade
   */
  private static async handleSubscriptionRenewed(payload: KiwifyWebhookPayload): Promise<void> {
    console.log('[WEBHOOK] Processando renovação:', payload.subscription?.subscription_id);

    if (!payload.subscription) {
      console.error('[WEBHOOK] Payload não contém subscription');
      return;
    }

    // 1. Buscar subscription pelo externalSubId
    const subscription = await prisma.subscription.findFirst({
      where: { externalSubId: payload.subscription.subscription_id },
      include: { plan: true },
    });

    if (!subscription) {
      console.error('[WEBHOOK] Subscription não encontrada:', payload.subscription.subscription_id);
      return;
    }

    // 2. Calcular nova validUntil
    const validUntil = subscription.validUntil || new Date();
    const newValidUntil = new Date(validUntil);

    if (subscription.plan.billingPeriod === 'MONTHLY') {
      newValidUntil.setMonth(newValidUntil.getMonth() + 1);
    } else if (subscription.plan.billingPeriod === 'YEARLY') {
      newValidUntil.setFullYear(newValidUntil.getFullYear() + 1);
    } else if (subscription.plan.billingPeriod === 'SEMIANNUAL') {
      newValidUntil.setMonth(newValidUntil.getMonth() + 6);
    }

    // 3. Atualizar subscription
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        validUntil: newValidUntil,
        queriesUsed: 0, // Resetar uso mensal
      },
    });

    console.log('[WEBHOOK] ✅ Subscription renovada:', subscription.id);
    console.log('[WEBHOOK] Nova validUntil:', newValidUntil.toISOString());
  }

  /**
   * Handler: Assinatura Cancelada
   * Marca subscription como CANCELLED
   */
  private static async handleSubscriptionCanceled(payload: KiwifyWebhookPayload): Promise<void> {
    console.log('[WEBHOOK] Processando cancelamento:', payload.subscription?.subscription_id);

    if (!payload.subscription) {
      console.error('[WEBHOOK] Payload não contém subscription');
      return;
    }

    // 1. Buscar subscription
    const subscription = await prisma.subscription.findFirst({
      where: { externalSubId: payload.subscription.subscription_id },
      include: { user: true, plan: true },
    });

    if (!subscription) {
      console.error('[WEBHOOK] Subscription não encontrada:', payload.subscription.subscription_id);
      return;
    }

    // 2. Atualizar status
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELLED' },
    });

    // 3. Enviar email de cancelamento
    await sendSubscriptionExpiredEmail(subscription.user.email);

    console.log('[WEBHOOK] ✅ Subscription cancelada:', subscription.id);
  }

  /**
   * Handler: Assinatura Atrasada
   * Marca como PAST_DUE
   */
  private static async handleSubscriptionLate(payload: KiwifyWebhookPayload): Promise<void> {
    console.log('[WEBHOOK] Processando atraso:', payload.subscription?.subscription_id);

    if (!payload.subscription) {
      console.error('[WEBHOOK] Payload não contém subscription');
      return;
    }

    // 1. Buscar subscription
    const subscription = await prisma.subscription.findFirst({
      where: { externalSubId: payload.subscription.subscription_id },
    });

    if (!subscription) {
      console.error('[WEBHOOK] Subscription não encontrada:', payload.subscription.subscription_id);
      return;
    }

    // 2. Atualizar status
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'PAST_DUE' },
    });

    console.log('[WEBHOOK] ✅ Subscription marcada como atrasada:', subscription.id);
  }

  /**
   * Handler: Compra Reembolsada
   * Cancela a subscription
   */
  private static async handlePurchaseRefunded(payload: KiwifyWebhookPayload): Promise<void> {
    console.log('[WEBHOOK] Processando reembolso:', payload.order.order_id);

    // 1. Buscar subscription pelo kiwifyOrderId
    const subscription = await prisma.subscription.findFirst({
      where: { kiwifyOrderId: payload.order.order_id },
      include: { user: true, plan: true },
    });

    if (!subscription) {
      console.error('[WEBHOOK] Subscription não encontrada para order:', payload.order.order_id);
      return;
    }

    // 2. Cancelar subscription
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELLED' },
    });

    // 3. Enviar email
    await sendSubscriptionExpiredEmail(subscription.user.email);

    console.log('[WEBHOOK] ✅ Subscription cancelada por reembolso:', subscription.id);
  }

  /**
   * Handler: Chargeback
   * Suspende a subscription
   */
  private static async handleChargeback(payload: KiwifyWebhookPayload): Promise<void> {
    console.log('[WEBHOOK] Processando chargeback:', payload.order.order_id);

    // 1. Buscar subscription
    const subscription = await prisma.subscription.findFirst({
      where: { kiwifyOrderId: payload.order.order_id },
    });

    if (!subscription) {
      console.error('[WEBHOOK] Subscription não encontrada para order:', payload.order.order_id);
      return;
    }

    // 2. Suspender subscription
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'SUSPENDED' },
    });

    // 3. Bloquear usuário
    await prisma.user.update({
      where: { id: subscription.userId },
      data: { blocked: true },
    });

    console.log('[WEBHOOK] ✅ Subscription suspensa por chargeback:', subscription.id);
  }
}

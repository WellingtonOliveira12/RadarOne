import { prisma } from '../server';
import { Plan, Coupon, Subscription } from '@prisma/client';
import { sendTrialStartedEmail } from './emailService';

/**
 * Serviço de Billing e Assinaturas (SaaS Ready)
 * Gerencia trial, cupons, pagamentos e expirações
 */

export interface CouponValidation {
  isValid: boolean;
  finalPriceCents: number;
  couponUsed?: Coupon;
  error?: string;
}

/**
 * Valida e aplica cupom de desconto
 */
export async function applyCouponIfValid(
  couponCode: string | undefined,
  plan: Plan
): Promise<CouponValidation> {
  if (!couponCode) {
    return {
      isValid: true,
      finalPriceCents: plan.priceCents
    };
  }

  const coupon = await prisma.coupon.findUnique({
    where: { code: couponCode.toUpperCase() }
  });

  if (!coupon) {
    return {
      isValid: false,
      finalPriceCents: plan.priceCents,
      error: 'Cupom não encontrado'
    };
  }

  if (!coupon.isActive) {
    return {
      isValid: false,
      finalPriceCents: plan.priceCents,
      error: 'Cupom inativo'
    };
  }

  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return {
      isValid: false,
      finalPriceCents: plan.priceCents,
      error: 'Cupom expirado'
    };
  }

  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    return {
      isValid: false,
      finalPriceCents: plan.priceCents,
      error: 'Cupom esgotado'
    };
  }

  if (coupon.appliesToPlanId && coupon.appliesToPlanId !== plan.id) {
    return {
      isValid: false,
      finalPriceCents: plan.priceCents,
      error: 'Cupom não válido para este plano'
    };
  }

  let finalPrice = plan.priceCents;

  if (coupon.discountType === 'PERCENT') {
    const discount = Math.floor((plan.priceCents * coupon.discountValue) / 100);
    finalPrice = plan.priceCents - discount;
  } else if (coupon.discountType === 'FIXED') {
    finalPrice = Math.max(0, plan.priceCents - coupon.discountValue);
  }

  return {
    isValid: true,
    finalPriceCents: Math.max(0, finalPrice),
    couponUsed: coupon
  };
}

/**
 * Inicia período de trial INTERNO para usuário
 *
 * IMPORTANTE: Este trial é INTERNO do RadarOne, usado para:
 * 1. Permitir que novos usuários testem o sistema ANTES de comprar
 * 2. Controlar acesso durante o período de teste gratuito (plano FREE)
 *
 * NÃO confundir com o período de garantia da Kiwify:
 * - Trial interno: Acesso gratuito sem cobrança (usado no plano FREE)
 * - Garantia Kiwify: Pagamento imediato + possibilidade de estorno em 7 dias
 */
export async function startTrialForUser(
  userId: string,
  planSlug: string
): Promise<Subscription> {
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });

  if (!plan) {
    throw new Error('Plano não encontrado: ' + planSlug);
  }

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + plan.trialDays);

  const subscription = await prisma.subscription.create({
    data: {
      userId,
      planId: plan.id,
      status: 'TRIAL',
      isTrial: true,
      trialEndsAt,
      validUntil: trialEndsAt,
      queriesLimit: 1000,
    },
    include: { plan: true, user: true }
  });

  console.log('[BILLING] Trial iniciado:', userId, plan.name);

  // Enviar e-mail de trial iniciado (não bloqueia se falhar)
  if (subscription.user && subscription.trialEndsAt) {
    sendTrialStartedEmail(
      subscription.user.email,
      plan.name,
      subscription.trialEndsAt
    ).catch((err) => {
      console.error('[BILLING] Erro ao enviar e-mail de trial iniciado:', err);
    });
  }

  return subscription;
}

/**
 * Ativa assinatura paga
 */
export async function activatePaidSubscription(
  userId: string,
  planSlug: string,
  billingPeriod: string,
  externalProvider: string,
  externalSubId: string,
  paidUntil: Date
): Promise<Subscription> {
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });

  if (!plan) {
    throw new Error('Plano não encontrado: ' + planSlug);
  }

  // Cancela assinaturas antigas
  await prisma.subscription.updateMany({
    where: { userId, status: { in: ['ACTIVE', 'TRIAL'] } },
    data: { status: 'CANCELLED' }
  });

  const subscription = await prisma.subscription.create({
    data: {
      userId,
      planId: plan.id,
      status: 'ACTIVE',
      isTrial: false,
      validUntil: paidUntil,
      externalProvider,
      externalSubId,
      queriesLimit: 10000,
    },
    include: { plan: true }
  });

  console.log('[BILLING] Assinatura ativada:', userId, plan.name);

  return subscription;
}

/**
 * Verifica e expira assinaturas vencidas
 */
export async function checkAndExpireSubscriptions(): Promise<number> {
  const now = new Date();

  const result = await prisma.subscription.updateMany({
    where: {
      validUntil: { lt: now },
      status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] }
    },
    data: { status: 'EXPIRED' }
  });

  if (result.count > 0) {
    console.log('[BILLING] Assinaturas expiradas:', result.count);
  }

  return result.count;
}

/**
 * Envia notificações de pré-expiração (stub)
 */
export async function sendPreExpiryNotifications(daysBeforeExpiry: number = 3): Promise<number> {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysBeforeExpiry);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'TRIAL'] },
      validUntil: {
        gte: now,
        lte: futureDate
      }
    },
    include: {
      user: true,
      plan: true
    }
  });

  console.log('[BILLING] Assinaturas próximas do vencimento:', subscriptions.length);

  // TODO: Implementar envio real via notificationService

  return subscriptions.length;
}

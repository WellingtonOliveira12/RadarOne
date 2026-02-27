import { prisma } from '../lib/prisma';
import { Plan, Coupon, Subscription } from '@prisma/client';
import { sendTrialStartedEmail } from './emailService';
import { ErrorCodes } from '../constants/errorCodes';
import { logInfo, logError } from '../utils/loggerHelpers';
import { PLAN_CONFIG } from '../config/appConfig';

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
 * Resultado do startTrialForUser — indica se o trial já existia ou foi criado novo.
 */
export interface StartTrialResult {
  subscription: Subscription;
  isExisting: boolean;
}

/**
 * Erro de negócio lançado pelo startTrialForUser.
 * O controller deve capturar e traduzir em HTTP response.
 */
export class TrialBusinessError extends Error {
  public readonly errorCode: string;
  constructor(message: string, errorCode: string) {
    super(message);
    this.name = 'TrialBusinessError';
    this.errorCode = errorCode;
  }
}

/**
 * Inicia período de trial INTERNO para usuário (TRANSACIONAL)
 *
 * REGRAS:
 * 1. Se já existe TRIAL válido do mesmo plano → retorna existente (idempotente)
 * 2. Se já existe subscription ACTIVE → rejeita (SUBSCRIPTION_ALREADY_ACTIVE)
 * 3. Se já usou trial deste plano antes (qualquer status) → rejeita (TRIAL_ALREADY_USED)
 * 4. Cancela trials expirados antigos do user (limpeza)
 * 5. Cria novo trial com guard rail de trialDays
 *
 * Usa prisma.$transaction para evitar race conditions.
 */
export async function startTrialForUser(
  userId: string,
  planSlug: string
): Promise<StartTrialResult> {
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });

  if (!plan) {
    throw new Error('Plano não encontrado: ' + planSlug);
  }

  // GUARD RAIL: trialDays deve ser >= 1. Se for 0/null/negativo, usar fallback de 7 dias.
  const FALLBACK_TRIAL_DAYS = PLAN_CONFIG.fallbackTrialDays;
  const effectiveTrialDays = (plan.trialDays && plan.trialDays >= 1) ? plan.trialDays : FALLBACK_TRIAL_DAYS;

  if (plan.trialDays < 1) {
    logError('BILLING: plan.trialDays invalid, using fallback', {
      trialDays: plan.trialDays, planSlug: plan.slug, fallback: FALLBACK_TRIAL_DAYS
    });
  }

  const now = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + effectiveTrialDays);

  // Validação final: trialEndsAt DEVE ser no futuro
  if (trialEndsAt <= now) {
    throw new Error(
      `[BILLING] BUG: trialEndsAt (${trialEndsAt.toISOString()}) não está no futuro. ` +
      `plan=${plan.slug}, trialDays=${plan.trialDays}, effectiveTrialDays=${effectiveTrialDays}`
    );
  }

  // TRANSAÇÃO: verificar duplicidade + criar trial atomicamente
  const result = await prisma.$transaction(async (tx) => {
    // 1. Buscar subscription válida ACTIVE ou TRIAL do user
    const existingSubs = await tx.subscription.findMany({
      where: {
        userId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      include: { plan: true },
      orderBy: [
        { isLifetime: 'desc' },
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    for (const sub of existingSubs) {
      // TRIAL válido do mesmo plano → idempotente
      if (sub.status === 'TRIAL' && sub.plan.slug === planSlug) {
        const stillValid = sub.isLifetime ||
          (sub.trialEndsAt && sub.trialEndsAt >= now) ||
          !sub.trialEndsAt;
        if (stillValid) {
          logInfo('TRIAL idempotent: existing valid trial', { userId, planSlug, subId: sub.id });
          return { subscription: sub as Subscription, isExisting: true };
        }
      }

      // ACTIVE válido → bloqueia
      if (sub.status === 'ACTIVE') {
        const stillValid = sub.isLifetime ||
          (sub.validUntil && sub.validUntil >= now) ||
          !sub.validUntil;
        if (stillValid) {
          logInfo('TRIAL rejected: user has active subscription', { userId, subId: sub.id });
          throw new TrialBusinessError(
            'Você já possui uma assinatura ativa.',
            ErrorCodes.SUBSCRIPTION_ALREADY_ACTIVE
          );
        }
      }
    }

    // 2. Verificar se já usou trial deste plano antes (qualquer status)
    //    1 trial por email/CPF — como userId é 1:1 com email/CPF, basta checar userId+planId
    const previousTrial = await tx.subscription.findFirst({
      where: {
        userId,
        planId: plan.id,
        isTrial: true,
      },
    });

    if (previousTrial) {
      logInfo('TRIAL rejected: already used trial for plan', { userId, planSlug, subId: previousTrial.id });
      throw new TrialBusinessError(
        'Você já utilizou o período de teste deste plano.',
        ErrorCodes.TRIAL_ALREADY_USED
      );
    }

    // 3. Cancelar trials expirados de outros planos (limpeza)
    await tx.subscription.updateMany({
      where: {
        userId,
        status: 'TRIAL',
        isTrial: true,
        trialEndsAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });

    // 4. Criar novo trial
    const subscription = await tx.subscription.create({
      data: {
        userId,
        planId: plan.id,
        status: 'TRIAL',
        isTrial: true,
        trialEndsAt,
        validUntil: trialEndsAt,
        queriesLimit: 1000,
      },
      include: { plan: true, user: true },
    });

    return { subscription, isExisting: false };
  });

  // Log estruturado de diagnóstico (fora da transação)
  if (!result.isExisting) {
    const diffDays = Math.round((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    logInfo('TRIAL created', { userId, plan: plan.slug, trialDays: effectiveTrialDays, diffDays });

    // Enviar e-mail de trial iniciado (não bloqueia se falhar)
    const sub = result.subscription as any;
    if (sub.user && sub.trialEndsAt) {
      sendTrialStartedEmail(
        sub.user.email,
        plan.name,
        sub.trialEndsAt
      ).catch((err: any) => {
        logError('BILLING: Failed to send trial started email', { err: String(err) });
      });
    }
  }

  return result;
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

  // Cancela assinaturas antigas (preserva vitalícias)
  await prisma.subscription.updateMany({
    where: { userId, status: { in: ['ACTIVE', 'TRIAL'] }, isLifetime: false },
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

  logInfo('BILLING: Subscription activated', { userId, plan: plan.name });

  return subscription;
}

/**
 * Verifica e expira assinaturas vencidas (ignorando vitalícias)
 */
export async function checkAndExpireSubscriptions(): Promise<number> {
  const now = new Date();

  const result = await prisma.subscription.updateMany({
    where: {
      isLifetime: false,
      validUntil: { lt: now },
      status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] }
    },
    data: { status: 'EXPIRED' }
  });

  if (result.count > 0) {
    logInfo('BILLING: Subscriptions expired', { count: result.count });
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
      isLifetime: false, // Vitalícias não expiram — não notificar
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

  logInfo('BILLING: Pre-expiry subscriptions found', { count: subscriptions.length });

  // TODO: Implementar envio real via notificationService

  return subscriptions.length;
}

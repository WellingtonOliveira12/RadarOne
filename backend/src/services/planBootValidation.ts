import { prisma } from '../lib/prisma';
import { logInfo, logError, logWarning } from '../utils/loggerHelpers';
import { PLAN_CONFIG } from '../config/appConfig';

/**
 * Validação de integridade dos planos no boot do servidor.
 *
 * Anti-regressão: garante que trialDays nunca fique < 1 no plano FREE.
 * Também conta "broken trials" (trial_ends_at ≈ created_at) para alertar.
 *
 * Roda em TODA inicialização (dev e prod). Non-fatal: loga mas não bloqueia boot.
 */

export interface PlansIntegrityResult {
  plansChecked: number;
  plansFixed: number;
  brokenTrials: number;
}

const FALLBACK_TRIAL_DAYS = PLAN_CONFIG.fallbackTrialDays;

export async function ensurePlansIntegrity(): Promise<PlansIntegrityResult> {
  const result: PlansIntegrityResult = { plansChecked: 0, plansFixed: 0, brokenTrials: 0 };

  try {
    // 1. Verificar planos ativos com trialDays inválido
    const plans = await prisma.plan.findMany({ where: { isActive: true } });
    result.plansChecked = plans.length;

    for (const plan of plans) {
      if (plan.trialDays < 1) {
        logError('[PLANS] CRITICAL: trialDays inválido detectado no boot', {
          planSlug: plan.slug,
          oldTrialDays: plan.trialDays,
          newTrialDays: FALLBACK_TRIAL_DAYS,
          env: process.env.NODE_ENV || 'development',
        });

        await prisma.plan.update({
          where: { id: plan.id },
          data: { trialDays: FALLBACK_TRIAL_DAYS },
        });

        result.plansFixed++;
      } else {
        logInfo('[PLANS] Boot check OK', {
          planSlug: plan.slug,
          trialDays: plan.trialDays,
        });
      }
    }

    // 2. Contar broken trials (trial_ends_at <= created_at + 5 minutos)
    const brokenTrials: { count: bigint }[] = await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM subscriptions
      WHERE is_trial = true
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at <= created_at + interval '5 minutes'
        AND status IN ('TRIAL', 'EXPIRED')
    `;

    result.brokenTrials = Number(brokenTrials[0]?.count ?? 0);

    if (result.brokenTrials > 0) {
      logError('[PLANS] ALERT: broken trials detectados', {
        brokenTrials: result.brokenTrials,
        action: 'Verificar script fix-free-plan-trial-days.ts',
      });
    } else {
      logInfo('[PLANS] Nenhum broken trial detectado', {});
    }

    logInfo('[PLANS] Boot validation concluída', {
      plansChecked: result.plansChecked,
      plansFixed: result.plansFixed,
      brokenTrials: result.brokenTrials,
    });
  } catch (error) {
    logError('[PLANS] Erro na validação de planos (non-fatal)', { err: error });
  }

  return result;
}

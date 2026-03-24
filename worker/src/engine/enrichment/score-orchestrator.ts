/**
 * Score Orchestrator (V2.1 Hardened)
 *
 * Combines the V1 base scorer with V2 modular adjustments, plus V2.1 safety caps.
 *
 * V2.1 Hardening:
 *   - FIPE cap: score capped at 85 if deltaFipe > -0.15
 *   - Dual confirmation: FIPE vs Market conflict → -10 penalty
 *   - Label gate: "OPORTUNIDADE" requires deltaFipe <= -0.15 OR deltaMarket <= -0.20
 *   - Normalization: final score clamped to 10–95 (no extremes)
 *   - Category: additive adjustment instead of multiplier
 *   - Confidence level: HIGH / MEDIUM / LOW based on data availability
 *
 * FAILSAFE: If any V2 module fails, falls back to V1 result untouched.
 * If V1 itself fails, returns null.
 */

import { logger } from '../../utils/logger';
import { computeOpportunityScore } from './opportunity-score';
import type { OpportunityInput } from './opportunity-score';
import type {
  OpportunityResult,
  ScoreBreakdown,
  ScoreConfidence,
  SellerInput,
} from './score-types';
import { detectCategory, getCategoryAdjustment } from './category-adjustment';
import { computeTimeBoost } from './time-weight';
import { computeSellerScore } from './seller-score';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OrchestratorInput extends OpportunityInput {
  publishedAt?: Date | null;
  seller?: SellerInput | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SCORE_MIN = 10;
const SCORE_MAX = 95;
const WEAK_FIPE_CAP = 85;           // Cap when FIPE delta is weak (> -0.15)
const FIPE_MARKET_CONFLICT_PENALTY = -10;
const OPPORTUNITY_MIN_FIPE_DELTA = -0.15;
const OPPORTUNITY_MIN_MARKET_DELTA = -0.20;

// ─── Helpers ────────────────────────────────────────────────────────────────

function scoreToLabel(
  score: number,
  deltaFipe: number | undefined,
  deltaMarket: number | undefined,
): string {
  // V2.1 Label Gate: "OPORTUNIDADE" requires strong price signal
  if (score >= 85) {
    const hasFipeSignal = deltaFipe !== undefined && deltaFipe <= OPPORTUNITY_MIN_FIPE_DELTA;
    const hasMarketSignal = deltaMarket !== undefined && deltaMarket <= OPPORTUNITY_MIN_MARKET_DELTA;

    if (hasFipeSignal || hasMarketSignal) {
      return '\uD83D\uDD25 OPORTUNIDADE';     // 🔥
    }
    // Downgrade: score is high but no strong price evidence
    return '\uD83D\uDFE2 BOM NEG\u00D3CIO';   // 🟢
  }

  if (score >= 70) return '\uD83D\uDFE2 BOM NEG\u00D3CIO'; // 🟢
  if (score >= 50) return '\uD83D\uDFE1 OK';                 // 🟡
  return '\uD83D\uDD34 CARO';                                 // 🔴
}

function computeConfidenceLevel(
  hasFipe: boolean,
  hasMarket: boolean,
): ScoreConfidence {
  if (hasFipe && hasMarket) return 'HIGH';
  if (hasFipe || hasMarket) return 'MEDIUM';
  return 'LOW';
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

export async function computeOpportunityScoreV2(
  input: OrchestratorInput,
): Promise<OpportunityResult | null> {
  // Step 1: Compute V1 base score
  const baseResult = await computeOpportunityScore(input);
  if (!baseResult) return null;

  let score = baseResult.score;
  const { meta } = baseResult;

  // Step 2: V2 adjustments (each module is independently failsafe)
  let timeBoost = 0;
  let sellerAdj = 0;
  let categoryAdj = 0;

  // ── Category Detection + Adjustment ──
  try {
    const category = detectCategory(input.title);
    const hasMarket = meta.scoreMarket !== null;
    categoryAdj = getCategoryAdjustment(category, meta.hasFipe, hasMarket);

    logger.info({
      monitorId: input.monitorId,
      category,
      adjustment: categoryAdj,
    }, 'OP_CATEGORY_DETECTED');
  } catch (error: any) {
    logger.warn({
      monitorId: input.monitorId,
      error: error.message,
    }, 'OP_SCORE_MODULE_FAIL: category-adjustment');
  }

  // ── Time Boost ──
  try {
    timeBoost = computeTimeBoost(input.publishedAt);

    if (timeBoost > 0) {
      logger.info({
        monitorId: input.monitorId,
        timeBoost,
        publishedAt: input.publishedAt?.toISOString(),
      }, 'OP_TIME_SCORE');
    }
  } catch (error: any) {
    logger.warn({
      monitorId: input.monitorId,
      error: error.message,
    }, 'OP_SCORE_MODULE_FAIL: time-weight');
  }

  // ── Seller Score ──
  try {
    sellerAdj = computeSellerScore(input.title, input.seller);

    if (sellerAdj !== 0) {
      logger.info({
        monitorId: input.monitorId,
        sellerScore: sellerAdj,
      }, 'OP_SELLER_SCORE');
    }
  } catch (error: any) {
    logger.warn({
      monitorId: input.monitorId,
      error: error.message,
    }, 'OP_SCORE_MODULE_FAIL: seller-score');
  }

  // Step 3: Apply adjustments
  score = score + timeBoost + sellerAdj + categoryAdj;

  // Step 4: V2.1 Safety Caps

  // ── FIPE Cap: weak FIPE delta → cap at 85 ──
  if (meta.hasFipe && meta.deltaFipe !== undefined && meta.deltaFipe > OPPORTUNITY_MIN_FIPE_DELTA) {
    if (score > WEAK_FIPE_CAP) {
      logger.info({
        monitorId: input.monitorId,
        scoreBefore: score,
        cap: WEAK_FIPE_CAP,
        deltaFipe: meta.deltaFipe,
      }, 'OP_SCORE_CAP_APPLIED: weak_fipe_delta');
      score = WEAK_FIPE_CAP;
    }
  }

  // ── Dual Confirmation: FIPE and Market disagree → penalty ──
  const hasMarket = meta.scoreMarket !== null;
  if (meta.hasFipe && hasMarket) {
    const fipeSaysCheap = meta.deltaFipe !== undefined && meta.deltaFipe <= -0.05;
    const marketSaysCheap = meta.deltaMarket !== undefined && meta.deltaMarket <= -0.05;

    if (fipeSaysCheap !== marketSaysCheap) {
      score += FIPE_MARKET_CONFLICT_PENALTY;

      logger.info({
        monitorId: input.monitorId,
        fipeSaysCheap,
        marketSaysCheap,
        penalty: FIPE_MARKET_CONFLICT_PENALTY,
      }, 'OP_SCORE_CONFLICT: fipe_vs_market');
    }
  }

  // Step 5: Normalize to 10–95
  const finalScore = Math.round(Math.max(SCORE_MIN, Math.min(SCORE_MAX, score)));

  // Step 6: Confidence level
  const confidenceLevel = computeConfidenceLevel(meta.hasFipe, hasMarket);

  // Step 7: Label with gate
  const label = scoreToLabel(finalScore, meta.deltaFipe, meta.deltaMarket);

  const breakdown: ScoreBreakdown = {
    base: baseResult.score,
    timeBoost,
    sellerScore: sellerAdj,
    categoryAdjustment: categoryAdj,
    final: finalScore,
  };

  // Structured label key for aggregation (no emoji, machine-readable)
  const labelKey = finalScore >= 85 && label.includes('OPORTUNIDADE') ? 'OPPORTUNITY'
    : finalScore >= 70 ? 'GOOD_DEAL'
    : finalScore >= 50 ? 'NEUTRAL'
    : 'EXPENSIVE';

  logger.info({
    monitorId: input.monitorId,
    base: baseResult.score,
    timeBoost,
    sellerScore: sellerAdj,
    categoryAdj,
    final: finalScore,
    confidence: confidenceLevel,
    label,
    labelKey,
    deltaFipe: meta.deltaFipe !== undefined ? Math.round(meta.deltaFipe * 100) / 100 : null,
    deltaMarket: meta.deltaMarket !== undefined ? Math.round(meta.deltaMarket * 100) / 100 : null,
    hasFipe: meta.hasFipe,
    hasMarket: meta.scoreMarket !== null,
  }, 'OP_SCORE_V2');

  return {
    score: finalScore,
    label,
    confidenceLevel,
    meta,
    breakdown,
  };
}

/**
 * Score Orchestrator (V3)
 *
 * V3 Rule: The system MUST NOT opine on price without a trusted reference.
 *
 * Two score modes:
 *   1. FULL — Has trusted price reference (FIPE for vehicles, Apple reference for Apple products)
 *      Uses V2.1 scoring with all safety caps, labels, and delta comparison.
 *
 *   2. SIMPLIFIED — No trusted price reference
 *      Score based ONLY on: time freshness + ad quality + seller signal.
 *      NO price labels ("CARO", "BOM NEGÓCIO", "OPORTUNIDADE").
 *      NO delta calculation, NO price comparison.
 *
 * V2.1 Hardening (retained in FULL mode):
 *   - FIPE cap: score capped at 85 if deltaFipe > -0.15
 *   - Dual confirmation: FIPE vs Market conflict → -10 penalty
 *   - Label gate: "OPORTUNIDADE" requires deltaFipe <= -0.15 OR deltaMarket <= -0.20
 *   - Normalization: final score clamped to 10–95 (no extremes)
 *
 * FAILSAFE: If any module fails, falls back gracefully. Never throws.
 */

import { logger } from '../../utils/logger';
import { computeOpportunityScore } from './opportunity-score';
import type { OpportunityInput } from './opportunity-score';
import type {
  OpportunityResult,
  ScoreBreakdown,
  ScoreConfidence,
  SellerInput,
  AppleReferenceMatch,
} from './score-types';
import { detectCategory, getCategoryAdjustment } from './category-adjustment';
import { computeTimeBoost } from './time-weight';
import { computeSellerScore } from './seller-score';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OrchestratorInput extends OpportunityInput {
  publishedAt?: Date | null;
  seller?: SellerInput | null;
  appleRef?: AppleReferenceMatch | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SCORE_MIN = 10;
const SCORE_MAX = 95;
const WEAK_FIPE_CAP = 85;           // Cap when FIPE delta is weak (> -0.15)
const FIPE_MARKET_CONFLICT_PENALTY = -10;
const OPPORTUNITY_MIN_FIPE_DELTA = -0.15;
const OPPORTUNITY_MIN_MARKET_DELTA = -0.20;

// ─── Label Helpers ──────────────────────────────────────────────────────────

/**
 * FULL mode labels (has trusted price reference).
 */
function scoreToLabelFull(
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

/**
 * SIMPLIFIED mode labels (no trusted price reference).
 * V3: No price opinion — labels reflect ad quality/freshness only.
 */
function scoreToLabelSimplified(score: number): string {
  if (score >= 70) return '\uD83D\uDFE2 AN\u00DANCIO DESTAQUE';  // 🟢 ANÚNCIO DESTAQUE
  if (score >= 40) return '\u2B50 AN\u00DANCIO';                   // ⭐ ANÚNCIO
  return '\uD83D\uDFE1 AN\u00DANCIO RECENTE';                     // 🟡 ANÚNCIO RECENTE
}

function computeConfidenceLevel(
  hasFipe: boolean,
  hasMarket: boolean,
  hasAppleRef: boolean,
): ScoreConfidence {
  if ((hasFipe || hasAppleRef) && hasMarket) return 'HIGH';
  if (hasFipe || hasAppleRef || hasMarket) return 'MEDIUM';
  return 'LOW';
}

// ─── Simplified Score (V3) ──────────────────────────────────────────────────

/**
 * Computes a simplified score for ads WITHOUT a trusted price reference.
 * Based ONLY on time freshness + ad quality + seller signals.
 * No price comparison, no delta, no price labels.
 */
function computeSimplifiedScore(
  title: string,
  timeBoost: number,
  sellerAdj: number,
  qualityScore: number,
): number {
  // Quality is 0-20 range, normalize to 0-50
  const qualityNorm = (qualityScore / 20) * 50;
  // Time boost is 0-7, normalize to 0-30
  const timeNorm = (timeBoost / 7) * 30;
  // Seller is -5 to +5, normalize to 0-20 (center at 10)
  const sellerNorm = ((sellerAdj + 5) / 10) * 20;

  return qualityNorm + timeNorm + sellerNorm;
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

export async function computeOpportunityScoreV2(
  input: OrchestratorInput,
): Promise<OpportunityResult | null> {
  // Step 1: Compute V1 base score (handles FIPE + Market + Quality + Confidence)
  const baseResult = await computeOpportunityScore(input);
  if (!baseResult) return null;

  let score = baseResult.score;
  const { meta } = baseResult;

  // Step 2: Detect category and check for trusted price reference
  let category = 'general' as string;
  try {
    category = detectCategory(input.title);
  } catch {
    // fallback to general
  }

  // V3: Determine if we have a trusted price reference
  const hasFipe = meta.hasFipe;
  const hasAppleRef = !!(input.appleRef && input.appleRef.referencePrice > 0);

  // Apply Apple reference as a FIPE-like enrichment
  if (hasAppleRef && input.appleRef && input.price && input.price > 0) {
    const applePrice = input.appleRef.referencePrice;
    const deltaApple = (input.price - applePrice) / applePrice;
    meta.hasAppleRef = true;
    meta.deltaApple = deltaApple;
    meta.appleRefPrice = applePrice;

    // If no FIPE, use Apple reference as the FIPE equivalent
    if (!hasFipe) {
      meta.hasFipe = true; // Treat Apple ref as price reference for scoring
      meta.deltaFipe = deltaApple;
      // Recompute FIPE score component
      meta.scoreFipe = appleRefDeltaToScore(deltaApple);
      // Recalculate base score with Apple reference
      const marketComponent = meta.scoreMarket !== null ? meta.scoreMarket : 50;
      score = meta.scoreFipe * 0.50 +
        marketComponent * 0.25 +
        meta.scoreQuality * (0.15 / 20 * 100) +
        meta.scoreConfidence * (0.10 / 10 * 100);
      score = Math.round(Math.max(0, Math.min(100, score)));
    }

    logger.info({
      monitorId: input.monitorId,
      appleModel: input.appleRef.model,
      appleStorage: input.appleRef.storage,
      appleRefPrice: applePrice,
      adPrice: input.price,
      deltaApple: Math.round(deltaApple * 100) / 100,
    }, 'OP_APPLE_REF_ENRICHED');
  }

  const hasTrustedPriceRef = meta.hasFipe || hasAppleRef;

  // Step 3: V2 adjustments (each module is independently failsafe)
  let timeBoost = 0;
  let sellerAdj = 0;
  let categoryAdj = 0;

  // ── Category Adjustment ──
  try {
    const hasMarket = meta.scoreMarket !== null;
    categoryAdj = getCategoryAdjustment(category as any, meta.hasFipe, hasMarket);

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

  // ─── V3 BRANCHING: FULL vs SIMPLIFIED ─────────────────────────────────────

  let finalScore: number;
  let label: string;
  let labelKey: string;
  let scoreMode: 'full' | 'simplified';

  if (hasTrustedPriceRef) {
    // ══════════════════════════════════════════════════════════════
    // FULL MODE — Trusted price reference available (FIPE or Apple)
    // ══════════════════════════════════════════════════════════════
    scoreMode = 'full';

    score = score + timeBoost + sellerAdj + categoryAdj;

    // V2.1 Safety Caps

    // ── FIPE Cap: weak delta → cap at 85 ──
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

    finalScore = Math.round(Math.max(SCORE_MIN, Math.min(SCORE_MAX, score)));
    label = scoreToLabelFull(finalScore, meta.deltaFipe, meta.deltaMarket);
    labelKey = finalScore >= 85 && label.includes('OPORTUNIDADE') ? 'OPPORTUNITY'
      : finalScore >= 70 ? 'GOOD_DEAL'
      : finalScore >= 50 ? 'NEUTRAL'
      : 'EXPENSIVE';
  } else {
    // ══════════════════════════════════════════════════════════════
    // SIMPLIFIED MODE — No trusted price reference
    // V3: No price opinion. Score = time + quality + seller only.
    // ══════════════════════════════════════════════════════════════
    scoreMode = 'simplified';

    const simplifiedRaw = computeSimplifiedScore(
      input.title,
      timeBoost,
      sellerAdj,
      meta.scoreQuality,
    );

    finalScore = Math.round(Math.max(SCORE_MIN, Math.min(SCORE_MAX, simplifiedRaw)));
    label = scoreToLabelSimplified(finalScore);
    labelKey = finalScore >= 70 ? 'HIGHLIGHT'
      : finalScore >= 40 ? 'STANDARD'
      : 'RECENT';
  }

  // Step 6: Confidence level
  const hasMarketFinal = meta.scoreMarket !== null;
  const confidenceLevel = computeConfidenceLevel(hasFipe, hasMarketFinal, hasAppleRef);

  const breakdown: ScoreBreakdown = {
    base: baseResult.score,
    timeBoost,
    sellerScore: sellerAdj,
    categoryAdjustment: categoryAdj,
    final: finalScore,
  };

  logger.info({
    monitorId: input.monitorId,
    scoreMode,
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
    deltaApple: meta.deltaApple !== undefined ? Math.round(meta.deltaApple * 100) / 100 : null,
    hasFipe: meta.hasFipe,
    hasAppleRef: meta.hasAppleRef,
    hasMarket: meta.scoreMarket !== null,
  }, 'OP_SCORE_V3');

  return {
    score: finalScore,
    label,
    confidenceLevel,
    scoreMode,
    meta,
    breakdown,
  };
}

// ─── Apple Reference Score Table ────────────────────────────────────────────

function appleRefDeltaToScore(delta: number): number {
  // Same scale as FIPE delta scoring
  if (delta <= -0.25) return 100;
  if (delta <= -0.15) return 90;
  if (delta <= -0.05) return 75;
  if (delta <= 0.05) return 60;
  if (delta <= 0.15) return 40;
  return 20;
}

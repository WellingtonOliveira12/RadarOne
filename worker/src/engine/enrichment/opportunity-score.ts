/**
 * Opportunity Score Engine
 *
 * Universal scoring system (0–100) that tells the user:
 * "Is this ad worth pursuing?"
 *
 * Works with or without FIPE data. Uses 4 weighted factors:
 *   1. FIPE delta   (50% when available)
 *   2. Market delta  (25% with FIPE, 60% without)
 *   3. Ad quality    (15%/25%)
 *   4. Confidence    (10%/15%)
 *
 * FAILSAFE: Never throws. Returns null on any error.
 */

import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import type { FipeEnrichment } from './fipe-types';
import type { OpportunityResult } from './score-types';

// Re-export types and formatters for backward-compat
export type { OpportunityResult } from './score-types';
export { formatScoreTelegram, formatScoreEmail, formatScoreText } from './score-formatters';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OpportunityInput {
  title: string;
  price?: number;
  location?: string;
  site: string;
  monitorId: string;
  fipe?: FipeEnrichment | null;
}

// ─── Score Tables ───────────────────────────────────────────────────────────

function fipeDeltaToScore(delta: number): number {
  if (delta <= -0.25) return 100;
  if (delta <= -0.15) return 90;
  if (delta <= -0.05) return 75;
  if (delta <= 0.05) return 60;
  if (delta <= 0.15) return 40;
  return 20;
}

function marketDeltaToScore(delta: number): number {
  if (delta <= -0.25) return 90;
  if (delta <= -0.15) return 75;
  if (delta <= -0.05) return 65;
  if (delta <= 0.05) return 50;
  if (delta <= 0.15) return 35;
  return 20;
}

// ─── Quality Heuristics ─────────────────────────────────────────────────────

const YEAR_REGEX = /\b(19|20)\d{2}\b/;

const KNOWN_BRANDS = /\b(toyota|honda|hyundai|volkswagen|vw|chevrolet|fiat|ford|renault|nissan|jeep|mitsubishi|peugeot|bmw|mercedes|audi|kia|volvo|yamaha|kawasaki|suzuki|byd|gwm|caoa|chery|ram|dodge)\b/i;

const KNOWN_MODELS = /\b(corolla|civic|gol|onix|hb20|creta|tracker|t-?cross|nivus|polo|kicks|renegade|compass|hilux|s10|ranger|toro|saveiro|strada|yaris|etios|ka|kwid|mobi|argo|cronos|virtus|jetta|tucson|sportage|hr-?v|cr-?v|wr-?v|fit|city|spin|montana|equinox|cruze|pulse|fastback|duster|sandero|captur|frontier|versa|cg\s*\d+|biz\s*\d+|bros\s*\d+|cb\s*\d+|xre\s*\d+|fazer\s*\d+|mt-?\d+)\b/i;

const NOISE_WORDS = /\b(leia\s+a?\s*descri[çc][ãa]o|troc[oa]|financio|aceito\s+troca|parcelo|particular|vendo\s+urgente|oportunidade\s+[uú]nica)\b/i;

function computeQualityScore(title: string): number {
  let score = 0;

  if (YEAR_REGEX.test(title)) score += 10;
  if (KNOWN_BRANDS.test(title)) score += 5;
  if (KNOWN_MODELS.test(title)) score += 5;
  if (NOISE_WORDS.test(title)) score -= 10;
  if (title.length < 15) score -= 5;

  // Clamp 0–20
  return Math.max(0, Math.min(20, score));
}

// ─── Confidence Score ───────────────────────────────────────────────────────

function computeConfidenceScore(
  fipe: FipeEnrichment | null | undefined,
  price: number | undefined,
): number {
  if (fipe) {
    switch (fipe.confidence) {
      case 'HIGH': return 10;
      case 'MEDIUM': return 5;
      default: return 0;
    }
  }
  // No FIPE: at least give credit for valid price
  return (price && price > 0) ? 5 : 0;
}

// ─── Market Median ──────────────────────────────────────────────────────────

/**
 * Fetches median price from the last 20 ads for the same monitor.
 * Uses DB query (single round-trip). Returns null if insufficient data.
 */
async function getMedianPrice(monitorId: string): Promise<number | null> {
  try {
    const recentAds = await prisma.adSeen.findMany({
      where: {
        monitorId,
        price: { not: null, gt: 0 },
      },
      select: { price: true },
      orderBy: { firstSeenAt: 'desc' },
      take: 20,
    });

    // Need at least 3 ads for meaningful median
    if (recentAds.length < 3) return null;

    const prices = recentAds
      .map((a) => a.price!)
      .sort((a, b) => a - b);

    const mid = Math.floor(prices.length / 2);
    return prices.length % 2 === 0
      ? (prices[mid - 1] + prices[mid]) / 2
      : prices[mid];
  } catch (error: any) {
    logger.warn({ monitorId, error: error.message }, 'OP_SCORE_MEDIAN_ERROR');
    return null;
  }
}

// ─── Label ──────────────────────────────────────────────────────────────────

function scoreToLabel(score: number): string {
  if (score >= 85) return '\uD83D\uDD25 OPORTUNIDADE';  // 🔥
  if (score >= 70) return '\uD83D\uDFE2 BOM NEG\u00D3CIO'; // 🟢
  if (score >= 50) return '\uD83D\uDFE1 OK';             // 🟡
  return '\uD83D\uDD34 CARO';                             // 🔴
}

// ─── Main Scorer ────────────────────────────────────────────────────────────

/**
 * Computes Opportunity Score for a single ad.
 *
 * @returns OpportunityResult or null (failsafe)
 */
export async function computeOpportunityScore(
  input: OpportunityInput,
): Promise<OpportunityResult | null> {
  try {
    const { title, price, monitorId, fipe } = input;

    // Must have valid price
    if (!price || price <= 0) return null;

    // ── FIPE Score ──────────────────────────────────────────────
    let scoreFipe: number | null = null;
    let deltaFipe: number | undefined;

    if (fipe && fipe.price > 0) {
      deltaFipe = (price - fipe.price) / fipe.price;
      scoreFipe = fipeDeltaToScore(deltaFipe);

      logger.info({
        monitorId,
        deltaFipe: Math.round(deltaFipe * 100) / 100,
        scoreFipe,
      }, 'OP_SCORE_FIPE');
    }

    // ── Market Score ────────────────────────────────────────────
    let scoreMarket: number | null = null;
    let deltaMarket: number | undefined;
    let medianPrice: number | undefined;

    const median = await getMedianPrice(monitorId);
    if (median && median > 0) {
      medianPrice = median;
      deltaMarket = (price - median) / median;
      scoreMarket = marketDeltaToScore(deltaMarket);

      logger.info({
        monitorId,
        medianPrice: Math.round(median),
        deltaMarket: Math.round(deltaMarket * 100) / 100,
        scoreMarket,
      }, 'OP_SCORE_MARKET');
    }

    // ── Quality Score ───────────────────────────────────────────
    const scoreQuality = computeQualityScore(title);

    // ── Confidence Score ────────────────────────────────────────
    const scoreConfidence = computeConfidenceScore(fipe, price);

    // ── Final Score ─────────────────────────────────────────────
    let finalScore: number;
    const hasFipe = scoreFipe !== null;

    if (hasFipe) {
      // Weighted: FIPE 50% + Market 25% + Quality 15% + Confidence 10%
      const marketComponent = scoreMarket !== null ? scoreMarket : 50; // neutral fallback
      finalScore =
        scoreFipe! * 0.50 +
        marketComponent * 0.25 +
        scoreQuality * (0.15 / 20 * 100) + // normalize 0-20 to 0-100 contribution
        scoreConfidence * (0.10 / 10 * 100); // normalize 0-10 to 0-100 contribution
    } else if (scoreMarket !== null) {
      // No FIPE: Market 60% + Quality 25% + Confidence 15%
      finalScore =
        scoreMarket * 0.60 +
        scoreQuality * (0.25 / 20 * 100) +
        scoreConfidence * (0.15 / 10 * 100);
    } else {
      // No FIPE, no market: Quality + Confidence only (limited signal)
      finalScore =
        scoreQuality * (0.60 / 20 * 100) +
        scoreConfidence * (0.40 / 10 * 100);
    }

    // Clamp and round
    const score = Math.round(Math.max(0, Math.min(100, finalScore)));
    const label = scoreToLabel(score);

    logger.info({
      monitorId,
      score,
      label,
      hasFipe,
      deltaFipe: deltaFipe !== undefined ? Math.round(deltaFipe * 100) / 100 : undefined,
      deltaMarket: deltaMarket !== undefined ? Math.round(deltaMarket * 100) / 100 : undefined,
    }, 'OP_SCORE_FINAL');

    // V2.1: confidence level based on data availability
    const hasMarketData = scoreMarket !== null;
    let confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    if (hasFipe && hasMarketData) confidenceLevel = 'HIGH';
    else if (hasFipe || hasMarketData) confidenceLevel = 'MEDIUM';
    else confidenceLevel = 'LOW';

    return {
      score,
      label,
      confidenceLevel,
      meta: {
        hasFipe,
        scoreFipe,
        scoreMarket,
        scoreQuality,
        scoreConfidence,
        deltaFipe,
        deltaMarket,
        medianPrice,
      },
    };
  } catch (error: any) {
    logger.warn({
      monitorId: input.monitorId,
      error: error.message,
    }, 'OP_SCORE_FAILSAFE_TRIGGERED');
    return null;
  }
}


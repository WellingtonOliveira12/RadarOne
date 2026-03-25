/**
 * Opportunity Score — Type Definitions (V3)
 *
 * Separated from the scorer to avoid pulling DB dependencies into notification services.
 *
 * V3 Changes:
 *   - Added `scoreMode`: 'full' (has trusted price reference) vs 'simplified' (no reference)
 *   - Added `hasPriceReference`: indicates if score includes price evaluation
 *   - Simplified mode: no price labels, no delta, only time + quality
 */

// ─── V1 (backward-compatible) ───────────────────────────────────────────────

export interface OpportunityResult {
  score: number;        // 0–100 (V2.1: hard-clamped 10–95)
  label: string;        // emoji + text label
  confidenceLevel: ScoreConfidence; // V2.1: how much to trust this score
  /** V3: 'full' = has trusted price reference (FIPE/Apple), 'simplified' = no reference */
  scoreMode: 'full' | 'simplified';
  meta: {
    hasFipe: boolean;
    hasAppleRef: boolean;
    scoreFipe: number | null;
    scoreMarket: number | null;
    scoreQuality: number;
    scoreConfidence: number;
    deltaFipe?: number;
    deltaMarket?: number;
    deltaApple?: number;
    medianPrice?: number;
    appleRefPrice?: number;
  };
  /** V2 breakdown — present when orchestrator runs. Absent = V1 fallback. */
  breakdown?: ScoreBreakdown;
}

// ─── V2 Extensions ──────────────────────────────────────────────────────────

export type ScoreConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ScoreBreakdown {
  base: number;                   // V1 base score (0–100)
  timeBoost: number;              // 0–7 (V2.1 reduced from 0-10)
  sellerScore: number;            // -5–5 (V2.1 reduced from -5–10)
  categoryAdjustment: number;     // -3–3 (V2.1 replaced multiplier)
  final: number;                  // after all adjustments (10–95)
}

export type AdCategory = 'vehicle' | 'electronics' | 'real_estate' | 'general';

export interface CategoryWeights {
  fipe: number;
  market: number;
  quality: number;
  confidence: number;
}

export interface SellerInput {
  sellerName?: string;
  isPro?: boolean;
  hasPhone?: boolean;
}

// ─── V3: Apple Reference ────────────────────────────────────────────────────

export interface AppleReferenceMatch {
  model: string;          // e.g. "iPhone 13 Pro"
  storage: string;        // e.g. "128 GB"
  referencePrice: number; // e.g. 1900
  confidence: 'HIGH' | 'MEDIUM';
}

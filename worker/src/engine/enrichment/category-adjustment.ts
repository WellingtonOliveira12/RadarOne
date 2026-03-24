/**
 * Category Adjustment Module (V2.1 Hardened)
 *
 * Detects ad category from title and returns additive adjustments.
 *
 * V2.1: Replaced arbitrary multiplier with conservative additive bonus (-3 to +3).
 * Multiplier approach was risky without real data backing the factors.
 *
 * Also returns category-specific weight overrides for the base scorer.
 */

import type { AdCategory, CategoryWeights } from './score-types';

// ─── Category Detection ─────────────────────────────────────────────────────

const VEHICLE_PATTERNS = /\b(carro|moto|motocicleta|caminh[aã]o|trator|suv|sedan|hatch|picape|pickup|corolla|civic|gol|onix|hb20|creta|tracker|hilux|s10|ranger|toro|strada|kicks|renegade|compass|polo|virtus|t-?cross|nivus|argo|mobi|pulse|kwid|duster|cg\s*\d+|biz\s*\d+|bros\s*\d+|cb\s*\d+|hornet|xre\s*\d+|fazer\s*\d+|mt-?\d+|scania|volvo\s*fh|massey|john\s*deere)\b/i;

const ELECTRONICS_PATTERNS = /\b(iphone|samsung|galaxy|macbook|notebook|laptop|ipad|tablet|playstation|ps[45]|xbox|monitor|tv\s*\d+|smartwatch|airpods|gopro|drone|camera|câmera|dell|lenovo|asus|acer|hp\s+\w+|rtx|gtx|rx\s*\d{4}|ssd|nvidia|apple\s*watch)\b/i;

const REAL_ESTATE_PATTERNS = /\b(apartamento|apto|casa|kitnet|sala\s+comercial|terreno|lote|ch[aá]cara|s[ií]tio|fazenda|galpão|galpao|cobertura|flat|loft|im[oó]vel|sobrado|condom[ií]nio|m[2²]|quartos?\b.*\bsu[ií]te)\b/i;

/**
 * Detects ad category from title text.
 * Returns 'general' as safe fallback.
 */
export function detectCategory(title: string): AdCategory {
  if (VEHICLE_PATTERNS.test(title)) return 'vehicle';
  if (ELECTRONICS_PATTERNS.test(title)) return 'electronics';
  if (REAL_ESTATE_PATTERNS.test(title)) return 'real_estate';
  return 'general';
}

// ─── Weight Overrides ───────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: CategoryWeights = {
  fipe: 0.50,
  market: 0.25,
  quality: 0.15,
  confidence: 0.10,
};

const CATEGORY_WEIGHTS: Record<AdCategory, CategoryWeights> = {
  vehicle: {
    fipe: 0.60,
    market: 0.20,
    quality: 0.12,
    confidence: 0.08,
  },
  electronics: {
    fipe: 0.00,
    market: 0.55,
    quality: 0.30,
    confidence: 0.15,
  },
  real_estate: {
    fipe: 0.00,
    market: 0.50,
    quality: 0.30,
    confidence: 0.20,
  },
  general: DEFAULT_WEIGHTS,
};

/**
 * Returns category-specific weight overrides.
 * Weights always sum to 1.0.
 */
export function getCategoryWeights(category: AdCategory): CategoryWeights {
  return CATEGORY_WEIGHTS[category];
}

// ─── Category Adjustment (V2.1: additive, not multiplicative) ───────────────

/**
 * Returns a small additive adjustment (-3 to +3) based on category context.
 *
 * - vehicle with FIPE: +3 (FIPE adds real signal)
 * - electronics with market data: +3 (market comparison is reliable)
 * - real_estate: -3 (harder to score accurately, higher risk of false positive)
 * - general: 0 (no opinion)
 */
export function getCategoryAdjustment(
  category: AdCategory,
  hasFipe: boolean,
  hasMarket: boolean,
): number {
  switch (category) {
    case 'vehicle':
      return hasFipe ? 3 : 0;
    case 'electronics':
      return hasMarket ? 3 : 0;
    case 'real_estate':
      return -3;
    case 'general':
    default:
      return 0;
  }
}

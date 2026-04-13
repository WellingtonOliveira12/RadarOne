/**
 * Relevance Filter (V3)
 *
 * Filters out noise ads that don't match the monitor's intent.
 * Prevents false positives like "bota" appearing in a car monitor.
 *
 * Rules:
 *   1. Main keyword MUST exist in ad title (at least one word with 4+ chars)
 *   2. Category-specific blacklist rejects known false positives
 *   3. Relevance score computed for observability (not a gate)
 *
 * FAILSAFE: If filter errors, ad is ACCEPTED (never block on filter failure).
 */

import { logger } from '../utils/logger';

// ─── Category Blacklists ────────────────────────────────────────────────────

const VEHICLE_BLACKLIST = /\b(bota|sapato|roupa|camiseta|camisa|calça|vestido|blusa|tênis|sandália|bolsa|mochila|capacete\s+ciclismo|pedal\s+bicicleta|bicicleta|bike|skate|patins|patinete)\b/i;

const ELECTRONICS_BLACKLIST = /\b(capinha|capa\s+de\s+celular|película|case|fone\s+genérico|carregador\s+genérico)\b/i;

// ─── Category Detection (simplified) ────────────────────────────────────────

const VEHICLE_KEYWORDS = /\b(carro|moto|caminhão|trator|suv|sedan|hatch|picape|pickup|veículo|automóvel|fiat|volkswagen|vw|chevrolet|toyota|honda|hyundai|ford|renault|nissan|jeep|bmw|mercedes|audi|kia|yamaha|kawasaki|suzuki)\b/i;

const ELECTRONICS_KEYWORDS = /\b(iphone|samsung|galaxy|macbook|notebook|laptop|ipad|tablet|playstation|ps[45]|xbox|smartwatch|airpods|apple\s*watch)\b/i;

type MonitorCategory = 'vehicle' | 'electronics' | 'general';

function detectMonitorCategory(monitorName: string, keywords: string): MonitorCategory {
  const combined = `${monitorName} ${keywords}`.toLowerCase();
  if (VEHICLE_KEYWORDS.test(combined)) return 'vehicle';
  if (ELECTRONICS_KEYWORDS.test(combined)) return 'electronics';
  return 'general';
}

// ─── Keyword Matching ───────────────────────────────────────────────────────

interface Tokens {
  /** Alphabetic tokens with 4+ chars (iphone, samsung, galaxy, notebook). */
  alpha: string[];
  /** Numeric tokens of ANY length (13, 12, 2024). Model identifiers. */
  numeric: string[];
}

/**
 * Splits a keyword string into alpha (≥4 chars) and numeric tokens.
 *
 * Numeric tokens are preserved regardless of length because they often
 * carry the model identifier (iPhone **13**, PS**5**, Galaxy S**24**).
 * Dropping them silently turns "iphone 13" into "iphone", which then
 * matches iPhone 11, 12, 14, 15, etc.
 */
function tokenize(keywords: string): Tokens {
  const raw = keywords
    .toLowerCase()
    .replace(/[^\w\sÀ-ú]/g, ' ')
    .replace(/([a-zÀ-ú])(\d)/g, '$1 $2') // "ipad10" → "ipad 10"
    .replace(/(\d)([a-zÀ-ú])/g, '$1 $2') // "13pro"  → "13 pro"
    .split(/[\s_]+/)
    .filter(Boolean);

  const alpha: string[] = [];
  const numeric: string[] = [];
  for (const t of raw) {
    if (/^\d+$/.test(t)) {
      numeric.push(t);
    } else if (t.length >= 4) {
      alpha.push(t);
    }
  }
  return { alpha, numeric };
}

/**
 * Legacy permissive match — used when the keyword string came from the
 * monitor name as a fallback. In that case the tokens are often noise
 * (e.g. "01_IPHONE_GERAL_PG5") and enforcing anything strict would
 * reject legitimate ads. Behavior: at least one alpha token (≥4 chars)
 * must appear as a substring; numbers are ignored.
 */
function hasKeywordMatchLegacy(title: string, keywords: string): boolean {
  const titleLower = title.toLowerCase();
  const { alpha } = tokenize(keywords);
  if (alpha.length === 0) return true; // "TV 50" → no alpha, accept all
  return alpha.some((w) => titleLower.includes(w));
}

/**
 * Strict match — used when the keyword string was EXPLICITLY typed by
 * the user (filtersJson.keywords). Applies a model-identifier rule so
 * that "iphone 13" does NOT silently match iPhone 11/12/14:
 *
 *  - Every numeric token MUST appear in the title as a whole word —
 *    `\b13\b` matches "iPhone 13" and "iPhone 13 Pro" but not "iPhone 130".
 *  - At least one alpha token must appear as a substring (tolerance for
 *    brand words — "iphone" matches "iPhone", "iPhoneX", etc.).
 *  - No tokens at all → accept (degenerate case).
 */
function hasKeywordMatchStrict(title: string, keywords: string): boolean {
  const titleLower = title.toLowerCase();
  const { alpha, numeric } = tokenize(keywords);

  if (alpha.length === 0 && numeric.length === 0) return true;

  for (const n of numeric) {
    const re = new RegExp(`\\b${n}\\b`);
    if (!re.test(titleLower)) return false;
  }

  if (alpha.length > 0 && !alpha.some((w) => titleLower.includes(w))) {
    return false;
  }

  return true;
}

// ─── Main Filter ────────────────────────────────────────────────────────────

export interface RelevanceResult {
  relevant: boolean;
  reason?: string;
  score: number; // 0-100 relevance score
}

export interface RelevanceOptions {
  /**
   * Where the keyword string came from. When `explicit`, enforces the
   * strict model-identifier rule (every numeric token must appear in
   * the title as a whole word). When `name_fallback` (default), uses
   * the legacy permissive behavior so monitors named e.g.
   * "01_IPHONE_GERAL_PG5" still match legitimate iPhone ads.
   */
  keywordsSource?: 'explicit' | 'name_fallback';
}

/**
 * Checks if an ad is relevant to the monitor.
 *
 * @param adTitle - The ad title
 * @param monitorName - The monitor name
 * @param monitorKeywords - The monitor search keywords
 * @param options - See {@link RelevanceOptions}
 */
export function checkRelevance(
  adTitle: string,
  monitorName: string,
  monitorKeywords: string,
  options: RelevanceOptions = {},
): RelevanceResult {
  try {
    const keywords = monitorKeywords || monitorName;
    const category = detectMonitorCategory(monitorName, keywords);
    const source = options.keywordsSource ?? 'name_fallback';
    const matchFn = source === 'explicit' ? hasKeywordMatchStrict : hasKeywordMatchLegacy;

    // Rule 1: Main keyword must exist in title
    if (!matchFn(adTitle, keywords)) {
      return {
        relevant: false,
        reason: 'keyword_not_in_title',
        score: 0,
      };
    }

    // Rule 2: Category-specific blacklist
    if (category === 'vehicle' && VEHICLE_BLACKLIST.test(adTitle)) {
      return {
        relevant: false,
        reason: 'vehicle_blacklist',
        score: 10,
      };
    }

    if (category === 'electronics' && ELECTRONICS_BLACKLIST.test(adTitle)) {
      return {
        relevant: false,
        reason: 'electronics_blacklist',
        score: 10,
      };
    }

    // Rule 3: Compute relevance score (informational — not a gate).
    // Rule 1 above is the real gate. This score is only for observability.
    const titleLower = adTitle.toLowerCase();
    const { alpha, numeric } = tokenize(keywords);
    const matchedAlpha = alpha.filter((w) => titleLower.includes(w));
    const matchedNumeric = numeric.filter((n) => new RegExp(`\\b${n}\\b`).test(titleLower));
    const totalTokens = alpha.length + numeric.length;
    const matchRatio = totalTokens > 0
      ? (matchedAlpha.length + matchedNumeric.length) / totalTokens
      : 1;

    const relevanceScore = Math.round(matchRatio * 100);

    return {
      relevant: true,
      score: relevanceScore,
    };
  } catch (error: any) {
    // FAILSAFE: accept on error
    logger.warn({ error: error.message, adTitle: String(adTitle ?? '').substring(0, 60) }, 'RELEVANCE_FILTER_ERROR');
    return { relevant: true, score: 100 };
  }
}

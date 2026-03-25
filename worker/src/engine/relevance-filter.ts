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

/**
 * Extracts significant words (4+ chars) from a keyword string.
 */
function extractSignificantWords(keywords: string): string[] {
  return keywords
    .toLowerCase()
    .replace(/[^\w\sÀ-ú]/g, '')
    .replace(/([a-zÀ-ú])(\d)/g, '$1 $2') // "ipad10" → "ipad 10"
    .split(/[\s_]+/)
    .filter(w => w.length >= 4);
}

/**
 * Checks if at least one significant keyword exists in the title.
 */
function hasKeywordMatch(title: string, keywords: string): boolean {
  const titleLower = title.toLowerCase();
  const significantWords = extractSignificantWords(keywords);

  // If no significant words (e.g., keywords = "TV 50"), accept all
  if (significantWords.length === 0) return true;

  return significantWords.some(word => titleLower.includes(word));
}

// ─── Main Filter ────────────────────────────────────────────────────────────

export interface RelevanceResult {
  relevant: boolean;
  reason?: string;
  score: number; // 0-100 relevance score
}

/**
 * Checks if an ad is relevant to the monitor.
 *
 * @param adTitle - The ad title
 * @param monitorName - The monitor name
 * @param monitorKeywords - The monitor search keywords
 * @returns RelevanceResult with match status and reason
 */
export function checkRelevance(
  adTitle: string,
  monitorName: string,
  monitorKeywords: string,
): RelevanceResult {
  try {
    const keywords = monitorKeywords || monitorName;
    const category = detectMonitorCategory(monitorName, keywords);

    // Rule 1: Main keyword must exist in title
    if (!hasKeywordMatch(adTitle, keywords)) {
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

    // Rule 3: Compute relevance score (informational — not a gate)
    // Rule 1 already ensures at least one keyword is in the title.
    // The score is computed for observability but does NOT reject ads.
    // Previous 30% threshold was too aggressive: monitors with 4+ keywords
    // and ads matching only 1 keyword (e.g. 1/4=25%) were silently rejected.
    const titleLower = adTitle.toLowerCase();
    const significantWords = extractSignificantWords(keywords);
    const matchedWords = significantWords.filter(w => titleLower.includes(w));
    const matchRatio = significantWords.length > 0
      ? matchedWords.length / significantWords.length
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

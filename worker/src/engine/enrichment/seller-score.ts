/**
 * Seller Score Module (V2.1 Hardened)
 *
 * Optional scoring based on seller information.
 * Returns an additive adjustment (-5 to +5).
 *
 * V2.1: Tightened rules to prevent inflating unverified sellers.
 *   - +5 requires seller name AND phone (real verification)
 *   - +3 for identified seller name only
 *   - Title-only pro hints no longer give positive score
 *   - Max clamped to +5 (was +10)
 *
 * IMPORTANT: Seller data is often unavailable (especially FB, OLX).
 * If no seller data → returns 0 (neutral, no impact).
 */

import type { SellerInput } from './score-types';

// ─── Title-based Signals (always available) ─────────────────────────────────

const URGENCY_NOISE = /\b(urgente|urgência|desapego|vendo\s+logo|preciso\s+vender|aceito\s+qualquer|barato\s+pra\s+sair)\b/i;

// ─── Scorer ─────────────────────────────────────────────────────────────────

/**
 * Computes seller-based score adjustment.
 *
 * @param title - Ad title (always available)
 * @param seller - Optional seller metadata (may be null/undefined)
 * @returns Adjustment -5 to +5
 */
export function computeSellerScore(
  title: string,
  seller?: SellerInput | null,
): number {
  let score = 0;

  // Title-based: only penalize suspicious signals (no positive from title alone)
  if (URGENCY_NOISE.test(title)) score -= 5;

  // Seller metadata: require real data for positive score
  if (seller) {
    const hasName = !!(seller.sellerName && seller.sellerName.trim().length > 0);
    const hasPhone = !!seller.hasPhone;

    if (hasName && hasPhone) {
      // Strong signal: identified seller with contact info
      score += 5;
    } else if (hasName) {
      // Moderate signal: identified seller, no contact
      score += 3;
    }
    // isPro alone is not enough (can be faked on some platforms)
  }

  // Clamp -5 to +5
  return Math.max(-5, Math.min(5, score));
}

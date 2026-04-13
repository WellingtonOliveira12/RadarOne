/**
 * OLX Seller Confidence Tiering
 *
 * Pure function that converts real, observable profile signals from the
 * OLX ad detail page into a tiered confidence label for operator UX.
 *
 * Tier definitions:
 *   • HIGH  — veteran seller (≥ 2 years on platform)
 *             OR multiple verified channels (≥ 2) AND ≥ 1 year
 *   • LOW   — brand-new account (joined this year) AND zero verifications
 *             OR freshness signal says seller has been offline ≥ 7 days
 *             (strong negative — the ad is likely stale or abandoned)
 *   • MEDIUM — everything else (default/neutral)
 *
 * Recency influence (added in revision 2):
 *   • last seen ≤ 60 min → positive boost: a MEDIUM can be promoted to HIGH
 *     if there are at least 2 verifications.
 *   • last seen ≥ 7 days → hard override to LOW regardless of other signals.
 *
 * Anything LOW gets a human-readable reason attached so the operator
 * can audit why the tier was assigned.
 */

import type { OlxProfileSignals } from './olx-profile-parser';
import { countVerifications, yearsOnPlatform } from './olx-profile-parser';

export type OlxConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface OlxConfidenceResult {
  tier: OlxConfidenceTier;
  /** Explainability: short reason codes, in English for log/telemetry. */
  reasons: string[];
}

export interface OlxConfidenceOptions {
  /** Year used for "joined this year" checks. Injectable for tests. */
  now?: Date;
}

const HIGH_VETERAN_YEARS = 2;
const HIGH_MIN_YEARS_WITH_VERIFS = 1;
const HIGH_MIN_VERIFICATIONS = 2;
const RECENCY_FRESH_MIN = 60;            // ≤ 1h → positive boost
const RECENCY_STALE_MIN = 60 * 24 * 7;   // ≥ 7 days → hard LOW override

export function computeOlxConfidence(
  signals: OlxProfileSignals,
  opts: OlxConfidenceOptions = {},
): OlxConfidenceResult {
  const now = opts.now ?? new Date();
  const years = yearsOnPlatform(signals, now);
  const verifCount = countVerifications(signals.verifications);
  const lastSeen = signals.lastSeenMinutes;
  const reasons: string[] = [];

  // ─── Recency tags (informational — influence tier below) ─────────────────
  const isFresh = lastSeen !== null && lastSeen <= RECENCY_FRESH_MIN;
  const isStale = lastSeen !== null && lastSeen >= RECENCY_STALE_MIN;

  // ─── LOW OVERRIDE: seller has been offline for a week+ ───────────────────
  // This is a strong negative signal: any other positives we might have
  // (verifications, tenure) do not matter if the seller is unlikely to
  // respond. The ad is effectively abandoned.
  if (isStale) {
    if (years !== null) reasons.push(`years_${years}`);
    if (verifCount > 0) reasons.push(`verif_${verifCount}`);
    reasons.push(`stale_${Math.round(lastSeen! / (60 * 24))}d`);
    return { tier: 'LOW', reasons };
  }

  // ─── HIGH ────────────────────────────────────────────────────────────────
  if (years !== null && years >= HIGH_VETERAN_YEARS) {
    reasons.push(`veteran_${years}y`);
    if (verifCount > 0) reasons.push(`verif_${verifCount}`);
    if (isFresh) reasons.push(`fresh_${lastSeen}m`);
    return { tier: 'HIGH', reasons };
  }
  if (
    years !== null &&
    years >= HIGH_MIN_YEARS_WITH_VERIFS &&
    verifCount >= HIGH_MIN_VERIFICATIONS
  ) {
    reasons.push(`established_${years}y`, `verif_${verifCount}`);
    if (isFresh) reasons.push(`fresh_${lastSeen}m`);
    return { tier: 'HIGH', reasons };
  }

  // Recency-driven promotion: brand-new account but fresh and with ≥2 verifs
  // → the seller is actively online AND has verified channels, which is a
  // stronger signal than tenure alone. Promote from MEDIUM to HIGH.
  if (isFresh && verifCount >= HIGH_MIN_VERIFICATIONS) {
    reasons.push(`fresh_${lastSeen}m`, `verif_${verifCount}`);
    if (years !== null) reasons.push(`years_${years}`);
    return { tier: 'HIGH', reasons };
  }

  // ─── LOW ─────────────────────────────────────────────────────────────────
  // Brand-new account (this year) + zero verifications → weak signal.
  if (years === 0 && verifCount === 0) {
    reasons.push('new_account', 'no_verifications');
    if (!signals.hasVerificationsSection) reasons.push('no_verif_section');
    return { tier: 'LOW', reasons };
  }

  // ─── MEDIUM (default) ────────────────────────────────────────────────────
  if (years !== null) reasons.push(`years_${years}`);
  if (verifCount > 0) reasons.push(`verif_${verifCount}`);
  if (isFresh) reasons.push(`fresh_${lastSeen}m`);
  if (reasons.length === 0) reasons.push('insufficient_data');
  return { tier: 'MEDIUM', reasons };
}

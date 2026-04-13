/**
 * OLX Seller Confidence Tiering
 *
 * Pure function that converts real, observable profile signals from the
 * OLX ad detail page into a tiered confidence label for operator UX.
 *
 * Tiers are deliberately explainable (`reasons`) and conservative — we
 * only reward signals OLX explicitly exposes, and only downgrade when
 * a weak signal is clearly present. We do NOT invent data and we do NOT
 * penalize missing data harshly, because missing data is common on OLX.
 *
 * Tier definitions:
 *   • HIGH  — veteran seller (≥ 2 years on platform)
 *             OR multiple verified channels (≥ 2) AND ≥ 1 year
 *   • LOW   — brand-new account (joined this year) AND zero verifications
 *             OR no verification section at all AND joined this year
 *   • MEDIUM — everything else (default/neutral)
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

export function computeOlxConfidence(
  signals: OlxProfileSignals,
  opts: OlxConfidenceOptions = {},
): OlxConfidenceResult {
  const now = opts.now ?? new Date();
  const years = yearsOnPlatform(signals, now);
  const verifCount = countVerifications(signals.verifications);
  const reasons: string[] = [];

  // ─── HIGH ────────────────────────────────────────────────────────────────
  if (years !== null && years >= HIGH_VETERAN_YEARS) {
    reasons.push(`veteran_${years}y`);
    if (verifCount > 0) reasons.push(`verif_${verifCount}`);
    return { tier: 'HIGH', reasons };
  }
  if (
    years !== null &&
    years >= HIGH_MIN_YEARS_WITH_VERIFS &&
    verifCount >= HIGH_MIN_VERIFICATIONS
  ) {
    reasons.push(`established_${years}y`, `verif_${verifCount}`);
    return { tier: 'HIGH', reasons };
  }

  // ─── LOW ─────────────────────────────────────────────────────────────────
  // Brand-new account (this year) + zero verifications → weak signal.
  // This covers both the "section present but empty" and the "no section at
  // all" cases, because verifCount === 0 in both.
  if (years === 0 && verifCount === 0) {
    reasons.push('new_account', 'no_verifications');
    if (!signals.hasVerificationsSection) reasons.push('no_verif_section');
    return { tier: 'LOW', reasons };
  }

  // ─── MEDIUM (default) ────────────────────────────────────────────────────
  if (years !== null) reasons.push(`years_${years}`);
  if (verifCount > 0) reasons.push(`verif_${verifCount}`);
  if (reasons.length === 0) reasons.push('insufficient_data');
  return { tier: 'MEDIUM', reasons };
}

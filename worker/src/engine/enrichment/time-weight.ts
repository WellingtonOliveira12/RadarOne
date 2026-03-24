/**
 * Time Weight Module (V2.1 Hardened)
 *
 * Gives a moderate boost to newer ads. Fresh listings are more likely to be
 * genuine opportunities — stale listings may already be sold or repriced.
 *
 * V2.1: Reduced max boost from +10 to +7 to prevent inflating weak ads.
 *
 * Returns an additive bonus (0–7) applied after base score.
 */

/**
 * Computes time-based score boost.
 *
 * @param publishedAt - When the ad was first seen/published (null = unknown)
 * @param now - Current time (injectable for testing)
 * @returns Bonus points 0–7
 */
export function computeTimeBoost(
  publishedAt: Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!publishedAt) return 0;

  const ageMs = now.getTime() - publishedAt.getTime();

  // Future dates (clock skew) → no boost
  if (ageMs < 0) return 0;

  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours < 1) return 7;
  if (ageHours < 6) return 5;
  if (ageHours < 24) return 3;
  if (ageHours < 72) return 1;
  return 0;
}

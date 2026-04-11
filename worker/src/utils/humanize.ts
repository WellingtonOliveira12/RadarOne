/**
 * Humanize — Anti-detection delay and scheduling utilities.
 *
 * Provides non-deterministic delays and jitter that mimic human browsing
 * patterns. All functions use bounded randomness (never unbounded).
 */

/** Platform risk levels — higher risk = more aggressive humanization */
export type PlatformRisk = 'high' | 'medium' | 'low';

const PLATFORM_RISK: Record<string, PlatformRisk> = {
  MERCADO_LIVRE: 'high',
  FACEBOOK_MARKETPLACE: 'high',
  OLX: 'medium',
  WEBMOTORS: 'medium',
  ICARROS: 'medium',
  ZAPIMOVEIS: 'low',
  VIVAREAL: 'low',
  IMOVELWEB: 'low',
  LEILAO: 'low',
};

/**
 * Returns platform risk level (defaults to 'medium' for unknown sites).
 */
export function getPlatformRisk(site: string): PlatformRisk {
  return PLATFORM_RISK[site] || 'medium';
}

/**
 * Computes humanized jitter for scheduler (monitor execution interval).
 *
 * - High risk: ±30% jitter (ML, Facebook — aggressive anti-bot)
 * - Medium risk: ±20% jitter (OLX, Webmotors)
 * - Low risk: ±10% jitter (Zapimoveis, Vivareal)
 *
 * @param baseMs - Base interval in milliseconds
 * @param site - Platform identifier
 * @returns Jitter offset in milliseconds (can be negative)
 */
export function computeSchedulerJitter(baseMs: number, site: string): number {
  const risk = getPlatformRisk(site);

  const ranges: Record<PlatformRisk, number> = {
    high: 0.30,
    medium: 0.20,
    low: 0.10,
  };

  const range = ranges[risk];
  const jitterMs = Math.round((Math.random() - 0.5) * 2 * baseMs * range);
  return jitterMs;
}

/**
 * Applies humanized jitter to a base delay (always positive result).
 *
 * @param baseMs - Base delay in milliseconds
 * @param variance - Variance factor (default 0.25 = ±25%)
 * @returns Jittered delay, guaranteed >= baseMs * 0.5
 */
export function humanDelay(baseMs: number, variance = 0.25): number {
  const factor = 1 - variance + Math.random() * variance * 2;
  return Math.max(Math.round(baseMs * factor), Math.round(baseMs * 0.5));
}

/**
 * Generates a random pre-navigation pause (simulates human hesitation).
 * Range: 500ms - 2500ms for high risk, 200ms - 1200ms for low risk.
 */
export function preNavigationPause(site: string): number {
  const risk = getPlatformRisk(site);

  const ranges: Record<PlatformRisk, [number, number]> = {
    high: [500, 2500],
    medium: [300, 1500],
    low: [200, 1000],
  };

  const [min, max] = ranges[risk];
  return Math.round(min + Math.random() * (max - min));
}

/**
 * Generates humanized scroll delay (varies per step to avoid pattern).
 *
 * @param baseMs - Base delay between scrolls
 * @param step - Current scroll step (adds micro-variation)
 * @returns Delay in ms
 */
export function scrollDelay(baseMs: number, step: number): number {
  // Vary by ±30% plus a small per-step component
  const variance = 0.30;
  const stepNoise = (step % 3) * 100; // 0, 100, or 200ms per step pattern
  const factor = 1 - variance + Math.random() * variance * 2;
  return Math.round(baseMs * factor + stepNoise);
}

/**
 * Post-scroll stabilization wait. Longer for high-risk platforms.
 */
export function postScrollWait(site: string): number {
  const risk = getPlatformRisk(site);

  const ranges: Record<PlatformRisk, [number, number]> = {
    high: [1500, 3000],
    medium: [1000, 2000],
    low: [500, 1500],
  };

  const [min, max] = ranges[risk];
  return Math.round(min + Math.random() * (max - min));
}

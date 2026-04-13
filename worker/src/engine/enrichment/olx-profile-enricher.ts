/**
 * OLX Profile Enricher — OPT-IN detail page navigation.
 *
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  SAFETY LAYERS (all active when OLX_ENRICH_PROFILE=true)               ║
 * ╠═══════════════════════════════════════════════════════════════════════╣
 * ║  1. Opt-in master switch      OLX_ENRICH_PROFILE=true                  ║
 * ║  2. Per-run hard cap          OLX_ENRICH_MAX_PER_RUN       (default 3) ║
 * ║  3. Per-monitor hourly cap    OLX_ENRICH_MAX_PER_MONITOR_HOUR (20)     ║
 * ║  4. Global hourly cap         OLX_ENRICH_MAX_GLOBAL_HOUR   (default 60)║
 * ║  5. Per-fetch timeout         OLX_ENRICH_TIMEOUT_MS        (default 10s)║
 * ║  6. Dry-run mode              OLX_ENRICH_DRY_RUN=true — parse & log    ║
 * ║                               but DO NOT attach signals to ads         ║
 * ║  7. Challenge/blocked URL detection → silent abort, no retry           ║
 * ║  8. Full try/catch around every fetch — ads return without enrichment  ║
 * ║  9. Humanized inter-fetch delay (1.5–3.5 s randomized)                 ║
 * ║ 10. Reuses SAME BrowserContext as the main scrape (no extra session)   ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

import type { BrowserContext } from 'playwright';
import type { ScrapedAd } from '../../types/scraper';
import { logger } from '../../utils/logger';
import { parseOlxProfileText, type OlxProfileSignals } from './olx-profile-parser';
import { computeOlxConfidence } from './olx-confidence';
import {
  canEnrichNow,
  recordEnrichHit,
  limiterSnapshot,
  logLimiterBlocked,
} from './olx-enrich-limiter';

const DEFAULT_MAX_PER_RUN = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_INTER_DELAY_MIN_MS = 1500;
const DEFAULT_INTER_DELAY_MAX_MS = 3500;

export interface EnrichOptions {
  context: BrowserContext;
  ads: ScrapedAd[];
  monitorId: string;
}

// Cumulative counters (process lifetime) — complement per-run logs.
const processCounters = {
  runs: 0,
  enriched: 0,
  failed: 0,
  rateLimited: 0,
  challengeAborts: 0,
  totalDurationMs: 0,
};

function isEnabled(): boolean {
  return process.env.OLX_ENRICH_PROFILE === 'true';
}

function isDryRun(): boolean {
  return process.env.OLX_ENRICH_DRY_RUN === 'true';
}

function maxPerRun(): number {
  const raw = parseInt(process.env.OLX_ENRICH_MAX_PER_RUN || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_PER_RUN;
}

function timeoutMs(): number {
  const raw = parseInt(process.env.OLX_ENRICH_TIMEOUT_MS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function randomInterDelayMs(): number {
  return (
    DEFAULT_INTER_DELAY_MIN_MS +
    Math.floor(Math.random() * (DEFAULT_INTER_DELAY_MAX_MS - DEFAULT_INTER_DELAY_MIN_MS))
  );
}

export async function enrichOlxAdsWithProfile(opts: EnrichOptions): Promise<void> {
  if (!isEnabled()) return;

  const { context, ads, monitorId } = opts;
  if (!ads || ads.length === 0) return;

  const dryRun = isDryRun();
  const cap = maxPerRun();
  const candidates = ads.slice(0, cap);
  const perTimeout = timeoutMs();
  const startedAt = Date.now();
  let enriched = 0;
  let failed = 0;
  let rateLimited = 0;
  let challengeAborts = 0;
  const durations: number[] = [];

  processCounters.runs += 1;

  logger.info(
    {
      monitorId,
      candidates: candidates.length,
      cap,
      timeoutMs: perTimeout,
      dryRun,
      limiterSnapshot: limiterSnapshot(),
    },
    'OLX_PROFILE_ENRICH_START',
  );

  for (let i = 0; i < candidates.length; i++) {
    const ad = candidates[i];

    // ── Rate limit check (per-monitor hour + global hour) ─────────────────
    const gate = canEnrichNow(monitorId);
    if (!gate.allowed) {
      rateLimited++;
      processCounters.rateLimited++;
      logLimiterBlocked(monitorId, gate.reason ?? 'unknown', gate.usage);
      // Stop here — further ads in this run are guaranteed to hit the same
      // ceiling, so we avoid burning inter-fetch delays for no reason.
      break;
    }

    if (i > 0) {
      // Human-ish pacing between detail pages within the same run.
      await new Promise((r) => setTimeout(r, randomInterDelayMs()));
    }

    const fetchStart = Date.now();
    try {
      const result = await fetchProfileSignals(context, ad.url, perTimeout);
      recordEnrichHit(monitorId);
      const fetchMs = Date.now() - fetchStart;
      durations.push(fetchMs);

      if (result === 'challenge') {
        challengeAborts++;
        processCounters.challengeAborts++;
        logger.warn(
          { monitorId, externalId: ad.externalId, fetchMs },
          'OLX_PROFILE_ENRICH_CHALLENGE',
        );
        continue;
      }

      if (!result) {
        failed++;
        processCounters.failed++;
        continue;
      }

      const signals = result;
      const confidence = computeOlxConfidence(signals);
      enriched++;
      processCounters.enriched++;

      // Dry-run mode: log everything but DO NOT mutate the ad.
      // This lets the operator observe behavior in production for N days
      // before allowing the tier to influence the notification payload.
      if (!dryRun) {
        ad.profileSignals = signals;
        ad.confidence = confidence;
      }

      logger.info(
        {
          monitorId,
          externalId: ad.externalId,
          yearJoined: signals.yearJoined,
          lastSeenRaw: signals.lastSeenRaw,
          lastSeenMinutes: signals.lastSeenMinutes,
          verifCount:
            (signals.verifications.email ? 1 : 0) +
            (signals.verifications.phone ? 1 : 0) +
            (signals.verifications.facebook ? 1 : 0) +
            (signals.verifications.identity ? 1 : 0),
          tier: confidence.tier,
          reasons: confidence.reasons,
          fetchMs,
          dryRun,
        },
        dryRun ? 'OLX_PROFILE_ENRICH_DRY_RUN' : 'OLX_PROFILE_ENRICH_OK',
      );
    } catch (error: any) {
      failed++;
      processCounters.failed++;
      recordEnrichHit(monitorId); // failure consumes budget too
      durations.push(Date.now() - fetchStart);
      logger.warn(
        {
          monitorId,
          externalId: ad.externalId,
          error: String(error?.message || error).slice(0, 200),
        },
        'OLX_PROFILE_ENRICH_FAIL',
      );
    }
  }

  const durationMs = Date.now() - startedAt;
  processCounters.totalDurationMs += durationMs;
  const avgFetchMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

  logger.info(
    {
      monitorId,
      candidates: candidates.length,
      enriched,
      failed,
      rateLimited,
      challengeAborts,
      durationMs,
      avgFetchMs,
      dryRun,
      processTotals: { ...processCounters },
      limiterSnapshot: limiterSnapshot(),
    },
    'OLX_PROFILE_ENRICH_END',
  );
}

/**
 * Navigates a fresh short-lived page to the OLX ad detail URL, extracts
 * the rendered innerText, and parses stable signals. Returns:
 *   - signals object     on success
 *   - 'challenge'        on anti-bot redirect (no retry, no escalation)
 *   - null               on empty page / navigation failure
 */
async function fetchProfileSignals(
  context: BrowserContext,
  adUrl: string,
  timeoutMsVal: number,
): Promise<OlxProfileSignals | 'challenge' | null> {
  const page = await context.newPage();
  try {
    const response = await page.goto(adUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMsVal,
    });
    if (!response) return null;

    const finalUrl = page.url();
    if (/account-verification|desafio|challenge|blocked/i.test(finalUrl)) {
      return 'challenge';
    }

    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    if (!bodyText || bodyText.length < 100) {
      return null;
    }

    return parseOlxProfileText(bodyText);
  } finally {
    try {
      await page.close();
    } catch {
      // Ignore cleanup errors — context lifecycle is owned elsewhere.
    }
  }
}

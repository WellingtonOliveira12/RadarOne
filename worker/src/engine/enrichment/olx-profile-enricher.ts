/**
 * OLX Profile Enricher — OPT-IN detail page navigation.
 *
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  WHY THIS IS OPT-IN AND CONSERVATIVE                                   ║
 * ╠═══════════════════════════════════════════════════════════════════════╣
 * ║                                                                        ║
 * ║  OLX aggressively anti-bots on detail pages:                           ║
 * ║  - Anonymous navigation → /gz/account-verification challenge           ║
 * ║  - HTTP curl → Cloudflare 5K-byte "blocked_why_detail" page            ║
 * ║  - Requires an ACTIVE logged-in session to resolve the real HTML       ║
 * ║                                                                        ║
 * ║  Each detail navigation consumes session budget and can burn the       ║
 * ║  session. Therefore this module:                                       ║
 * ║                                                                        ║
 * ║    1. Runs ONLY when process.env.OLX_ENRICH_PROFILE === 'true'         ║
 * ║    2. Runs ONLY on OLX site (the hook is registered in olx.config)     ║
 * ║    3. Runs ONLY on ads that already passed title+price+location        ║
 * ║    4. Hard-caps MAX_ENRICH_PER_RUN at 3 details per monitor execution  ║
 * ║    5. Short per-ad timeout (OLX_ENRICH_TIMEOUT_MS, default 10s)        ║
 * ║    6. Randomized inter-request delay to look human                     ║
 * ║    7. FULL failsafe: any error → ad returned WITHOUT enrichment        ║
 * ║    8. Reuses the SAME Playwright context that just loaded the listing  ║
 * ║       (no new browser, no extra session consumption)                   ║
 * ║                                                                        ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 *
 * Returns nothing; mutates ScrapedAd in place with `profileSignals` and
 * `confidence`. Never throws.
 */

import type { BrowserContext } from 'playwright';
import type { ScrapedAd } from '../../types/scraper';
import { logger } from '../../utils/logger';
import { parseOlxProfileText, type OlxProfileSignals } from './olx-profile-parser';
import { computeOlxConfidence } from './olx-confidence';

const DEFAULT_MAX_PER_RUN = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_INTER_DELAY_MIN_MS = 1500;
const DEFAULT_INTER_DELAY_MAX_MS = 3500;

export interface EnrichOptions {
  context: BrowserContext;
  ads: ScrapedAd[];
  monitorId: string;
}

function isEnabled(): boolean {
  return process.env.OLX_ENRICH_PROFILE === 'true';
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

/**
 * Enriches at most N OLX ads with profile signals and a confidence tier.
 * Opt-in, fail-safe. Mutates `ads` in place — callers must still treat
 * the ads as normally-scraped (enrichment is additive and optional).
 */
export async function enrichOlxAdsWithProfile(opts: EnrichOptions): Promise<void> {
  if (!isEnabled()) return;

  const { context, ads, monitorId } = opts;
  if (!ads || ads.length === 0) return;

  const cap = maxPerRun();
  const candidates = ads.slice(0, cap);
  const perTimeout = timeoutMs();
  const startedAt = Date.now();
  let enriched = 0;
  let failed = 0;

  logger.info(
    {
      monitorId,
      candidates: candidates.length,
      cap,
      timeoutMs: perTimeout,
    },
    'OLX_PROFILE_ENRICH_START',
  );

  for (let i = 0; i < candidates.length; i++) {
    const ad = candidates[i];
    if (i > 0) {
      // Human-ish pacing between detail pages within the same run.
      await new Promise((r) => setTimeout(r, randomInterDelayMs()));
    }

    try {
      const signals = await fetchProfileSignals(context, ad.url, perTimeout);
      if (!signals) {
        failed++;
        continue;
      }
      const confidence = computeOlxConfidence(signals);
      ad.profileSignals = signals;
      ad.confidence = confidence;
      enriched++;
      logger.info(
        {
          monitorId,
          externalId: ad.externalId,
          yearJoined: signals.yearJoined,
          lastSeen: signals.lastSeenRaw,
          verifCount:
            (signals.verifications.email ? 1 : 0) +
            (signals.verifications.phone ? 1 : 0) +
            (signals.verifications.facebook ? 1 : 0) +
            (signals.verifications.identity ? 1 : 0),
          tier: confidence.tier,
          reasons: confidence.reasons,
        },
        'OLX_PROFILE_ENRICH_OK',
      );
    } catch (error: any) {
      failed++;
      logger.warn(
        {
          monitorId,
          externalId: ad.externalId,
          error: String(error?.message || error).slice(0, 200),
        },
        'OLX_PROFILE_ENRICH_FAIL',
      );
      // Continue with next ad — never throw from here.
    }
  }

  logger.info(
    {
      monitorId,
      candidates: candidates.length,
      enriched,
      failed,
      durationMs: Date.now() - startedAt,
    },
    'OLX_PROFILE_ENRICH_END',
  );
}

/**
 * Navigates a fresh short-lived page to the OLX ad detail URL, extracts
 * the rendered innerText, and parses the stable signals. All errors are
 * caught and surfaced as `null` to the caller.
 */
async function fetchProfileSignals(
  context: BrowserContext,
  adUrl: string,
  timeoutMsVal: number,
): Promise<OlxProfileSignals | null> {
  const page = await context.newPage();
  try {
    // domcontentloaded is sufficient — we only need the rendered text of the
    // already-hydrated sections ("Informações verificadas", "Na OLX desde").
    const response = await page.goto(adUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMsVal,
    });

    if (!response) return null;

    // Detect anti-bot / challenge redirect. We bail out silently — no retry,
    // no escalation, no session burn.
    const finalUrl = page.url();
    if (/account-verification|desafio|challenge|blocked/i.test(finalUrl)) {
      return null;
    }

    // Cheap, resilient: use innerText of body instead of chasing fragile
    // CSS selectors. The parser works off rendered text.
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

import { ScrapedAd, MonitorWithFilters } from '../types/scraper';
import { MarketplaceEngine, toDiagnosisRecord } from '../engine/marketplace-engine';
import { ExtractionResult } from '../engine/types';
import { facebookConfig } from '../engine/configs/facebook.config';
import { slugify, extractKeywords } from '../engine/url-builder';

// Singleton engine instance
const engine = new MarketplaceEngine(facebookConfig);

/**
 * Scrapes Facebook Marketplace using the unified engine.
 *
 * For STRUCTURED_FILTERS monitors:
 *   1. Scrapes using the city-slug URL built by url-builder.
 *   2. Validates that the final URL (after redirects) still targets the city.
 *   3. If Facebook redirected away from the city slug, retries with a
 *      keyword-only fallback URL (location filter in ad-extractor handles the rest).
 *   4. If both attempts yield 0 valid ads, aborts with a clear error.
 *
 * URL_ONLY monitors are NOT affected by any of this logic.
 */
export async function scrapeFacebook(monitor: MonitorWithFilters): Promise<ScrapedAd[]> {
  const isStructured = monitor.mode === 'STRUCTURED_FILTERS';
  const citySlug = monitor.city ? slugify(monitor.city) : null;

  let result = await engine.scrape(monitor);

  // Log final URL after all redirects
  console.log(
    `FB_NAV_FINAL_URL: monitorId=${monitor.id} finalUrl=${result.diagnosis.finalUrl}`
  );

  // ── Location assertion (STRUCTURED_FILTERS only) ──────────────
  if (isStructured && citySlug && result.diagnosis.finalUrl) {
    const finalLower = result.diagnosis.finalUrl.toLowerCase();
    const expectedPath = `/marketplace/${citySlug}`;

    if (!finalLower.includes(expectedPath)) {
      console.warn(
        `FB_LOCATION_MISMATCH: monitorId=${monitor.id} ` +
        `expectedCitySlug=${citySlug} finalUrl=${result.diagnosis.finalUrl}`
      );

      // ── Fallback: keyword-only URL ──────────────────────────
      const keywords = extractKeywords(monitor);
      if (keywords) {
        const fallbackUrl =
          `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(keywords)}`;
        console.log(
          `FB_FALLBACK_URL: monitorId=${monitor.id} url=${fallbackUrl}`
        );

        (monitor as any).searchUrl = fallbackUrl;
        result = await engine.scrape(monitor);

        console.log(
          `FB_FALLBACK_RESULT: monitorId=${monitor.id} ` +
          `ads=${result.ads.length} raw=${result.metrics.adsRaw} ` +
          `finalUrl=${result.diagnosis.finalUrl}`
        );
      }
    }
  }

  // Store diagnosis from the LAST scrape attempt (original or fallback)
  (monitor as any).__lastDiagnosis = toDiagnosisRecord(
    result,
    facebookConfig.antiDetection.stealthLevel
  );

  // Log engine metrics
  logMetrics(result);

  // Auth errors → throw for circuit breaker
  if (result.ads.length === 0 && result.diagnosis.pageType === 'LOGIN_REQUIRED') {
    throw new Error('FB_LOGIN_REQUIRED: Facebook Marketplace requires authentication');
  }

  if (result.ads.length === 0 && result.diagnosis.pageType === 'CHECKPOINT') {
    throw new Error('FB_CHECKPOINT: Facebook account verification required');
  }

  return result.ads;
}

function logMetrics(result: ExtractionResult): void {
  const m = result.metrics;
  console.log(
    `FB_ENGINE: ads=${result.ads.length} raw=${m.adsRaw} auth=${m.authenticated}(${m.authSource}) ` +
      `selector=${m.selectorUsed || 'NONE'} scrolls=${m.scrollsDone} duration=${m.durationMs}ms ` +
      `pageType=${result.diagnosis.pageType} skipped=${JSON.stringify(m.skippedReasons)}`
  );
}

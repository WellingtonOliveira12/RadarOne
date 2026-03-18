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

  // Log final URL after all redirects + detailed diagnosis for debugging
  console.log(
    `FB_NAV_FINAL_URL: monitorId=${monitor.id} finalUrl=${result.diagnosis.finalUrl}`
  );
  console.log(
    `FB_DIAGNOSIS_DETAIL: monitorId=${monitor.id} pageType=${result.diagnosis.pageType} ` +
    `adsRaw=${result.metrics.adsRaw} adsValid=${result.metrics.adsValid} ` +
    `auth=${result.metrics.authenticated}(${result.metrics.authSource}) ` +
    `bodyLength=${result.diagnosis.bodyLength} ` +
    `skipped=${JSON.stringify(result.metrics.skippedReasons)}`
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

  // Log engine metrics + location samples for debugging
  logMetrics(result);

  // Log location samples (first 5 ads) for debugging extraction quality
  if (result.ads.length > 0) {
    const locationSamples = result.ads.slice(0, 5).map((ad) => ({
      title: ad.title?.substring(0, 40),
      location: ad.location || '(empty)',
    }));
    console.log(
      `FB_LOCATION_SAMPLES: monitorId=${monitor.id} mode=${monitor.mode || 'URL_ONLY'} ` +
      `city=${monitor.city || 'none'} samples=${JSON.stringify(locationSamples)}`
    );
  } else if (result.metrics.adsRaw > 0) {
    console.log(
      `FB_LOCATION_ALL_FILTERED: monitorId=${monitor.id} raw=${result.metrics.adsRaw} valid=0 ` +
      `mode=${monitor.mode || 'URL_ONLY'} city=${monitor.city || 'none'} ` +
      `skipped=${JSON.stringify(result.metrics.skippedReasons)}`
    );
  }

  // Auth errors → throw for circuit breaker
  // For LOGIN_REQUIRED, confirm with a second attempt before invalidating the session.
  // Facebook can occasionally show login-like elements on valid pages (transient state).
  if (result.ads.length === 0 && result.diagnosis.pageType === 'LOGIN_REQUIRED') {
    console.warn(
      `FB_LOGIN_REQUIRED_FIRST_ATTEMPT: monitorId=${monitor.id} ` +
      `finalUrl=${result.diagnosis.finalUrl} bodyLength=${result.diagnosis.bodyLength} ` +
      `signals=${JSON.stringify(result.diagnosis.signals)}`
    );

    // Confirmation attempt: re-scrape to rule out transient false positive
    console.log(`FB_LOGIN_CONFIRM_RETRY: monitorId=${monitor.id} retrying to confirm...`);
    const confirmResult = await engine.scrape(monitor);

    if (confirmResult.ads.length === 0 && confirmResult.diagnosis.pageType === 'LOGIN_REQUIRED') {
      console.error(
        `FB_LOGIN_REQUIRED_CONFIRMED: monitorId=${monitor.id} ` +
        `finalUrl=${confirmResult.diagnosis.finalUrl} — session is truly invalid`
      );
      // Update diagnosis to confirmation attempt
      (monitor as any).__lastDiagnosis = toDiagnosisRecord(
        confirmResult,
        facebookConfig.antiDetection.stealthLevel
      );
      throw new Error('FB_LOGIN_REQUIRED: Facebook Marketplace requires authentication (confirmed)');
    }

    // False positive — use the successful confirmation result
    console.log(
      `FB_LOGIN_FALSE_POSITIVE: monitorId=${monitor.id} ` +
      `confirmAds=${confirmResult.ads.length} confirmPageType=${confirmResult.diagnosis.pageType}`
    );
    (monitor as any).__lastDiagnosis = toDiagnosisRecord(
      confirmResult,
      facebookConfig.antiDetection.stealthLevel
    );
    logMetrics(confirmResult);
    return confirmResult.ads;
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

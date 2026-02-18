import { ScrapedAd, MonitorWithFilters } from '../types/scraper';
import { MarketplaceEngine, toDiagnosisRecord } from '../engine/marketplace-engine';
import { facebookConfig } from '../engine/configs/facebook.config';

// Singleton engine instance
const engine = new MarketplaceEngine(facebookConfig);

/**
 * Scrapes Facebook Marketplace using the unified engine.
 *
 * Requires valid cookies (cookies_required).
 * Uses adaptive scroll and aggressive anti-detection.
 */
export async function scrapeFacebook(monitor: MonitorWithFilters): Promise<ScrapedAd[]> {
  const result = await engine.scrape(monitor);

  // Store diagnosis on the monitor for later persistence
  (monitor as any).__lastDiagnosis = toDiagnosisRecord(
    result,
    facebookConfig.antiDetection.stealthLevel
  );

  // Log engine metrics
  const m = result.metrics;
  console.log(
    `FB_ENGINE: ads=${result.ads.length} raw=${m.adsRaw} auth=${m.authenticated}(${m.authSource}) ` +
      `selector=${m.selectorUsed || 'NONE'} scrolls=${m.scrollsDone} duration=${m.durationMs}ms ` +
      `pageType=${result.diagnosis.pageType} skipped=${JSON.stringify(m.skippedReasons)}`
  );

  // If 0 ads due to auth issues, throw for circuit breaker handling
  if (result.ads.length === 0 && result.diagnosis.pageType === 'LOGIN_REQUIRED') {
    throw new Error('FB_LOGIN_REQUIRED: Facebook Marketplace requires authentication');
  }

  if (result.ads.length === 0 && result.diagnosis.pageType === 'CHECKPOINT') {
    throw new Error('FB_CHECKPOINT: Facebook account verification required');
  }

  return result.ads;
}

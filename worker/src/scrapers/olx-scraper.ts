import { ScrapedAd, MonitorWithFilters } from '../types/scraper';
import { MarketplaceEngine, toDiagnosisRecord } from '../engine/marketplace-engine';
import { olxConfig } from '../engine/configs/olx.config';

// Singleton engine instance
const engine = new MarketplaceEngine(olxConfig);

/**
 * Executa scraping na OLX via MarketplaceEngine v2.
 *
 * SAME EXTERNAL SIGNATURE as before — zero regression.
 * Now with 5+ fallback selectors and structured diagnosis.
 */
export async function scrapeOLX(monitor: MonitorWithFilters): Promise<ScrapedAd[]> {
  const result = await engine.scrape(monitor);

  // Store diagnosis on the monitor for later persistence
  (monitor as any).__lastDiagnosis = toDiagnosisRecord(
    result,
    olxConfig.antiDetection.stealthLevel
  );

  // Log engine metrics with detailed diagnosis
  const m = result.metrics;
  console.log(
    `OLX_ENGINE: ads=${result.ads.length} raw=${m.adsRaw} ` +
      `selector=${m.selectorUsed || 'NONE'} scrolls=${m.scrollsDone} duration=${m.durationMs}ms ` +
      `pageType=${result.diagnosis.pageType}`
  );
  console.log(
    `OLX_DIAGNOSIS_DETAIL: monitorId=${monitor.id} pageType=${result.diagnosis.pageType} ` +
    `adsRaw=${m.adsRaw} adsValid=${m.adsValid} ` +
    `bodyLength=${result.diagnosis.bodyLength} finalUrl=${result.diagnosis.finalUrl} ` +
    `skipped=${JSON.stringify(m.skippedReasons)}`
  );

  // Warn if we got raw ads but all were filtered out (likely externalId extraction issue)
  if (m.adsRaw > 0 && result.ads.length === 0) {
    console.warn(
      `OLX_ALL_ADS_FILTERED: monitorId=${monitor.id} raw=${m.adsRaw} valid=0 ` +
      `skippedReasons=${JSON.stringify(m.skippedReasons)} — check externalIdExtractor or selectors`
    );
  }

  return result.ads;
}

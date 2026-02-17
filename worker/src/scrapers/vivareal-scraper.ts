import { ScrapedAd, MonitorWithFilters } from '../types/scraper';
import { MarketplaceEngine, toDiagnosisRecord } from '../engine/marketplace-engine';
import { vivaRealConfig } from '../engine/configs/vivareal.config';

// Singleton engine instance
const engine = new MarketplaceEngine(vivaRealConfig);

/**
 * Executa scraping no Viva Real via MarketplaceEngine v2.
 *
 * SAME EXTERNAL SIGNATURE as before — zero regression.
 * Now with fallback selectors and structured diagnosis.
 */
export async function scrapeVivaReal(monitor: MonitorWithFilters): Promise<ScrapedAd[]> {
  const result = await engine.scrape(monitor);

  // Store diagnosis on the monitor for later persistence
  (monitor as any).__lastDiagnosis = toDiagnosisRecord(
    result,
    vivaRealConfig.antiDetection.stealthLevel
  );

  // Log engine metrics
  const m = result.metrics;
  console.log(
    `VIVAREAL_ENGINE: ads=${result.ads.length} raw=${m.adsRaw} ` +
      `selector=${m.selectorUsed || 'NONE'} scrolls=${m.scrollsDone} duration=${m.durationMs}ms ` +
      `pageType=${result.diagnosis.pageType}`
  );

  return result.ads;
}

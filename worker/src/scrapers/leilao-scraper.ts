import { ScrapedAd, MonitorWithFilters } from '../types/scraper';
import { MarketplaceEngine, toDiagnosisRecord } from '../engine/marketplace-engine';
import { leilaoConfig } from '../engine/configs/leilao.config';

// Singleton engine instance
const engine = new MarketplaceEngine(leilaoConfig);

/**
 * Executa scraping em sites de leilão via MarketplaceEngine v2.
 *
 * SAME EXTERNAL SIGNATURE as before — zero regression.
 * Multi-platform: Superbid, VIP Leilões, Sodré Santoro, genérico.
 * Container selectors cobrem todas as plataformas com fallback progressivo.
 */
export async function scrapeLeilao(monitor: MonitorWithFilters): Promise<ScrapedAd[]> {
  const result = await engine.scrape(monitor);

  // Store diagnosis on the monitor for later persistence
  (monitor as any).__lastDiagnosis = toDiagnosisRecord(
    result,
    leilaoConfig.antiDetection.stealthLevel
  );

  // Log engine metrics
  const m = result.metrics;
  console.log(
    `LEILAO_ENGINE: ads=${result.ads.length} raw=${m.adsRaw} ` +
      `selector=${m.selectorUsed || 'NONE'} scrolls=${m.scrollsDone} duration=${m.durationMs}ms ` +
      `pageType=${result.diagnosis.pageType}`
  );

  return result.ads;
}

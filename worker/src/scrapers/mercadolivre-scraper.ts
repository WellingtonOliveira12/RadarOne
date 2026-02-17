import { ScrapedAd, MonitorWithFilters } from '../types/scraper';
import { MarketplaceEngine, toDiagnosisRecord } from '../engine/marketplace-engine';
import { mercadoLivreConfig } from '../engine/configs/mercadolivre.config';
import { siteSessionManager, detectAuthError } from '../utils/site-session-manager';

const SITE_ID = 'MERCADO_LIVRE' as const;

// Singleton engine instance
const engine = new MarketplaceEngine(mercadoLivreConfig);

/**
 * Executa scraping no Mercado Livre via MarketplaceEngine v2.
 *
 * SAME EXTERNAL SIGNATURE as before — zero regression.
 * Internally uses the unified engine with diagnosis, anti-detection, etc.
 */
export async function scrapeMercadoLivre(monitor: MonitorWithFilters): Promise<ScrapedAd[]> {
  // Check site session manager backoff
  const canUse = siteSessionManager.canUseSite(SITE_ID);
  if (!canUse.canUse) {
    throw new Error(
      `ML_SITE_BACKOFF: ${canUse.reason}. Tente novamente em ${canUse.backoffMinutes} minutos.`
    );
  }

  try {
    const result = await engine.scrape(monitor);

    // Store diagnosis on the monitor for later persistence by monitor-runner
    (monitor as any).__lastDiagnosis = toDiagnosisRecord(
      result,
      mercadoLivreConfig.antiDetection.stealthLevel
    );

    // Mark success
    siteSessionManager.markSuccess(SITE_ID);

    // Log engine metrics
    const m = result.metrics;
    console.log(
      `ML_ENGINE: ads=${result.ads.length} raw=${m.adsRaw} auth=${m.authenticated}(${m.authSource}) ` +
        `selector=${m.selectorUsed || 'NONE'} scrolls=${m.scrollsDone} duration=${m.durationMs}ms ` +
        `pageType=${result.diagnosis.pageType}`
    );

    // If engine returned 0 ads due to LOGIN_REQUIRED, throw auth error for circuit breaker
    if (
      result.ads.length === 0 &&
      result.diagnosis.pageType === 'LOGIN_REQUIRED'
    ) {
      throw new Error('ML_LOGIN_REQUIRED: Mercado Livre exigindo login para esta busca');
    }

    return result.ads;
  } catch (error: any) {
    // Detect auth error type and mark in session manager
    const authError = detectAuthError(error);
    siteSessionManager.markError(SITE_ID, authError.type, authError.reason);
    throw error;
  }
}

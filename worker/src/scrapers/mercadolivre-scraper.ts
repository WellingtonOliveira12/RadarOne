import { chromium, Browser, Page } from 'playwright';
import { ScrapedAd, MonitorWithFilters } from '../types/scraper';
import { rateLimiter } from '../utils/rate-limiter';
import { retry, retryPresets } from '../utils/retry-helper';
import { captchaSolver } from '../utils/captcha-solver';
import { randomUA } from '../utils/user-agents';
import { screenshotHelper } from '../utils/screenshot-helper';

/**
 * Mercado Livre Scraper - Implementação Real
 *
 * Extrai anúncios da página de busca do Mercado Livre
 * usando Playwright para navegação e scraping
 *
 * Features:
 * - Rate limiting automático (10 req/min)
 * - Retry com backoff exponencial
 * - Tratamento robusto de erros
 */

/**
 * Executa scraping no Mercado Livre com rate limiting e retry
 */
export async function scrapeMercadoLivre(monitor: MonitorWithFilters): Promise<ScrapedAd[]> {
  // Aplica rate limiting
  await rateLimiter.acquire('MERCADO_LIVRE');

  // Executa scraping com retry
  return retry(
    () => scrapeMercadoLivreInternal(monitor),
    retryPresets.scraping
  );
}

/**
 * Implementação interna do scraping (usada pelo retry)
 */
async function scrapeMercadoLivreInternal(monitor: MonitorWithFilters): Promise<ScrapedAd[]> {
  console.log(`🔍 Starting Mercado Livre scraper for: ${monitor.name}`);

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Launch browser
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: randomUA(),
      locale: 'pt-BR',
    });

    page = await context.newPage();

    // Navigate to search URL
    console.log(`📄 Navigating to: ${monitor.searchUrl}`);
    await page.goto(monitor.searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Detectar e resolver captcha (se presente)
    const hasCaptcha = await page.evaluate(() => {
      return !!(
        document.querySelector('.g-recaptcha') ||
        document.querySelector('#g-recaptcha') ||
        document.querySelector('[data-sitekey]')
      );
    });

    if (hasCaptcha) {
      console.log('🔐 Captcha detectado na página');

      if (captchaSolver.isEnabled()) {
        const result = await captchaSolver.autoSolve(page);

        if (result.success) {
          console.log('✅ Captcha resolvido com sucesso');
          await page.waitForTimeout(2000); // Aguarda form submit
        } else {
          console.warn(`⚠️  Captcha não resolvido: ${result.error}`);
          // Continua mesmo assim (pode funcionar sem captcha em algumas situações)
        }
      } else {
        console.warn('⚠️  Captcha detectado mas solver não configurado (CAPTCHA_SERVICE e CAPTCHA_API_KEY)');
      }
    }

    // Wait for results to load
    try {
      await page.waitForSelector('.ui-search-result__content', { timeout: 5000 });
    } catch (error) {
      console.log('⚠️  No results found or page structure changed');
      await browser.close();
      return [];
    }

    // Scroll to load more results
    await scrollPage(page);

    // Extract ads from page
    const ads = await extractAds(page, monitor);

    console.log(`✅ Extracted ${ads.length} ads from Mercado Livre`);

    await browser.close();
    return ads;
  } catch (error: any) {
    console.error(`❌ Error in Mercado Livre scraper: ${error.message}`);

    // Captura screenshot para debug
    if (page && screenshotHelper.isEnabled()) {
      try {
        await screenshotHelper.captureError(page, {
          monitorId: monitor.id,
          monitorName: monitor.name,
          site: 'MERCADO_LIVRE',
          errorMessage: error.message,
        });
      } catch (screenshotError) {
        console.error('Failed to capture error screenshot:', screenshotError);
      }
    }

    if (browser) {
      await browser.close();
    }

    throw error;
  }
}

/**
 * Scroll page to load more results
 */
async function scrollPage(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(1000);
  } catch (error) {
    console.log('⚠️  Could not scroll page');
  }
}

/**
 * Extract ads from the page
 */
async function extractAds(page: Page, monitor: MonitorWithFilters): Promise<ScrapedAd[]> {
  const rawAds = await page.$$eval('.ui-search-result', (elements) => {
    return elements.map((el) => {
      try {
        // Extract title
        const titleEl = el.querySelector('.ui-search-item__title');
        const title = titleEl?.textContent?.trim() || '';

        // Extract price
        const priceEl = el.querySelector('.andes-money-amount__fraction');
        const priceText = priceEl?.textContent?.trim() || '';
        const price = priceText ? parseFloat(priceText.replace(/\./g, '').replace(',', '.')) : 0;

        // Extract URL
        const linkEl = el.querySelector('a.ui-search-link');
        const url = linkEl?.getAttribute('href') || '';

        // Extract image
        const imageEl = el.querySelector('img');
        const imageUrl = imageEl?.getAttribute('src') || imageEl?.getAttribute('data-src') || '';

        // Extract location
        const locationEl = el.querySelector('.ui-search-item__location-label');
        const location = locationEl?.textContent?.trim() || '';

        // Extract external ID from URL
        let externalId = '';
        const urlMatch = url.match(/ML[A-Z]{1}\d+/);
        if (urlMatch) {
          externalId = urlMatch[0];
        }

        return {
          externalId,
          title,
          price,
          url,
          imageUrl,
          location,
        };
      } catch (error) {
        return null;
      }
    }).filter((ad) => ad !== null);
  });

  // Filter and validate ads
  const validAds: ScrapedAd[] = [];

  for (const rawAd of rawAds as any[]) {
    // Skip if no external ID or title
    if (!rawAd.externalId || !rawAd.title || !rawAd.url) {
      continue;
    }

    // Skip if price is 0 (invalid)
    if (rawAd.price === 0) {
      continue;
    }

    // Apply price filters
    if (monitor.priceMin && rawAd.price < monitor.priceMin) {
      continue;
    }

    if (monitor.priceMax && rawAd.price > monitor.priceMax) {
      continue;
    }

    // Make URL absolute if relative
    let absoluteUrl = rawAd.url;
    if (!absoluteUrl.startsWith('http')) {
      absoluteUrl = `https://www.mercadolivre.com.br${absoluteUrl}`;
    }

    validAds.push({
      externalId: rawAd.externalId,
      title: rawAd.title,
      price: rawAd.price,
      url: absoluteUrl,
      imageUrl: rawAd.imageUrl || undefined,
      location: rawAd.location || undefined,
    });
  }

  return validAds;
}

/**
 * Helper: Parse price from Brazilian format (ex: "2.350,00" -> 2350.00)
 */
function parseBrazilianPrice(priceText: string): number {
  try {
    // Remove "R$", spaces, and dots (thousands separator)
    // Replace comma with dot (decimal separator)
    const cleaned = priceText
      .replace(/R\$/g, '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.');

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  } catch (error) {
    return 0;
  }
}

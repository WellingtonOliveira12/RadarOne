import { chromium, Browser, Page } from 'playwright';
import { ScrapedAd, MonitorWithFilters } from '../types/scraper';
import { rateLimiter } from '../utils/rate-limiter';
import { retry, retryPresets } from '../utils/retry-helper';

/**
 * Zap Imóveis Scraper - Implementação Real
 *
 * Extrai anúncios de imóveis do portal Zap Imóveis
 * Suporta venda e locação
 *
 * Features:
 * - Rate limiting automático (8 req/min)
 * - Retry com backoff exponencial
 * - Tratamento robusto de erros
 */

/**
 * Executa scraping no Zap Imóveis com rate limiting e retry
 */
export async function scrapeZapImoveis(
  monitor: MonitorWithFilters
): Promise<ScrapedAd[]> {
  // Aplica rate limiting
  await rateLimiter.acquire('ZAP_IMOVEIS');

  // Executa scraping com retry
  return retry(() => scrapeZapImoveisInternal(monitor), retryPresets.scraping);
}

/**
 * Implementação interna do scraping (usada pelo retry)
 */
async function scrapeZapImoveisInternal(
  monitor: MonitorWithFilters
): Promise<ScrapedAd[]> {
  console.log(`🔍 Starting Zap Imóveis scraper for: ${monitor.name}`);

  let browser: Browser | null = null;

  try {
    // Launch browser
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'pt-BR',
    });

    const page = await context.newPage();

    // Navigate to search URL
    console.log(`📄 Navigating to: ${monitor.searchUrl}`);
    await page.goto(monitor.searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for results to load
    try {
      await page.waitForSelector('[data-position]', { timeout: 5000 });
    } catch (error) {
      console.log('⚠️  No results found or page structure changed');
      await browser.close();
      return [];
    }

    // Scroll to load more results
    await scrollPage(page);

    // Extract ads from page
    const ads = await extractAds(page, monitor);

    console.log(`✅ Extracted ${ads.length} ads from Zap Imóveis`);

    await browser.close();
    return ads;
  } catch (error: any) {
    console.error(`❌ Error in Zap Imóveis scraper: ${error.message}`);

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
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await page.waitForTimeout(1000);
    }
  } catch (error) {
    console.log('⚠️  Could not scroll page');
  }
}

/**
 * Extract ads from the page
 */
async function extractAds(
  page: Page,
  monitor: MonitorWithFilters
): Promise<ScrapedAd[]> {
  const rawAds = await page.$$eval('[data-position]', (elements) => {
    return elements
      .map((el) => {
        try {
          // Extract title
          const titleEl = el.querySelector('h2.card__address');
          const title = titleEl?.textContent?.trim() || '';

          // Extract price
          const priceEl = el.querySelector('.card__price');
          const priceText = priceEl?.textContent?.trim() || '';
          // Remove "R$" e converte (ex: "R$ 350.000" -> 350000)
          const price = priceText
            ? parseFloat(
                priceText
                  .replace('R$', '')
                  .replace(/\s/g, '')
                  .replace(/\./g, '')
                  .replace(',', '.')
              )
            : 0;

          // Extract URL
          const linkEl = el.querySelector('a.card__link');
          const href = linkEl?.getAttribute('href') || '';
          const url = href.startsWith('http')
            ? href
            : `https://www.zapimoveis.com.br${href}`;

          // Extract image
          const imageEl = el.querySelector('img');
          const imageUrl =
            imageEl?.getAttribute('src') ||
            imageEl?.getAttribute('data-src') ||
            '';

          // Extract location
          const locationEl = el.querySelector('.card__street');
          const location = locationEl?.textContent?.trim() || '';

          // Extract external ID from data-id attribute
          let externalId = '';
          const dataId = el.getAttribute('data-id');
          if (dataId) {
            externalId = `ZAP-${dataId}`;
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
      })
      .filter((ad) => ad !== null);
  });

  // Filter and validate ads
  const validAds: ScrapedAd[] = [];

  for (const rawAd of rawAds as any[]) {
    // Skip if no external ID or title
    if (!rawAd.externalId || !rawAd.title || !rawAd.url) {
      continue;
    }

    // Skip if price is 0
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

    validAds.push({
      externalId: rawAd.externalId,
      title: rawAd.title,
      price: rawAd.price,
      url: rawAd.url,
      imageUrl: rawAd.imageUrl || undefined,
      location: rawAd.location || undefined,
    });
  }

  return validAds;
}

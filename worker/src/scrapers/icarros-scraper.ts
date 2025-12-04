import { chromium, Browser, Page } from 'playwright';
import { ScrapedAd, MonitorWithFilters } from '../types/scraper';
import { rateLimiter } from '../utils/rate-limiter';
import { retry, retryPresets } from '../utils/retry-helper';

/**
 * iCarros Scraper - Implementação Real
 *
 * Extrai anúncios de veículos do portal iCarros
 * Suporta carros e motos
 *
 * Features:
 * - Rate limiting automático (12 req/min)
 * - Retry com backoff exponencial
 * - Tratamento robusto de erros
 */

/**
 * Executa scraping no iCarros com rate limiting e retry
 */
export async function scrapeIcarros(
  monitor: MonitorWithFilters
): Promise<ScrapedAd[]> {
  // Aplica rate limiting
  await rateLimiter.acquire('ICARROS');

  // Executa scraping com retry
  return retry(() => scrapeIcarrosInternal(monitor), retryPresets.scraping);
}

/**
 * Implementação interna do scraping (usada pelo retry)
 */
async function scrapeIcarrosInternal(
  monitor: MonitorWithFilters
): Promise<ScrapedAd[]> {
  console.log(`🔍 Starting iCarros scraper for: ${monitor.name}`);

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
      await page.waitForSelector('.ItemList__ItemWrap', { timeout: 5000 });
    } catch (error) {
      console.log('⚠️  No results found or page structure changed');
      await browser.close();
      return [];
    }

    // Scroll to load more results
    await scrollPage(page);

    // Extract ads from page
    const ads = await extractAds(page, monitor);

    console.log(`✅ Extracted ${ads.length} ads from iCarros`);

    await browser.close();
    return ads;
  } catch (error: any) {
    console.error(`❌ Error in iCarros scraper: ${error.message}`);

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
      await page.waitForTimeout(800);
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
  const rawAds = await page.$$eval('.ItemList__ItemWrap', (elements) => {
    return elements
      .map((el) => {
        try {
          // Extract title
          const titleEl = el.querySelector('.CardDescription__Title');
          const title = titleEl?.textContent?.trim() || '';

          // Extract price
          const priceEl = el.querySelector('.CardPrice__Value');
          const priceText = priceEl?.textContent?.trim() || '';
          // Remove "R$" e converte (ex: "R$ 52.900" -> 52900)
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
          const linkEl = el.querySelector('a');
          const href = linkEl?.getAttribute('href') || '';
          const url = href.startsWith('http')
            ? href
            : `https://www.icarros.com.br${href}`;

          // Extract image
          const imageEl = el.querySelector('img');
          const imageUrl =
            imageEl?.getAttribute('src') ||
            imageEl?.getAttribute('data-src') ||
            '';

          // Extract location
          const locationEl = el.querySelector('.CardLocation');
          const location = locationEl?.textContent?.trim() || '';

          // Extract external ID from URL
          let externalId = '';
          const urlMatch = url.match(/\/(\d+)\.html/);
          if (urlMatch) {
            externalId = `IC-${urlMatch[1]}`;
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

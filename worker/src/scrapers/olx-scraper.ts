import { chromium, Browser, Page } from 'playwright';
import { ScrapedAd, MonitorWithFilters } from '../types/scraper';
import { rateLimiter } from '../utils/rate-limiter';
import { retry, retryPresets } from '../utils/retry-helper';

/**
 * OLX Scraper - Implementação Real
 *
 * Extrai anúncios da página de busca da OLX
 * Suporta carros, motos, imóveis, etc
 *
 * Features:
 * - Rate limiting automático (15 req/min)
 * - Retry com backoff exponencial
 * - Tratamento robusto de erros
 */

/**
 * Executa scraping na OLX com rate limiting e retry
 */
export async function scrapeOLX(monitor: MonitorWithFilters): Promise<ScrapedAd[]> {
  // Aplica rate limiting
  await rateLimiter.acquire('OLX');

  // Executa scraping com retry
  return retry(() => scrapeOLXInternal(monitor), retryPresets.scraping);
}

/**
 * Implementação interna do scraping (usada pelo retry)
 */
async function scrapeOLXInternal(monitor: MonitorWithFilters): Promise<ScrapedAd[]> {
  console.log(`🔍 Starting OLX scraper for: ${monitor.name}`);

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
      await page.waitForSelector('[data-ds-component="DS-AdCard"]', {
        timeout: 5000,
      });
    } catch (error) {
      console.log('⚠️  No results found or page structure changed');
      await browser.close();
      return [];
    }

    // Scroll to load more results
    await scrollPage(page);

    // Extract ads from page
    const ads = await extractAds(page, monitor);

    console.log(`✅ Extracted ${ads.length} ads from OLX`);

    await browser.close();
    return ads;
  } catch (error: any) {
    console.error(`❌ Error in OLX scraper: ${error.message}`);

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

    // Scroll mais um pouco
    await page.evaluate(() => {
      window.scrollTo(0, (document.body.scrollHeight * 3) / 4);
    });
    await page.waitForTimeout(1000);
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
  const rawAds = await page.$$eval('[data-ds-component="DS-AdCard"]', (elements) => {
    return elements
      .map((el) => {
        try {
          // Extract title
          const titleEl = el.querySelector('h2');
          const title = titleEl?.textContent?.trim() || '';

          // Extract price
          const priceEl = el.querySelector('[data-ds-component="DS-Text"]');
          const priceText = priceEl?.textContent?.trim() || '';
          // Remove "R$" e converte (ex: "R$ 25.000" -> 25000)
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
            : `https://www.olx.com.br${href}`;

          // Extract image
          const imageEl = el.querySelector('img');
          const imageUrl =
            imageEl?.getAttribute('src') || imageEl?.getAttribute('data-src') || '';

          // Extract location
          const locationEl = el.querySelector('[data-testid="ad-location"]');
          const location = locationEl?.textContent?.trim() || '';

          // Extract external ID from URL
          let externalId = '';
          const urlMatch = url.match(/\/(\d+)$/);
          if (urlMatch) {
            externalId = `OLX-${urlMatch[1]}`;
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

    // Skip if price is 0 (pode ser válido na OLX - ex: "Troca")
    // Mas vamos manter validação de filtros

    // Apply price filters (se preço existir)
    if (rawAd.price > 0) {
      if (monitor.priceMin && rawAd.price < monitor.priceMin) {
        continue;
      }

      if (monitor.priceMax && rawAd.price > monitor.priceMax) {
        continue;
      }
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

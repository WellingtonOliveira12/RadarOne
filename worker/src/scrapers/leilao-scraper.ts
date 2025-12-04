import { chromium, Browser, Page } from 'playwright';
import { ScrapedAd, MonitorWithFilters } from '../types/scraper';
import { rateLimiter } from '../utils/rate-limiter';
import { retry, retryPresets } from '../utils/retry-helper';

/**
 * Leilão Scraper - Implementação Genérica
 *
 * Extrai anúncios de sites de leilão (múltiplas plataformas)
 * Detecta automaticamente estrutura de diferentes sites
 *
 * Suporta:
 * - Superbid
 * - VIP Leilões
 * - Sodré Santoro
 * - Outros sites de leilão
 *
 * Features:
 * - Rate limiting automático (5 req/min - mais conservador)
 * - Retry com backoff exponencial
 * - Detecção automática de estrutura HTML
 * - Tratamento robusto de erros
 */

/**
 * Executa scraping em site de leilão com rate limiting e retry
 */
export async function scrapeLeilao(
  monitor: MonitorWithFilters
): Promise<ScrapedAd[]> {
  // Aplica rate limiting
  await rateLimiter.acquire('LEILAO');

  // Executa scraping com retry
  return retry(() => scrapeLeilaoInternal(monitor), retryPresets.scraping);
}

/**
 * Implementação interna do scraping (usada pelo retry)
 */
async function scrapeLeilaoInternal(
  monitor: MonitorWithFilters
): Promise<ScrapedAd[]> {
  console.log(`🔍 Starting Leilão scraper for: ${monitor.name}`);

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

    // Wait a bit for JS to load
    await page.waitForTimeout(2000);

    // Detect site type and extract ads
    const ads = await detectAndExtract(page, monitor);

    console.log(`✅ Extracted ${ads.length} ads from Leilão site`);

    await browser.close();
    return ads;
  } catch (error: any) {
    console.error(`❌ Error in Leilão scraper: ${error.message}`);

    if (browser) {
      await browser.close();
    }

    throw error;
  }
}

/**
 * Detecta tipo de site e extrai anúncios
 */
async function detectAndExtract(
  page: Page,
  monitor: MonitorWithFilters
): Promise<ScrapedAd[]> {
  const url = monitor.searchUrl.toLowerCase();

  // Detecta plataforma baseado na URL
  if (url.includes('superbid')) {
    return extractSuperbid(page, monitor);
  } else if (url.includes('vipleiloes')) {
    return extractVIPLeiloes(page, monitor);
  } else if (url.includes('sodresantoro')) {
    return extractSodreSantoro(page, monitor);
  } else {
    // Fallback: tenta extrair de forma genérica
    return extractGeneric(page, monitor);
  }
}

/**
 * Extrai anúncios do Superbid
 */
async function extractSuperbid(
  page: Page,
  monitor: MonitorWithFilters
): Promise<ScrapedAd[]> {
  await scrollPage(page);

  const rawAds = await page.$$eval('.card-lot, .lot-card', (elements) => {
    return elements.map((el) => {
      try {
        const title = el.querySelector('.lot-title, h3, h4')?.textContent?.trim() || '';
        const priceText =
          el.querySelector('.price, .bid-value')?.textContent?.trim() || '';
        const price = parseFloat(
          priceText.replace(/[^\d,]/g, '').replace(',', '.')
        );
        const url = el.querySelector('a')?.getAttribute('href') || '';
        const imageUrl = el.querySelector('img')?.getAttribute('src') || '';
        const externalId = `SB-${url.split('/').pop() || Math.random()}`;

        return { externalId, title, price, url, imageUrl };
      } catch {
        return null;
      }
    }).filter((ad) => ad !== null);
  });

  return filterAndValidate(rawAds, monitor, 'https://www.superbid.net');
}

/**
 * Extrai anúncios do VIP Leilões
 */
async function extractVIPLeiloes(
  page: Page,
  monitor: MonitorWithFilters
): Promise<ScrapedAd[]> {
  await scrollPage(page);

  const rawAds = await page.$$eval('.item-lote, .lote', (elements) => {
    return elements.map((el) => {
      try {
        const title = el.querySelector('.titulo, h3')?.textContent?.trim() || '';
        const priceText = el.querySelector('.valor, .lance')?.textContent?.trim() || '';
        const price = parseFloat(
          priceText.replace(/[^\d,]/g, '').replace(',', '.')
        );
        const url = el.querySelector('a')?.getAttribute('href') || '';
        const imageUrl = el.querySelector('img')?.getAttribute('src') || '';
        const externalId = `VIP-${url.split('/').pop() || Math.random()}`;

        return { externalId, title, price, url, imageUrl };
      } catch {
        return null;
      }
    }).filter((ad) => ad !== null);
  });

  return filterAndValidate(rawAds, monitor, 'https://www.vipleiloes.com.br');
}

/**
 * Extrai anúncios do Sodré Santoro
 */
async function extractSodreSantoro(
  page: Page,
  monitor: MonitorWithFilters
): Promise<ScrapedAd[]> {
  await scrollPage(page);

  const rawAds = await page.$$eval('.lote-item', (elements) => {
    return elements.map((el) => {
      try {
        const title = el.querySelector('.descricao')?.textContent?.trim() || '';
        const priceText = el.querySelector('.lance-atual')?.textContent?.trim() || '';
        const price = parseFloat(
          priceText.replace(/[^\d,]/g, '').replace(',', '.')
        );
        const url = el.querySelector('a')?.getAttribute('href') || '';
        const imageUrl = el.querySelector('img')?.getAttribute('src') || '';
        const externalId = `SS-${url.split('/').pop() || Math.random()}`;

        return { externalId, title, price, url, imageUrl };
      } catch {
        return null;
      }
    }).filter((ad) => ad !== null);
  });

  return filterAndValidate(rawAds, monitor, 'https://www.sodresantoro.com.br');
}

/**
 * Extração genérica para sites não identificados
 */
async function extractGeneric(
  page: Page,
  monitor: MonitorWithFilters
): Promise<ScrapedAd[]> {
  await scrollPage(page);

  // Tenta múltiplos seletores comuns
  const selectors = [
    '.lot, .lote, .item',
    '[class*="lot"], [class*="lote"]',
    'article, .card',
  ];

  for (const selector of selectors) {
    try {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`✅ Found ${count} elements with selector: ${selector}`);

        const rawAds = await page.$$eval(selector, (elements) => {
          return elements.map((el, index) => {
            try {
              // Tenta encontrar título
              const title =
                el.querySelector('h1, h2, h3, h4, h5')?.textContent?.trim() ||
                el.querySelector('[class*="title"], [class*="titulo"]')
                  ?.textContent?.trim() ||
                '';

              // Tenta encontrar preço
              const priceEl = el.querySelector(
                '[class*="price"], [class*="valor"], [class*="lance"]'
              );
              const priceText = priceEl?.textContent?.trim() || '';
              const price = parseFloat(
                priceText.replace(/[^\d,]/g, '').replace(',', '.')
              );

              // Tenta encontrar URL
              const url = el.querySelector('a')?.getAttribute('href') || '';

              // Tenta encontrar imagem
              const imageUrl =
                el.querySelector('img')?.getAttribute('src') ||
                el.querySelector('img')?.getAttribute('data-src') ||
                '';

              const externalId = `LEI-${index}-${Date.now()}`;

              return { externalId, title, price, url, imageUrl };
            } catch {
              return null;
            }
          }).filter((ad) => ad !== null);
        });

        if (rawAds.length > 0) {
          return filterAndValidate(rawAds, monitor, '');
        }
      }
    } catch (error) {
      console.log(`⚠️  Selector ${selector} failed, trying next...`);
    }
  }

  console.log('⚠️  Could not find any valid elements on page');
  return [];
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
 * Filtra e valida anúncios extraídos
 */
function filterAndValidate(
  rawAds: any[],
  monitor: MonitorWithFilters,
  baseUrl: string
): ScrapedAd[] {
  const validAds: ScrapedAd[] = [];

  for (const rawAd of rawAds) {
    // Skip if no external ID or title
    if (!rawAd.externalId || !rawAd.title) {
      continue;
    }

    // Make URL absolute if needed
    let url = rawAd.url || '';
    if (url && !url.startsWith('http') && baseUrl) {
      url = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    }

    // Skip if no URL
    if (!url) {
      continue;
    }

    // Skip if price is invalid
    if (isNaN(rawAd.price) || rawAd.price <= 0) {
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
      url: url,
      imageUrl: rawAd.imageUrl || undefined,
      location: undefined,
    });
  }

  return validAds;
}

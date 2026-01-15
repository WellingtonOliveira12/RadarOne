import { chromium, Browser, Page } from 'playwright';
import { ScrapedAd, MonitorWithFilters } from '../types/scraper';
import { rateLimiter } from '../utils/rate-limiter';
import { retry, retryPresets } from '../utils/retry-helper';
import { captchaSolver } from '../utils/captcha-solver';
import { randomUA } from '../utils/user-agents';
import { screenshotHelper } from '../utils/screenshot-helper';
import * as fs from 'fs/promises';
import * as path from 'path';

// Diretório para evidências forenses
const FORENSIC_DIR = '/tmp/radarone-screenshots';

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
    const urlInicial = monitor.searchUrl;
    console.log(`📄 Navigating to: ${urlInicial}`);
    await page.goto(urlInicial, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // ========== PROBE RÁPIDO APÓS GOTO ==========
    const probeResult = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();
      const html = document.documentElement.innerHTML.toLowerCase();

      return {
        // Sinais de resultado
        hasResultContent: !!document.querySelector('.ui-search-result__content'),
        hasResultItem: !!document.querySelector('.ui-search-result'),
        hasSearchLayout: !!document.querySelector('.ui-search-layout'),

        // Sinais de "sem resultados"
        hasNoResults: bodyText.includes('não encontramos') ||
                      bodyText.includes('nao encontramos') ||
                      bodyText.includes('sem resultados') ||
                      bodyText.includes('no results'),

        // Sinais de challenge/anti-bot
        hasRecaptcha: !!document.querySelector('.g-recaptcha, #g-recaptcha, iframe[src*="recaptcha"]'),
        hasHcaptcha: !!document.querySelector('.h-captcha, iframe[src*="hcaptcha"]'),
        hasCloudflare: !!document.querySelector('#cf-wrapper, .cf-browser-verification, #challenge-running'),
        hasDatadome: !!document.querySelector('[data-datadome], iframe[src*="datadome"]'),

        // Sinais de texto suspeito
        textSignals: {
          verificando: bodyText.includes('verificando'),
          captcha: bodyText.includes('captcha'),
          blocked: bodyText.includes('blocked') || bodyText.includes('bloqueado'),
          denied: bodyText.includes('access denied') || bodyText.includes('acesso negado'),
          robot: bodyText.includes('robot') || bodyText.includes('robô'),
        }
      };
    });

    // Log do probe
    const probeBlockingSignal =
      probeResult.hasRecaptcha || probeResult.hasHcaptcha ||
      probeResult.hasCloudflare || probeResult.hasDatadome ||
      Object.values(probeResult.textSignals).some(v => v);

    if (probeBlockingSignal) {
      console.log(`ML_PROBE_WARNING blocking_detected hasRecaptcha=${probeResult.hasRecaptcha} hasCloudflare=${probeResult.hasCloudflare} hasDatadome=${probeResult.hasDatadome}`);
    }

    if (probeResult.hasNoResults) {
      console.log('ML_PROBE_INFO no_results_message_detected');
    }

    // Detectar e resolver captcha (se presente)
    const hasCaptcha = probeResult.hasRecaptcha || probeResult.hasHcaptcha;

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

    // Wait for results to load (timeout aumentado para 15s)
    try {
      await page.waitForSelector('.ui-search-result__content', { timeout: 15000 });
    } catch (selectorError) {
      // ========== DEBUG FORENSE COMPLETO ==========
      console.log('⚠️  ML_FORENSIC: Selector timeout - coletando evidências');

      try {
        // Garantir que diretório existe
        await fs.mkdir(FORENSIC_DIR, { recursive: true });

        const timestamp = Date.now();
        const safeMonitorId = monitor.id.replace(/[^a-zA-Z0-9-]/g, '');
        const baseName = `ml-${safeMonitorId}-${timestamp}`;

        // Coletar evidências
        const urlFinal = page.url();
        const title = await page.title();
        const bodySnippet = await page.evaluate(() =>
          document.body.innerText.slice(0, 1200).replace(/\n+/g, ' ').trim()
        );

        // Detectar captcha/bloqueio detalhado
        const forensicHints = await page.evaluate(() => {
          const bodyText = document.body.innerText.toLowerCase();

          // Strings suspeitas encontradas
          const suspiciousStrings = [
            'verificando', 'captcha', 'não sou um robô', 'nao sou um robo',
            'challenge', 'acesso negado', 'access denied', 'blocked',
            'security check', 'prove you are human', 'robot', 'bot detected',
            'cloudflare', 'ddos', 'rate limit', 'too many requests'
          ];

          const textSignals = suspiciousStrings.filter(s => bodyText.includes(s));

          return {
            hasRecaptcha: !!document.querySelector('.g-recaptcha, #g-recaptcha, iframe[src*="recaptcha"]'),
            hasHcaptcha: !!document.querySelector('.h-captcha, iframe[src*="hcaptcha"]'),
            hasCloudflare: !!document.querySelector('#cf-wrapper, .cf-browser-verification, #challenge-running'),
            hasDatadome: !!document.querySelector('[data-datadome], iframe[src*="datadome"]'),
            hasNoResultsMsg: bodyText.includes('não encontramos') || bodyText.includes('sem resultados'),
            textSignals,
          };
        });

        const isCaptchaBlocked =
          forensicHints.hasRecaptcha || forensicHints.hasHcaptcha ||
          forensicHints.hasCloudflare || forensicHints.hasDatadome ||
          forensicHints.textSignals.length > 0;

        // Paths para arquivos
        const screenshotPath = path.join(FORENSIC_DIR, `${baseName}.png`);
        const htmlPath = path.join(FORENSIC_DIR, `${baseName}.html`);

        // Salvar screenshot
        await page.screenshot({
          path: screenshotPath,
          fullPage: true,
          timeout: 10000,
        });

        // Salvar HTML completo
        const htmlContent = await page.content();
        await fs.writeFile(htmlPath, htmlContent, 'utf-8');

        // ===== LOGS FORENSES NO FORMATO ESPECIFICADO =====
        console.log(`ML_FORENSIC_FAIL reason=selector_timeout url_inicial=${urlInicial} url_final=${urlFinal} title="${title.slice(0, 80)}" captcha=${isCaptchaBlocked} screenshot=${screenshotPath} html=${htmlPath}`);

        console.log(`ML_FORENSIC_HINTS ${JSON.stringify(forensicHints)}`);

        console.log(`ML_FORENSIC_BODY_SNIPPET: ${bodySnippet.slice(0, 500)}...`);

      } catch (forensicError: any) {
        // Não deixar falha forense crashar o sistema
        console.error(`ML_FORENSIC_ERROR: Falha ao coletar evidências: ${forensicError.message}`);
      }
      // ========== FIM DEBUG FORENSE ==========

      return [];
    }

    // Scroll to load more results
    await scrollPage(page);

    // Extract ads from page
    const ads = await extractAds(page, monitor);

    console.log(`✅ Extracted ${ads.length} ads from Mercado Livre`);

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

    throw error;
  } finally {
    // Garantir fechamento do browser em qualquer cenário
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('ML_DEBUG: Erro ao fechar browser:', closeError);
      }
    }
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

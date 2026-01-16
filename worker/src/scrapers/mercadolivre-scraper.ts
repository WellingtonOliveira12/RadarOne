import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ScrapedAd, MonitorWithFilters } from '../types/scraper';
import { rateLimiter } from '../utils/rate-limiter';
import { retry, retryPresets } from '../utils/retry-helper';
import { captchaSolver } from '../utils/captcha-solver';
import { randomUA } from '../utils/user-agents';
import { screenshotHelper } from '../utils/screenshot-helper';
import {
  getMLAuthenticatedContext,
  diagnosePageState,
  MLAuthContextResult,
} from '../utils/ml-auth-provider';
import { siteSessionManager, detectAuthError } from '../utils/site-session-manager';
import * as fs from 'fs/promises';
import * as path from 'path';

// Site ID para autenticacao
const SITE_ID = 'MERCADO_LIVRE' as const;

// Diretório para evidências forenses
const FORENSIC_DIR = '/tmp/radarone-screenshots';

/**
 * ============================================================
 * SELETORES CSS - FALLBACK PROGRESSIVO
 * ============================================================
 * O Mercado Livre muda frequentemente o layout.
 * Mantemos múltiplos seletores ordenados por prioridade.
 */
const CONTAINER_SELECTORS = [
  // Layout 2024/2025 - Grid moderno
  'li.ui-search-layout__item',
  'div.ui-search-result__wrapper',
  '.ui-search-result__content',
  '.ui-search-result',
  // Layout alternativo - Cards
  '.ui-search-layout__item',
  '.andes-card.ui-search-result',
  // Layout mobile/responsivo
  '[class*="ui-search-result"]',
  '[class*="search-layout__item"]',
  // Fallback genérico
  '.shops__result-item',
  '.results-item',
  'article[class*="result"]',
];

const TITLE_SELECTORS = [
  '.ui-search-item__title',
  '.ui-search-item__group__element .ui-search-item__title',
  'h2.ui-search-item__title',
  '[class*="item__title"]',
  '.poly-box h2',
  '.poly-component__title',
];

const PRICE_SELECTORS = [
  '.andes-money-amount__fraction',
  '.ui-search-price__second-line .andes-money-amount__fraction',
  '[class*="price"] .andes-money-amount__fraction',
  '.price-tag-fraction',
  '[class*="money-amount__fraction"]',
];

const LINK_SELECTORS = [
  'a.ui-search-link',
  'a.ui-search-item__group__element',
  'a.ui-search-result__content',
  'a[href*="/MLB"]',
  'a[href*="mercadolivre.com.br/"]',
];

const LOCATION_SELECTORS = [
  '.ui-search-item__location-label',
  '.ui-search-item__group__element--location',
  '[class*="location"]',
  '.ui-search-item__location',
];

/**
 * Timeouts progressivos em milissegundos
 */
const PROGRESSIVE_TIMEOUTS = [5000, 10000, 20000];

/**
 * ============================================================
 * FUNÇÕES UTILITÁRIAS
 * ============================================================
 */

/**
 * Tenta encontrar elemento usando lista de seletores com fallback
 */
async function findWithFallback(
  page: Page,
  selectors: string[],
  description: string
): Promise<{ selector: string | null; count: number }> {
  for (const selector of selectors) {
    try {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`ML_SELECTOR_FOUND: ${description} usando "${selector}" (${count} elementos)`);
        return { selector, count };
      }
    } catch (e) {
      // Ignora erro e tenta próximo seletor
    }
  }
  return { selector: null, count: 0 };
}

/**
 * Aguarda container com timeout progressivo
 */
async function waitForContainerProgressive(page: Page): Promise<{
  success: boolean;
  selector: string | null;
  timeout: number;
  attempts: number;
}> {
  for (let i = 0; i < PROGRESSIVE_TIMEOUTS.length; i++) {
    const timeout = PROGRESSIVE_TIMEOUTS[i];
    console.log(`ML_WAIT_ATTEMPT: ${i + 1}/${PROGRESSIVE_TIMEOUTS.length} timeout=${timeout}ms`);

    for (const selector of CONTAINER_SELECTORS) {
      try {
        await page.waitForSelector(selector, { timeout, state: 'attached' });
        const count = await page.locator(selector).count();
        if (count > 0) {
          console.log(`ML_WAIT_SUCCESS: selector="${selector}" count=${count} timeout=${timeout}ms`);
          return { success: true, selector, timeout, attempts: i + 1 };
        }
      } catch (e) {
        // Continua para próximo seletor
      }
    }

    // Se não é o último timeout, espera um pouco antes de tentar novamente
    if (i < PROGRESSIVE_TIMEOUTS.length - 1) {
      console.log(`ML_WAIT_RETRY: Aguardando 1s antes da próxima tentativa...`);
      await page.waitForTimeout(1000);
    }
  }

  return { success: false, selector: null, timeout: PROGRESSIVE_TIMEOUTS[PROGRESSIVE_TIMEOUTS.length - 1], attempts: PROGRESSIVE_TIMEOUTS.length };
}

/**
 * ============================================================
 * DIAGNÓSTICO FORENSE
 * ============================================================
 */
interface ForensicResult {
  urlFinal: string;
  title: string;
  bodySnippet: string;
  screenshotPath: string | null;
  htmlPath: string | null;
  pageType: 'BLOCKED' | 'LOGIN_REQUIRED' | 'NO_RESULTS' | 'EMPTY' | 'ALTERNATIVE_LAYOUT' | 'UNKNOWN';
  signals: {
    hasRecaptcha: boolean;
    hasHcaptcha: boolean;
    hasCloudflare: boolean;
    hasDatadome: boolean;
    hasNoResultsMsg: boolean;
    hasEmptyBody: boolean;
    hasSuspiciousText: string[];
    hasAnyContent: boolean;
    visibleElementsCount: number;
    bodyLength: number;
    hasLoginRequired: boolean;
  };
}

async function collectForensicEvidence(
  page: Page,
  monitor: MonitorWithFilters,
  reason: string
): Promise<ForensicResult> {
  const timestamp = Date.now();
  const safeMonitorId = monitor.id.replace(/[^a-zA-Z0-9-]/g, '');
  const baseName = `ml-${safeMonitorId}-${timestamp}`;

  let screenshotPath: string | null = null;
  let htmlPath: string | null = null;

  try {
    await fs.mkdir(FORENSIC_DIR, { recursive: true });
  } catch (e) {
    console.log('ML_FORENSIC: Não foi possível criar diretório de evidências');
  }

  // Coleta informações básicas
  const urlFinal = page.url();
  let title = '';
  let bodySnippet = '';

  try {
    title = await page.title();
  } catch (e) {
    title = '[ERRO AO OBTER TITLE]';
  }

  // Coleta sinais de diagnóstico
  const signals = await page.evaluate(() => {
    const bodyText = document.body?.innerText?.toLowerCase() || '';
    const bodyLength = bodyText.length;

    // Strings suspeitas para detecção de bloqueio
    const suspiciousStrings = [
      'verificando', 'captcha', 'não sou um robô', 'nao sou um robo',
      'challenge', 'acesso negado', 'access denied', 'blocked',
      'security check', 'prove you are human', 'robot', 'bot detected',
      'cloudflare', 'ddos', 'rate limit', 'too many requests',
      'unusual traffic', 'suspicious activity', 'please wait',
      'checking your browser', 'just a moment',
      // Login required detection
      'para continuar, acesse sua conta', 'acesse sua conta',
      'faça login', 'faca login', 'entre na sua conta',
      'identifique-se', 'você precisa entrar', 'voce precisa entrar'
    ];

    const foundSuspicious = suspiciousStrings.filter(s => bodyText.includes(s));

    // Conta elementos visíveis na página
    const allElements = document.querySelectorAll('*');
    let visibleCount = 0;
    allElements.forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        visibleCount++;
      }
    });

    return {
      hasRecaptcha: !!document.querySelector('.g-recaptcha, #g-recaptcha, iframe[src*="recaptcha"]'),
      hasHcaptcha: !!document.querySelector('.h-captcha, iframe[src*="hcaptcha"]'),
      hasCloudflare: !!document.querySelector('#cf-wrapper, .cf-browser-verification, #challenge-running, #challenge-form'),
      hasDatadome: !!document.querySelector('[data-datadome], iframe[src*="datadome"]'),
      hasNoResultsMsg: bodyText.includes('não encontramos') ||
                       bodyText.includes('nao encontramos') ||
                       bodyText.includes('sem resultados') ||
                       bodyText.includes('no results') ||
                       bodyText.includes('nenhum resultado'),
      hasEmptyBody: bodyLength < 100,
      hasSuspiciousText: foundSuspicious,
      hasAnyContent: bodyLength > 500,
      visibleElementsCount: visibleCount,
      bodyLength,
      // Login required detection
      hasLoginRequired: bodyText.includes('para continuar, acesse sua conta') ||
                        bodyText.includes('acesse sua conta') ||
                        bodyText.includes('faça login') ||
                        bodyText.includes('faca login') ||
                        bodyText.includes('entre na sua conta') ||
                        bodyText.includes('identifique-se') ||
                        !!document.querySelector('form[action*="login"], input[name="user_id"], #login_user_id'),
    };
  });

  // Coleta body snippet
  try {
    bodySnippet = await page.evaluate(() => {
      return document.body?.innerText?.slice(0, 1000).replace(/\n+/g, ' ').trim() || '[BODY VAZIO]';
    });
  } catch (e) {
    bodySnippet = '[ERRO AO OBTER BODY]';
  }

  // Determina tipo de página
  let pageType: ForensicResult['pageType'] = 'UNKNOWN';

  // Login required tem prioridade - é um problema específico
  if (signals.hasLoginRequired) {
    pageType = 'LOGIN_REQUIRED';
  } else if (signals.hasRecaptcha || signals.hasHcaptcha || signals.hasCloudflare || signals.hasDatadome || signals.hasSuspiciousText.length > 0) {
    pageType = 'BLOCKED';
  } else if (signals.hasNoResultsMsg) {
    pageType = 'NO_RESULTS';
  } else if (signals.hasEmptyBody || signals.bodyLength < 200) {
    pageType = 'EMPTY';
  } else if (signals.hasAnyContent && signals.visibleElementsCount > 50) {
    pageType = 'ALTERNATIVE_LAYOUT';
  }

  // Salva screenshot
  try {
    screenshotPath = path.join(FORENSIC_DIR, `${baseName}.png`);
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      timeout: 15000,
    });
    console.log(`ML_FORENSIC_SCREENSHOT: ${screenshotPath}`);
  } catch (e: any) {
    console.log(`ML_FORENSIC_SCREENSHOT_ERROR: ${e.message}`);
    screenshotPath = null;
  }

  // Salva HTML completo
  try {
    htmlPath = path.join(FORENSIC_DIR, `${baseName}.html`);
    const htmlContent = await page.content();
    await fs.writeFile(htmlPath, htmlContent, 'utf-8');
    console.log(`ML_FORENSIC_HTML: ${htmlPath}`);
  } catch (e: any) {
    console.log(`ML_FORENSIC_HTML_ERROR: ${e.message}`);
    htmlPath = null;
  }

  // Log forense completo
  console.log('═'.repeat(80));
  console.log(`ML_FORENSIC_REPORT`);
  console.log('═'.repeat(80));
  console.log(`REASON:          ${reason}`);
  console.log(`URL_FINAL:       ${urlFinal}`);
  console.log(`TITLE:           ${title}`);
  console.log(`PAGE_TYPE:       ${pageType}`);
  console.log(`BODY_LENGTH:     ${signals.bodyLength} chars`);
  console.log(`VISIBLE_ELEMENTS: ${signals.visibleElementsCount}`);
  console.log(`HAS_RECAPTCHA:   ${signals.hasRecaptcha}`);
  console.log(`HAS_HCAPTCHA:    ${signals.hasHcaptcha}`);
  console.log(`HAS_CLOUDFLARE:  ${signals.hasCloudflare}`);
  console.log(`HAS_DATADOME:    ${signals.hasDatadome}`);
  console.log(`HAS_LOGIN_REQ:   ${signals.hasLoginRequired}`);
  console.log(`NO_RESULTS_MSG:  ${signals.hasNoResultsMsg}`);
  console.log(`SUSPICIOUS_TEXT: ${signals.hasSuspiciousText.length > 0 ? signals.hasSuspiciousText.join(', ') : 'none'}`);
  console.log(`SCREENSHOT:      ${screenshotPath || 'FAILED'}`);
  console.log(`HTML_FILE:       ${htmlPath || 'FAILED'}`);
  console.log('─'.repeat(80));
  console.log(`BODY_SNIPPET (primeiros 1000 chars):`);
  console.log(bodySnippet);
  console.log('═'.repeat(80));

  return {
    urlFinal,
    title,
    bodySnippet,
    screenshotPath,
    htmlPath,
    pageType,
    signals,
  };
}

/**
 * ============================================================
 * SCRAPER PRINCIPAL
 * ============================================================
 */

/**
 * Executa scraping no Mercado Livre com rate limiting e retry
 */
export async function scrapeMercadoLivre(monitor: MonitorWithFilters): Promise<ScrapedAd[]> {
  // Verifica se o site pode ser usado (nao esta em backoff)
  const canUse = siteSessionManager.canUseSite(SITE_ID);
  if (!canUse.canUse) {
    console.log(`ML_BACKOFF: Site em backoff por ${canUse.backoffMinutes} minutos. Razao: ${canUse.reason}`);
    throw new Error(`ML_SITE_BACKOFF: ${canUse.reason}. Tente novamente em ${canUse.backoffMinutes} minutos.`);
  }

  // Aplica rate limiting
  await rateLimiter.acquire('MERCADO_LIVRE');

  try {
    // Executa scraping com retry
    const result = await retry(
      () => scrapeMercadoLivreInternal(monitor),
      retryPresets.scraping
    );

    // Marca sucesso se conseguiu extrair algo
    siteSessionManager.markSuccess(SITE_ID);

    return result;
  } catch (error: any) {
    // Detecta tipo de erro e marca no session manager
    const authError = detectAuthError(error);
    siteSessionManager.markError(SITE_ID, authError.type, authError.reason);

    throw error;
  }
}

/**
 * Implementacao interna do scraping (usada pelo retry)
 */
async function scrapeMercadoLivreInternal(monitor: MonitorWithFilters): Promise<ScrapedAd[]> {
  console.log('='.repeat(80));
  console.log(`ML_SCRAPER_START: ${monitor.name}`);
  console.log(`Monitor ID: ${monitor.id}`);
  console.log('='.repeat(80));

  let authResult: MLAuthContextResult | null = null;

  try {
    // ========== OBTEM CONTEXTO VIA ML AUTH PROVIDER ==========
    // Usa o novo provider com cascata de prioridades:
    // A) Secret File (ML_STORAGE_STATE_PATH)
    // B) ENV base64 (ML_STORAGE_STATE_B64 ou SESSION_MERCADO_LIVRE)
    // C) Session Manager (se USE_SESSION_MANAGER=true)
    // D) Fallback anonimo

    authResult = await getMLAuthenticatedContext();
    const { context, page, authState } = authResult;

    const isAuthenticatedContext = authState.loaded;
    if (isAuthenticatedContext) {
      console.log(`ML_AUTH_OK: Usando sessao de ${authState.source}`);
    }

    // Navigate to search URL
    const urlInicial = monitor.searchUrl;
    console.log(`ML_NAVIGATE: ${urlInicial}`);

    const navigationStart = Date.now();
    await page.goto(urlInicial, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    console.log(`ML_NAVIGATION_TIME: ${Date.now() - navigationStart}ms`);

    // Aguarda um pouco para JavaScript renderizar
    await page.waitForTimeout(2000);

    // ========== DIAGNOSTICO DE PAGINA ==========
    const diagnostics = await diagnosePageState(page, urlInicial);

    // Probe adicional para resultados
    const probeResult = await page.evaluate(() => {
      const bodyText = document.body?.innerText?.toLowerCase() || '';

      return {
        hasNoResults: bodyText.includes('nao encontramos') ||
                      bodyText.includes('sem resultados') ||
                      bodyText.includes('no results'),
      };
    });

    // Se detectou pagina de login obrigatorio
    if (diagnostics.isLoginRequired) {
      console.log('ML_LOGIN_REQUIRED: Mercado Livre exigindo login para esta busca');

      // Verifica se estava usando sessao autenticada
      if (isAuthenticatedContext) {
        // Sessao expirou
        console.log('ML_AUTH_EXPIRED: Sessao autenticada expirou');
        await collectForensicEvidence(page, monitor, 'AUTH_SESSION_EXPIRED');
        throw new Error(
          'ML_AUTH_SESSION_EXPIRED: Sessao do Mercado Livre expirou. ' +
          'Gere uma nova sessao localmente com: npm run ml:login'
        );
      }

      // Nao tinha sessao - precisa configurar
      await collectForensicEvidence(page, monitor, 'LOGIN_REQUIRED_NO_SESSION');
      throw new Error(
        'ML_LOGIN_REQUIRED: Esta busca requer autenticacao no Mercado Livre. ' +
        'Configure uma sessao: npm run ml:login (local) e depois configure ML_STORAGE_STATE_B64 no Render.'
      );
    }

    // Se detectou challenge/captcha
    if (diagnostics.isChallengeDetected && !diagnostics.isContentPage) {
      console.log('ML_CHALLENGE_DETECTED: Pagina de bloqueio/captcha detectada');
      await collectForensicEvidence(page, monitor, 'CHALLENGE_DETECTED');
      throw new Error('ML_CHALLENGE: Pagina de captcha/bloqueio detectada');
    }

    // Se e pagina "sem resultados" legitima
    if (probeResult.hasNoResults && !diagnostics.signals.hasSearchResults) {
      console.log('ML_NO_RESULTS: Busca nao retornou resultados (pagina legitima)');
      await collectForensicEvidence(page, monitor, 'LEGITIMATE_NO_RESULTS');
      return []; // Retorno vazio legitimo
    }

    // Detectar e resolver captcha (se presente)
    const hasCaptcha = await page.evaluate(() => {
      return !!document.querySelector('.g-recaptcha, #g-recaptcha, iframe[src*="recaptcha"], .h-captcha, iframe[src*="hcaptcha"]');
    });

    if (hasCaptcha) {
      console.log('🔐 ML_CAPTCHA: Captcha detectado na página');

      if (captchaSolver.isEnabled()) {
        const result = await captchaSolver.autoSolve(page);

        if (result.success) {
          console.log('✅ ML_CAPTCHA_SOLVED: Captcha resolvido com sucesso');
          await page.waitForTimeout(3000);
        } else {
          console.warn(`⚠️  ML_CAPTCHA_FAILED: ${result.error}`);
          await collectForensicEvidence(page, monitor, 'CAPTCHA_SOLVE_FAILED');
          throw new Error(`ML_CAPTCHA_FAILED: ${result.error}`);
        }
      } else {
        console.warn('⚠️  ML_CAPTCHA_NO_SOLVER: Captcha detectado mas solver não configurado');
        await collectForensicEvidence(page, monitor, 'CAPTCHA_NO_SOLVER');
        throw new Error('ML_CAPTCHA_NO_SOLVER: Captcha detectado sem solver configurado');
      }
    }

    // ========== AGUARDA CONTAINER COM TIMEOUT PROGRESSIVO ==========
    const waitResult = await waitForContainerProgressive(page);

    if (!waitResult.success) {
      console.log('❌ ML_NO_CONTAINER: Nenhum container de resultados encontrado');

      // Tenta busca alternativa direta no HTML
      const alternativeSearch = await page.evaluate((selectors) => {
        const results: string[] = [];

        for (const sel of selectors) {
          try {
            const elements = document.querySelectorAll(sel);
            if (elements.length > 0) {
              results.push(`${sel}: ${elements.length}`);
            }
          } catch (e) {
            // Ignora
          }
        }

        // Busca por links de produto como último recurso
        const productLinks = document.querySelectorAll('a[href*="/MLB"], a[href*="produto.mercadolivre"]');
        if (productLinks.length > 0) {
          results.push(`product_links: ${productLinks.length}`);
        }

        return results;
      }, CONTAINER_SELECTORS);

      console.log(`ML_ALTERNATIVE_SEARCH: ${alternativeSearch.length > 0 ? alternativeSearch.join(', ') : 'NENHUM'}`);

      // Coleta evidência forense
      await collectForensicEvidence(page, monitor, 'CONTAINER_NOT_FOUND');

      throw new Error(`ML_CONTAINER_NOT_FOUND: Nenhum seletor funcionou após ${waitResult.attempts} tentativas`);
    }

    // Scroll para carregar mais resultados
    await scrollPage(page);

    // ========== EXTRAÇÃO DE ANÚNCIOS ==========
    const ads = await extractAdsRobust(page, monitor, waitResult.selector!);

    if (ads.length === 0) {
      console.log('⚠️  ML_ZERO_ADS: Container encontrado mas extração retornou 0 anúncios');
      await collectForensicEvidence(page, monitor, 'EXTRACTION_ZERO_ADS');
      // Não lança erro, pode ser filtro de preço etc.
    }

    console.log('='.repeat(80));
    console.log(`ML_SCRAPER_SUCCESS: ${ads.length} anuncios extraidos`);
    if (isAuthenticatedContext) {
      console.log(`ML_AUTH_SUCCESS: Scraping com sessao autenticada funcionou (source=${authState.source})`);
    }
    console.log('='.repeat(80));

    return ads;
  } catch (error: any) {
    console.error(`ML_SCRAPER_ERROR: ${error.message}`);

    // Captura screenshot adicional em caso de erro
    if (authResult?.page && screenshotHelper.isEnabled()) {
      try {
        await screenshotHelper.captureError(authResult.page, {
          monitorId: monitor.id,
          monitorName: monitor.name,
          site: 'MERCADO_LIVRE',
          errorMessage: error.message,
        });
      } catch (screenshotError) {
        console.error('ML_SCREENSHOT_ERROR:', screenshotError);
      }
    }

    throw error;
  } finally {
    // Libera recursos via cleanup do auth provider
    if (authResult) {
      try {
        await authResult.cleanup();
      } catch (cleanupError) {
        console.error('ML_CLEANUP_ERROR:', cleanupError);
      }
    }
  }
}

/**
 * Scroll page to load more results
 */
async function scrollPage(page: Page): Promise<void> {
  try {
    // Scroll progressivo
    for (let i = 0; i < 3; i++) {
      await page.evaluate((step) => {
        const height = document.body.scrollHeight;
        window.scrollTo(0, (height / 3) * (step + 1));
      }, i);
      await page.waitForTimeout(500);
    }
    console.log('ML_SCROLL: Scroll completo');
  } catch (error) {
    console.log('⚠️  ML_SCROLL_ERROR: Não foi possível fazer scroll');
  }
}

/**
 * Extração robusta de anúncios com múltiplos seletores
 */
async function extractAdsRobust(
  page: Page,
  monitor: MonitorWithFilters,
  containerSelector: string
): Promise<ScrapedAd[]> {
  console.log(`ML_EXTRACT: Iniciando extração com container="${containerSelector}"`);

  // Primeiro, identifica quais seletores funcionam para cada campo
  const titleResult = await findWithFallback(page, TITLE_SELECTORS, 'TITLE');
  const priceResult = await findWithFallback(page, PRICE_SELECTORS, 'PRICE');
  const linkResult = await findWithFallback(page, LINK_SELECTORS, 'LINK');

  // Log dos seletores encontrados
  console.log(`ML_SELECTORS_FOUND: title=${titleResult.selector || 'NONE'} price=${priceResult.selector || 'NONE'} link=${linkResult.selector || 'NONE'}`);

  // Extrai dados usando os seletores encontrados
  const rawAds = await page.$$eval(
    containerSelector,
    (elements, selectors) => {
      const { titleSel, priceSel, linkSel, locationSels } = selectors;

      return elements.map((el) => {
        try {
          // Extract title
          let title = '';
          if (titleSel) {
            const titleEl = el.querySelector(titleSel);
            title = titleEl?.textContent?.trim() || '';
          }
          // Fallback para qualquer texto em h2/h3
          if (!title) {
            const h2 = el.querySelector('h2, h3');
            title = h2?.textContent?.trim() || '';
          }

          // Extract price
          let price = 0;
          if (priceSel) {
            const priceEl = el.querySelector(priceSel);
            const priceText = priceEl?.textContent?.trim() || '';
            price = priceText ? parseFloat(priceText.replace(/\./g, '').replace(',', '.')) : 0;
          }

          // Extract URL
          let url = '';
          if (linkSel) {
            const linkEl = el.querySelector(linkSel);
            url = linkEl?.getAttribute('href') || '';
          }
          // Fallback para qualquer link com MLB
          if (!url) {
            const anyLink = el.querySelector('a[href*="/MLB"], a[href*="mercadolivre"]');
            url = anyLink?.getAttribute('href') || '';
          }
          // Último fallback: primeiro link
          if (!url) {
            const firstLink = el.querySelector('a');
            url = firstLink?.getAttribute('href') || '';
          }

          // Extract image
          const imageEl = el.querySelector('img');
          const imageUrl = imageEl?.getAttribute('src') ||
                          imageEl?.getAttribute('data-src') ||
                          imageEl?.getAttribute('data-lazy') || '';

          // Extract location
          let location = '';
          for (const locSel of locationSels) {
            const locEl = el.querySelector(locSel);
            if (locEl?.textContent) {
              location = locEl.textContent.trim();
              break;
            }
          }

          // Extract external ID from URL
          // Formatos suportados:
          // - /MLB-1234567890 (com hifen)
          // - /MLB1234567890 (sem hifen)
          // - MLB-1234567890 em qualquer parte da URL
          let externalId = '';

          // Regex robusto para capturar ID do ML
          // Captura: MLB-123456789, MLB123456789, MLA-123, etc
          const idPatterns = [
            /\/ML[A-Z]-?(\d+)/i,           // /MLB-123 ou /MLB123
            /[?&]id=ML[A-Z]-?(\d+)/i,      // ?id=MLB-123
            /ML[A-Z]-?(\d+)/i,             // MLB-123 em qualquer lugar
          ];

          for (const pattern of idPatterns) {
            const match = url.match(pattern);
            if (match) {
              // Normaliza para formato MLB1234567890 (sem hifen)
              const fullMatch = match[0].replace(/\//g, '');
              externalId = fullMatch.replace(/-/g, '');
              break;
            }
          }

          // Fallback: tenta extrair qualquer sequencia numerica grande da URL
          if (!externalId) {
            const numericMatch = url.match(/(\d{8,})/);
            if (numericMatch) {
              externalId = `MLB${numericMatch[1]}`;
            }
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
    },
    {
      titleSel: titleResult.selector,
      priceSel: priceResult.selector,
      linkSel: linkResult.selector,
      locationSels: LOCATION_SELECTORS,
    }
  );

  console.log(`ML_EXTRACT_RAW: ${rawAds.length} elementos encontrados antes da validação`);

  // Log de amostra
  if (rawAds.length > 0) {
    const sample = rawAds[0] as any;
    console.log(`ML_EXTRACT_SAMPLE: title="${sample.title?.slice(0, 40) || 'EMPTY'}..." price=${sample.price} url=${sample.url?.slice(0, 50) || 'EMPTY'}...`);
  }

  // Filter and validate ads
  const validAds: ScrapedAd[] = [];
  let skippedNoId = 0;
  let skippedNoTitle = 0;
  let skippedNoUrl = 0;
  let skippedNoPrice = 0;
  let skippedPriceMin = 0;
  let skippedPriceMax = 0;

  for (const rawAd of rawAds as any[]) {
    // Skip if no external ID
    if (!rawAd.externalId) {
      skippedNoId++;
      continue;
    }

    // Skip if no title
    if (!rawAd.title) {
      skippedNoTitle++;
      continue;
    }

    // Skip if no URL
    if (!rawAd.url) {
      skippedNoUrl++;
      continue;
    }

    // Skip if price is 0 (invalid) - mas só se não for filtro específico
    if (rawAd.price === 0) {
      skippedNoPrice++;
      continue;
    }

    // Apply price filters
    if (monitor.priceMin && rawAd.price < monitor.priceMin) {
      skippedPriceMin++;
      continue;
    }

    if (monitor.priceMax && rawAd.price > monitor.priceMax) {
      skippedPriceMax++;
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

  // Log de validação
  console.log(`ML_VALIDATION: valid=${validAds.length} skipped_no_id=${skippedNoId} skipped_no_title=${skippedNoTitle} skipped_no_url=${skippedNoUrl} skipped_no_price=${skippedNoPrice} skipped_price_min=${skippedPriceMin} skipped_price_max=${skippedPriceMax}`);

  return validAds;
}

/**
 * Helper: Parse price from Brazilian format (ex: "2.350,00" -> 2350.00)
 */
function parseBrazilianPrice(priceText: string): number {
  try {
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

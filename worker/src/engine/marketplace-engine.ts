import { Page } from 'playwright';
import {
  SiteConfig,
  ExtractionResult,
  ExtractionMetrics,
  PageDiagnosis,
  DiagnosisRecord,
  MonitorWithFilters,
  AuthContextResult,
} from './types';
import { browserManager } from './browser-manager';
import { rateLimiter } from '../utils/rate-limiter';
import { retry, retryPresets, isAuthenticationError, isBrowserCrashError } from '../utils/retry-helper';
import { captchaSolver } from '../utils/captcha-solver';
import { diagnosePage, collectForensics } from './page-diagnoser';
import { waitForContainer } from './container-waiter';
import { extractAds } from './ad-extractor';
import { setupAntiDetection } from './anti-detection';
import { getAuthContext } from './auth-strategy';
import { scrollPage } from './scroller';
import { sessionPool } from './session-pool';

/** Applies ±15% jitter to a base delay to avoid bot-detectable patterns. */
function applyJitter(baseMs: number): number {
  const factor = 0.85 + Math.random() * 0.3; // [0.85, 1.15]
  return Math.round(baseMs * factor);
}

/**
 * MarketplaceEngine — universal scraper engine.
 *
 * GUARANTEES:
 * - NEVER returns without ExtractionResult.
 * - NEVER returns ads=[] without diagnosis.pageType explaining why.
 */
export class MarketplaceEngine {
  private config: SiteConfig;

  constructor(config: SiteConfig) {
    this.config = config;
  }

  /**
   * Main entry point: scrapes a monitor URL and returns structured results.
   */
  async scrape(monitor: MonitorWithFilters): Promise<ExtractionResult> {
    // 1. Validate searchUrl against supportedUrlPatterns
    if (this.config.supportedUrlPatterns && monitor.searchUrl) {
      const isValid = this.config.supportedUrlPatterns.some((p) =>
        p.test(monitor.searchUrl!)
      );
      if (!isValid) {
        return this.buildErrorResult(
          monitor,
          'UNKNOWN',
          `URL not supported for ${this.config.site}: ${monitor.searchUrl}`
        );
      }
    }

    // 2. Rate limiter
    await rateLimiter.acquire(this.config.site);

    // 3. Retry with error classification + crash recovery
    let crashRetries = 0;
    const MAX_CRASH_RETRIES = 2;

    const attempt = async (): Promise<ExtractionResult> => {
      try {
        return await retry(
          () => this.scrapeInternal(monitor),
          {
            ...retryPresets.scraping,
            onRetry: (error, attemptNum) => {
              if (isAuthenticationError(error)) {
                throw error;
              }
              // Don't retry CAPTCHA for sites without a solver — same IP = same result.
              // Retrying wastes 15+ seconds per attempt with no benefit.
              if (error.message?.includes('CAPTCHA') && !captchaSolver.isEnabled()) {
                console.warn(
                  `ENGINE_CAPTCHA_NO_RETRY: ${this.config.site} captcha detected, no solver configured — aborting retries`
                );
                throw error;
              }
              console.warn(
                `ENGINE_RETRY: ${this.config.site} attempt ${attemptNum}: ${error.message}`
              );
            },
          }
        );
      } catch (error: any) {
        // Browser crash: relaunch and retry immediately (no long backoff)
        if (isBrowserCrashError(error) && crashRetries < MAX_CRASH_RETRIES) {
          crashRetries++;
          console.warn(
            `ENGINE_CRASH_RECOVERY: ${this.config.site} crash detected (retry ${crashRetries}/${MAX_CRASH_RETRIES}): ${error.message}`
          );
          await browserManager.ensureAlive({ forceRelaunch: true });
          return attempt();
        }

        // Log observability on final failure
        const metrics = browserManager.getMetrics();
        console.error(
          `ENGINE_FAILED: ${this.config.site} rssMB=${metrics.rssMB} heapUsedMB=${metrics.heapUsedMB} ` +
            `connected=${metrics.connected} activeContexts=${metrics.activeContexts} ` +
            `crashDetected=${isBrowserCrashError(error)} crashRetries=${crashRetries}`
        );

        const pageType = isAuthenticationError(error) ? 'LOGIN_REQUIRED' : 'UNKNOWN';
        return this.buildErrorResult(monitor, pageType, error.message);
      }
    };

    return attempt();
  }

  /**
   * Internal scrape implementation.
   */
  private async scrapeInternal(
    monitor: MonitorWithFilters
  ): Promise<ExtractionResult> {
    const startTime = Date.now();
    let authResult: AuthContextResult | null = null;
    let scrollsDone = 0;

    // Acquire browser context slot (semaphore)
    const { browser, release } = await browserManager.acquireContext();

    try {
      // 1. Get auth context (pass browser so it doesn't call getOrLaunch)
      authResult = await getAuthContext(
        monitor.userId,
        this.config.site,
        this.config.domain,
        this.config.authMode,
        this.config.antiDetection,
        this.config.customAuthProvider,
        browser
      );

      const { context, page } = authResult;

      // 2. Setup anti-detection
      await setupAntiDetection(context, this.config.antiDetection);

      // 2.5 Set extra headers if configured (e.g. Referer for OLX)
      if (this.config.extraHeaders) {
        await page.setExtraHTTPHeaders(this.config.extraHeaders);
      }

      // 2.6 Warm-up navigation: visit a seed URL first to establish cookies/tokens
      //     before the real search URL. Mimics human browsing pattern.
      if (this.config.warmupUrl) {
        console.log(
          `WARMUP_START: ${this.config.site} monitorId=${monitor.id} url=${this.config.warmupUrl}`
        );
        try {
          // Use 'load' + networkidle to ensure ALL anti-bot scripts execute and set cookies
          await page.goto(this.config.warmupUrl, {
            waitUntil: 'load',
            timeout: this.config.navigationTimeout,
          });
          // Wait for networkidle — ensures all async scripts (reCAPTCHA, anti-bot) finish
          try {
            await page.waitForLoadState('networkidle', { timeout: 10000 });
          } catch { /* non-fatal if networkidle times out */ }
          // Realistic dwell time on homepage (human would browse for a few seconds)
          const warmupDelay = applyJitter(4000);
          await page.waitForTimeout(warmupDelay);

          // Log cookies established during warm-up
          const cookies = await context.cookies();
          const cookieDomains = [...new Set(cookies.map(c => c.domain))];
          console.log(
            `WARMUP_DONE: ${this.config.site} monitorId=${monitor.id} dwellMs=${warmupDelay} ` +
            `cookies=${cookies.length} domains=[${cookieDomains.join(',')}] ` +
            `finalUrl=${page.url()}`
          );
        } catch (error: any) {
          // Warm-up failure is non-fatal — continue to real URL
          console.warn(
            `WARMUP_FAILED: ${this.config.site} monitorId=${monitor.id} error=${error.message}`
          );
        }
      }

      // 3. Navigate to real search URL
      // For sites with warm-up (SPA like OLX), use 'load' to wait for full page render.
      // For other sites, use 'domcontentloaded' for speed.
      const navWaitUntil = this.config.warmupUrl ? 'load' as const : 'domcontentloaded' as const;
      await page.goto(monitor.searchUrl!, {
        waitUntil: navWaitUntil,
        timeout: this.config.navigationTimeout,
      });

      // For SPA sites: wait for network to settle (search API responses)
      if (this.config.warmupUrl) {
        try {
          await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch { /* non-fatal */ }
      }

      // 3.1 Log final URL after redirects (observability for all sites)
      const finalUrl = page.url();
      console.log(
        `NAV_FINAL_URL: ${this.config.site} requested=${monitor.searchUrl} final=${finalUrl}`
      );

      // 3.2 Early login redirect detection — abort immediately to save memory
      //     Facebook redirects to /login when session is invalid, and the login
      //     page is very heavy (can OOM on 512MB instances).
      if (this.isLoginRedirect(finalUrl)) {
        console.warn(
          `EARLY_LOGIN_DETECTED: ${this.config.site} redirected to login page, aborting immediately`
        );
        throw new Error(
          `LOGIN_REQUIRED: ${this.config.site} redirected to login (early detection)`
        );
      }

      // 4. Wait for render (with jitter to avoid bot detection)
      await page.waitForTimeout(applyJitter(this.config.renderDelay));
      if (this.config.renderWaitSelector) {
        try {
          await page.waitForSelector(this.config.renderWaitSelector, {
            timeout: this.config.timeouts[0] || 5000,
          });
        } catch {
          // Not fatal — continue with diagnosis
        }
      }

      // 5. Diagnose page
      const diagnosis = await diagnosePage(page, this.config, monitor.searchUrl!);

      console.log(
        `PAGE_DIAGNOSIS: ${this.config.site} monitorId=${monitor.id} ` +
        `pageType=${diagnosis.pageType} finalUrl=${diagnosis.finalUrl} ` +
        `bodyLength=${diagnosis.bodyLength} loginForm=${diagnosis.signals.hasLoginForm} ` +
        `loginText=${diagnosis.signals.hasLoginText} checkpoint=${diagnosis.signals.hasCheckpoint} ` +
        `visibleElements=${diagnosis.signals.visibleElements}`
      );

      // OLX deep diagnostic — probe real DOM state before container wait
      if (this.config.site === 'OLX') {
        await this.olxDeepDiagnostic(authResult.page, monitor.id);
      }

      // Handle non-content page types
      switch (diagnosis.pageType) {
        case 'LOGIN_REQUIRED':
          // Report to session pool if we have a session
          if (authResult.sessionId) {
            await sessionPool.reportResult(authResult.sessionId, 'LOGIN_REQUIRED');
          }
          throw new Error(
            `LOGIN_REQUIRED: ${this.config.site} requires authentication`
          );

        case 'CHECKPOINT':
          if (authResult.sessionId) {
            await sessionPool.reportResult(authResult.sessionId, 'CHECKPOINT');
          }
          throw new Error(
            `CHECKPOINT: ${this.config.site} account verification required`
          );

        case 'CAPTCHA':
          // Try to solve captcha
          if (captchaSolver.isEnabled()) {
            const captchaResult = await captchaSolver.autoSolve(page);
            if (captchaResult.success) {
              await page.waitForTimeout(3000);
              // Re-diagnose after solving
              const rediagnosis = await diagnosePage(page, this.config, monitor.searchUrl!);
              if (rediagnosis.pageType !== 'CONTENT' && rediagnosis.pageType !== 'NO_RESULTS') {
                throw new Error(`CAPTCHA_PERSISTS: Captcha solved but page still ${rediagnosis.pageType}`);
              }
              // Update diagnosis to the re-diagnosed state
              Object.assign(diagnosis, rediagnosis);
            } else {
              throw new Error(`CAPTCHA_FAILED: ${captchaResult.error}`);
            }
          } else {
            throw new Error('CAPTCHA_DETECTED: Captcha present but no solver configured');
          }
          break;

        case 'NO_RESULTS':
          return this.buildResult([], diagnosis, {
            durationMs: Date.now() - startTime,
            authenticated: authResult.authenticated,
            authSource: authResult.source,
            selectorUsed: null,
            adsRaw: 0,
            adsValid: 0,
            skippedReasons: {},
            scrollsDone: 0,
            retryAttempts: 0,
          });

        case 'BLOCKED':
          throw new Error(`BLOCKED: ${this.config.site} blocked the request`);

        case 'EMPTY':
          await collectForensics(page, diagnosis, monitor.id);
          return this.buildResult([], diagnosis, {
            durationMs: Date.now() - startTime,
            authenticated: authResult.authenticated,
            authSource: authResult.source,
            selectorUsed: null,
            adsRaw: 0,
            adsValid: 0,
            skippedReasons: {},
            scrollsDone: 0,
            retryAttempts: 0,
          });
      }

      // 6. Wait for container
      const containerResult = await waitForContainer(
        page,
        this.config.selectors.containers,
        this.config.timeouts
      );

      if (!containerResult.success) {
        diagnosis.pageType = 'UNKNOWN';
        const screenshotPath = await collectForensics(page, diagnosis, monitor.id);
        diagnosis.screenshotPath = screenshotPath;

        return this.buildResult([], diagnosis, {
          durationMs: Date.now() - startTime,
          authenticated: authResult.authenticated,
          authSource: authResult.source,
          selectorUsed: null,
          adsRaw: 0,
          adsValid: 0,
          skippedReasons: {},
          scrollsDone: 0,
          retryAttempts: 0,
        });
      }

      diagnosis.selectorUsed = containerResult.selector;

      // 7. Scroll
      scrollsDone = await scrollPage(page, this.config.scroll);

      // 8. Extract ads
      const extractionResult = await extractAds(
        page,
        containerResult.selector!,
        this.config,
        monitor
      );

      // 9. Report success to session pool
      if (authResult.sessionId) {
        await sessionPool.reportResult(authResult.sessionId, 'CONTENT');
      }

      // 10. Build result
      diagnosis.pageType = 'CONTENT';

      const metrics: ExtractionMetrics = {
        durationMs: Date.now() - startTime,
        authenticated: authResult.authenticated,
        authSource: authResult.source,
        selectorUsed: containerResult.selector,
        adsRaw: extractionResult.adsRaw,
        adsValid: extractionResult.ads.length,
        skippedReasons: extractionResult.skippedReasons,
        scrollsDone,
        retryAttempts: 0,
      };

      console.log(
        `ENGINE_SUCCESS: ${this.config.site} ads=${extractionResult.ads.length} raw=${extractionResult.adsRaw} auth=${authResult.authenticated} duration=${metrics.durationMs}ms`
      );

      return this.buildResult(extractionResult.ads, diagnosis, metrics);
    } finally {
      // Cleanup auth context
      if (authResult) {
        try {
          await authResult.cleanup();
        } catch (e) {
          console.error(`ENGINE_CLEANUP_ERROR: ${this.config.site}`, e);
        }
      }

      // Release browser semaphore slot (idempotent)
      release();

      // Log observability
      const m = browserManager.getMetrics();
      console.log(
        `ENGINE_METRICS: ${this.config.site} rssMB=${m.rssMB} heapUsedMB=${m.heapUsedMB} ` +
          `connected=${m.connected} activeContexts=${m.activeContexts} ` +
          `durationMs=${Date.now() - startTime}`
      );
    }
  }

  /**
   * OLX-specific deep diagnostic: probes the real DOM to understand
   * what the page looks like before container wait + extraction.
   * Logs element counts for ALL selectors, HTML snippet, anti-bot indicators.
   */
  private async olxDeepDiagnostic(page: Page, monitorId: string): Promise<void> {
    try {
      const diagnostic = await page.evaluate(() => {
        const body = document.body;
        const bodyText = body?.innerText || '';
        const bodyHTML = body?.innerHTML || '';

        // Anti-bot indicators
        const antiBotSignals = {
          hasAccessDenied: /access denied|acesso negado/i.test(bodyText),
          hasCaptcha: /captcha|verify you are human|verifique/i.test(bodyText),
          hasRetryMessage: /tente novamente|try again/i.test(bodyText),
          hasBlankPage: bodyText.trim().length < 100,
          htmlLength: bodyHTML.length,
          textLength: bodyText.length,
          title: document.title,
        };

        // Count elements for each known OLX selector
        const selectorCounts: Record<string, number> = {};
        const selectors = [
          '[data-ds-component="DS-AdCard"]',
          'li[data-ds-component="DS-AdCard"]',
          'section[data-ds-component="DS-AdCard"]',
          'a[data-lurker-detail]',
          'li[class*="sc-"] a[href*="/d/"]',
          '[class*="AdCard"]',
          '.olx-ad-card',
          '#ad-list li',
          'ul[class*="list"] > li',
          'section[class*="list"] a[href*="/d/"]',
          // Extra discovery selectors
          'a[href*="/d/"]',
          '#ad-list',
          '[id*="ad"]',
          '[class*="ad-list"]',
          '[class*="listing"]',
          'article',
          '[role="listitem"]',
          '[data-testid]',
        ];

        for (const sel of selectors) {
          try {
            selectorCounts[sel] = document.querySelectorAll(sel).length;
          } catch {
            selectorCounts[sel] = -1; // invalid selector
          }
        }

        // Capture HTML snippet around ad content (first 3000 chars of main content area)
        let htmlSnippet = '';
        const mainContent = document.querySelector('#ad-list, [class*="list"], main, [role="main"]');
        if (mainContent) {
          htmlSnippet = mainContent.innerHTML.substring(0, 3000);
        } else {
          // Fallback: body HTML after <header>
          const headerEnd = bodyHTML.indexOf('</header>');
          const start = headerEnd > 0 ? headerEnd + 9 : 0;
          htmlSnippet = bodyHTML.substring(start, start + 3000);
        }

        // Check for all <a> tags linking to /d/ (OLX ad detail pattern)
        const adLinks = document.querySelectorAll('a[href*="/d/"]');
        const adLinkSamples: string[] = [];
        for (let i = 0; i < Math.min(3, adLinks.length); i++) {
          const el = adLinks[i] as HTMLAnchorElement;
          adLinkSamples.push(`href=${el.href} text=${el.textContent?.trim().substring(0, 50)}`);
        }

        return { antiBotSignals, selectorCounts, htmlSnippet, adLinkCount: adLinks.length, adLinkSamples };
      });

      // Log anti-bot signals
      console.log(
        `OLX_DEEP_DIAGNOSTIC: monitorId=${monitorId} ` +
        `title="${diagnostic.antiBotSignals.title}" ` +
        `htmlLength=${diagnostic.antiBotSignals.htmlLength} ` +
        `textLength=${diagnostic.antiBotSignals.textLength} ` +
        `accessDenied=${diagnostic.antiBotSignals.hasAccessDenied} ` +
        `captcha=${diagnostic.antiBotSignals.hasCaptcha} ` +
        `retryMsg=${diagnostic.antiBotSignals.hasRetryMessage} ` +
        `blankPage=${diagnostic.antiBotSignals.hasBlankPage}`
      );

      // Log selector counts
      const selectorEntries = Object.entries(diagnostic.selectorCounts)
        .map(([sel, count]) => `${sel}=${count}`)
        .join(' | ');
      console.log(`OLX_SELECTOR_COUNTS: monitorId=${monitorId} ${selectorEntries}`);

      // Log ad links found
      console.log(
        `OLX_AD_LINKS: monitorId=${monitorId} count=${diagnostic.adLinkCount} ` +
        `samples=[${diagnostic.adLinkSamples.join(' ; ')}]`
      );

      // Log HTML snippet (truncated for log safety)
      const safeSnippet = diagnostic.htmlSnippet
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .substring(0, 1500);
      console.log(`OLX_HTML_SNIPPET: monitorId=${monitorId} ${safeSnippet}`);

      // Anti-bot alert
      if (diagnostic.antiBotSignals.hasAccessDenied || diagnostic.antiBotSignals.hasCaptcha) {
        console.warn(
          `OLX_ANTI_BOT_DETECTED: monitorId=${monitorId} ` +
          `reason=${diagnostic.antiBotSignals.hasAccessDenied ? 'ACCESS_DENIED' : 'CAPTCHA'}`
        );
      }
    } catch (error: any) {
      console.error(`OLX_DEEP_DIAGNOSTIC_ERROR: monitorId=${monitorId} error=${error.message}`);
    }
  }

  /**
   * Detects if the final URL is a login/auth redirect.
   * Used for early abort before the page fully loads (prevents OOM on heavy login pages).
   *
   * IMPORTANT: Must be precise to avoid false positives. Facebook may include
   * '/login' in intermediate redirects that resolve to valid pages.
   * We check the URL pathname (not query params or fragments) to reduce FPs.
   */
  private isLoginRedirect(url: string): boolean {
    let pathname: string;
    try {
      pathname = new URL(url).pathname.toLowerCase();
    } catch {
      return false;
    }

    const loginPathPatterns = [
      /^\/login(\/|\.php)?$/,        // /login, /login/, /login.php
      /^\/checkpoint(\/)?$/,          // /checkpoint, /checkpoint/
      /^\/accounts\/login(\/)?$/,     // /accounts/login
      /^\/signin(\/)?$/,              // /signin
      /^\/auth\/login(\/)?$/,         // /auth/login
    ];

    return loginPathPatterns.some((pattern) => pattern.test(pathname));
  }

  /**
   * Builds an ExtractionResult.
   */
  private buildResult(
    ads: import('../types/scraper').ScrapedAd[],
    diagnosis: PageDiagnosis,
    metrics: ExtractionMetrics
  ): ExtractionResult {
    return { ads, diagnosis, metrics };
  }

  /**
   * Builds an error ExtractionResult (used when scrape fails completely).
   */
  private buildErrorResult(
    monitor: MonitorWithFilters,
    pageType: PageDiagnosis['pageType'],
    errorMessage: string
  ): ExtractionResult {
    const diagnosis: PageDiagnosis = {
      pageType,
      url: monitor.searchUrl || '',
      finalUrl: '',
      title: '',
      bodyLength: 0,
      signals: {
        hasRecaptcha: false,
        hasHcaptcha: false,
        hasCloudflare: false,
        hasDatadome: false,
        hasLoginForm: false,
        hasLoginText: pageType === 'LOGIN_REQUIRED',
        hasNoResultsMsg: false,
        hasSearchResults: false,
        hasCheckpoint: pageType === 'CHECKPOINT',
        visibleElements: 0,
      },
      selectorUsed: null,
      screenshotPath: null,
    };

    const metrics: ExtractionMetrics = {
      durationMs: 0,
      authenticated: false,
      authSource: 'anonymous',
      selectorUsed: null,
      adsRaw: 0,
      adsValid: 0,
      skippedReasons: { error: 1 },
      scrollsDone: 0,
      retryAttempts: 0,
    };

    return { ads: [], diagnosis, metrics };
  }
}

/**
 * Converts an ExtractionResult to a DiagnosisRecord for persistence.
 */
export function toDiagnosisRecord(
  result: ExtractionResult,
  stealthLevel: string
): DiagnosisRecord {
  return {
    pageType: result.diagnosis.pageType,
    finalUrl: result.diagnosis.finalUrl,
    selectorUsed: result.metrics.selectorUsed,
    authenticated: result.metrics.authenticated,
    authSource: result.metrics.authSource,
    adsRaw: result.metrics.adsRaw,
    adsValid: result.metrics.adsValid,
    durationMs: result.metrics.durationMs,
    bodyLength: result.diagnosis.bodyLength,
    signals: {
      recaptcha: result.diagnosis.signals.hasRecaptcha,
      hcaptcha: result.diagnosis.signals.hasHcaptcha,
      cloudflare: result.diagnosis.signals.hasCloudflare,
      datadome: result.diagnosis.signals.hasDatadome,
      loginRequired: result.diagnosis.signals.hasLoginText || result.diagnosis.signals.hasLoginForm,
      checkpoint: result.diagnosis.signals.hasCheckpoint,
      noResults: result.diagnosis.signals.hasNoResultsMsg,
    },
    antiDetection: stealthLevel,
    skippedReasons: result.metrics.skippedReasons,
  };
}

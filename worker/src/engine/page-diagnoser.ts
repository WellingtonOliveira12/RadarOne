import { Page } from 'playwright';
import { PageDiagnosis, PageType, SiteConfig } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';

const FORENSIC_DIR = '/tmp/radarone-screenshots';

/**
 * Diagnoses the current page state.
 * Determines if the page has content, is blocked, requires login, etc.
 */
export async function diagnosePage(
  page: Page,
  config: SiteConfig,
  requestedUrl: string
): Promise<PageDiagnosis> {
  const finalUrl = page.url();
  let title = '';

  try {
    title = await page.title();
  } catch {
    title = '[ERROR]';
  }

  const signals = await page.evaluate(
    (params) => {
      const bodyText = document.body?.innerText?.toLowerCase() || '';
      const bodyLength = bodyText.length;
      const { noResultsPatterns, loginPatterns, checkpointPatterns } = params;

      // Count visible elements
      let visibleElements = 0;
      const allElements = document.querySelectorAll('*');
      allElements.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          visibleElements++;
        }
      });

      return {
        hasRecaptcha: !!(
          document.querySelector('.g-recaptcha, #g-recaptcha, iframe[src*="recaptcha"]')
        ),
        hasHcaptcha: !!(
          document.querySelector('.h-captcha, iframe[src*="hcaptcha"]')
        ),
        hasCloudflare: !!(
          document.querySelector(
            '#cf-wrapper, .cf-browser-verification, #challenge-running, #challenge-form'
          )
        ),
        hasDatadome: !!(
          document.querySelector('[data-datadome], iframe[src*="datadome"]')
        ),
        hasLoginForm: !!(
          document.querySelector(
            'form[action*="login"], input[name="user_id"], #login_user_id, input[type="password"]'
          )
        ),
        hasLoginText: loginPatterns.some((p: string) => bodyText.includes(p.toLowerCase())),
        hasNoResultsMsg: noResultsPatterns.some((p: string) => bodyText.includes(p.toLowerCase())),
        hasSearchResults: bodyLength > 5000,
        hasCheckpoint: (checkpointPatterns || []).some((p: string) =>
          bodyText.includes(p.toLowerCase())
        ),
        visibleElements,
        bodyLength,
      };
    },
    {
      noResultsPatterns: config.noResultsPatterns,
      loginPatterns: config.loginPatterns,
      checkpointPatterns: config.checkpointPatterns || [],
    }
  );

  // Determine page type
  const pageType = classifyPage(signals, finalUrl, config);

  return {
    pageType,
    url: requestedUrl,
    finalUrl,
    title,
    bodyLength: signals.bodyLength,
    signals: {
      hasRecaptcha: signals.hasRecaptcha,
      hasHcaptcha: signals.hasHcaptcha,
      hasCloudflare: signals.hasCloudflare,
      hasDatadome: signals.hasDatadome,
      hasLoginForm: signals.hasLoginForm,
      hasLoginText: signals.hasLoginText,
      hasNoResultsMsg: signals.hasNoResultsMsg,
      hasSearchResults: signals.hasSearchResults,
      hasCheckpoint: signals.hasCheckpoint,
      visibleElements: signals.visibleElements,
    },
    selectorUsed: null,
    screenshotPath: null,
  };
}

/**
 * Classifies the page type based on collected signals.
 */
function classifyPage(
  signals: {
    hasRecaptcha: boolean;
    hasHcaptcha: boolean;
    hasCloudflare: boolean;
    hasDatadome: boolean;
    hasLoginForm: boolean;
    hasLoginText: boolean;
    hasNoResultsMsg: boolean;
    hasSearchResults: boolean;
    hasCheckpoint: boolean;
    visibleElements: number;
    bodyLength: number;
  },
  finalUrl: string,
  config: SiteConfig
): PageType {
  // Checkpoint (Facebook account verification) - highest priority
  if (signals.hasCheckpoint) {
    return 'CHECKPOINT';
  }

  // Login required
  if (signals.hasLoginText || signals.hasLoginForm) {
    // Check if URL was redirected to login
    const loginUrlPatterns = ['/login', '/signin', '/account-verification'];
    const isLoginUrl = loginUrlPatterns.some((p) => finalUrl.includes(p));
    if (isLoginUrl || signals.hasLoginText) {
      return 'LOGIN_REQUIRED';
    }
  }

  // Captcha
  if (signals.hasRecaptcha || signals.hasHcaptcha) {
    return 'CAPTCHA';
  }

  // Blocked by WAF
  if (signals.hasCloudflare || signals.hasDatadome) {
    return 'BLOCKED';
  }

  // No results (legitimate)
  if (signals.hasNoResultsMsg) {
    return 'NO_RESULTS';
  }

  // Empty page
  if (signals.bodyLength < 200) {
    return 'EMPTY';
  }

  // Has content
  if (signals.hasSearchResults || signals.visibleElements > 50) {
    return 'CONTENT';
  }

  return 'UNKNOWN';
}

/**
 * Collects forensic evidence for debugging failed scrapes.
 * Saves screenshot and logs page state.
 */
export async function collectForensics(
  page: Page,
  diagnosis: PageDiagnosis,
  monitorId: string
): Promise<string | null> {
  let screenshotPath: string | null = null;
  const timestamp = Date.now();
  const safeName = monitorId.replace(/[^a-zA-Z0-9-]/g, '');

  try {
    await fs.mkdir(FORENSIC_DIR, { recursive: true });
    screenshotPath = path.join(FORENSIC_DIR, `engine-${safeName}-${timestamp}.png`);
    // Viewport-only screenshot to save memory (fullPage can OOM on long pages)
    await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 10000 });
  } catch {
    screenshotPath = null;
  }

  console.log(`ENGINE_DIAGNOSIS: pageType=${diagnosis.pageType} finalUrl=${diagnosis.finalUrl} bodyLength=${diagnosis.bodyLength} selector=${diagnosis.selectorUsed || 'NONE'}`);

  return screenshotPath;
}

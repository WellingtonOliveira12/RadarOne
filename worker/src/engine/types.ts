import { Page, BrowserContext, Browser } from 'playwright';
import { ScrapedAd, MonitorWithFilters } from '../types/scraper';

// ===============================================================
// AUTH
// ===============================================================

export type AuthMode = 'anonymous' | 'cookies_optional' | 'cookies_required';

export interface AuthContextResult {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  authenticated: boolean;
  source: 'database' | 'env' | 'secret_file' | 'session_manager' | 'anonymous';
  sessionId?: string;
  cleanup: () => Promise<void>;
}

/** Custom auth provider (e.g. ML with 5-priority cascade) */
export type CustomAuthProvider = (userId: string) => Promise<AuthContextResult>;

// ===============================================================
// SELECTORS
// ===============================================================

export interface SelectorSet {
  containers: string[];
  title: string[];
  price: string[];
  link: string[];
  location: string[];
  image: string[];
}

// ===============================================================
// PAGE DIAGNOSIS
// ===============================================================

export type PageType =
  | 'CONTENT'
  | 'BLOCKED'
  | 'CAPTCHA'
  | 'LOGIN_REQUIRED'
  | 'CHECKPOINT'
  | 'NO_RESULTS'
  | 'EMPTY'
  | 'UNKNOWN';

export interface PageDiagnosis {
  pageType: PageType;
  url: string;
  finalUrl: string;
  title: string;
  bodyLength: number;
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
  };
  selectorUsed: string | null;
  screenshotPath: string | null;
}

// ===============================================================
// ANTI-DETECTION
// ===============================================================

export type StealthLevel = 'minimal' | 'standard' | 'aggressive';

export interface AntiDetectionConfig {
  stealthLevel: StealthLevel;
  blockImages: boolean;
  blockFonts: boolean;
  blockCSS: boolean;
  blockMedia: boolean;
  injectStealthScripts: boolean;
  randomizeViewport: boolean;
}

// ===============================================================
// SCROLL
// ===============================================================

export type ScrollStrategy = 'fixed' | 'adaptive';

export interface ScrollConfig {
  strategy: ScrollStrategy;
  fixedSteps?: number;
  maxScrollAttempts?: number;
  stableThreshold?: number;
  delayBetweenScrollsMs?: number;
}

// ===============================================================
// EXTRACTION RESULT
// ===============================================================

export interface ExtractionResult {
  ads: ScrapedAd[];
  diagnosis: PageDiagnosis;
  metrics: ExtractionMetrics;
}

export interface ExtractionMetrics {
  durationMs: number;
  authenticated: boolean;
  authSource: string;
  selectorUsed: string | null;
  adsRaw: number;
  adsValid: number;
  skippedReasons: Record<string, number>;
  scrollsDone: number;
  retryAttempts: number;
}

// ===============================================================
// DIAGNOSIS RECORD (persisted in MonitorLog.diagnosis)
// ===============================================================

export interface DiagnosisRecord {
  pageType: PageType;
  finalUrl: string;
  selectorUsed: string | null;
  authenticated: boolean;
  authSource: string;
  adsRaw: number;
  adsValid: number;
  durationMs: number;
  bodyLength: number;
  signals: {
    recaptcha: boolean;
    hcaptcha: boolean;
    cloudflare: boolean;
    datadome: boolean;
    loginRequired: boolean;
    checkpoint: boolean;
    noResults: boolean;
  };
  antiDetection: string;
  skippedReasons: Record<string, number>;
}

// ===============================================================
// SITE CONFIG
// ===============================================================

export interface SiteConfig {
  site: string;
  domain: string;
  authMode: AuthMode;
  customAuthProvider?: CustomAuthProvider;
  selectors: SelectorSet;
  rateLimit: { tokensPerMin: number };
  timeouts: number[];
  navigationTimeout: number;
  renderDelay: number;
  renderWaitSelector?: string;
  scroll: ScrollConfig;
  antiDetection: AntiDetectionConfig;
  supportedUrlPatterns?: RegExp[];
  externalIdExtractor: (url: string) => string;
  priceParser: (text: string) => number;
  urlNormalizer: (url: string) => string;
  noResultsPatterns: string[];
  loginPatterns: string[];
  checkpointPatterns?: string[];
}

// Re-export scraper types for convenience
export type { ScrapedAd, MonitorWithFilters };

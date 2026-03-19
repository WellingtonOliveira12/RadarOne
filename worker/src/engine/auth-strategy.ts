import { Browser, BrowserContext, Page } from 'playwright';
import { AuthContextResult, AuthMode, CustomAuthProvider, AntiDetectionConfig } from './types';
import { randomUA } from '../utils/user-agents';
import { getRandomViewport } from './anti-detection';

/**
 * Generic auth strategy.
 * Tries to get an authenticated context for a user/site combination.
 *
 * Priority cascade:
 * 1. customAuthProvider (if defined in SiteConfig — e.g. ML)
 * 2. Database cookies (UserSession via userSessionService)
 * 3. Anonymous context (fallback)
 *
 * Observability: logs SESSION_POLICY_SELECTED, AUTHENTICATED_CONTEXT_USED,
 * ANONYMOUS_CONTEXT_USED, AUTH_FALLBACK_USED at each decision point.
 */
export async function getAuthContext(
  userId: string,
  site: string,
  domain: string,
  authMode: AuthMode,
  antiDetection: AntiDetectionConfig,
  customAuthProvider?: CustomAuthProvider,
  browser?: Browser
): Promise<AuthContextResult> {
  console.log(
    `SESSION_POLICY_SELECTED: site=${site} userId=${userId} authMode=${authMode} ` +
    `hasCustomProvider=${!!customAuthProvider}`
  );

  // 1. Custom auth provider (ML uses this for its 5-priority cascade)
  if (customAuthProvider) {
    try {
      const result = await customAuthProvider(userId);
      console.log(
        `AUTHENTICATED_CONTEXT_USED: site=${site} source=${result.source} ` +
        `authenticated=${result.authenticated} via=customAuthProvider`
      );
      return result;
    } catch (error: any) {
      console.error(`ENGINE_AUTH: customAuthProvider failed for ${site}: ${error.message}`);
      // If cookies_required, we must propagate the error
      if (authMode === 'cookies_required') {
        throw error;
      }
      // Otherwise fall through to try other methods
    }
  }

  // 2. Database cookies (UserSession)
  if (authMode !== 'anonymous') {
    try {
      const dbResult = await tryDatabaseAuth(userId, site, domain, antiDetection);
      if (dbResult) {
        console.log(
          `AUTHENTICATED_CONTEXT_USED: site=${site} source=database ` +
          `authenticated=true sessionId=${dbResult.sessionId} via=databaseAuth`
        );
        return dbResult;
      }
      console.log(`SESSION_NOT_FOUND_FOR_SITE: site=${site} userId=${userId} — no valid DB session`);
    } catch (error: any) {
      console.error(`ENGINE_AUTH: Database auth failed for ${site}: ${error.message}`);
      if (authMode === 'cookies_required') {
        throw new Error(
          `AUTH_SESSION_REQUIRED: Site ${site} requires authentication. Error: ${error.message}`
        );
      }
    }
  }

  // 3. Check if auth is required but we have none
  if (authMode === 'cookies_required') {
    throw new Error(
      `AUTH_SESSION_REQUIRED: Site ${site} requires authentication but no valid session found. ` +
        'Please connect your account.'
    );
  }

  // 4. Anonymous context (use provided browser if available)
  const isAuthFallback = authMode === 'cookies_optional';
  if (isAuthFallback) {
    console.log(
      `AUTH_FALLBACK_USED: site=${site} userId=${userId} ` +
      `reason=no_session_available falling_back_to=anonymous`
    );
  } else {
    console.log(`ANONYMOUS_CONTEXT_USED: site=${site} userId=${userId} authMode=${authMode}`);
  }
  return createAnonymousContext(antiDetection, browser);
}

/**
 * Tries to load auth context from the database (UserSession).
 */
async function tryDatabaseAuth(
  userId: string,
  site: string,
  domain: string,
  antiDetection: AntiDetectionConfig
): Promise<AuthContextResult | null> {
  // Dynamic import to avoid circular deps
  const { userSessionService } = await import('../services/user-session-service');

  const hasSession = await userSessionService.hasValidSession(userId, site);
  if (!hasSession) {
    return null;
  }

  const result = await userSessionService.getUserContext(userId, site);

  if (!result.success || !result.context || !result.browser) {
    if (result.needsUserAction) {
      throw new Error(
        `AUTH_NEEDS_REAUTH: Session for ${site} needs re-authentication. ${result.error || ''}`
      );
    }
    return null;
  }

  const page = await result.context.newPage();

  return {
    browser: result.browser,
    context: result.context,
    page,
    authenticated: true,
    source: 'database',
    sessionId: result.sessionId,
    cleanup: async () => {
      try { await page.close(); } catch {}
      await result.cleanup();
    },
  };
}

/**
 * Creates an anonymous (unauthenticated) browser context.
 * Receives browser via parameter from acquireContext (preferred)
 * or falls back to browserManager.getOrLaunch().
 */
async function createAnonymousContext(
  antiDetection: AntiDetectionConfig,
  browser?: Browser
): Promise<AuthContextResult> {
  const viewport = antiDetection.randomizeViewport
    ? getRandomViewport()
    : { width: 1920, height: 1080 };

  // Use provided browser (from acquireContext) or fall back to getOrLaunch
  const { browserManager } = await import('./browser-manager');
  const resolvedBrowser = browser ?? await browserManager.getOrLaunch();

  const context = await resolvedBrowser.newContext({
    userAgent: randomUA(),
    locale: 'pt-BR',
    viewport,
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  return {
    browser: resolvedBrowser,
    context,
    page,
    authenticated: false,
    source: 'anonymous',
    cleanup: async () => {
      try { await page.close(); } catch {}
      try { await context.close(); } catch {}
      // NOTE: Do NOT close browser — it's shared. Release is handled by acquireContext caller.
    },
  };
}

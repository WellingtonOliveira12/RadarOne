import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Integration tests: Facebook Marketplace is fully wired across the worker.
 *
 * These tests verify that FACEBOOK_MARKETPLACE is present in every
 * registry, config, and mapping that it needs to be, ensuring no
 * hardcoded ML fallback or missing paths.
 *
 * NOTE: These tests do NOT launch Playwright or hit the database.
 * They validate static config/registry consistency only.
 * We mock prisma and browser-manager to avoid requiring DATABASE_URL.
 */

// Mock heavy dependencies that require external services
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    userSession: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    subscription: { update: vi.fn() },
  },
  default: {},
}));

vi.mock('../../src/engine/browser-manager', () => ({
  browserManager: {
    getOrLaunch: vi.fn(),
    acquireContext: vi.fn(),
    getMetrics: vi.fn().mockReturnValue({ rssMB: 100, heapUsedMB: 50, connected: true, activeContexts: 0 }),
    shutdown: vi.fn(),
    ensureAlive: vi.fn(),
  },
}));

// ============================================================
// 1. SITE REGISTRY
// ============================================================

describe('Site Registry — Facebook Marketplace', () => {
  it('FACEBOOK_MARKETPLACE is registered in the engine site registry', async () => {
    const { getSiteConfig, getAllSites } = await import('../../src/engine/site-registry');

    const allSites = getAllSites();
    expect(allSites).toContain('FACEBOOK_MARKETPLACE');

    const config = getSiteConfig('FACEBOOK_MARKETPLACE');
    expect(config).not.toBeNull();
    expect(config!.site).toBe('FACEBOOK_MARKETPLACE');
    expect(config!.domain).toBe('facebook.com');
  });

  it('registry has all 9 sites (no missing entries)', async () => {
    const { getAllSites } = await import('../../src/engine/site-registry');
    const expected = [
      'MERCADO_LIVRE', 'OLX', 'FACEBOOK_MARKETPLACE',
      'IMOVELWEB', 'VIVA_REAL', 'ZAP_IMOVEIS',
      'WEBMOTORS', 'ICARROS', 'LEILAO',
    ];
    const allSites = getAllSites();
    for (const site of expected) {
      expect(allSites).toContain(site);
    }
  });
});

// ============================================================
// 2. FACEBOOK CONFIG VALIDATION
// ============================================================

describe('Facebook Config', () => {
  it('has cookies_required auth mode', async () => {
    const { facebookConfig } = await import('../../src/engine/configs/facebook.config');
    expect(facebookConfig.authMode).toBe('cookies_required');
  });

  it('does NOT have a customAuthProvider (uses generic DB auth)', async () => {
    const { facebookConfig } = await import('../../src/engine/configs/facebook.config');
    expect(facebookConfig.customAuthProvider).toBeUndefined();
  });

  it('has facebook.com as domain', async () => {
    const { facebookConfig } = await import('../../src/engine/configs/facebook.config');
    expect(facebookConfig.domain).toBe('facebook.com');
  });

  it('has valid container selectors', async () => {
    const { facebookConfig } = await import('../../src/engine/configs/facebook.config');
    expect(facebookConfig.selectors.containers.length).toBeGreaterThan(0);
    const hasMarketplaceSelector = facebookConfig.selectors.containers.some(
      (s) => s.includes('marketplace')
    );
    expect(hasMarketplaceSelector).toBe(true);
  });

  it('has login and checkpoint patterns', async () => {
    const { facebookConfig } = await import('../../src/engine/configs/facebook.config');
    expect(facebookConfig.loginPatterns.length).toBeGreaterThan(0);
    expect(facebookConfig.checkpointPatterns!.length).toBeGreaterThan(0);
  });

  it('has aggressive stealth level', async () => {
    const { facebookConfig } = await import('../../src/engine/configs/facebook.config');
    expect(facebookConfig.antiDetection.stealthLevel).toBe('aggressive');
  });
});

// ============================================================
// 3. ML CONFIG — NO REGRESSION
// ============================================================

describe('Mercado Livre Config — No Regression', () => {
  it('ML config is still registered and uses cookies_optional', async () => {
    const { getSiteConfig } = await import('../../src/engine/site-registry');
    const config = getSiteConfig('MERCADO_LIVRE');
    expect(config).not.toBeNull();
    expect(config!.authMode).toBe('cookies_optional');
    expect(config!.domain).toBe('mercadolivre.com.br');
  });

  it('ML has customAuthProvider (5-priority cascade)', async () => {
    const { getSiteConfig } = await import('../../src/engine/site-registry');
    const config = getSiteConfig('MERCADO_LIVRE');
    expect(config!.customAuthProvider).toBeDefined();
    expect(typeof config!.customAuthProvider).toBe('function');
  });
});

// ============================================================
// 4. AUTH SITES CONFIG
// ============================================================

describe('Auth Sites Config — Facebook Marketplace', () => {
  it('FACEBOOK_MARKETPLACE is in AUTH_SITES', async () => {
    const { AUTH_SITES, getSiteAuthConfig } = await import('../../src/config/auth-sites');
    expect(AUTH_SITES).toHaveProperty('FACEBOOK_MARKETPLACE');

    const config = getSiteAuthConfig('FACEBOOK_MARKETPLACE');
    expect(config).not.toBeNull();
    expect(config!.domain).toBe('facebook.com');
    expect(config!.loginUrl).toContain('facebook.com');
  });

  it('ML is still in AUTH_SITES (no regression)', async () => {
    const { getSiteAuthConfig } = await import('../../src/config/auth-sites');
    const config = getSiteAuthConfig('MERCADO_LIVRE');
    expect(config).not.toBeNull();
    expect(config!.domain).toBe('mercadolivre.com.br');
  });
});

// ============================================================
// 5. AUTH GATE — PER-SITE ENV VARS
// ============================================================

describe('Auth Gate — Facebook Marketplace', () => {
  it('auth gate has FB config with correct env var names', async () => {
    const { authGate } = await import('../../src/utils/auth-gate');
    const config = authGate.getConfig('FACEBOOK_MARKETPLACE');
    expect(config).toBeDefined();
    expect(config.envVarBase64).toBe('FB_STORAGE_STATE_B64');
    expect(config.envVarPath).toBe('FB_STORAGE_STATE_PATH');
  });

  it('auth gate has ML config (no regression)', async () => {
    const { authGate } = await import('../../src/utils/auth-gate');
    const config = authGate.getConfig('MERCADO_LIVRE');
    expect(config).toBeDefined();
    expect(config.envVarBase64).toBe('ML_STORAGE_STATE_B64');
  });
});

// ============================================================
// 6. USER SESSION SERVICE — SITE CONFIGS
// ============================================================

describe('User Session Service — Facebook Marketplace', () => {
  it('recognizes FACEBOOK_MARKETPLACE as requiresAuth', async () => {
    const { userSessionService } = await import('../../src/services/user-session-service');
    expect(userSessionService.siteRequiresAuth('FACEBOOK_MARKETPLACE')).toBe(true);
  });

  it('has correct domain config for Facebook', async () => {
    const { userSessionService } = await import('../../src/services/user-session-service');
    const config = userSessionService.getSiteConfig('FACEBOOK_MARKETPLACE');
    expect(config).not.toBeNull();
    expect(config!.domain).toBe('facebook.com');
    expect(config!.loginUrl).toContain('facebook.com');
  });

  it('ML is still requiresAuth (no regression)', async () => {
    const { userSessionService } = await import('../../src/services/user-session-service');
    expect(userSessionService.siteRequiresAuth('MERCADO_LIVRE')).toBe(true);
    const config = userSessionService.getSiteConfig('MERCADO_LIVRE');
    expect(config!.domain).toBe('mercadolivre.com.br');
  });

  it('OLX does NOT require auth', async () => {
    const { userSessionService } = await import('../../src/services/user-session-service');
    expect(userSessionService.siteRequiresAuth('OLX')).toBe(false);
  });
});

// ============================================================
// 7. NO HARDCODED ML FALLBACK IN FB FLOW
// ============================================================

describe('No hardcoded ML fallback in Facebook flow', () => {
  it('FB config domain is facebook.com, NOT mercadolivre', async () => {
    const { facebookConfig } = await import('../../src/engine/configs/facebook.config');
    expect(facebookConfig.domain).not.toContain('mercadolivre');
    expect(facebookConfig.domain).not.toContain('mercadolibre');
    expect(facebookConfig.domain).toBe('facebook.com');
  });

  it('FB login patterns do NOT reference mercadolivre', async () => {
    const { facebookConfig } = await import('../../src/engine/configs/facebook.config');
    for (const pattern of facebookConfig.loginPatterns) {
      expect(pattern.toLowerCase()).not.toContain('mercadolivre');
    }
  });

  it('FB URL normalizer produces facebook.com URLs', async () => {
    const { facebookConfig } = await import('../../src/engine/configs/facebook.config');
    const normalized = facebookConfig.urlNormalizer('/marketplace/item/123');
    expect(normalized).toContain('facebook.com');
    expect(normalized).not.toContain('mercadolivre');
  });
});

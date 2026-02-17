import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── isBrowserCrashError ─────────────────────────────────────

// We need to import isBrowserCrashError from retry-helper
import { isBrowserCrashError } from '../../src/utils/retry-helper';

describe('isBrowserCrashError', () => {
  const crashMessages = [
    'Target page, context or browser has been closed',
    'browser has been closed',
    'context has been closed',
    'Target closed',
    'Protocol error (Runtime.callFunctionOn): Session closed',
    'Browser disconnected',
  ];

  it.each(crashMessages)('detects crash pattern: "%s"', (msg) => {
    expect(isBrowserCrashError(new Error(msg))).toBe(true);
  });

  it('returns false for non-crash errors', () => {
    expect(isBrowserCrashError(new Error('net::ERR_CONNECTION_REFUSED'))).toBe(false);
    expect(isBrowserCrashError(new Error('Timeout 30000ms exceeded'))).toBe(false);
    expect(isBrowserCrashError(new Error('LOGIN_REQUIRED'))).toBe(false);
    expect(isBrowserCrashError(new Error(''))).toBe(false);
    expect(isBrowserCrashError(null)).toBe(false);
    expect(isBrowserCrashError(undefined)).toBe(false);
  });
});

// ─── BrowserManager semaphore & metrics ──────────────────────

// We mock chromium so tests don't launch a real browser
vi.mock('playwright', () => {
  const mockBrowser = {
    isConnected: vi.fn(() => true),
    close: vi.fn(async () => {}),
    on: vi.fn(),
    newContext: vi.fn(async () => ({
      newPage: vi.fn(async () => ({})),
      close: vi.fn(async () => {}),
    })),
  };

  return {
    chromium: {
      launch: vi.fn(async () => mockBrowser),
    },
  };
});

// Must import AFTER vi.mock
import { browserManager } from '../../src/engine/browser-manager';

describe('BrowserManager', () => {
  beforeEach(async () => {
    // Ensure clean state between tests
    try {
      await browserManager.shutdown();
    } catch {
      // ignore
    }
  });

  describe('acquireContext / release', () => {
    it('acquires and releases a context', async () => {
      const { browser, release } = await browserManager.acquireContext();

      expect(browser).toBeDefined();
      expect(browser.isConnected()).toBe(true);

      const metrics = browserManager.getMetrics();
      expect(metrics.activeContexts).toBe(1);

      release();
      const after = browserManager.getMetrics();
      expect(after.activeContexts).toBe(0);
    });

    it('release is idempotent', async () => {
      const { release } = await browserManager.acquireContext();

      const m1 = browserManager.getMetrics();
      expect(m1.activeContexts).toBe(1);

      release();
      release(); // second call should be a no-op
      release(); // third call should be a no-op

      const m2 = browserManager.getMetrics();
      expect(m2.activeContexts).toBe(0);
    });

    it('can acquire multiple contexts up to MAX_CONTEXTS', async () => {
      const handles = [];
      // Default MAX_CONTEXTS is 5
      for (let i = 0; i < 5; i++) {
        handles.push(await browserManager.acquireContext());
      }

      const metrics = browserManager.getMetrics();
      expect(metrics.activeContexts).toBe(5);

      // Release all
      for (const h of handles) {
        h.release();
      }

      const after = browserManager.getMetrics();
      expect(after.activeContexts).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('returns expected shape', async () => {
      const metrics = browserManager.getMetrics();

      expect(metrics).toHaveProperty('connected');
      expect(metrics).toHaveProperty('activeContexts');
      expect(metrics).toHaveProperty('pendingAcquires');
      expect(metrics).toHaveProperty('rssMB');
      expect(metrics).toHaveProperty('heapUsedMB');
      expect(typeof metrics.rssMB).toBe('number');
      expect(typeof metrics.heapUsedMB).toBe('number');
      expect(metrics.rssMB).toBeGreaterThan(0);
    });
  });

  describe('ensureAlive', () => {
    it('returns browser when connected', async () => {
      const browser = await browserManager.ensureAlive();
      expect(browser).toBeDefined();
      expect(browser.isConnected()).toBe(true);
    });

    it('relaunches when forceRelaunch is true', async () => {
      const browser1 = await browserManager.ensureAlive();
      const browser2 = await browserManager.ensureAlive({ forceRelaunch: true });
      // Both should be defined and connected
      expect(browser1).toBeDefined();
      expect(browser2).toBeDefined();
    });
  });
});

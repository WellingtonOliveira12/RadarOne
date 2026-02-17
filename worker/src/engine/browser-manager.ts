import { chromium, Browser } from 'playwright';

/**
 * BrowserManager v2 — singleton that maintains ONE Chromium browser per process.
 *
 * Features:
 * - Semaphore-based context acquisition (acquireContext/release)
 * - RSS memory thresholds (WARN / STOP / FORCE_RELAUNCH)
 * - Crash-aware ensureAlive with forceRelaunch
 * - Graceful shutdown awaiting active contexts
 * - No SIGTERM/SIGINT handlers (centralized in worker.ts)
 */

const MAX_CONTEXTS = parseInt(process.env.MAX_BROWSER_CONTEXTS || '5');
const ACQUIRE_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 30_000;
const RELAUNCH_WAIT_TIMEOUT_MS = 15_000;

// Memory thresholds (RSS in MB)
const MEM_WARN_MB = 380;
const MEM_STOP_NEW_MB = 420;
const MEM_FORCE_RELAUNCH_MB = 460;

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--metrics-recording-only',
  '--no-first-run',
  '--mute-audio',
  '--hide-scrollbars',
  '--disable-blink-features=AutomationControlled',
  '--js-flags=--max-old-space-size=256',
  '--disable-features=TranslateUI',
  '--disable-ipc-flooding-protection',
  // NOTE: --single-process REMOVED — crashes in one renderer killed entire browser
];

export interface BrowserMetrics {
  connected: boolean;
  activeContexts: number;
  pendingAcquires: number;
  rssMB: number;
  heapUsedMB: number;
}

export interface AcquireResult {
  browser: Browser;
  release: () => void;
}

class BrowserManager {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private activeContexts = 0;
  private pendingAcquires = 0;
  private waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  private relaunchScheduled = false;

  /**
   * Acquires a browser reference with semaphore control.
   * Blocks if activeContexts >= MAX_CONTEXTS (with timeout).
   * Caller MUST call release() in a finally block.
   */
  async acquireContext(): Promise<AcquireResult> {
    // Check memory before allowing new context
    const rss = this.getRssMB();

    if (rss >= MEM_FORCE_RELAUNCH_MB) {
      this.scheduleRelaunch();
      throw new Error(
        `BROWSER_MEMORY_CRITICAL: RSS ${rss.toFixed(0)}MB >= ${MEM_FORCE_RELAUNCH_MB}MB. ` +
          'Refusing new context and scheduling browser relaunch.'
      );
    }

    if (rss >= MEM_STOP_NEW_MB) {
      throw new Error(
        `BROWSER_MEMORY_HIGH: RSS ${rss.toFixed(0)}MB >= ${MEM_STOP_NEW_MB}MB. Refusing new context.`
      );
    }

    if (rss >= MEM_WARN_MB) {
      console.warn(
        `BROWSER_MANAGER: Memory warning — RSS ${rss.toFixed(0)}MB >= ${MEM_WARN_MB}MB`
      );
    }

    // Wait if at capacity
    if (this.activeContexts >= MAX_CONTEXTS) {
      await this.waitForSlot();
    }

    const browser = await this.ensureAlive();
    this.activeContexts++;

    let released = false;
    const release = () => {
      if (released) return; // idempotent
      released = true;
      this.activeContexts = Math.max(0, this.activeContexts - 1);
      this.drainWaitQueue();
      this.checkPendingRelaunch();
    };

    return { browser, release };
  }

  /**
   * Ensures browser is alive. Relaunches if disconnected or forceRelaunch requested.
   */
  async ensureAlive(opts?: { forceRelaunch?: boolean }): Promise<Browser> {
    if (opts?.forceRelaunch) {
      console.warn('BROWSER_MANAGER: Force relaunch requested');
      await this.closeBrowser();
    }

    if (this.browser?.isConnected()) {
      return this.browser;
    }

    return this.getOrLaunch();
  }

  /**
   * Returns the shared browser instance, launching if needed.
   * Safe to call concurrently — deduplicates launch.
   */
  async getOrLaunch(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    if (this.launching) {
      return this.launching;
    }

    this.launching = this.launch();
    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
  }

  /**
   * Returns current metrics for health/observability.
   */
  getMetrics(): BrowserMetrics {
    const mem = process.memoryUsage();
    return {
      connected: this.browser?.isConnected() ?? false,
      activeContexts: this.activeContexts,
      pendingAcquires: this.pendingAcquires,
      rssMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    };
  }

  /**
   * Returns whether the browser is currently connected.
   */
  isConnected(): boolean {
    return this.browser?.isConnected() ?? false;
  }

  /**
   * Graceful shutdown. Waits for active contexts to finish (up to timeout).
   */
  async shutdown(): Promise<void> {
    if (!this.browser) return;

    console.log(
      `BROWSER_MANAGER: Shutting down (activeContexts=${this.activeContexts})...`
    );

    // Wait for active contexts to drain
    if (this.activeContexts > 0) {
      await this.waitForDrain(SHUTDOWN_TIMEOUT_MS);
    }

    // Reject any pending acquires
    this.rejectAllWaiters('Browser shutting down');

    await this.closeBrowser();
    console.log('BROWSER_MANAGER: Shutdown complete');
  }

  // ─── Private ────────────────────────────────────────────────

  private async launch(): Promise<Browser> {
    await this.closeBrowser();

    const args = [...LAUNCH_ARGS];

    // Feature flag: renderer process limit
    const rendererLimit = process.env.PW_RENDERER_LIMIT;
    if (rendererLimit) {
      args.push(`--renderer-process-limit=${rendererLimit}`);
    }

    console.log('BROWSER_MANAGER: Launching shared Chromium instance...');

    this.browser = await chromium.launch({
      headless: true,
      args,
    });

    this.activeContexts = 0;
    this.relaunchScheduled = false;

    this.browser.on('disconnected', () => {
      console.warn(
        'BROWSER_MANAGER: Browser disconnected. Will relaunch on next request.'
      );
      this.browser = null;
    });

    console.log('BROWSER_MANAGER: Chromium ready');
    return this.browser;
  }

  private async closeBrowser(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // already closed or crashed
      }
      this.browser = null;
    }
  }

  private getRssMB(): number {
    return process.memoryUsage.rss() / 1024 / 1024;
  }

  private async waitForSlot(): Promise<void> {
    this.pendingAcquires++;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          // Remove from queue
          const idx = this.waitQueue.findIndex((w) => w.resolve === resolve);
          if (idx !== -1) this.waitQueue.splice(idx, 1);
          reject(
            new Error(
              `BROWSER_ACQUIRE_TIMEOUT: Waited ${ACQUIRE_TIMEOUT_MS}ms for context slot ` +
                `(active=${this.activeContexts}, max=${MAX_CONTEXTS})`
            )
          );
        }, ACQUIRE_TIMEOUT_MS);

        this.waitQueue.push({
          resolve: () => {
            clearTimeout(timer);
            resolve();
          },
          reject: (err: Error) => {
            clearTimeout(timer);
            reject(err);
          },
        });
      });
    } finally {
      this.pendingAcquires = Math.max(0, this.pendingAcquires - 1);
    }
  }

  private drainWaitQueue(): void {
    if (this.waitQueue.length > 0 && this.activeContexts < MAX_CONTEXTS) {
      const waiter = this.waitQueue.shift();
      waiter?.resolve();
    }
  }

  private rejectAllWaiters(reason: string): void {
    const waiters = this.waitQueue.splice(0);
    for (const w of waiters) {
      w.reject(new Error(reason));
    }
    this.pendingAcquires = 0;
  }

  private scheduleRelaunch(): void {
    if (this.relaunchScheduled) return;
    this.relaunchScheduled = true;
    console.warn(
      'BROWSER_MANAGER: Relaunch scheduled — will execute when all contexts are released'
    );
    this.checkPendingRelaunch();
  }

  private checkPendingRelaunch(): void {
    if (!this.relaunchScheduled) return;

    if (this.activeContexts === 0) {
      this.relaunchScheduled = false;
      console.warn('BROWSER_MANAGER: Executing scheduled relaunch now');
      this.closeBrowser().catch(() => {});
      return;
    }

    // Timeout: force relaunch even if contexts remain
    setTimeout(() => {
      if (this.relaunchScheduled) {
        this.relaunchScheduled = false;
        console.warn(
          `BROWSER_MANAGER: Relaunch timeout (${RELAUNCH_WAIT_TIMEOUT_MS}ms) — forcing relaunch with ${this.activeContexts} active contexts`
        );
        this.closeBrowser().catch(() => {});
      }
    }, RELAUNCH_WAIT_TIMEOUT_MS);
  }

  private waitForDrain(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.activeContexts === 0) {
        resolve();
        return;
      }

      const interval = setInterval(() => {
        if (this.activeContexts === 0) {
          clearInterval(interval);
          clearTimeout(timer);
          resolve();
        }
      }, 200);

      const timer = setTimeout(() => {
        clearInterval(interval);
        console.warn(
          `BROWSER_MANAGER: Shutdown timeout — ${this.activeContexts} contexts still active`
        );
        resolve();
      }, timeoutMs);
    });
  }
}

// Singleton
export const browserManager = new BrowserManager();

import { chromium, Browser } from 'playwright';

/**
 * BrowserManager — singleton that maintains ONE Chromium browser per process.
 *
 * Why: Each chromium.launch() spawns a ~80-150MB process.
 * With 9 sites scraping concurrently, that's 700MB+ just in browsers.
 * By sharing ONE browser, we drop to ~150MB baseline + ~20MB per context.
 *
 * Contexts are isolated (separate cookies, storage) so security is maintained.
 */

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
  // Memory-specific flags
  '--js-flags=--max-old-space-size=256',
  '--disable-features=TranslateUI',
  '--disable-ipc-flooding-protection',
  '--single-process',
];

class BrowserManager {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private contextCount = 0;

  /**
   * Returns the shared browser instance, launching if needed.
   * Safe to call concurrently — deduplicates launch.
   */
  async getOrLaunch(): Promise<Browser> {
    // Fast path: browser exists and is connected
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    // Deduplicate concurrent launches
    if (this.launching) {
      return this.launching;
    }

    this.launching = this.launch();
    try {
      const browser = await this.launching;
      return browser;
    } finally {
      this.launching = null;
    }
  }

  private async launch(): Promise<Browser> {
    // Cleanup stale browser if any
    if (this.browser) {
      try { await this.browser.close(); } catch {}
      this.browser = null;
    }

    console.log('BROWSER_MANAGER: Launching shared Chromium instance...');

    this.browser = await chromium.launch({
      headless: true,
      args: LAUNCH_ARGS,
    });

    this.contextCount = 0;

    // Auto-reconnect on disconnect
    this.browser.on('disconnected', () => {
      console.warn('BROWSER_MANAGER: Browser disconnected. Will relaunch on next request.');
      this.browser = null;
    });

    console.log('BROWSER_MANAGER: Chromium ready (PID: shared singleton)');
    return this.browser;
  }

  /**
   * Tracks context creation for metrics/debugging.
   */
  trackContextOpen(): void {
    this.contextCount++;
  }

  /**
   * Tracks context close for metrics/debugging.
   */
  trackContextClose(): void {
    this.contextCount = Math.max(0, this.contextCount - 1);
  }

  /**
   * Returns current number of open contexts.
   */
  getOpenContextCount(): number {
    return this.contextCount;
  }

  /**
   * Returns whether the browser is currently connected.
   */
  isConnected(): boolean {
    return this.browser?.isConnected() ?? false;
  }

  /**
   * Graceful shutdown. Call on process exit.
   */
  async shutdown(): Promise<void> {
    if (this.browser) {
      console.log('BROWSER_MANAGER: Shutting down Chromium...');
      try { await this.browser.close(); } catch {}
      this.browser = null;
    }
  }
}

// Singleton
export const browserManager = new BrowserManager();

// Graceful shutdown on process exit
process.on('SIGTERM', () => browserManager.shutdown());
process.on('SIGINT', () => browserManager.shutdown());

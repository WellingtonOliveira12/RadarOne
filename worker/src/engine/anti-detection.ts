import { BrowserContext } from 'playwright';
import { AntiDetectionConfig } from './types';

/**
 * Sets up anti-detection measures on a browser context based on site config.
 *
 * IMPORTANT: Playwright route() does NOT support join(',') of patterns.
 * Each pattern is registered individually via loop.
 */
export async function setupAntiDetection(
  context: BrowserContext,
  config: AntiDetectionConfig
): Promise<void> {
  const patterns: string[] = [];

  if (config.blockImages) patterns.push('**/*.{png,jpg,jpeg,gif,svg,ico,webp}');
  if (config.blockFonts) patterns.push('**/*.{woff,woff2,ttf,otf,eot}');
  if (config.blockCSS) patterns.push('**/*.css');
  if (config.blockMedia) patterns.push('**/*.{mp4,mp3,avi,mov}');

  for (const pattern of patterns) {
    await context.route(pattern, (route) => route.abort());
  }

  if (config.injectStealthScripts) {
    await context.addInitScript(() => {
      // Hide webdriver flag
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // Override chrome.runtime to appear as normal Chrome
      if (!(window as any).chrome) {
        (window as any).chrome = { runtime: {} };
      }

      // Override permissions query
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' } as PermissionStatus)
          : originalQuery(parameters);

      // Override plugins to have non-zero length
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['pt-BR', 'pt', 'en-US', 'en'],
      });
    });
  }
}

/**
 * Returns a randomized viewport for aggressive stealth mode.
 */
export function getRandomViewport(): { width: number; height: number } {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1680, height: 1050 },
    { width: 1280, height: 720 },
  ];
  return viewports[Math.floor(Math.random() * viewports.length)];
}

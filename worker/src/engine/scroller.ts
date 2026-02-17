import { Page } from 'playwright';
import { ScrollConfig } from './types';

/**
 * Scrolls the page according to the scroll strategy.
 * Returns the number of scrolls performed.
 */
export async function scrollPage(
  page: Page,
  config: ScrollConfig
): Promise<number> {
  const delay = config.delayBetweenScrollsMs ?? 800;

  if (config.strategy === 'fixed') {
    return scrollFixed(page, config.fixedSteps ?? 3, delay);
  }

  return scrollAdaptive(page, config, delay);
}

/**
 * Fixed scroll: scrolls N steps down the page.
 */
async function scrollFixed(
  page: Page,
  steps: number,
  delayMs: number
): Promise<number> {
  for (let i = 0; i < steps; i++) {
    await page.evaluate((step) => {
      const height = document.body.scrollHeight;
      window.scrollTo(0, (height / (step.total)) * (step.current + 1));
    }, { current: i, total: steps });
    await page.waitForTimeout(delayMs);
  }
  return steps;
}

/**
 * Adaptive scroll: scrolls until no new items appear.
 * Used for infinite-scroll pages like Facebook Marketplace.
 */
async function scrollAdaptive(
  page: Page,
  config: ScrollConfig,
  delayMs: number
): Promise<number> {
  const maxAttempts = config.maxScrollAttempts ?? 10;
  const stableThreshold = config.stableThreshold ?? 2;

  let scrollsDone = 0;
  let stableCount = 0;
  let previousCount = await countVisibleItems(page);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Scroll to bottom
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    scrollsDone++;

    await page.waitForTimeout(delayMs);

    const currentCount = await countVisibleItems(page);

    if (currentCount <= previousCount) {
      stableCount++;
      if (stableCount >= stableThreshold) {
        break;
      }
    } else {
      stableCount = 0;
    }

    previousCount = currentCount;
  }

  return scrollsDone;
}

/**
 * Counts visible items on the page (generic heuristic).
 * Uses common listing selectors to estimate item count.
 */
async function countVisibleItems(page: Page): Promise<number> {
  return page.evaluate(() => {
    // Try common listing patterns
    const selectors = [
      'a[href*="/marketplace/item/"]',
      '[data-ds-component="DS-AdCard"]',
      'li.ui-search-layout__item',
      '[data-position]',
      'article',
      '[role="listitem"]',
    ];

    for (const sel of selectors) {
      const count = document.querySelectorAll(sel).length;
      if (count > 0) return count;
    }

    return 0;
  });
}

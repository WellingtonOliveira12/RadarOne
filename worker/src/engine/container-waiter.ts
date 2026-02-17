import { Page } from 'playwright';

/**
 * Waits for a container selector to appear using progressive timeouts.
 * Tries each selector at each timeout level.
 *
 * @returns The first matching selector and metadata, or null if none found.
 */
export async function waitForContainer(
  page: Page,
  selectors: string[],
  timeouts: number[]
): Promise<{
  success: boolean;
  selector: string | null;
  timeout: number;
  attempts: number;
}> {
  for (let i = 0; i < timeouts.length; i++) {
    const timeout = timeouts[i];

    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout, state: 'attached' });
        const count = await page.locator(selector).count();
        if (count > 0) {
          return { success: true, selector, timeout, attempts: i + 1 };
        }
      } catch {
        // Continue to next selector
      }
    }

    // Wait a bit before next timeout level (unless last)
    if (i < timeouts.length - 1) {
      await page.waitForTimeout(1000);
    }
  }

  return {
    success: false,
    selector: null,
    timeout: timeouts[timeouts.length - 1],
    attempts: timeouts.length,
  };
}

/**
 * Finds the first matching selector from a list.
 * Useful for finding title, price, link selectors with fallback.
 */
export async function findSelector(
  page: Page,
  selectors: string[]
): Promise<{ selector: string | null; count: number }> {
  for (const selector of selectors) {
    try {
      const count = await page.locator(selector).count();
      if (count > 0) {
        return { selector, count };
      }
    } catch {
      // Continue
    }
  }
  return { selector: null, count: 0 };
}

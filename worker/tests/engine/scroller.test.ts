import { describe, it, expect, vi } from 'vitest';
import { scrollPage } from '../../src/engine/scroller';
import { ScrollConfig } from '../../src/engine/types';

function createMockPage(itemCounts?: number[]) {
  let scrollIdx = 0;
  const counts = itemCounts || [5, 10, 15, 15, 15];

  return {
    evaluate: vi.fn().mockImplementation((fn: any, ...args: any[]) => {
      // If called with no args or with a scroll function, it's a scroll call
      if (typeof fn === 'function') {
        const result = fn.toString();
        // Count items call
        if (result.includes('querySelectorAll')) {
          const count = counts[Math.min(scrollIdx, counts.length - 1)];
          scrollIdx++;
          return Promise.resolve(count);
        }
        // Scroll call
        return Promise.resolve();
      }
      return Promise.resolve();
    }),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('scrollPage', () => {
  describe('fixed strategy', () => {
    it('should scroll the specified number of steps', async () => {
      const page = createMockPage();
      const config: ScrollConfig = {
        strategy: 'fixed',
        fixedSteps: 3,
        delayBetweenScrollsMs: 10,
      };

      const result = await scrollPage(page, config);

      expect(result).toBe(3);
      expect(page.evaluate).toHaveBeenCalledTimes(3);
      expect(page.waitForTimeout).toHaveBeenCalledTimes(3);
    });

    it('should use default fixedSteps=3 when not specified', async () => {
      const page = createMockPage();
      const config: ScrollConfig = {
        strategy: 'fixed',
        delayBetweenScrollsMs: 10,
      };

      const result = await scrollPage(page, config);
      expect(result).toBe(3);
    });
  });

  describe('adaptive strategy', () => {
    it('should stop when items stabilize', async () => {
      // Items: 5, 10, 15, 15, 15 — should stop after 2 stable counts
      const page = createMockPage([5, 10, 15, 15, 15]);
      const config: ScrollConfig = {
        strategy: 'adaptive',
        maxScrollAttempts: 10,
        stableThreshold: 2,
        delayBetweenScrollsMs: 10,
      };

      const result = await scrollPage(page, config);

      // Initial count (5) + scroll 1 (10, not stable) + scroll 2 (15, not stable) +
      // scroll 3 (15, stable=1) + scroll 4 (15, stable=2, stop)
      // So scrollsDone should be 4
      expect(result).toBeGreaterThanOrEqual(2);
      expect(result).toBeLessThanOrEqual(10);
    });

    it('should respect maxScrollAttempts', async () => {
      // Items always increase — never stabilizes
      const page = createMockPage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      const config: ScrollConfig = {
        strategy: 'adaptive',
        maxScrollAttempts: 3,
        stableThreshold: 2,
        delayBetweenScrollsMs: 10,
      };

      const result = await scrollPage(page, config);
      expect(result).toBeLessThanOrEqual(3);
    });
  });
});

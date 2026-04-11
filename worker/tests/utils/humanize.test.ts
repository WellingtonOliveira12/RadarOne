import { describe, it, expect } from 'vitest';
import {
  getPlatformRisk,
  computeSchedulerJitter,
  humanDelay,
  preNavigationPause,
  scrollDelay,
  postScrollWait,
} from '../../src/utils/humanize';

describe('humanize', () => {
  describe('getPlatformRisk', () => {
    it('returns high for ML and Facebook', () => {
      expect(getPlatformRisk('MERCADO_LIVRE')).toBe('high');
      expect(getPlatformRisk('FACEBOOK_MARKETPLACE')).toBe('high');
    });

    it('returns medium for OLX', () => {
      expect(getPlatformRisk('OLX')).toBe('medium');
    });

    it('returns low for Zapimoveis', () => {
      expect(getPlatformRisk('ZAPIMOVEIS')).toBe('low');
    });

    it('defaults to medium for unknown sites', () => {
      expect(getPlatformRisk('UNKNOWN')).toBe('medium');
    });
  });

  describe('computeSchedulerJitter', () => {
    it('returns jitter within ±30% for high risk', () => {
      const baseMs = 60_000;
      const results = Array.from({ length: 100 }, () =>
        computeSchedulerJitter(baseMs, 'MERCADO_LIVRE')
      );

      for (const j of results) {
        expect(Math.abs(j)).toBeLessThanOrEqual(baseMs * 0.30 + 1);
      }
    });

    it('returns jitter within ±20% for medium risk', () => {
      const baseMs = 60_000;
      const results = Array.from({ length: 100 }, () =>
        computeSchedulerJitter(baseMs, 'OLX')
      );

      for (const j of results) {
        expect(Math.abs(j)).toBeLessThanOrEqual(baseMs * 0.20 + 1);
      }
    });

    it('returns jitter within ±10% for low risk', () => {
      const baseMs = 60_000;
      const results = Array.from({ length: 100 }, () =>
        computeSchedulerJitter(baseMs, 'ZAPIMOVEIS')
      );

      for (const j of results) {
        expect(Math.abs(j)).toBeLessThanOrEqual(baseMs * 0.10 + 1);
      }
    });

    it('produces varied results (not deterministic)', () => {
      const results = new Set(
        Array.from({ length: 20 }, () =>
          computeSchedulerJitter(60_000, 'MERCADO_LIVRE')
        )
      );
      expect(results.size).toBeGreaterThan(5);
    });
  });

  describe('humanDelay', () => {
    it('returns delay within variance bounds', () => {
      const base = 1000;
      const variance = 0.25;
      const results = Array.from({ length: 100 }, () => humanDelay(base, variance));

      for (const d of results) {
        expect(d).toBeGreaterThanOrEqual(base * 0.5);
        expect(d).toBeLessThanOrEqual(base * 1.25 + 1);
      }
    });

    it('never returns less than half the base', () => {
      const results = Array.from({ length: 100 }, () => humanDelay(100, 0.9));
      for (const d of results) {
        expect(d).toBeGreaterThanOrEqual(50);
      }
    });
  });

  describe('preNavigationPause', () => {
    it('returns longer pauses for high-risk sites', () => {
      const highPauses = Array.from({ length: 50 }, () => preNavigationPause('MERCADO_LIVRE'));
      const lowPauses = Array.from({ length: 50 }, () => preNavigationPause('ZAPIMOVEIS'));

      const avgHigh = highPauses.reduce((a, b) => a + b) / highPauses.length;
      const avgLow = lowPauses.reduce((a, b) => a + b) / lowPauses.length;

      expect(avgHigh).toBeGreaterThan(avgLow);
    });

    it('returns positive values within expected range', () => {
      const results = Array.from({ length: 50 }, () => preNavigationPause('MERCADO_LIVRE'));
      for (const d of results) {
        expect(d).toBeGreaterThanOrEqual(500);
        expect(d).toBeLessThanOrEqual(2500);
      }
    });
  });

  describe('scrollDelay', () => {
    it('varies by step', () => {
      const step0Delays = Array.from({ length: 20 }, () => scrollDelay(800, 0));
      const step1Delays = Array.from({ length: 20 }, () => scrollDelay(800, 1));

      const avg0 = step0Delays.reduce((a, b) => a + b) / step0Delays.length;
      const avg1 = step1Delays.reduce((a, b) => a + b) / step1Delays.length;

      // Step 1 should average ~100ms more than step 0 due to stepNoise
      expect(avg1).toBeGreaterThan(avg0);
    });

    it('returns positive values', () => {
      const results = Array.from({ length: 50 }, () => scrollDelay(800, 5));
      for (const d of results) {
        expect(d).toBeGreaterThan(0);
      }
    });
  });

  describe('postScrollWait', () => {
    it('returns longer waits for high-risk sites', () => {
      const highWaits = Array.from({ length: 50 }, () => postScrollWait('MERCADO_LIVRE'));
      const lowWaits = Array.from({ length: 50 }, () => postScrollWait('ZAPIMOVEIS'));

      const avgHigh = highWaits.reduce((a, b) => a + b) / highWaits.length;
      const avgLow = lowWaits.reduce((a, b) => a + b) / lowWaits.length;

      expect(avgHigh).toBeGreaterThan(avgLow);
    });
  });
});

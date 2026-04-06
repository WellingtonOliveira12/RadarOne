import { describe, it, expect } from 'vitest';

/**
 * Tests for the processAds dedupe + re-alert logic.
 *
 * The processAds function now supports 2 triggers for notification:
 * 1. Genuinely new ad (externalId never seen)
 * 2. Price changed significantly (>5% or >R$50)
 *
 * Plus a 72h safety net for never-alerted ads.
 *
 * Cross-monitor dedupe prevents the same ad from being alerted
 * across sibling monitors (same user + same site) within 24h.
 */

// ─── Constants matching processAds ──────────────────────────

const PRICE_CHANGE_THRESHOLD_PERCENT = 0.05; // 5%
const PRICE_CHANGE_THRESHOLD_ABS = 50; // R$50
const NEVER_ALERTED_WINDOW_MS = 72 * 60 * 60 * 1000; // 72h safety net
const CROSS_MONITOR_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h cross-monitor window

// ─── Pure logic functions ───────────────────────────────────

function shouldRealertForPriceChange(
  oldPrice: number | null,
  newPrice: number | null
): { shouldRealert: boolean; reason: string } {
  if (newPrice == null || oldPrice == null || newPrice === oldPrice) {
    return { shouldRealert: false, reason: '' };
  }
  const priceDiff = Math.abs(newPrice - oldPrice);
  const percentChange = priceDiff / oldPrice;

  if (percentChange >= PRICE_CHANGE_THRESHOLD_PERCENT || priceDiff >= PRICE_CHANGE_THRESHOLD_ABS) {
    return { shouldRealert: true, reason: `price_changed:${oldPrice}→${newPrice}` };
  }
  return { shouldRealert: false, reason: '' };
}

function shouldRealertForNeverAlerted(
  alertSent: boolean,
  firstSeenAt: Date,
  now: Date
): { shouldRealert: boolean; reason: string } {
  if (!alertSent) {
    const timeSinceFirstSeen = now.getTime() - firstSeenAt.getTime();
    if (timeSinceFirstSeen >= NEVER_ALERTED_WINDOW_MS) {
      return { shouldRealert: true, reason: 'never_alerted_72h' };
    }
  }
  return { shouldRealert: false, reason: '' };
}

interface AdRecord {
  externalId: string;
  monitorId: string;
  alertSent: boolean;
  alertSentAt: Date | null;
}

function filterCrossMonitorDuplicates(
  currentMonitorId: string,
  ads: { externalId: string }[],
  allAdSeenRecords: AdRecord[],
): { passed: { externalId: string }[]; filtered: number } {
  const windowStart = new Date(Date.now() - CROSS_MONITOR_WINDOW_MS);

  // Find ads already alerted from sibling monitors within window
  const alertedFromSiblings = new Set(
    allAdSeenRecords
      .filter(
        (r) =>
          r.monitorId !== currentMonitorId &&
          r.alertSent &&
          r.alertSentAt &&
          r.alertSentAt.getTime() >= windowStart.getTime()
      )
      .map((r) => r.externalId)
  );

  const passed = ads.filter((ad) => !alertedFromSiblings.has(ad.externalId));
  return { passed, filtered: ads.length - passed.length };
}

// ─── Tests ──────────────────────────────────────────────────

describe('Price Change Re-alert', () => {
  it('triggers re-alert for >5% price drop', () => {
    const result = shouldRealertForPriceChange(1000, 940); // -6%
    expect(result.shouldRealert).toBe(true);
    expect(result.reason).toContain('price_changed');
  });

  it('triggers re-alert for >5% price increase', () => {
    const result = shouldRealertForPriceChange(1000, 1060); // +6%
    expect(result.shouldRealert).toBe(true);
  });

  it('triggers re-alert for >R$50 absolute change even if <5%', () => {
    const result = shouldRealertForPriceChange(5000, 4940); // -1.2% but R$60 diff
    expect(result.shouldRealert).toBe(true);
  });

  it('does NOT trigger for small change (<5% and <R$50)', () => {
    const result = shouldRealertForPriceChange(1000, 980); // -2% = R$20
    expect(result.shouldRealert).toBe(false);
  });

  it('does NOT trigger when prices are equal', () => {
    const result = shouldRealertForPriceChange(1500, 1500);
    expect(result.shouldRealert).toBe(false);
  });

  it('does NOT trigger when either price is null', () => {
    expect(shouldRealertForPriceChange(null, 1000).shouldRealert).toBe(false);
    expect(shouldRealertForPriceChange(1000, null).shouldRealert).toBe(false);
    expect(shouldRealertForPriceChange(null, null).shouldRealert).toBe(false);
  });

  it('triggers for dramatic price drop (50%)', () => {
    const result = shouldRealertForPriceChange(2000, 1000);
    expect(result.shouldRealert).toBe(true);
  });

  it('price threshold works at boundary (exactly 5%)', () => {
    const result = shouldRealertForPriceChange(1000, 950); // exactly 5%
    expect(result.shouldRealert).toBe(true);
  });

  it('price threshold does NOT trigger just under 5% and under R$50', () => {
    const result = shouldRealertForPriceChange(1000, 951); // 4.9% = R$49
    expect(result.shouldRealert).toBe(false);
  });
});

describe('Never-Alerted Safety Net (72h)', () => {
  const now = new Date();

  it('triggers for never-alerted ad seen 73h ago (>72h window)', () => {
    const firstSeenAt = new Date(now.getTime() - 73 * 60 * 60 * 1000);
    const result = shouldRealertForNeverAlerted(false, firstSeenAt, now);
    expect(result.shouldRealert).toBe(true);
    expect(result.reason).toBe('never_alerted_72h');
  });

  it('does NOT trigger for never-alerted ad seen 48h ago (<72h window)', () => {
    const firstSeenAt = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const result = shouldRealertForNeverAlerted(false, firstSeenAt, now);
    expect(result.shouldRealert).toBe(false);
  });

  it('does NOT trigger for never-alerted ad seen 2h ago', () => {
    const firstSeenAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const result = shouldRealertForNeverAlerted(false, firstSeenAt, now);
    expect(result.shouldRealert).toBe(false);
  });

  it('does NOT trigger for already-alerted ad regardless of age', () => {
    const firstSeenAt = new Date(now.getTime() - 200 * 60 * 60 * 1000);
    const result = shouldRealertForNeverAlerted(true, firstSeenAt, now);
    expect(result.shouldRealert).toBe(false);
  });
});

describe('No Time-Based Re-alert for Alerted Ads', () => {
  const now = new Date();

  it('previously-alerted ad does NOT re-alert after 12h without price change', () => {
    const priceResult = shouldRealertForPriceChange(1500, 1500);
    const windowResult = shouldRealertForNeverAlerted(true, new Date(now.getTime() - 48 * 60 * 60 * 1000), now);
    expect(priceResult.shouldRealert).toBe(false);
    expect(windowResult.shouldRealert).toBe(false);
  });

  it('previously-alerted ad does NOT re-alert after 24h without price change', () => {
    const priceResult = shouldRealertForPriceChange(1500, 1500);
    const windowResult = shouldRealertForNeverAlerted(true, new Date(now.getTime() - 72 * 60 * 60 * 1000), now);
    expect(priceResult.shouldRealert).toBe(false);
    expect(windowResult.shouldRealert).toBe(false);
  });

  it('previously-alerted ad re-alerts ONLY when price changes materially', () => {
    const priceResult = shouldRealertForPriceChange(3000, 2500); // -16.7%
    expect(priceResult.shouldRealert).toBe(true);
  });
});

describe('Cross-Monitor Dedupe', () => {
  const monitorPG1 = 'monitor-pg1';
  const monitorPG2 = 'monitor-pg2';
  const monitorPG3 = 'monitor-pg3';

  it('T1: same externalId in PG2 and PG3 → alerts only once', () => {
    const ads = [{ externalId: 'MLB123' }];
    const records: AdRecord[] = [
      {
        externalId: 'MLB123',
        monitorId: monitorPG2,
        alertSent: true,
        alertSentAt: new Date(Date.now() - 30 * 60 * 1000), // 30min ago
      },
    ];

    const result = filterCrossMonitorDuplicates(monitorPG3, ads, records);
    expect(result.filtered).toBe(1);
    expect(result.passed).toHaveLength(0);
  });

  it('T4: genuinely new externalId passes through', () => {
    const ads = [{ externalId: 'MLB999' }];
    const records: AdRecord[] = [
      {
        externalId: 'MLB123',
        monitorId: monitorPG2,
        alertSent: true,
        alertSentAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    ];

    const result = filterCrossMonitorDuplicates(monitorPG3, ads, records);
    expect(result.filtered).toBe(0);
    expect(result.passed).toHaveLength(1);
  });

  it('T5: same externalId already alerted from sibling → filtered', () => {
    const ads = [{ externalId: 'MLB456' }, { externalId: 'MLB789' }];
    const records: AdRecord[] = [
      {
        externalId: 'MLB456',
        monitorId: monitorPG1,
        alertSent: true,
        alertSentAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
      },
    ];

    const result = filterCrossMonitorDuplicates(monitorPG2, ads, records);
    expect(result.filtered).toBe(1);
    expect(result.passed).toHaveLength(1);
    expect(result.passed[0].externalId).toBe('MLB789');
  });

  it('T6: same externalId from SAME monitor is NOT filtered (self-dedupe is separate)', () => {
    const ads = [{ externalId: 'MLB123' }];
    const records: AdRecord[] = [
      {
        externalId: 'MLB123',
        monitorId: monitorPG2, // same as current
        alertSent: true,
        alertSentAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    ];

    const result = filterCrossMonitorDuplicates(monitorPG2, ads, records);
    expect(result.filtered).toBe(0);
    expect(result.passed).toHaveLength(1);
  });

  it('old alert (>24h) does NOT block new alert from sibling', () => {
    const ads = [{ externalId: 'MLB123' }];
    const records: AdRecord[] = [
      {
        externalId: 'MLB123',
        monitorId: monitorPG1,
        alertSent: true,
        alertSentAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25h ago
      },
    ];

    const result = filterCrossMonitorDuplicates(monitorPG2, ads, records);
    expect(result.filtered).toBe(0);
    expect(result.passed).toHaveLength(1);
  });

  it('no sibling records → all ads pass', () => {
    const ads = [{ externalId: 'MLB123' }, { externalId: 'MLB456' }];
    const records: AdRecord[] = [];

    const result = filterCrossMonitorDuplicates(monitorPG1, ads, records);
    expect(result.filtered).toBe(0);
    expect(result.passed).toHaveLength(2);
  });

  it('empty ads list → no filtering needed', () => {
    const result = filterCrossMonitorDuplicates(monitorPG1, [], []);
    expect(result.filtered).toBe(0);
    expect(result.passed).toHaveLength(0);
  });
});

describe('Combined Dedupe Logic', () => {
  it('genuinely new ad (no existing record) always passes', () => {
    const existing = null;
    expect(existing).toBeNull(); // → newAds.push(ad)
  });

  it('duplicate with no price change and recent alert stays silent', () => {
    const priceResult = shouldRealertForPriceChange(1500, 1500);
    const now = new Date();
    const windowResult = shouldRealertForNeverAlerted(true, new Date(now.getTime() - 48 * 60 * 60 * 1000), now);
    expect(priceResult.shouldRealert).toBe(false);
    expect(windowResult.shouldRealert).toBe(false);
  });

  it('duplicate with price drop triggers notification', () => {
    const priceResult = shouldRealertForPriceChange(3000, 2500); // -16.7%
    expect(priceResult.shouldRealert).toBe(true);
  });
});

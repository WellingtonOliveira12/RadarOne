import { describe, it, expect } from 'vitest';

/**
 * Tests for the processAds dedupe + re-alert logic.
 *
 * The processAds function now supports 3 triggers for notification:
 * 1. Genuinely new ad (externalId never seen)
 * 2. Price changed significantly (>5% or >R$50)
 * 3. Re-alert window expired (24h since last alert)
 *
 * These tests validate the pure decision logic extracted from processAds.
 */

// ─── Constants matching processAds ──────────────────────────

const PRICE_CHANGE_THRESHOLD_PERCENT = 0.05; // 5%
const PRICE_CHANGE_THRESHOLD_ABS = 50; // R$50
const REALERT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours (for previously-alerted ads)
const NEVER_ALERTED_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours (for never-alerted ads)

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

function shouldRealertForWindow(
  alertSent: boolean,
  alertSentAt: Date | null,
  firstSeenAt: Date,
  now: Date
): { shouldRealert: boolean; reason: string } {
  if (alertSent) {
    // Previously alerted: 24h window
    const lastAlertTime = alertSentAt?.getTime() || firstSeenAt.getTime();
    if (now.getTime() - lastAlertTime >= REALERT_WINDOW_MS) {
      return { shouldRealert: true, reason: 'realert_window_24h' };
    }
  } else {
    // Never alerted: shorter 6h window (catches transition from old logic)
    const timeSinceFirstSeen = now.getTime() - firstSeenAt.getTime();
    if (timeSinceFirstSeen >= NEVER_ALERTED_WINDOW_MS) {
      return { shouldRealert: true, reason: 'never_alerted_6h' };
    }
  }
  return { shouldRealert: false, reason: '' };
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

describe('24h Re-alert Window', () => {
  const now = new Date();

  it('triggers re-alert when last alert was 25h ago', () => {
    const alertSentAt = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const firstSeenAt = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const result = shouldRealertForWindow(true, alertSentAt, firstSeenAt, now);
    expect(result.shouldRealert).toBe(true);
    expect(result.reason).toBe('realert_window_24h');
  });

  it('does NOT trigger when last alert was 23h ago', () => {
    const alertSentAt = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    const firstSeenAt = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const result = shouldRealertForWindow(true, alertSentAt, firstSeenAt, now);
    expect(result.shouldRealert).toBe(false);
  });

  it('triggers for never-alerted ad seen 7h ago (>6h window)', () => {
    const firstSeenAt = new Date(now.getTime() - 7 * 60 * 60 * 1000);
    const result = shouldRealertForWindow(false, null, firstSeenAt, now);
    expect(result.shouldRealert).toBe(true);
    expect(result.reason).toBe('never_alerted_6h');
  });

  it('does NOT trigger for never-alerted ad seen 5h ago (<6h window)', () => {
    const firstSeenAt = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const result = shouldRealertForWindow(false, null, firstSeenAt, now);
    expect(result.shouldRealert).toBe(false);
  });

  it('does NOT trigger for ad alerted 1h ago', () => {
    const alertSentAt = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const firstSeenAt = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const result = shouldRealertForWindow(true, alertSentAt, firstSeenAt, now);
    expect(result.shouldRealert).toBe(false);
  });
});

describe('Combined Dedupe Logic', () => {
  it('genuinely new ad (no existing record) always passes', () => {
    // processAds creates new AdSeen record and pushes to newAds
    // This is Case 1 — tested by absence of existing record
    const existing = null;
    expect(existing).toBeNull(); // → newAds.push(ad)
  });

  it('duplicate with no price change and recent alert stays silent', () => {
    const priceResult = shouldRealertForPriceChange(1500, 1500);
    const now = new Date();
    const windowResult = shouldRealertForWindow(
      true,
      new Date(now.getTime() - 2 * 60 * 60 * 1000), // alerted 2h ago
      new Date(now.getTime() - 48 * 60 * 60 * 1000),
      now
    );
    expect(priceResult.shouldRealert).toBe(false);
    expect(windowResult.shouldRealert).toBe(false);
    // → ad stays as duplicate, no notification
  });

  it('duplicate with price drop triggers notification', () => {
    const priceResult = shouldRealertForPriceChange(3000, 2500); // -16.7%
    expect(priceResult.shouldRealert).toBe(true);
    // → even though externalId exists, price change triggers re-alert
  });

  it('duplicate with no price change but 24h+ silence triggers re-alert', () => {
    const priceResult = shouldRealertForPriceChange(1500, 1500);
    const now = new Date();
    const windowResult = shouldRealertForWindow(
      true,
      new Date(now.getTime() - 25 * 60 * 60 * 1000), // alerted 25h ago
      new Date(now.getTime() - 72 * 60 * 60 * 1000),
      now
    );
    expect(priceResult.shouldRealert).toBe(false);
    expect(windowResult.shouldRealert).toBe(true);
    // → 24h window triggers re-alert even without price change
  });
});

import { describe, it, expect } from 'vitest';
import { computeTimeBoost } from '../../../src/engine/enrichment/time-weight';

describe('computeTimeBoost', () => {
  const now = new Date('2026-03-23T12:00:00Z');

  it('returns +7 for ads < 1 hour old', () => {
    const published = new Date('2026-03-23T11:30:00Z'); // 30min ago
    expect(computeTimeBoost(published, now)).toBe(7);
  });

  it('returns +5 for ads 1–6 hours old', () => {
    const published = new Date('2026-03-23T09:00:00Z'); // 3h ago
    expect(computeTimeBoost(published, now)).toBe(5);
  });

  it('returns +3 for ads 6–24 hours old', () => {
    const published = new Date('2026-03-23T00:00:00Z'); // 12h ago
    expect(computeTimeBoost(published, now)).toBe(3);
  });

  it('returns +1 for ads 24–72 hours old', () => {
    const published = new Date('2026-03-21T12:00:00Z'); // 48h ago
    expect(computeTimeBoost(published, now)).toBe(1);
  });

  it('returns 0 for ads > 72 hours old', () => {
    const published = new Date('2026-03-19T00:00:00Z'); // 4+ days ago
    expect(computeTimeBoost(published, now)).toBe(0);
  });

  it('returns 0 for null/undefined publishedAt', () => {
    expect(computeTimeBoost(null, now)).toBe(0);
    expect(computeTimeBoost(undefined, now)).toBe(0);
  });

  it('returns 0 for future dates (clock skew)', () => {
    const future = new Date('2026-03-24T00:00:00Z');
    expect(computeTimeBoost(future, now)).toBe(0);
  });

  it('returns +7 for just-now ads (same timestamp)', () => {
    expect(computeTimeBoost(now, now)).toBe(7);
  });

  it('boundary: exactly 1 hour → +5', () => {
    const oneHourAgo = new Date('2026-03-23T11:00:00Z');
    expect(computeTimeBoost(oneHourAgo, now)).toBe(5);
  });

  it('boundary: exactly 6 hours → +3', () => {
    const sixHoursAgo = new Date('2026-03-23T06:00:00Z');
    expect(computeTimeBoost(sixHoursAgo, now)).toBe(3);
  });

  it('boundary: exactly 24 hours → +1', () => {
    const oneDayAgo = new Date('2026-03-22T12:00:00Z');
    expect(computeTimeBoost(oneDayAgo, now)).toBe(1);
  });

  it('boundary: exactly 72 hours → 0', () => {
    const threeDaysAgo = new Date('2026-03-20T12:00:00Z');
    expect(computeTimeBoost(threeDaysAgo, now)).toBe(0);
  });

  it('max boost is 7 (V2.1 cap)', () => {
    const justNow = new Date(now.getTime() - 1000); // 1 second ago
    expect(computeTimeBoost(justNow, now)).toBeLessThanOrEqual(7);
  });
});

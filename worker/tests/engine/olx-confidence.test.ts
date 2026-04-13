import { describe, it, expect } from 'vitest';
import { computeOlxConfidence } from '../../src/engine/enrichment/olx-confidence';
import { emptyProfileSignals } from '../../src/engine/enrichment/olx-profile-parser';

const NOW = new Date('2026-04-13T00:00:00Z');

function signals(overrides: Partial<ReturnType<typeof emptyProfileSignals>> = {}) {
  return { ...emptyProfileSignals(), ...overrides };
}

describe('computeOlxConfidence', () => {
  it('returns LOW for a brand-new account with no verifications', () => {
    const r = computeOlxConfidence(
      signals({
        yearJoined: 2026,
        hasVerificationsSection: true,
        verifications: { email: false, phone: false, facebook: false, identity: false },
      }),
      { now: NOW },
    );
    expect(r.tier).toBe('LOW');
    expect(r.reasons).toContain('new_account');
    expect(r.reasons).toContain('no_verifications');
  });

  it('returns LOW for a brand-new account with no verification section', () => {
    const r = computeOlxConfidence(
      signals({ yearJoined: 2026, hasVerificationsSection: false }),
      { now: NOW },
    );
    expect(r.tier).toBe('LOW');
    expect(r.reasons).toContain('new_account');
    expect(r.reasons).toContain('no_verif_section');
  });

  it('returns HIGH for a 5-year veteran regardless of verifications', () => {
    const r = computeOlxConfidence(
      signals({
        yearJoined: 2021,
        hasVerificationsSection: false,
      }),
      { now: NOW },
    );
    expect(r.tier).toBe('HIGH');
    expect(r.reasons.some((x) => x.startsWith('veteran_'))).toBe(true);
  });

  it('returns HIGH for a 1-year account with 2 verifications', () => {
    const r = computeOlxConfidence(
      signals({
        yearJoined: 2025,
        hasVerificationsSection: true,
        verifications: { email: true, phone: true, facebook: false, identity: false },
      }),
      { now: NOW },
    );
    expect(r.tier).toBe('HIGH');
    expect(r.reasons.some((x) => x.startsWith('established_'))).toBe(true);
    expect(r.reasons).toContain('verif_2');
  });

  it('returns MEDIUM for a 1-year account with only 1 verification', () => {
    const r = computeOlxConfidence(
      signals({
        yearJoined: 2025,
        hasVerificationsSection: true,
        verifications: { email: false, phone: true, facebook: false, identity: false },
      }),
      { now: NOW },
    );
    expect(r.tier).toBe('MEDIUM');
  });

  it('returns MEDIUM when yearJoined is unknown but section present', () => {
    const r = computeOlxConfidence(
      signals({
        hasVerificationsSection: true,
        verifications: { email: true, phone: false, facebook: false, identity: false },
      }),
      { now: NOW },
    );
    expect(r.tier).toBe('MEDIUM');
    expect(r.reasons).toContain('verif_1');
  });

  it('returns MEDIUM with insufficient_data when everything is null/false', () => {
    const r = computeOlxConfidence(emptyProfileSignals(), { now: NOW });
    expect(r.tier).toBe('MEDIUM');
    expect(r.reasons).toContain('insufficient_data');
  });

  it('matches the real Albertorlk sample w/o recency (new + 3 verifs → MEDIUM)', () => {
    // Without lastSeenMinutes, Albertorlk lands in MEDIUM.
    const r = computeOlxConfidence(
      signals({
        yearJoined: 2026,
        monthJoined: 'abril',
        hasVerificationsSection: true,
        verifications: { email: true, phone: true, facebook: true, identity: false },
      }),
      { now: NOW },
    );
    expect(r.tier).toBe('MEDIUM');
  });

  it('promotes Albertorlk to HIGH when lastSeen is fresh (39 min)', () => {
    // Real case: last seen 39 min ago → recency boost kicks in.
    const r = computeOlxConfidence(
      signals({
        yearJoined: 2026,
        monthJoined: 'abril',
        hasVerificationsSection: true,
        lastSeenMinutes: 39,
        verifications: { email: true, phone: true, facebook: true, identity: false },
      }),
      { now: NOW },
    );
    expect(r.tier).toBe('HIGH');
    expect(r.reasons.some((x) => x.startsWith('fresh_'))).toBe(true);
  });

  it('hard-overrides to LOW when lastSeen is 7+ days old, regardless of tenure', () => {
    // Veteran seller 5y on platform with 3 verifications, but offline 10 days.
    const r = computeOlxConfidence(
      signals({
        yearJoined: 2021,
        hasVerificationsSection: true,
        lastSeenMinutes: 60 * 24 * 10, // 10 days
        verifications: { email: true, phone: true, facebook: true, identity: false },
      }),
      { now: NOW },
    );
    expect(r.tier).toBe('LOW');
    expect(r.reasons.some((x) => x.startsWith('stale_'))).toBe(true);
  });

  it('fresh seller (<1h) with 2+ verifications is HIGH even as new account', () => {
    const r = computeOlxConfidence(
      signals({
        yearJoined: 2026,
        hasVerificationsSection: true,
        lastSeenMinutes: 15,
        verifications: { email: true, phone: true, facebook: false, identity: false },
      }),
      { now: NOW },
    );
    expect(r.tier).toBe('HIGH');
  });

  it('stale boundary is exactly 7 days', () => {
    const r = computeOlxConfidence(
      signals({
        yearJoined: 2021,
        lastSeenMinutes: 60 * 24 * 7, // exactly 7 days
        verifications: { email: true, phone: true, facebook: false, identity: false },
      }),
      { now: NOW },
    );
    expect(r.tier).toBe('LOW');
  });

  it('fresh boundary: 60 min is still fresh; 61 min is not', () => {
    const base = {
      yearJoined: 2026,
      hasVerificationsSection: true,
      verifications: { email: true, phone: true, facebook: false, identity: false },
    };
    const fresh = computeOlxConfidence(
      signals({ ...base, lastSeenMinutes: 60 }),
      { now: NOW },
    );
    const stale = computeOlxConfidence(
      signals({ ...base, lastSeenMinutes: 61 }),
      { now: NOW },
    );
    expect(fresh.tier).toBe('HIGH');
    expect(stale.tier).toBe('MEDIUM');
  });

  it('does NOT dip into LOW when verifications exist even for a new account', () => {
    const r = computeOlxConfidence(
      signals({
        yearJoined: 2026,
        hasVerificationsSection: true,
        verifications: { email: true, phone: false, facebook: false, identity: false },
      }),
      { now: NOW },
    );
    expect(r.tier).toBe('MEDIUM');
  });
});

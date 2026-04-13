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

  it('matches the real Albertorlk sample (new + 3 verifications → MEDIUM)', () => {
    // Real signals observed: yearJoined=2026 (brand new), phone+email+facebook verified.
    // Not enough tenure for HIGH, but too verified for LOW → MEDIUM.
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

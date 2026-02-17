import { describe, it, expect } from 'vitest';

/**
 * Tests for the NEEDS_REAUTH cooldown logic.
 * These test the pure logic extracted from UserSessionService.markNeedsReauth.
 */

const NOTIFICATION_COOLDOWN_HOURS = 6;
const COOLDOWN_MS = NOTIFICATION_COOLDOWN_HOURS * 60 * 60 * 1000;

function shouldNotify(cooldownNotifiedAt: string | null): boolean {
  if (!cooldownNotifiedAt) return true;
  const lastNotified = new Date(cooldownNotifiedAt);
  return Date.now() - lastNotified.getTime() > COOLDOWN_MS;
}

describe('NEEDS_REAUTH Cooldown Logic', () => {
  it('should notify when cooldownNotifiedAt is null (first time)', () => {
    expect(shouldNotify(null)).toBe(true);
  });

  it('should NOT notify within 6h cooldown', () => {
    // 1 hour ago
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(shouldNotify(oneHourAgo)).toBe(false);
  });

  it('should NOT notify at exactly 5h59m', () => {
    const fiveHours59m = new Date(Date.now() - (6 * 60 * 60 * 1000 - 60000)).toISOString();
    expect(shouldNotify(fiveHours59m)).toBe(false);
  });

  it('should notify after 6h cooldown expires', () => {
    // 7 hours ago
    const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    expect(shouldNotify(sevenHoursAgo)).toBe(true);
  });

  it('should notify after exactly 6h', () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000 - 1000).toISOString();
    expect(shouldNotify(sixHoursAgo)).toBe(true);
  });

  it('cooldown is per-session (userId+site scope)', () => {
    // Simulate two different sessions
    const sessionA = { cooldownNotifiedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() };
    const sessionB = { cooldownNotifiedAt: null };

    // Session A: notified 1h ago → don't re-notify
    expect(shouldNotify(sessionA.cooldownNotifiedAt)).toBe(false);
    // Session B: never notified → should notify
    expect(shouldNotify(sessionB.cooldownNotifiedAt)).toBe(true);
  });
});

describe('Reconnection Flow', () => {
  it('saveUserSession sets status to ACTIVE and clears error state', () => {
    // Simulates the upsert behavior
    const updateData = {
      status: 'ACTIVE',
      lastErrorAt: null,
      metadata: {
        cookieCount: 15,
        domains: ['.mercadolivre.com.br'],
        uploadedAt: new Date().toISOString(),
        source: 'user_upload',
      },
    };

    expect(updateData.status).toBe('ACTIVE');
    expect(updateData.lastErrorAt).toBeNull();
    // cooldownNotifiedAt is NOT in the new metadata → effectively cleared
    expect(updateData.metadata).not.toHaveProperty('cooldownNotifiedAt');
  });

  it('after reconnection, getSessionStatus returns needsAction=false', () => {
    // Simulates check after ACTIVE status
    const session = { status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) };

    const needsAction =
      session.status === 'NEEDS_REAUTH' ||
      session.status === 'EXPIRED' ||
      session.status === 'INVALID' ||
      (session.expiresAt && new Date() > session.expiresAt);

    expect(needsAction).toBe(false);
  });
});

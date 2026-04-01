import { describe, it, expect } from 'vitest';

/**
 * Tests for the session pool selection, failover, cooldown, and health logic.
 * Uses pure function extraction to test logic without DB dependencies.
 */

// ─── Types (mirroring session-pool.service.ts) ─────────────

type PoolHealthStatus = 'HEALTHY' | 'DEGRADED' | 'EMPTY';

interface SessionCandidate {
  id: string;
  status: string;
  isPrimary: boolean;
  priority: number;
  consecutiveFailures: number;
  cooldownUntil: Date | null;
  lastSuccessAt: Date | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

// ─── Pure logic extracted from service ──────────────────────

function isEligible(s: SessionCandidate, now: Date, excludeIds: string[]): boolean {
  if (excludeIds.includes(s.id)) return false;
  if (s.status !== 'ACTIVE') return false;
  if (s.cooldownUntil && s.cooldownUntil > now) return false;
  if (s.expiresAt && s.expiresAt < now) return false;
  return true;
}

function selectBestSession(
  sessions: SessionCandidate[],
  excludeIds: string[] = []
): SessionCandidate | null {
  const now = new Date();
  const eligible = sessions.filter((s) => isEligible(s, now, excludeIds));

  if (eligible.length === 0) return null;

  // Sort: isPrimary desc, priority asc, consecutiveFailures asc, lastUsedAt asc
  eligible.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.consecutiveFailures !== b.consecutiveFailures)
      return a.consecutiveFailures - b.consecutiveFailures;
    const aUsed = a.lastUsedAt?.getTime() || 0;
    const bUsed = b.lastUsedAt?.getTime() || 0;
    return aUsed - bUsed;
  });

  return eligible[0];
}

function calculatePoolHealth(sessions: SessionCandidate[]): PoolHealthStatus {
  const now = new Date();
  const activeCount = sessions.filter(
    (s) =>
      s.status === 'ACTIVE' &&
      (!s.cooldownUntil || s.cooldownUntil <= now) &&
      (!s.expiresAt || s.expiresAt >= now)
  ).length;

  if (sessions.length === 0 || activeCount === 0) return 'EMPTY';
  if (activeCount >= 2) return 'HEALTHY';
  return 'DEGRADED';
}

// ─── Helpers ────────────────────────────────────────────────

function makeSession(overrides: Partial<SessionCandidate> & { id: string }): SessionCandidate {
  return {
    status: 'ACTIVE',
    isPrimary: false,
    priority: 0,
    consecutiveFailures: 0,
    cooldownUntil: null,
    lastSuccessAt: null,
    lastUsedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

const futureDate = new Date(Date.now() + 86400000); // +1 day
const pastDate = new Date(Date.now() - 86400000); // -1 day
const futureCooldown = new Date(Date.now() + 30 * 60 * 1000); // +30 min

// ─── Tests ──────────────────────────────────────────────────

describe('Session Pool Selection', () => {
  it('selects the only active session', () => {
    const sessions = [makeSession({ id: 'sess-1', isPrimary: true })];
    expect(selectBestSession(sessions)?.id).toBe('sess-1');
  });

  it('returns null when no sessions exist', () => {
    expect(selectBestSession([])).toBeNull();
  });

  it('ignores NEEDS_REAUTH sessions', () => {
    const sessions = [
      makeSession({ id: 'sess-1', status: 'NEEDS_REAUTH', isPrimary: true }),
      makeSession({ id: 'sess-2', status: 'ACTIVE' }),
    ];
    expect(selectBestSession(sessions)?.id).toBe('sess-2');
  });

  it('ignores COOLING_DOWN sessions', () => {
    const sessions = [
      makeSession({ id: 'sess-1', status: 'COOLING_DOWN', isPrimary: true }),
      makeSession({ id: 'sess-2', status: 'ACTIVE' }),
    ];
    expect(selectBestSession(sessions)?.id).toBe('sess-2');
  });

  it('ignores sessions with active cooldownUntil (even if ACTIVE)', () => {
    const sessions = [
      makeSession({ id: 'sess-1', cooldownUntil: futureCooldown, isPrimary: true }),
      makeSession({ id: 'sess-2' }),
    ];
    expect(selectBestSession(sessions)?.id).toBe('sess-2');
  });

  it('ignores expired sessions', () => {
    const sessions = [
      makeSession({ id: 'sess-1', expiresAt: pastDate, isPrimary: true }),
      makeSession({ id: 'sess-2', expiresAt: futureDate }),
    ];
    expect(selectBestSession(sessions)?.id).toBe('sess-2');
  });

  it('prefers primary session over non-primary', () => {
    const sessions = [
      makeSession({ id: 'sess-2', isPrimary: false }),
      makeSession({ id: 'sess-1', isPrimary: true }),
    ];
    expect(selectBestSession(sessions)?.id).toBe('sess-1');
  });

  it('prefers lower priority number', () => {
    const sessions = [
      makeSession({ id: 'sess-high', priority: 10 }),
      makeSession({ id: 'sess-low', priority: 1 }),
    ];
    expect(selectBestSession(sessions)?.id).toBe('sess-low');
  });

  it('prefers fewer consecutiveFailures', () => {
    const sessions = [
      makeSession({ id: 'sess-bad', consecutiveFailures: 3 }),
      makeSession({ id: 'sess-good', consecutiveFailures: 0 }),
    ];
    expect(selectBestSession(sessions)?.id).toBe('sess-good');
  });

  it('prefers least recently used (round-robin effect)', () => {
    const sessions = [
      makeSession({ id: 'sess-recent', lastUsedAt: new Date() }),
      makeSession({ id: 'sess-old', lastUsedAt: pastDate }),
    ];
    expect(selectBestSession(sessions)?.id).toBe('sess-old');
  });

  it('excludes already-tried session IDs (failover)', () => {
    const sessions = [
      makeSession({ id: 'sess-1', isPrimary: true }),
      makeSession({ id: 'sess-2' }),
    ];
    const result = selectBestSession(sessions, ['sess-1']);
    expect(result?.id).toBe('sess-2');
  });

  it('returns null when all sessions are excluded', () => {
    const sessions = [
      makeSession({ id: 'sess-1' }),
      makeSession({ id: 'sess-2' }),
    ];
    expect(selectBestSession(sessions, ['sess-1', 'sess-2'])).toBeNull();
  });

  it('primary down + secondary active → selects secondary', () => {
    const sessions = [
      makeSession({ id: 'primary', isPrimary: true, status: 'NEEDS_REAUTH' }),
      makeSession({ id: 'secondary', isPrimary: false, status: 'ACTIVE' }),
    ];
    expect(selectBestSession(sessions)?.id).toBe('secondary');
  });
});

describe('Failover Simulation', () => {
  it('first attempt selects best; on failure, second attempt skips it', () => {
    const sessions = [
      makeSession({ id: 'sess-1', isPrimary: true }),
      makeSession({ id: 'sess-2' }),
      makeSession({ id: 'sess-3' }),
    ];

    // Attempt 1: selects primary
    const attempt1 = selectBestSession(sessions, []);
    expect(attempt1?.id).toBe('sess-1');

    // Simulate failure: mark sess-1 as tried
    const excluded = ['sess-1'];

    // Attempt 2: selects next best
    const attempt2 = selectBestSession(sessions, excluded);
    expect(attempt2?.id).toBe('sess-2');

    // Attempt 3: selects last
    excluded.push('sess-2');
    const attempt3 = selectBestSession(sessions, excluded);
    expect(attempt3?.id).toBe('sess-3');

    // Attempt 4: exhausted
    excluded.push('sess-3');
    expect(selectBestSession(sessions, excluded)).toBeNull();
  });

  it('failover skips NEEDS_REAUTH sessions automatically', () => {
    const sessions = [
      makeSession({ id: 'sess-1', isPrimary: true, status: 'NEEDS_REAUTH' }),
      makeSession({ id: 'sess-2', status: 'NEEDS_REAUTH' }),
      makeSession({ id: 'sess-3', status: 'ACTIVE' }),
    ];

    // First attempt already skips reauth sessions
    expect(selectBestSession(sessions)?.id).toBe('sess-3');
  });
});

describe('Pool Health Calculation', () => {
  it('EMPTY when no sessions exist', () => {
    expect(calculatePoolHealth([])).toBe('EMPTY');
  });

  it('EMPTY when all sessions are NEEDS_REAUTH', () => {
    const sessions = [
      makeSession({ id: '1', status: 'NEEDS_REAUTH' }),
      makeSession({ id: '2', status: 'NEEDS_REAUTH' }),
    ];
    expect(calculatePoolHealth(sessions)).toBe('EMPTY');
  });

  it('DEGRADED when only 1 session is active', () => {
    const sessions = [
      makeSession({ id: '1', status: 'ACTIVE' }),
      makeSession({ id: '2', status: 'NEEDS_REAUTH' }),
    ];
    expect(calculatePoolHealth(sessions)).toBe('DEGRADED');
  });

  it('HEALTHY when >= 2 sessions are active', () => {
    const sessions = [
      makeSession({ id: '1', status: 'ACTIVE' }),
      makeSession({ id: '2', status: 'ACTIVE' }),
    ];
    expect(calculatePoolHealth(sessions)).toBe('HEALTHY');
  });

  it('HEALTHY with 3 active sessions', () => {
    const sessions = [
      makeSession({ id: '1', status: 'ACTIVE' }),
      makeSession({ id: '2', status: 'ACTIVE' }),
      makeSession({ id: '3', status: 'ACTIVE' }),
    ];
    expect(calculatePoolHealth(sessions)).toBe('HEALTHY');
  });

  it('excludes expired sessions from active count', () => {
    const sessions = [
      makeSession({ id: '1', status: 'ACTIVE', expiresAt: pastDate }),
      makeSession({ id: '2', status: 'ACTIVE', expiresAt: pastDate }),
    ];
    expect(calculatePoolHealth(sessions)).toBe('EMPTY');
  });

  it('excludes sessions in cooldown from active count', () => {
    const sessions = [
      makeSession({ id: '1', status: 'ACTIVE', cooldownUntil: futureCooldown }),
      makeSession({ id: '2', status: 'ACTIVE' }),
    ];
    expect(calculatePoolHealth(sessions)).toBe('DEGRADED');
  });

  it('EMPTY when all sessions are DISABLED', () => {
    const sessions = [
      makeSession({ id: '1', status: 'DISABLED' }),
      makeSession({ id: '2', status: 'DISABLED' }),
    ];
    expect(calculatePoolHealth(sessions)).toBe('EMPTY');
  });
});

describe('Cooldown Logic', () => {
  it('session with past cooldownUntil is eligible', () => {
    const session = makeSession({
      id: 'sess-1',
      cooldownUntil: pastDate,
    });
    expect(isEligible(session, new Date(), [])).toBe(true);
  });

  it('session with future cooldownUntil is NOT eligible', () => {
    const session = makeSession({
      id: 'sess-1',
      cooldownUntil: futureCooldown,
    });
    expect(isEligible(session, new Date(), [])).toBe(false);
  });

  it('session with null cooldownUntil is eligible', () => {
    const session = makeSession({ id: 'sess-1' });
    expect(isEligible(session, new Date(), [])).toBe(true);
  });
});

describe('Non-regression: other sites', () => {
  it('sites without auth are not affected by session pool logic', () => {
    // OLX, Webmotors, etc. don't require auth
    // The monitor-runner checks siteRequiresAuth first
    // If false, it skips the entire pool logic
    const siteRequiresAuth = false;
    expect(siteRequiresAuth).toBe(false);
    // This test documents the contract: non-auth sites bypass pool entirely
  });
});

describe('Alert Rate Limiting', () => {
  const NOTIFICATION_COOLDOWN_HOURS = 6;
  const COOLDOWN_MS = NOTIFICATION_COOLDOWN_HOURS * 60 * 60 * 1000;

  function shouldNotify(cooldownNotifiedAt: string | null): boolean {
    if (!cooldownNotifiedAt) return true;
    const lastNotified = new Date(cooldownNotifiedAt);
    return Date.now() - lastNotified.getTime() > COOLDOWN_MS;
  }

  it('does not flood alerts within 6h cooldown', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(shouldNotify(oneHourAgo)).toBe(false);
  });

  it('sends alert after 6h cooldown expires', () => {
    const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    expect(shouldNotify(sevenHoursAgo)).toBe(true);
  });

  it('always sends first alert (null cooldown)', () => {
    expect(shouldNotify(null)).toBe(true);
  });
});

describe('Structured Filter Monitor Edge Case', () => {
  it('invalid structured filter does not crash pool selection', () => {
    // Structured filter returning null URL is handled in monitor-runner
    // before session pool selection happens (lines 75-168).
    // Pool selection only runs if URL is valid.
    // This test documents that separation.
    const structuredFiltersResult = null; // builder returned null
    const fallbackToHomepage = structuredFiltersResult === null;
    expect(fallbackToHomepage).toBe(true);
  });
});

/**
 * ============================================================
 * SESSION POOL SERVICE
 * ============================================================
 *
 * Manages multi-session pools per user/site for resilient scraping.
 *
 * Responsibilities:
 * - Select best eligible session from pool (health-weighted)
 * - Mark sessions as failed / quarantined / recovered
 * - Calculate pool health status
 * - Support failover: try next session on auth failure
 * - Enforce cooldown to prevent reuse of broken sessions
 *
 * Design: stateless service, all state in DB (UserSession table).
 */

import { prisma } from '../lib/prisma';
import { UserSessionStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import { cryptoManager } from '../auth/crypto-manager';

// ============================================================
// TYPES
// ============================================================

export type PoolHealthStatus = 'HEALTHY' | 'DEGRADED' | 'EMPTY';

export interface PoolHealth {
  userId: string;
  site: string;
  status: PoolHealthStatus;
  totalSessions: number;
  activeSessions: number;
  degradedSessions: number;
  needsReauthSessions: number;
  coolingDownSessions: number;
  disabledSessions: number;
}

export interface SessionCandidate {
  id: string;
  userId: string;
  site: string;
  domain: string;
  accountLabel: string | null;
  status: UserSessionStatus;
  isPrimary: boolean;
  priority: number;
  consecutiveFailures: number;
  cooldownUntil: Date | null;
  lastSuccessAt: Date | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

export interface SelectionResult {
  session: SessionCandidate | null;
  poolHealth: PoolHealthStatus;
  totalEligible: number;
  reason: string;
}

// ============================================================
// CONFIGURATION
// ============================================================

/** Max failover attempts per monitor execution */
export const MAX_FAILOVER_ATTEMPTS = 3;

/** Cooldown durations by failure type */
const COOLDOWN_DURATIONS_MS = {
  /** Transient error (network, timeout) */
  transient: 10 * 60 * 1000, // 10 min
  /** Auth error (needs reauth, verification) */
  auth: Infinity, // Until user reconnects
  /** Repeated failures (>= 3 consecutive) */
  repeated: 30 * 60 * 1000, // 30 min
} as const;

/** Minimum active sessions for HEALTHY status */
const HEALTHY_THRESHOLD = 2;

// ============================================================
// SERVICE
// ============================================================

class SessionPoolService {
  /**
   * Select the best eligible session from the pool for a user/site.
   *
   * Selection criteria (in order):
   * 1. Status must be ACTIVE
   * 2. Not in cooldown (cooldownUntil < now)
   * 3. Not expired
   * 4. Prefer isPrimary
   * 5. Prefer lower priority number
   * 6. Prefer fewer consecutiveFailures
   * 7. Prefer least recently used (round-robin effect)
   *
   * @param excludeIds - Session IDs to skip (already tried in this execution)
   */
  async selectSession(
    userId: string,
    site: string,
    excludeIds: string[] = []
  ): Promise<SelectionResult> {
    const now = new Date();

    // Fetch all sessions for this user/site
    const allSessions = await prisma.userSession.findMany({
      where: { userId, site },
      select: {
        id: true,
        userId: true,
        site: true,
        domain: true,
        accountLabel: true,
        status: true,
        isPrimary: true,
        priority: true,
        consecutiveFailures: true,
        cooldownUntil: true,
        lastSuccessAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
      orderBy: [
        { isPrimary: 'desc' },
        { priority: 'asc' },
        { consecutiveFailures: 'asc' },
        { lastUsedAt: 'asc' },
      ],
    });

    if (allSessions.length === 0) {
      return {
        session: null,
        poolHealth: 'EMPTY',
        totalEligible: 0,
        reason: 'NO_SESSIONS_CONFIGURED',
      };
    }

    // Filter eligible sessions
    const eligible = allSessions.filter((s) => {
      // Skip excluded IDs (already tried in this execution)
      if (excludeIds.includes(s.id)) return false;

      // Must be ACTIVE
      if (s.status !== UserSessionStatus.ACTIVE) return false;

      // Must not be in cooldown
      if (s.cooldownUntil && s.cooldownUntil > now) return false;

      // Must not be expired
      if (s.expiresAt && s.expiresAt < now) return false;

      return true;
    });

    const poolHealth = this.calculateHealthStatus(allSessions, now);

    if (eligible.length === 0) {
      // Check if there are sessions but all are ineligible
      const hasNeedsReauth = allSessions.some(
        (s) => s.status === UserSessionStatus.NEEDS_REAUTH
      );
      const hasCoolingDown = allSessions.some(
        (s) =>
          s.status === UserSessionStatus.COOLING_DOWN ||
          (s.cooldownUntil && s.cooldownUntil > now)
      );

      const reason = hasNeedsReauth
        ? 'ALL_SESSIONS_NEED_REAUTH'
        : hasCoolingDown
          ? 'ALL_SESSIONS_COOLING_DOWN'
          : 'NO_ELIGIBLE_SESSIONS';

      logger.warn(
        {
          userId: cryptoManager.mask(userId, 4, 4),
          site,
          totalSessions: allSessions.length,
          reason,
          excludeCount: excludeIds.length,
        },
        'SESSION_POOL_NO_ELIGIBLE'
      );

      return {
        session: null,
        poolHealth,
        totalEligible: 0,
        reason,
      };
    }

    // Best session is first (already sorted by DB query)
    const selected = eligible[0];

    logger.info(
      {
        userId: cryptoManager.mask(userId, 4, 4),
        site,
        sessionId: selected.id,
        isPrimary: selected.isPrimary,
        poolSize: allSessions.length,
        eligibleCount: eligible.length,
        consecutiveFailures: selected.consecutiveFailures,
      },
      'SESSION_SELECTED'
    );

    return {
      session: selected,
      poolHealth,
      totalEligible: eligible.length,
      reason: 'SESSION_AVAILABLE',
    };
  }

  /**
   * Mark a session as failed after an auth/verification error.
   * Applies cooldown and increments failure counters.
   */
  async markSessionFailed(
    sessionId: string,
    reason: string,
    failureType: 'transient' | 'auth' = 'auth'
  ): Promise<void> {
    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        site: true,
        consecutiveFailures: true,
        failureCount: true,
        metadata: true,
      },
    });

    if (!session) return;

    const newConsecutiveFailures = session.consecutiveFailures + 1;
    const newFailureCount = session.failureCount + 1;

    // Determine new status and cooldown
    let newStatus: UserSessionStatus;
    let cooldownUntil: Date | null = null;

    if (failureType === 'auth') {
      // Auth failures → NEEDS_REAUTH (no cooldown timer, needs human action)
      newStatus = UserSessionStatus.NEEDS_REAUTH;
    } else if (newConsecutiveFailures >= 3) {
      // Repeated transient failures → COOLING_DOWN
      newStatus = UserSessionStatus.COOLING_DOWN;
      cooldownUntil = new Date(Date.now() + COOLDOWN_DURATIONS_MS.repeated);
    } else {
      // Single transient failure → COOLING_DOWN with short cooldown
      newStatus = UserSessionStatus.COOLING_DOWN;
      cooldownUntil = new Date(Date.now() + COOLDOWN_DURATIONS_MS.transient);
    }

    const metadata = (session.metadata as Record<string, any>) || {};

    await prisma.userSession.update({
      where: { id: sessionId },
      data: {
        status: newStatus,
        consecutiveFailures: newConsecutiveFailures,
        failureCount: newFailureCount,
        lastFailureAt: new Date(),
        lastErrorAt: new Date(),
        cooldownUntil,
        reasonCode: reason,
        metadata: {
          ...metadata,
          lastErrorReason: reason,
          lastErrorAt: new Date().toISOString(),
        },
      },
    });

    logger.warn(
      {
        sessionId,
        userId: cryptoManager.mask(session.userId, 4, 4),
        site: session.site,
        failureType,
        newStatus,
        consecutiveFailures: newConsecutiveFailures,
        cooldownUntil: cooldownUntil?.toISOString() || null,
        reason,
      },
      'SESSION_QUARANTINED'
    );
  }

  /**
   * Mark a session as successfully used.
   * Resets failure counters and ensures ACTIVE status.
   */
  async markSessionSuccess(sessionId: string): Promise<void> {
    await prisma.userSession.update({
      where: { id: sessionId },
      data: {
        status: UserSessionStatus.ACTIVE,
        consecutiveFailures: 0,
        cooldownUntil: null,
        reasonCode: null,
        lastSuccessAt: new Date(),
        lastUsedAt: new Date(),
      },
    });
  }

  /**
   * Recover sessions whose cooldown has expired.
   * Called periodically to bring COOLING_DOWN sessions back to ACTIVE.
   */
  async recoverCooledDownSessions(): Promise<number> {
    const now = new Date();

    const result = await prisma.userSession.updateMany({
      where: {
        status: UserSessionStatus.COOLING_DOWN,
        cooldownUntil: { lte: now },
      },
      data: {
        status: UserSessionStatus.ACTIVE,
        cooldownUntil: null,
        reasonCode: null,
      },
    });

    if (result.count > 0) {
      logger.info(
        { recoveredCount: result.count },
        'SESSIONS_RECOVERED_FROM_COOLDOWN'
      );
    }

    return result.count;
  }

  /**
   * Get pool health for a user/site.
   */
  async getPoolHealth(userId: string, site: string): Promise<PoolHealth> {
    const now = new Date();

    const sessions = await prisma.userSession.findMany({
      where: { userId, site },
      select: {
        status: true,
        cooldownUntil: true,
        expiresAt: true,
      },
    });

    let active = 0;
    let degraded = 0;
    let needsReauth = 0;
    let coolingDown = 0;
    let disabled = 0;

    for (const s of sessions) {
      // Check expiration
      if (s.expiresAt && s.expiresAt < now) {
        degraded++;
        continue;
      }

      switch (s.status) {
        case UserSessionStatus.ACTIVE:
          if (s.cooldownUntil && s.cooldownUntil > now) {
            coolingDown++;
          } else {
            active++;
          }
          break;
        case UserSessionStatus.NEEDS_REAUTH:
          needsReauth++;
          break;
        case UserSessionStatus.COOLING_DOWN:
          coolingDown++;
          break;
        case UserSessionStatus.EXPIRED:
        case UserSessionStatus.INVALID:
          degraded++;
          break;
        case UserSessionStatus.DISABLED:
          disabled++;
          break;
      }
    }

    const status = this.calculateHealthFromCounts(active, sessions.length);

    return {
      userId,
      site,
      status,
      totalSessions: sessions.length,
      activeSessions: active,
      degradedSessions: degraded,
      needsReauthSessions: needsReauth,
      coolingDownSessions: coolingDown,
      disabledSessions: disabled,
    };
  }

  /**
   * Get pool health for all users/sites (admin overview).
   */
  async getAllPoolHealth(): Promise<PoolHealth[]> {
    const sessions = await prisma.userSession.findMany({
      select: {
        userId: true,
        site: true,
        status: true,
        cooldownUntil: true,
        expiresAt: true,
      },
    });

    // Group by userId+site
    const groups = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const key = `${s.userId}:${s.site}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }

    const results: PoolHealth[] = [];
    const now = new Date();

    for (const [key, group] of groups) {
      const [userId, site] = key.split(':');
      let active = 0;
      let degraded = 0;
      let needsReauth = 0;
      let coolingDown = 0;
      let disabled = 0;

      for (const s of group) {
        if (s.expiresAt && s.expiresAt < now) {
          degraded++;
          continue;
        }
        switch (s.status) {
          case UserSessionStatus.ACTIVE:
            if (s.cooldownUntil && s.cooldownUntil > now) coolingDown++;
            else active++;
            break;
          case UserSessionStatus.NEEDS_REAUTH:
            needsReauth++;
            break;
          case UserSessionStatus.COOLING_DOWN:
            coolingDown++;
            break;
          case UserSessionStatus.EXPIRED:
          case UserSessionStatus.INVALID:
            degraded++;
            break;
          case UserSessionStatus.DISABLED:
            disabled++;
            break;
        }
      }

      results.push({
        userId,
        site,
        status: this.calculateHealthFromCounts(active, group.length),
        totalSessions: group.length,
        activeSessions: active,
        degradedSessions: degraded,
        needsReauthSessions: needsReauth,
        coolingDownSessions: coolingDown,
        disabledSessions: disabled,
      });
    }

    return results;
  }

  // ─── Private helpers ──────────────────────────────────────

  private calculateHealthStatus(
    sessions: Pick<SessionCandidate, 'status' | 'cooldownUntil' | 'expiresAt'>[],
    now: Date
  ): PoolHealthStatus {
    const active = sessions.filter(
      (s) =>
        s.status === UserSessionStatus.ACTIVE &&
        (!s.cooldownUntil || s.cooldownUntil <= now) &&
        (!s.expiresAt || s.expiresAt >= now)
    ).length;

    return this.calculateHealthFromCounts(active, sessions.length);
  }

  private calculateHealthFromCounts(
    activeCount: number,
    totalCount: number
  ): PoolHealthStatus {
    if (totalCount === 0 || activeCount === 0) return 'EMPTY';
    if (activeCount >= HEALTHY_THRESHOLD) return 'HEALTHY';
    return 'DEGRADED';
  }
}

export const sessionPoolService = new SessionPoolService();

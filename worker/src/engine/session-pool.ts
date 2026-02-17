import { PageType } from './types';

/**
 * Session Pool — manages sessions per userId+site with health tracking.
 *
 * UserSession already supports multiple sessions via accountLabel.
 * Unique constraint: (userId, site, domain) — accountLabel differentiates sessions.
 *
 * Health Score:
 *   100 = ACTIVE, last execution SUCCESS
 *   -20 per BLOCKED/CAPTCHA
 *   -50 per LOGIN_REQUIRED/CHECKPOINT
 *   Reset to 100 after SUCCESS
 *
 * Rotation: Engine picks session with highest health score.
 * If ALL degraded -> returns best available + log warning.
 */

export interface SessionPoolEntry {
  sessionId: string;
  accountLabel: string;
  healthScore: number;
  lastPageType: PageType | null;
  lastUsedAt: Date;
  consecutiveFailures: number;
}

export class SessionPool {
  /**
   * Gets the best session for a user+site from the database.
   * Returns the session with highest health score.
   */
  async getBestSession(
    userId: string,
    site: string
  ): Promise<SessionPoolEntry | null> {
    const { prisma } = await import('../lib/prisma');

    const sessions = await prisma.userSession.findMany({
      where: {
        userId,
        site,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        accountLabel: true,
        metadata: true,
        lastUsedAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    if (sessions.length === 0) return null;

    // Map to pool entries with health scores
    const entries: SessionPoolEntry[] = sessions.map((s) => {
      const meta = (s.metadata as Record<string, any>) || {};
      return {
        sessionId: s.id,
        accountLabel: s.accountLabel || 'default',
        healthScore: typeof meta.healthScore === 'number' ? meta.healthScore : 100,
        lastPageType: meta.lastPageType || null,
        lastUsedAt: s.lastUsedAt || new Date(),
        consecutiveFailures: typeof meta.consecutiveFailures === 'number' ? meta.consecutiveFailures : 0,
      };
    });

    // Sort by health score (descending)
    entries.sort((a, b) => b.healthScore - a.healthScore);

    const best = entries[0];

    if (best.healthScore < 50) {
      console.warn(
        `SESSION_POOL: All sessions degraded for ${userId}/${site}. Best score: ${best.healthScore}`
      );
    }

    return best;
  }

  /**
   * Reports the result of a scrape to update health scores.
   */
  async reportResult(sessionId: string, pageType: PageType): Promise<void> {
    const { prisma } = await import('../lib/prisma');

    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });

    if (!session) return;

    const meta = (session.metadata as Record<string, any>) || {};
    let healthScore = typeof meta.healthScore === 'number' ? meta.healthScore : 100;
    let consecutiveFailures = typeof meta.consecutiveFailures === 'number' ? meta.consecutiveFailures : 0;

    switch (pageType) {
      case 'CONTENT':
      case 'NO_RESULTS':
        // Success — reset
        healthScore = 100;
        consecutiveFailures = 0;
        break;
      case 'BLOCKED':
      case 'CAPTCHA':
        healthScore = Math.max(0, healthScore - 20);
        consecutiveFailures++;
        break;
      case 'LOGIN_REQUIRED':
      case 'CHECKPOINT':
        healthScore = Math.max(0, healthScore - 50);
        consecutiveFailures++;
        break;
      default:
        healthScore = Math.max(0, healthScore - 10);
        consecutiveFailures++;
        break;
    }

    await prisma.userSession.update({
      where: { id: sessionId },
      data: {
        lastUsedAt: new Date(),
        metadata: {
          ...meta,
          healthScore,
          lastPageType: pageType,
          consecutiveFailures,
          lastReportAt: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Gets pool status for monitoring/debugging.
   */
  async getPoolStatus(
    userId: string,
    site: string
  ): Promise<SessionPoolEntry[]> {
    const { prisma } = await import('../lib/prisma');

    const sessions = await prisma.userSession.findMany({
      where: { userId, site },
      select: {
        id: true,
        accountLabel: true,
        metadata: true,
        lastUsedAt: true,
        status: true,
      },
    });

    return sessions.map((s) => {
      const meta = (s.metadata as Record<string, any>) || {};
      return {
        sessionId: s.id,
        accountLabel: s.accountLabel || 'default',
        healthScore: typeof meta.healthScore === 'number' ? meta.healthScore : 100,
        lastPageType: meta.lastPageType || null,
        lastUsedAt: s.lastUsedAt || new Date(),
        consecutiveFailures: typeof meta.consecutiveFailures === 'number' ? meta.consecutiveFailures : 0,
      };
    });
  }
}

export const sessionPool = new SessionPool();

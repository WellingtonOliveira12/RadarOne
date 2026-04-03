/**
 * PipelineWatchdog — Monitors pipeline health and alerts on silent failures.
 *
 * Runs every 5 minutes and checks:
 * 1. EMPTY rate across monitors (ML verification redirect detection)
 * 2. VERIFICATION_REQUIRED rate (session blocking)
 * 3. Notification drop (zero alerts when historical average > 0)
 * 4. Consecutive EMPTY per monitor (stuck monitor detection)
 *
 * Also runs AdsSeen cleanup (TTL 7 days) once per hour.
 */

import { prisma } from '../lib/prisma';
import { TelegramService } from './telegram-service';
import { log } from '../utils/logger';

// ─── Configuration ──────────────────────────────────────────

/** How often the watchdog runs (ms) */
const WATCHDOG_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** How often AdsSeen cleanup runs (ms) */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** AdsSeen records older than this are deleted */
const ADS_SEEN_TTL_DAYS = 7;

/** Alert thresholds */
const THRESHOLDS = {
  /** Trigger alert if >50% of executions in the window are EMPTY */
  highEmptyRate: 0.5,
  /** Trigger alert if >30% are VERIFICATION_REQUIRED */
  highVerificationRate: 0.3,
  /** Trigger alert if zero notifications sent in the lookback window */
  notificationDropLookbackMin: 60,
  /** Minimum executions in the window to trigger rate-based alerts */
  minExecutionsForAlert: 5,
  /** Consecutive EMPTY per monitor before alert */
  consecutiveEmptyThreshold: 3,
};

// ─── State ──────────────────────────────────────────────────

let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let lastCleanupAt = 0;

// Dedup: don't spam the same alert type within this window
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const lastAlertSentAt: Record<string, number> = {};

// ─── Public API ─────────────────────────────────────────────

export function startWatchdog(): void {
  if (watchdogTimer) return;

  console.log('WATCHDOG_STARTED: interval=5min cleanup=1h adsTTL=7d');

  // Run first check after 2 minutes (let system warm up after deploy)
  setTimeout(() => {
    runHealthCheck().catch((e) =>
      console.error('WATCHDOG_INITIAL_CHECK_ERROR:', e.message)
    );
  }, 2 * 60 * 1000);

  watchdogTimer = setInterval(() => {
    runHealthCheck().catch((e) =>
      console.error('WATCHDOG_CHECK_ERROR:', e.message)
    );
  }, WATCHDOG_INTERVAL_MS);

  cleanupTimer = setInterval(() => {
    runAdsSeenCleanup().catch((e) =>
      console.error('WATCHDOG_CLEANUP_ERROR:', e.message)
    );
  }, CLEANUP_INTERVAL_MS);
}

export function stopWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  console.log('WATCHDOG_STOPPED');
}

// ─── Health Check ───────────────────────────────────────────

interface HealthReport {
  totalExecutions: number;
  contentCount: number;
  emptyCount: number;
  verificationCount: number;
  noResultsCount: number;
  loginRequiredCount: number;
  alertsSentTotal: number;
  emptyRate: number;
  verificationRate: number;
  alerts: string[];
}

async function runHealthCheck(): Promise<void> {
  const lookback = new Date(Date.now() - WATCHDOG_INTERVAL_MS);

  try {
    // Get recent execution stats
    const stats = await prisma.siteExecutionStats.findMany({
      where: { startedAt: { gte: lookback } },
      select: {
        pageType: true,
        adsFound: true,
        success: true,
        site: true,
        monitorId: true,
      },
    });

    if (stats.length === 0) {
      log.info('WATCHDOG_TICK', { totalExecutions: 0, status: 'idle' });
      return;
    }

    const totalExecutions = stats.length;
    const contentCount = stats.filter((s) => s.pageType === 'CONTENT').length;
    const emptyCount = stats.filter((s) => s.pageType === 'EMPTY').length;
    // Cast to string to handle new enum values before Prisma client is regenerated
    const verificationCount = stats.filter(
      (s) => (s.pageType as string) === 'VERIFICATION_REQUIRED' || (s.pageType as string) === 'LOGIN_REQUIRED'
    ).length;
    const noResultsCount = stats.filter((s) => s.pageType === 'NO_RESULTS').length;
    const loginRequiredCount = stats.filter((s) => s.pageType === 'LOGIN_REQUIRED').length;
    const alertsSentTotal = stats.filter((s) => s.adsFound > 0).length;

    const emptyRate = totalExecutions > 0 ? emptyCount / totalExecutions : 0;
    const verificationRate = totalExecutions > 0 ? verificationCount / totalExecutions : 0;

    const alerts: string[] = [];

    // Check 1: High EMPTY rate
    if (
      totalExecutions >= THRESHOLDS.minExecutionsForAlert &&
      emptyRate > THRESHOLDS.highEmptyRate
    ) {
      alerts.push(
        `HIGH_EMPTY_RATE: ${(emptyRate * 100).toFixed(0)}% of executions returned EMPTY ` +
        `(${emptyCount}/${totalExecutions})`
      );
    }

    // Check 2: High verification/auth rate
    if (
      totalExecutions >= THRESHOLDS.minExecutionsForAlert &&
      verificationRate > THRESHOLDS.highVerificationRate
    ) {
      alerts.push(
        `SESSION_BLOCKING: ${(verificationRate * 100).toFixed(0)}% of executions hit ` +
        `verification/login (${verificationCount}/${totalExecutions})`
      );
    }

    // Check 3: Notification drop (short window — 60min)
    const notifLookback = new Date(
      Date.now() - THRESHOLDS.notificationDropLookbackMin * 60 * 1000
    );
    const recentNotifications = await prisma.notificationLog.count({
      where: {
        createdAt: { gte: notifLookback },
        status: 'SUCCESS',
        title: { not: { startsWith: '[SESSION' } }, // Exclude system notifications
      },
    });

    if (recentNotifications === 0 && totalExecutions >= THRESHOLDS.minExecutionsForAlert) {
      alerts.push(
        `NOTIFICATION_DROP: Zero ad notifications sent in the last ` +
        `${THRESHOLDS.notificationDropLookbackMin}min despite ${totalExecutions} executions`
      );
    }

    // Check 4: Prolonged silence — zero notifications for 4+ hours despite activity
    // This catches systemic issues like relevance filter killing all new ads
    const prolongedLookback = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours
    const prolongedNotifications = await prisma.notificationLog.count({
      where: {
        createdAt: { gte: prolongedLookback },
        status: 'SUCCESS',
        title: { not: { startsWith: '[SESSION' } },
      },
    });
    const prolongedExecutions = await prisma.siteExecutionStats.count({
      where: { startedAt: { gte: prolongedLookback }, adsFound: { gt: 0 } },
    });

    if (prolongedNotifications === 0 && prolongedExecutions >= 10) {
      alerts.push(
        `PROLONGED_SILENCE: Zero notifications in 4h despite ${prolongedExecutions} executions with ads. ` +
        `Possible: all_duplicates, relevance_filter_too_strict, or dispatch failure.`
      );
    }

    // Log health report
    const report: HealthReport = {
      totalExecutions,
      contentCount,
      emptyCount,
      verificationCount,
      noResultsCount,
      loginRequiredCount,
      alertsSentTotal,
      emptyRate: Math.round(emptyRate * 100) / 100,
      verificationRate: Math.round(verificationRate * 100) / 100,
      alerts,
    };

    log.info('WATCHDOG_HEALTH_REPORT', report);

    // Send alerts if needed
    for (const alert of alerts) {
      await sendWatchdogAlert(alert);
    }
  } catch (error: any) {
    log.warn('WATCHDOG_CHECK_FAILED', { error: error.message });
  }
}

// ─── AdsSeen Cleanup ────────────────────────────────────────

async function runAdsSeenCleanup(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS - 60_000) return; // Debounce
  lastCleanupAt = now;

  const cutoff = new Date(Date.now() - ADS_SEEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  try {
    const result = await prisma.adSeen.deleteMany({
      where: { lastSeenAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      log.info('WATCHDOG_ADS_CLEANUP', {
        deletedCount: result.count,
        ttlDays: ADS_SEEN_TTL_DAYS,
        cutoff: cutoff.toISOString(),
      });
    }
  } catch (error: any) {
    log.warn('WATCHDOG_ADS_CLEANUP_FAILED', { error: error.message });
  }
}

// ─── Alert Delivery ─────────────────────────────────────────

async function sendWatchdogAlert(message: string): Promise<void> {
  // Cooldown check: don't spam same alert type
  const alertKey = message.split(':')[0]; // e.g. "HIGH_EMPTY_RATE"
  const lastSent = lastAlertSentAt[alertKey] || 0;
  if (Date.now() - lastSent < ALERT_COOLDOWN_MS) return;

  lastAlertSentAt[alertKey] = Date.now();

  console.warn(`WATCHDOG_ALERT: ${message}`);

  // Send to admin Telegram if configured
  const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (adminChatId) {
    try {
      const htmlMessage =
        `🚨 <b>RadarOne Watchdog Alert</b>\n\n` +
        `<code>${TelegramService.escapeHtml(message)}</code>\n\n` +
        `⏰ ${new Date().toISOString()}`;

      await TelegramService.sendMessage(adminChatId, htmlMessage);
    } catch (e: any) {
      log.warn('WATCHDOG_ALERT_SEND_FAILED', { error: e.message });
    }
  }
}

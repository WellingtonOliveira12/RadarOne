/**
 * ResilientScheduler — in-process scheduler for RadarOne worker.
 *
 * DESIGN PRINCIPLES:
 * 1. Discovery is separated from execution (no blocking the tick)
 * 2. Concurrent execution pool with global + per-site limits
 * 3. Jitter prevents synchronized thundering-herd
 * 4. Staggered restart prevents burst after deploy/OOM
 * 5. Scheduler lag is tracked per monitor
 * 6. Backlog policy prevents accumulated overdue from exploding
 * 7. lastCheckedAt is updated at START to prevent drift
 *
 * NO external dependencies (no Redis/BullMQ required).
 * Works with the existing MonitorRunner without changes.
 */

import { prisma } from '../lib/prisma';
import { MonitorRunner, type MonitorRunResult } from './monitor-runner';
import { captureException } from '../monitoring/sentry';

// ─── Configuration ──────────────────────────────────────────

/** How often the scheduler ticks to discover due monitors (ms) */
const TICK_INTERVAL_MS = 30_000; // 30 seconds

/** Default check interval for users without a plan (Free tier) */
const DEFAULT_CHECK_INTERVAL_MIN = 60;

/** Maximum concurrent monitor executions (global) */
const MAX_GLOBAL_CONCURRENCY = parseInt(process.env.SCHEDULER_CONCURRENCY || '3');

/** Maximum overdue ratio before we apply catch-up throttle */
const OVERDUE_RATIO_THRESHOLD = 2.0;

/** Delay spread on restart — each monitor gets a random delay up to this (ms) */
const RESTART_SPREAD_MS = 60_000; // 1 minute spread on restart

/** Per-site concurrency limits (heavy sites get lower limits) */
const SITE_CONCURRENCY: Record<string, number> = {
  FACEBOOK_MARKETPLACE: 1, // Heavy: aggressive stealth, adaptive scroll, 60s timeout
  MERCADO_LIVRE: 2,
  OLX: 2,
  WEBMOTORS: 2,
  ICARROS: 2,
  ZAP_IMOVEIS: 2,
  VIVA_REAL: 2,
  IMOVELWEB: 2,
  LEILAO: 1,
};

/** Site execution weight for priority ordering (lower = higher priority) */
const SITE_WEIGHT: Record<string, number> = {
  MERCADO_LIVRE: 1,  // Proven stable — run first
  OLX: 2,
  FACEBOOK_MARKETPLACE: 3, // Heaviest — run last
  WEBMOTORS: 2,
  ICARROS: 2,
  ZAP_IMOVEIS: 2,
  VIVA_REAL: 2,
  IMOVELWEB: 2,
  LEILAO: 3,
};

// ─── Types ──────────────────────────────────────────────────

interface QueuedMonitor {
  monitor: any; // Prisma monitor with includes
  dueAt: Date;  // When this monitor became due
  enqueuedAt: Date;
  jitterMs: number;
  schedulerLagMs: number; // How late we are relative to ideal dueAt
}

interface SchedulerMetrics {
  tickCount: number;
  queueDepth: number;
  activeCount: number;
  perSiteActive: Record<string, number>;
  dueCount: number;
  startedCount: number;
  finishedCount: number;
  skippedCount: number;
  overdueMonitorCount: number;
  avgSchedulerLagMs: number;
  avgExecutionMs: Record<string, number>;
}

// ─── Scheduler ──────────────────────────────────────────────

export class ResilientScheduler {
  private queue: QueuedMonitor[] = [];
  private activeCount = 0;
  private perSiteActive: Record<string, number> = {};
  private tickTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private tickCount = 0;
  private isFirstTick = true;

  // Metrics tracking
  private startedCount = 0;
  private finishedCount = 0;
  private skippedCount = 0;
  private executionTimes: Record<string, number[]> = {};
  private schedulerLags: number[] = [];

  // Track which monitors are currently being executed (prevent double-execution)
  private executingMonitorIds = new Set<string>();

  async start(): Promise<void> {
    this.isRunning = true;
    this.isFirstTick = true;

    console.log('SCHEDULER_INIT', JSON.stringify({
      tickIntervalMs: TICK_INTERVAL_MS,
      maxGlobalConcurrency: MAX_GLOBAL_CONCURRENCY,
      siteConcurrency: SITE_CONCURRENCY,
      restartSpreadMs: RESTART_SPREAD_MS,
    }));

    // First tick immediately
    await this.tick();

    // Schedule subsequent ticks
    this.tickTimer = setInterval(() => {
      this.tick().catch((err) => {
        console.error('SCHEDULER_TICK_ERROR:', err.message);
        captureException(err, { context: 'scheduler_tick' });
      });
    }, TICK_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    // Wait for active executions to drain (max 60s)
    const deadline = Date.now() + 60_000;
    while (this.activeCount > 0 && Date.now() < deadline) {
      console.log(`SCHEDULER_DRAIN: waiting for ${this.activeCount} active executions...`);
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (this.activeCount > 0) {
      console.warn(`SCHEDULER_DRAIN_TIMEOUT: ${this.activeCount} executions still active`);
    }

    console.log('SCHEDULER_STOPPED');
  }

  getMetrics(): SchedulerMetrics {
    const avgLag = this.schedulerLags.length > 0
      ? Math.round(this.schedulerLags.reduce((a, b) => a + b, 0) / this.schedulerLags.length)
      : 0;

    const avgExec: Record<string, number> = {};
    for (const [site, times] of Object.entries(this.executionTimes)) {
      if (times.length > 0) {
        avgExec[site] = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      }
    }

    return {
      tickCount: this.tickCount,
      queueDepth: this.queue.length,
      activeCount: this.activeCount,
      perSiteActive: { ...this.perSiteActive },
      dueCount: 0, // Set during tick
      startedCount: this.startedCount,
      finishedCount: this.finishedCount,
      skippedCount: this.skippedCount,
      overdueMonitorCount: this.queue.filter(
        (q) => q.schedulerLagMs > DEFAULT_CHECK_INTERVAL_MIN * 60_000 * OVERDUE_RATIO_THRESHOLD
      ).length,
      avgSchedulerLagMs: avgLag,
      avgExecutionMs: avgExec,
    };
  }

  // ─── Core Tick ──────────────────────────────────────────────

  private async tick(): Promise<void> {
    if (!this.isRunning) return;

    this.tickCount++;
    const tickStart = Date.now();
    const now = new Date();

    console.log(`SCHEDULER_TICK_START #${this.tickCount} queue=${this.queue.length} active=${this.activeCount}`);

    try {
      // STEP 1: Discover due monitors
      const dueMonitors = await this.discoverDueMonitors(now);

      if (dueMonitors.length > 0) {
        console.log(`MONITOR_DUE_DISCOVERED: count=${dueMonitors.length} monitors=[${dueMonitors.map((m) => m.name).join(', ')}]`);
      }

      // STEP 2: Enqueue with jitter (skip already queued or executing)
      let enqueued = 0;
      for (const monitor of dueMonitors) {
        if (this.executingMonitorIds.has(monitor.id)) {
          console.log(`MONITOR_EXECUTION_SKIPPED: name=${monitor.name} reason=already_executing`);
          this.skippedCount++;
          continue;
        }

        if (this.queue.some((q) => q.monitor.id === monitor.id)) {
          console.log(`MONITOR_EXECUTION_SKIPPED: name=${monitor.name} reason=already_queued`);
          this.skippedCount++;
          continue;
        }

        const subscription = monitor.user.subscriptions[0];
        const checkIntervalMin = subscription?.plan?.checkInterval || DEFAULT_CHECK_INTERVAL_MIN;
        const checkIntervalMs = checkIntervalMin * 60_000;

        // Calculate scheduler lag
        const idealDueAt = monitor.lastCheckedAt
          ? new Date(monitor.lastCheckedAt.getTime() + checkIntervalMs)
          : now;
        const schedulerLagMs = Math.max(0, now.getTime() - idealDueAt.getTime());

        // Apply jitter: ±15% of check interval
        let jitterMs = 0;
        if (this.isFirstTick) {
          // On restart: spread monitors over RESTART_SPREAD_MS to prevent burst
          jitterMs = Math.round(Math.random() * RESTART_SPREAD_MS);
        } else {
          // Normal: ±15% of check interval
          const jitterRange = checkIntervalMs * 0.15;
          jitterMs = Math.round((Math.random() - 0.5) * 2 * jitterRange);
        }

        // Backlog policy: if severely overdue (>2x interval), don't add extra jitter
        if (schedulerLagMs > checkIntervalMs * OVERDUE_RATIO_THRESHOLD) {
          jitterMs = 0;
          console.log(`SCHEDULER_LAG_DETECTED: name=${monitor.name} lagMs=${schedulerLagMs} interval=${checkIntervalMs} — no jitter applied`);
        }

        this.queue.push({
          monitor,
          dueAt: idealDueAt,
          enqueuedAt: now,
          jitterMs,
          schedulerLagMs,
        });

        this.schedulerLags.push(schedulerLagMs);
        // Keep only last 100 lag measurements
        if (this.schedulerLags.length > 100) this.schedulerLags.shift();

        console.log(`MONITOR_ENQUEUED: name=${monitor.name} site=${monitor.site} lagMs=${schedulerLagMs} jitterMs=${jitterMs}`);
        enqueued++;
      }

      // STEP 3: Sort queue by priority (weight + due time)
      this.queue.sort((a, b) => {
        const weightA = SITE_WEIGHT[a.monitor.site] || 5;
        const weightB = SITE_WEIGHT[b.monitor.site] || 5;
        if (weightA !== weightB) return weightA - weightB;
        return a.dueAt.getTime() - b.dueAt.getTime();
      });

      // STEP 4: Drain queue into execution pool
      await this.drainQueue();

      // Log backlog warning
      if (this.queue.length > 5) {
        console.warn(`BACKLOG_OVER_THRESHOLD: depth=${this.queue.length} active=${this.activeCount}`);
      }

    } catch (error: any) {
      console.error('SCHEDULER_TICK_ERROR:', error.message);
      captureException(error, { context: 'scheduler_tick' });
    } finally {
      this.isFirstTick = false;
      const tickDuration = Date.now() - tickStart;
      console.log(`SCHEDULER_TICK_END #${this.tickCount} duration=${tickDuration}ms queue=${this.queue.length} active=${this.activeCount} enqueued=${this.startedCount}`);
    }
  }

  // ─── Discovery ──────────────────────────────────────────────

  private async discoverDueMonitors(now: Date): Promise<any[]> {
    const allMonitors = await prisma.monitor.findMany({
      where: { active: true },
      include: {
        user: {
          include: {
            subscriptions: {
              where: {
                OR: [{ status: 'ACTIVE' }, { status: 'TRIAL' }],
              },
              include: { plan: true },
              take: 1,
            },
            notificationSettings: true,
            telegramAccounts: {
              where: { active: true },
              take: 1,
            },
          },
        },
      },
    });

    return allMonitors.filter((monitor) => {
      const subscription = monitor.user.subscriptions[0];
      if (!subscription) return false;

      const plan = subscription.plan;
      const checkIntervalMin = plan?.checkInterval || DEFAULT_CHECK_INTERVAL_MIN;

      if (!monitor.lastCheckedAt) return true;

      // Clock drift protection
      if (monitor.lastCheckedAt.getTime() > now.getTime() + 60_000) {
        console.warn(`CLOCK_DRIFT: name=${monitor.name} lastCheckedAt in future`);
        return false;
      }

      const nextRunAt = new Date(monitor.lastCheckedAt.getTime() + checkIntervalMin * 60_000);
      return now >= nextRunAt;
    });
  }

  // ─── Execution Pool ─────────────────────────────────────────

  private async drainQueue(): Promise<void> {
    while (this.queue.length > 0 && this.activeCount < MAX_GLOBAL_CONCURRENCY) {
      // Find first item in queue that respects per-site concurrency
      const idx = this.queue.findIndex((q) => {
        const site = q.monitor.site;
        const siteLimit = SITE_CONCURRENCY[site] || 2;
        const siteActive = this.perSiteActive[site] || 0;
        return siteActive < siteLimit;
      });

      if (idx === -1) {
        // All queued monitors are blocked by per-site limits
        const blocked = Object.entries(this.perSiteActive)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        console.log(`CONCURRENCY_LIMIT_REACHED: global=${this.activeCount}/${MAX_GLOBAL_CONCURRENCY} perSite=[${blocked}]`);
        break;
      }

      const queued = this.queue.splice(idx, 1)[0];

      // Apply jitter delay if positive
      if (queued.jitterMs > 0) {
        // Don't await jitter — just delay the execution start
        this.executeWithDelay(queued, queued.jitterMs);
      } else {
        this.executeMonitor(queued);
      }
    }
  }

  private async executeWithDelay(queued: QueuedMonitor, delayMs: number): Promise<void> {
    // Reserve the slot immediately
    this.activeCount++;
    const site = queued.monitor.site;
    this.perSiteActive[site] = (this.perSiteActive[site] || 0) + 1;
    this.executingMonitorIds.add(queued.monitor.id);

    setTimeout(() => {
      this.runMonitor(queued).finally(() => {
        this.releaseSlot(queued.monitor);
        // Try to drain more from queue
        this.drainQueue().catch(() => {});
      });
    }, delayMs);
  }

  private executeMonitor(queued: QueuedMonitor): void {
    // Reserve the slot immediately
    this.activeCount++;
    const site = queued.monitor.site;
    this.perSiteActive[site] = (this.perSiteActive[site] || 0) + 1;
    this.executingMonitorIds.add(queued.monitor.id);

    // Fire-and-forget (non-blocking — allows concurrent execution)
    this.runMonitor(queued).finally(() => {
      this.releaseSlot(queued.monitor);
      // Try to drain more from queue
      this.drainQueue().catch(() => {});
    });
  }

  private releaseSlot(monitor: any): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    const site = monitor.site;
    this.perSiteActive[site] = Math.max(0, (this.perSiteActive[site] || 0) - 1);
    this.executingMonitorIds.delete(monitor.id);
  }

  private async runMonitor(queued: QueuedMonitor): Promise<void> {
    const { monitor, schedulerLagMs, enqueuedAt } = queued;
    const startTime = Date.now();
    const queueWaitMs = startTime - enqueuedAt.getTime();

    this.startedCount++;

    console.log(
      `MONITOR_EXECUTION_STARTED: name=${monitor.name} site=${monitor.site} ` +
      `monitorId=${monitor.id} schedulerLagMs=${schedulerLagMs} queueWaitMs=${queueWaitMs}`
    );

    // Update lastCheckedAt at START to prevent drift
    // This ensures the next due time is calculated from when we started, not when we finished
    try {
      await prisma.monitor.update({
        where: { id: monitor.id },
        data: { lastCheckedAt: new Date() },
      });
    } catch (e: any) {
      console.error(`MONITOR_LASTCHECKED_UPDATE_FAILED: ${monitor.name} ${e.message}`);
    }

    try {
      // Mark that scheduler already updated lastCheckedAt at start
      (monitor as any).__lastCheckedAtSetByScheduler = true;

      const result: MonitorRunResult = await MonitorRunner.run(monitor) || { status: 'SUCCESS' };
      const durationMs = Date.now() - startTime;
      this.finishedCount++;

      // Track execution time per site
      if (!this.executionTimes[monitor.site]) this.executionTimes[monitor.site] = [];
      this.executionTimes[monitor.site].push(durationMs);
      // Keep last 50 per site
      if (this.executionTimes[monitor.site].length > 50) {
        this.executionTimes[monitor.site].shift();
      }

      const logStatus = result.status;
      const reasonSuffix = result.reason ? ` reason=${result.reason}` : '';
      console.log(
        `MONITOR_EXECUTION_FINISHED: name=${monitor.name} site=${monitor.site} ` +
        `durationMs=${durationMs} schedulerLagMs=${schedulerLagMs} status=${logStatus}${reasonSuffix}`
      );
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      console.error(
        `MONITOR_EXECUTION_FINISHED: name=${monitor.name} site=${monitor.site} ` +
        `durationMs=${durationMs} schedulerLagMs=${schedulerLagMs} status=ERROR error=${error.message}`
      );

      captureException(error, {
        context: 'scheduler_monitor_execution',
        monitorId: monitor.id,
        site: monitor.site,
      });
    }
  }
}

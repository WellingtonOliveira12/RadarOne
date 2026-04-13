/**
 * OLX Enrich Rate Limiter
 *
 * In-memory rate limiter for the OLX profile enrichment flow. Prevents
 * silent escalation of detail-page navigations beyond the configured
 * budgets:
 *
 *   - Per-run cap         (already enforced at the call site via ads.slice(0,N))
 *   - Per-monitor / hour  → this module
 *   - Global / hour       → this module
 *
 * Implementation: ring buffer of timestamps per scope, rolling 60-minute
 * window. Lives in the worker process memory. When the worker restarts
 * the counters reset — that is intentional, we want fresh budgets after
 * a redeploy.
 *
 * Pure-ish module: only side effect is a module-level Map. Easy to reset
 * between tests via `resetOlxEnrichLimiter()`.
 */

import { logger } from '../../utils/logger';

const WINDOW_MS = 60 * 60 * 1000; // 60 minutes

interface Budgets {
  perMonitorHour: number;
  globalHour: number;
}

function readBudgets(): Budgets {
  const perMonitor = parseInt(process.env.OLX_ENRICH_MAX_PER_MONITOR_HOUR || '', 10);
  const global = parseInt(process.env.OLX_ENRICH_MAX_GLOBAL_HOUR || '', 10);
  return {
    perMonitorHour: Number.isFinite(perMonitor) && perMonitor > 0 ? perMonitor : 20,
    globalHour: Number.isFinite(global) && global > 0 ? global : 60,
  };
}

const perMonitorHits = new Map<string, number[]>();
const globalHits: number[] = [];

function pruneBefore(arr: number[], cutoff: number): void {
  while (arr.length > 0 && arr[0] < cutoff) arr.shift();
}

/**
 * Check whether a new enrichment is allowed for the given monitor RIGHT
 * NOW. Does NOT register the hit — caller must call {@link recordEnrichHit}
 * after a successful attempt (pass AND fail both consume budget, to make
 * failures count against escalation).
 */
export function canEnrichNow(monitorId: string, now: number = Date.now()): {
  allowed: boolean;
  reason?: string;
  usage: { monitor: number; global: number; budgets: Budgets };
} {
  const budgets = readBudgets();
  const cutoff = now - WINDOW_MS;

  // Prune old hits
  pruneBefore(globalHits, cutoff);
  const monHits = perMonitorHits.get(monitorId) || [];
  pruneBefore(monHits, cutoff);
  if (monHits.length === 0) perMonitorHits.delete(monitorId);
  else perMonitorHits.set(monitorId, monHits);

  const usage = {
    monitor: monHits.length,
    global: globalHits.length,
    budgets,
  };

  if (monHits.length >= budgets.perMonitorHour) {
    return { allowed: false, reason: 'per_monitor_hour_exceeded', usage };
  }
  if (globalHits.length >= budgets.globalHour) {
    return { allowed: false, reason: 'global_hour_exceeded', usage };
  }
  return { allowed: true, usage };
}

/** Records an enrichment attempt (success or failure) for rate-limit purposes. */
export function recordEnrichHit(monitorId: string, now: number = Date.now()): void {
  globalHits.push(now);
  const monHits = perMonitorHits.get(monitorId) || [];
  monHits.push(now);
  perMonitorHits.set(monitorId, monHits);
}

/** Reset all counters — for tests. */
export function resetOlxEnrichLimiter(): void {
  perMonitorHits.clear();
  globalHits.length = 0;
}

/** Snapshot for observability logs. */
export function limiterSnapshot(): {
  global: number;
  monitors: Record<string, number>;
  budgets: Budgets;
} {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  pruneBefore(globalHits, cutoff);
  const monitors: Record<string, number> = {};
  for (const [k, v] of perMonitorHits) {
    pruneBefore(v, cutoff);
    if (v.length > 0) monitors[k] = v.length;
    else perMonitorHits.delete(k);
  }
  return { global: globalHits.length, monitors, budgets: readBudgets() };
}

/** Log a limiter-blocked decision with context (used by the enricher). */
export function logLimiterBlocked(
  monitorId: string,
  reason: string,
  usage: ReturnType<typeof canEnrichNow>['usage'],
): void {
  logger.warn(
    {
      monitorId,
      reason,
      usageMonitor: usage.monitor,
      usageGlobal: usage.global,
      budgetPerMonitor: usage.budgets.perMonitorHour,
      budgetGlobal: usage.budgets.globalHour,
    },
    'OLX_ENRICH_RATE_LIMITED',
  );
}

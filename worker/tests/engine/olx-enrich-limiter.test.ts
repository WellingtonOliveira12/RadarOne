import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  canEnrichNow,
  recordEnrichHit,
  resetOlxEnrichLimiter,
  limiterSnapshot,
} from '../../src/engine/enrichment/olx-enrich-limiter';

describe('olx-enrich-limiter', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    resetOlxEnrichLimiter();
    process.env.OLX_ENRICH_MAX_PER_MONITOR_HOUR = '3';
    process.env.OLX_ENRICH_MAX_GLOBAL_HOUR = '5';
  });

  afterEach(() => {
    process.env = { ...origEnv };
    resetOlxEnrichLimiter();
  });

  it('allows the first hit and returns usage 0', () => {
    const r = canEnrichNow('mon1');
    expect(r.allowed).toBe(true);
    expect(r.usage.monitor).toBe(0);
    expect(r.usage.global).toBe(0);
  });

  it('blocks a monitor after hitting the per-monitor cap', () => {
    recordEnrichHit('mon1');
    recordEnrichHit('mon1');
    recordEnrichHit('mon1');
    const r = canEnrichNow('mon1');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('per_monitor_hour_exceeded');
    expect(r.usage.monitor).toBe(3);
  });

  it('blocks when global cap is exceeded even across monitors', () => {
    recordEnrichHit('mon1');
    recordEnrichHit('mon2');
    recordEnrichHit('mon3');
    recordEnrichHit('mon4');
    recordEnrichHit('mon5');
    const r = canEnrichNow('mon6');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('global_hour_exceeded');
    expect(r.usage.global).toBe(5);
  });

  it('per-monitor cap is independent across monitors', () => {
    recordEnrichHit('mon1');
    recordEnrichHit('mon1');
    recordEnrichHit('mon1');
    // mon1 at cap, mon2 still fresh and global still has room
    const r2 = canEnrichNow('mon2');
    expect(r2.allowed).toBe(true);
  });

  it('prunes old hits beyond 60 min window', () => {
    const now = Date.now();
    const longAgo = now - 61 * 60 * 1000;
    // Monkey-patch Date.now is expensive — use the explicit timestamp
    // parameter overload instead by calling record with fake old times.
    // Since the current impl uses Date.now() internally, we simulate by
    // recording via an injected clock hack through the exported API:
    // we rely on the internal prune in `canEnrichNow` with a `now` arg.
    // The internal queue is private, so we just verify the snapshot API
    // prunes when called.
    recordEnrichHit('mon1', longAgo);
    recordEnrichHit('mon1', longAgo);
    recordEnrichHit('mon1', longAgo);
    const r = canEnrichNow('mon1', now);
    expect(r.allowed).toBe(true);
    expect(r.usage.monitor).toBe(0);
  });

  it('snapshot reflects current window', () => {
    recordEnrichHit('mon1');
    recordEnrichHit('mon2');
    const snap = limiterSnapshot();
    expect(snap.global).toBe(2);
    expect(snap.monitors.mon1).toBe(1);
    expect(snap.monitors.mon2).toBe(1);
    expect(snap.budgets.perMonitorHour).toBe(3);
    expect(snap.budgets.globalHour).toBe(5);
  });
});

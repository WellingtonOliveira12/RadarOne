import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for ResilientScheduler design invariants.
 *
 * These tests validate the scheduler's core logic without
 * needing a real database or browser — using mocked Prisma and MonitorRunner.
 */

// ─── Mocks ──────────────────────────────────────────────────

// Mock prisma
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    monitor: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

// Mock monitor runner
vi.mock('../../src/services/monitor-runner', () => ({
  MonitorRunner: {
    run: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock sentry
vi.mock('../../src/monitoring/sentry', () => ({
  initSentry: vi.fn(),
  captureException: vi.fn(),
}));

import { ResilientScheduler } from '../../src/services/resilient-scheduler';
import { prisma } from '../../src/lib/prisma';
import { MonitorRunner } from '../../src/services/monitor-runner';

// ─── Helper: Create mock monitors ──────────────────────────

function createMockMonitor(overrides: any = {}) {
  return {
    id: overrides.id || `monitor-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name || 'Test Monitor',
    site: overrides.site || 'MERCADO_LIVRE',
    active: true,
    searchUrl: 'https://example.com',
    alertsEnabled: true,
    lastCheckedAt: overrides.lastCheckedAt || new Date(Date.now() - 120 * 60_000), // 2h ago
    userId: 'user-1',
    priceMin: null,
    priceMax: null,
    user: {
      id: 'user-1',
      email: 'test@test.com',
      subscriptions: [{
        id: 'sub-1',
        status: 'ACTIVE',
        queriesUsed: 0,
        queriesLimit: 1000,
        plan: {
          id: 'plan-1',
          name: overrides.planName || 'Pro',
          checkInterval: overrides.checkInterval || 15,
        },
      }],
      notificationSettings: null,
      telegramAccounts: [],
    },
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('ResilientScheduler', () => {
  let scheduler: ResilientScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new ResilientScheduler();
  });

  describe('Initialization', () => {
    it('starts with empty metrics', () => {
      const metrics = scheduler.getMetrics();
      expect(metrics.tickCount).toBe(0);
      expect(metrics.queueDepth).toBe(0);
      expect(metrics.activeCount).toBe(0);
      expect(metrics.startedCount).toBe(0);
      expect(metrics.finishedCount).toBe(0);
    });
  });

  describe('Discovery', () => {
    it('discovers monitors that are due', async () => {
      const dueMonitor = createMockMonitor({
        name: 'Due Monitor',
        lastCheckedAt: new Date(Date.now() - 120 * 60_000), // 2h ago, interval 15min
      });

      (prisma.monitor.findMany as any).mockResolvedValue([dueMonitor]);

      await scheduler.start();
      // Wait for first tick to complete
      await new Promise((r) => setTimeout(r, 100));
      await scheduler.stop();

      expect(MonitorRunner.run).toHaveBeenCalledTimes(1);
    });

    it('skips monitors that are not due yet', async () => {
      const notDueMonitor = createMockMonitor({
        name: 'Not Due',
        lastCheckedAt: new Date(), // just now
        checkInterval: 60,
      });

      (prisma.monitor.findMany as any).mockResolvedValue([notDueMonitor]);

      await scheduler.start();
      await new Promise((r) => setTimeout(r, 100));
      await scheduler.stop();

      expect(MonitorRunner.run).not.toHaveBeenCalled();
    });

    it('skips monitors without active subscription', async () => {
      const noSubMonitor = createMockMonitor({
        name: 'No Sub',
        user: {
          id: 'user-1',
          email: 'test@test.com',
          subscriptions: [], // No subscription
          notificationSettings: null,
          telegramAccounts: [],
        },
      });

      (prisma.monitor.findMany as any).mockResolvedValue([noSubMonitor]);

      await scheduler.start();
      await new Promise((r) => setTimeout(r, 100));
      await scheduler.stop();

      expect(MonitorRunner.run).not.toHaveBeenCalled();
    });
  });

  describe('Duplicate Prevention', () => {
    it('does not execute the same monitor twice concurrently', async () => {
      // MonitorRunner.run takes 500ms
      (MonitorRunner.run as any).mockImplementation(() => new Promise((r) => setTimeout(r, 500)));

      const monitor = createMockMonitor({ name: 'Slow Monitor' });

      // Return same monitor on two consecutive ticks
      (prisma.monitor.findMany as any).mockResolvedValue([monitor]);

      await scheduler.start();
      // Wait for first tick to start, then second tick
      await new Promise((r) => setTimeout(r, 200));

      // Metrics should show only 1 started
      const metrics = scheduler.getMetrics();
      expect(metrics.startedCount).toBe(1);

      await scheduler.stop();
    });
  });

  describe('Per-Site Concurrency', () => {
    it('limits Facebook to 1 concurrent execution', async () => {
      (MonitorRunner.run as any).mockImplementation(() => new Promise((r) => setTimeout(r, 300)));

      const fb1 = createMockMonitor({ id: 'fb-1', name: 'FB 1', site: 'FACEBOOK_MARKETPLACE' });
      const fb2 = createMockMonitor({ id: 'fb-2', name: 'FB 2', site: 'FACEBOOK_MARKETPLACE' });

      (prisma.monitor.findMany as any).mockResolvedValue([fb1, fb2]);

      await scheduler.start();
      await new Promise((r) => setTimeout(r, 100));

      // Only 1 FB should be active at a time
      const metrics = scheduler.getMetrics();
      expect(metrics.perSiteActive['FACEBOOK_MARKETPLACE'] || 0).toBeLessThanOrEqual(1);

      await scheduler.stop();
    });
  });

  describe('Priority Ordering', () => {
    it('executes MERCADO_LIVRE before FACEBOOK_MARKETPLACE', async () => {
      const executionOrder: string[] = [];
      (MonitorRunner.run as any).mockImplementation((m: any) => {
        executionOrder.push(m.site);
        return Promise.resolve();
      });

      const fb = createMockMonitor({ id: 'fb-1', name: 'FB Monitor', site: 'FACEBOOK_MARKETPLACE' });
      const ml = createMockMonitor({ id: 'ml-1', name: 'ML Monitor', site: 'MERCADO_LIVRE' });

      // Return FB first, ML second (scheduler should reorder)
      (prisma.monitor.findMany as any).mockResolvedValue([fb, ml]);

      await scheduler.start();
      await new Promise((r) => setTimeout(r, 200));
      await scheduler.stop();

      // ML should have been executed before FB
      expect(executionOrder[0]).toBe('MERCADO_LIVRE');
    });
  });

  describe('Metrics', () => {
    it('tracks started and finished counts', async () => {
      const monitor = createMockMonitor({ name: 'Tracked Monitor' });
      (prisma.monitor.findMany as any).mockResolvedValue([monitor]);

      await scheduler.start();
      await new Promise((r) => setTimeout(r, 200));
      await scheduler.stop();

      const metrics = scheduler.getMetrics();
      expect(metrics.startedCount).toBe(1);
      expect(metrics.finishedCount).toBe(1);
    });

    it('tracks scheduler lag for due monitors', async () => {
      const overdueMonitor = createMockMonitor({
        name: 'Overdue',
        lastCheckedAt: new Date(Date.now() - 180 * 60_000), // 3h ago, interval 15min
      });

      (prisma.monitor.findMany as any).mockResolvedValue([overdueMonitor]);

      await scheduler.start();
      await new Promise((r) => setTimeout(r, 200));
      await scheduler.stop();

      const metrics = scheduler.getMetrics();
      // Lag should be significant (close to 3h - 15min = 165min)
      expect(metrics.avgSchedulerLagMs).toBeGreaterThan(100 * 60_000);
    });
  });

  describe('Clock Drift Protection', () => {
    it('skips monitors with lastCheckedAt in the future', async () => {
      const futureMonitor = createMockMonitor({
        name: 'Future Monitor',
        lastCheckedAt: new Date(Date.now() + 120_000), // 2 min in the future
      });

      (prisma.monitor.findMany as any).mockResolvedValue([futureMonitor]);

      await scheduler.start();
      await new Promise((r) => setTimeout(r, 100));
      await scheduler.stop();

      expect(MonitorRunner.run).not.toHaveBeenCalled();
    });
  });

  describe('Mixed Marketplace Fairness', () => {
    it('does not let heavy FB block light ML execution', async () => {
      const executionOrder: string[] = [];
      (MonitorRunner.run as any).mockImplementation((m: any) => {
        executionOrder.push(m.site);
        // FB takes longer
        const delay = m.site === 'FACEBOOK_MARKETPLACE' ? 500 : 50;
        return new Promise((r) => setTimeout(r, delay));
      });

      const fb = createMockMonitor({ id: 'fb-1', name: 'FB', site: 'FACEBOOK_MARKETPLACE' });
      const ml1 = createMockMonitor({ id: 'ml-1', name: 'ML 1', site: 'MERCADO_LIVRE' });
      const ml2 = createMockMonitor({ id: 'ml-2', name: 'ML 2', site: 'MERCADO_LIVRE' });

      (prisma.monitor.findMany as any).mockResolvedValue([fb, ml1, ml2]);

      await scheduler.start();
      await new Promise((r) => setTimeout(r, 800));
      await scheduler.stop();

      // All 3 should execute (FB concurrently with MLs)
      expect(executionOrder).toContain('FACEBOOK_MARKETPLACE');
      expect(executionOrder).toContain('MERCADO_LIVRE');
      expect(executionOrder.length).toBe(3);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes para SiteHealthService
 *
 * Casos testados:
 * - Retorna metricas corretas para multiplos sites
 * - Calcula successRate corretamente
 * - Conta consecutiveFailures corretamente
 * - Status HEALTHY/WARNING/CRITICAL/NO_DATA
 */

// Mock do Prisma
const { mockPrisma } = vi.hoisted(() => {
  const mockSiteExecutionStats = {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    aggregate: vi.fn(),
  };

  const mockMonitor = {
    count: vi.fn(),
  };

  const mockPrisma = {
    siteExecutionStats: mockSiteExecutionStats,
    monitor: mockMonitor,
  } as any;

  return { mockPrisma };
});

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import { SiteHealthService } from '../../src/services/siteHealthService';

describe('SiteHealthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Defaults: zero data for all sites
    mockPrisma.siteExecutionStats.count.mockResolvedValue(0);
    mockPrisma.siteExecutionStats.findFirst.mockResolvedValue(null);
    mockPrisma.siteExecutionStats.findMany.mockResolvedValue([]);
    mockPrisma.siteExecutionStats.aggregate.mockResolvedValue({
      _avg: { durationMs: null },
    });
    mockPrisma.monitor.count.mockResolvedValue(0);
  });

  it('deve retornar NO_DATA quando nao ha execucoes', async () => {
    const result = await SiteHealthService.getSiteHealthSummary();

    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBeGreaterThan(0);

    // Todos devem ser NO_DATA
    for (const site of result) {
      expect(site.status).toBe('NO_DATA');
      expect(site.totalRunsLast24h).toBe(0);
      expect(site.successRate).toBe(0);
    }
  });

  it('deve calcular HEALTHY quando successRate >= 85% e consecutiveFailures < 3', async () => {
    // Configura mock para retornar dados de sucesso para a primeira chamada (MERCADO_LIVRE)
    let callIndex = 0;
    mockPrisma.siteExecutionStats.count.mockImplementation(() => {
      callIndex++;
      // As 2 primeiras chamadas sao para o primeiro site (total e success)
      if (callIndex === 1) return Promise.resolve(100); // total
      if (callIndex === 2) return Promise.resolve(90);  // success
      return Promise.resolve(0);
    });

    mockPrisma.siteExecutionStats.findFirst.mockResolvedValueOnce({
      createdAt: new Date(),
      pageType: 'CONTENT',
      adsFound: 15,
    });

    mockPrisma.siteExecutionStats.findMany.mockResolvedValueOnce([
      { success: true },
      { success: true },
      { success: true },
    ]);

    mockPrisma.siteExecutionStats.aggregate.mockResolvedValueOnce({
      _avg: { durationMs: 2500 },
    });

    mockPrisma.monitor.count.mockResolvedValueOnce(10);

    const result = await SiteHealthService.getSiteHealthSummary();
    const ml = result.find((s) => s.site === 'MERCADO_LIVRE');

    expect(ml).toBeDefined();
    expect(ml!.status).toBe('HEALTHY');
    expect(ml!.totalRunsLast24h).toBe(100);
    expect(ml!.successRate).toBe(90);
    expect(ml!.consecutiveFailures).toBe(0);
    expect(ml!.lastPageType).toBe('CONTENT');
    expect(ml!.lastAdsFound).toBe(15);
    expect(ml!.avgDurationMs).toBe(2500);
    expect(ml!.activeMonitorsCount).toBe(10);
  });

  it('deve calcular WARNING quando 60 <= successRate < 85', async () => {
    let callIndex = 0;
    mockPrisma.siteExecutionStats.count.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) return Promise.resolve(100); // total
      if (callIndex === 2) return Promise.resolve(70);  // success (70%)
      return Promise.resolve(0);
    });

    mockPrisma.siteExecutionStats.findFirst.mockResolvedValueOnce({
      createdAt: new Date(),
      pageType: 'CONTENT',
      adsFound: 5,
    });

    mockPrisma.siteExecutionStats.findMany.mockResolvedValueOnce([
      { success: true },
    ]);

    mockPrisma.siteExecutionStats.aggregate.mockResolvedValueOnce({
      _avg: { durationMs: 3000 },
    });

    mockPrisma.monitor.count.mockResolvedValueOnce(5);

    const result = await SiteHealthService.getSiteHealthSummary();
    const ml = result.find((s) => s.site === 'MERCADO_LIVRE');

    expect(ml!.status).toBe('WARNING');
    expect(ml!.successRate).toBe(70);
  });

  it('deve calcular CRITICAL quando successRate < 60', async () => {
    let callIndex = 0;
    mockPrisma.siteExecutionStats.count.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) return Promise.resolve(100); // total
      if (callIndex === 2) return Promise.resolve(40);  // success (40%)
      return Promise.resolve(0);
    });

    mockPrisma.siteExecutionStats.findFirst.mockResolvedValueOnce({
      createdAt: new Date(),
      pageType: 'ERROR',
      adsFound: 0,
    });

    mockPrisma.siteExecutionStats.findMany.mockResolvedValueOnce([
      { success: false },
      { success: false },
      { success: false },
      { success: true },
    ]);

    mockPrisma.siteExecutionStats.aggregate.mockResolvedValueOnce({
      _avg: { durationMs: 5000 },
    });

    mockPrisma.monitor.count.mockResolvedValueOnce(3);

    const result = await SiteHealthService.getSiteHealthSummary();
    const ml = result.find((s) => s.site === 'MERCADO_LIVRE');

    expect(ml!.status).toBe('CRITICAL');
    expect(ml!.successRate).toBe(40);
    expect(ml!.consecutiveFailures).toBe(3);
  });

  it('deve calcular CRITICAL quando consecutiveFailures >= 5', async () => {
    let callIndex = 0;
    mockPrisma.siteExecutionStats.count.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) return Promise.resolve(20); // total
      if (callIndex === 2) return Promise.resolve(18); // success (90% — would be HEALTHY normally)
      return Promise.resolve(0);
    });

    mockPrisma.siteExecutionStats.findFirst.mockResolvedValueOnce({
      createdAt: new Date(),
      pageType: 'BLOCKED',
      adsFound: 0,
    });

    // 5 falhas consecutivas recentes
    mockPrisma.siteExecutionStats.findMany.mockResolvedValueOnce([
      { success: false },
      { success: false },
      { success: false },
      { success: false },
      { success: false },
      { success: true },
    ]);

    mockPrisma.siteExecutionStats.aggregate.mockResolvedValueOnce({
      _avg: { durationMs: 1000 },
    });

    mockPrisma.monitor.count.mockResolvedValueOnce(2);

    const result = await SiteHealthService.getSiteHealthSummary();
    const ml = result.find((s) => s.site === 'MERCADO_LIVRE');

    expect(ml!.status).toBe('CRITICAL');
    expect(ml!.consecutiveFailures).toBe(5);
  });

  it('deve contar consecutiveFailures corretamente (reseta no primeiro sucesso)', async () => {
    let callIndex = 0;
    mockPrisma.siteExecutionStats.count.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) return Promise.resolve(10);
      if (callIndex === 2) return Promise.resolve(9);
      return Promise.resolve(0);
    });

    mockPrisma.siteExecutionStats.findFirst.mockResolvedValueOnce({
      createdAt: new Date(),
      pageType: 'CONTENT',
      adsFound: 10,
    });

    // 2 falhas, depois sucesso — consecutiveFailures = 2
    mockPrisma.siteExecutionStats.findMany.mockResolvedValueOnce([
      { success: false },
      { success: false },
      { success: true },
      { success: false },
    ]);

    mockPrisma.siteExecutionStats.aggregate.mockResolvedValueOnce({
      _avg: { durationMs: 2000 },
    });

    mockPrisma.monitor.count.mockResolvedValueOnce(4);

    const result = await SiteHealthService.getSiteHealthSummary();
    const ml = result.find((s) => s.site === 'MERCADO_LIVRE');

    expect(ml!.consecutiveFailures).toBe(2);
  });

  it('deve incluir siteName amigavel', async () => {
    const result = await SiteHealthService.getSiteHealthSummary();

    const ml = result.find((s) => s.site === 'MERCADO_LIVRE');
    expect(ml!.siteName).toBe('Mercado Livre');

    const olx = result.find((s) => s.site === 'OLX');
    expect(olx!.siteName).toBe('OLX');

    const fb = result.find((s) => s.site === 'FACEBOOK_MARKETPLACE');
    expect(fb!.siteName).toBe('Facebook Marketplace');
  });
});

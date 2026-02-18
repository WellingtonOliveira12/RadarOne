import { prisma } from '../lib/prisma';
import { MonitorSite } from '@prisma/client';

export interface SiteHealthSummary {
  site: string;
  siteName: string;
  totalRunsLast24h: number;
  successRate: number;
  lastRunAt: Date | null;
  lastPageType: string | null;
  lastAdsFound: number;
  consecutiveFailures: number;
  avgDurationMs: number;
  activeMonitorsCount: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'NO_DATA';
}

const SITE_NAMES: Record<string, string> = {
  MERCADO_LIVRE: 'Mercado Livre',
  OLX: 'OLX',
  FACEBOOK_MARKETPLACE: 'Facebook Marketplace',
  WEBMOTORS: 'Webmotors',
  ICARROS: 'iCarros',
  ZAP_IMOVEIS: 'Zap Imoveis',
  VIVA_REAL: 'Viva Real',
  IMOVELWEB: 'ImovelWeb',
  LEILAO: 'Leilao',
  OUTRO: 'Outro',
};

function computeStatus(
  totalRuns: number,
  successRate: number,
  consecutiveFailures: number
): 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'NO_DATA' {
  if (totalRuns === 0) return 'NO_DATA';
  if (consecutiveFailures >= 5 || successRate < 60) return 'CRITICAL';
  if (successRate >= 85 && consecutiveFailures < 3) return 'HEALTHY';
  return 'WARNING';
}

export class SiteHealthService {
  static async getSiteHealthSummary(): Promise<SiteHealthSummary[]> {
    const sites = Object.values(MonitorSite);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const results = await Promise.all(
      sites.map(async (site) => {
        const [totalRuns, successRuns, lastRun, avgDuration, activeMonitors] =
          await Promise.all([
            // totalRunsLast24h
            prisma.siteExecutionStats.count({
              where: { site, createdAt: { gte: since24h } },
            }),
            // successRunsLast24h
            prisma.siteExecutionStats.count({
              where: { site, createdAt: { gte: since24h }, success: true },
            }),
            // lastRun (most recent)
            prisma.siteExecutionStats.findFirst({
              where: { site },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true, pageType: true, adsFound: true },
            }),
            // avgDurationMs (via aggregation)
            prisma.siteExecutionStats.aggregate({
              where: { site, createdAt: { gte: since24h } },
              _avg: { durationMs: true },
            }),
            // activeMonitorsCount
            prisma.monitor.count({
              where: { site, active: true },
            }),
          ]);

        // consecutiveFailures: count from most recent backwards
        const recentRuns = await prisma.siteExecutionStats.findMany({
          where: { site },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { success: true },
        });

        let consecutiveFailures = 0;
        for (const run of recentRuns) {
          if (!run.success) {
            consecutiveFailures++;
          } else {
            break;
          }
        }

        const successRate = totalRuns > 0 ? (successRuns / totalRuns) * 100 : 0;

        return {
          site,
          siteName: SITE_NAMES[site] || site,
          totalRunsLast24h: totalRuns,
          successRate: parseFloat(successRate.toFixed(1)),
          lastRunAt: lastRun?.createdAt ?? null,
          lastPageType: lastRun?.pageType ?? null,
          lastAdsFound: lastRun?.adsFound ?? 0,
          consecutiveFailures,
          avgDurationMs: Math.round(avgDuration._avg.durationMs ?? 0),
          activeMonitorsCount: activeMonitors,
          status: computeStatus(totalRuns, successRate, consecutiveFailures),
        };
      })
    );

    return results;
  }
}

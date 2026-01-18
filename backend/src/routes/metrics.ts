import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.middleware';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * GET /api/metrics/overview
 * Métricas gerais do sistema
 */
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalMonitors,
      activeMonitors,
      totalUsers,
      activeSubscriptions,
      recentLogs,
      successRate,
      adsBySource,
    ] = await Promise.all([
      // Total de monitores
      prisma.monitor.count(),

      // Monitores ativos
      prisma.monitor.count({ where: { active: true } }),

      // Total de usuários
      prisma.user.count(),

      // Assinaturas ativas
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),

      // Logs recentes
      prisma.monitorLog.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),

      // Taxa de sucesso geral
      prisma.monitorLog.aggregate({
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: { status: true },
      }),

      // Anúncios por fonte
      prisma.monitor.groupBy({
        by: ['site'],
        where: { active: true },
        _count: true,
      }),
    ]);

    const successCount = recentLogs.filter((log) => log.status === 'SUCCESS').length;
    const totalLogs = recentLogs.length;

    const overview = {
      monitors: {
        total: totalMonitors,
        active: activeMonitors,
        inactive: totalMonitors - activeMonitors,
      },
      users: {
        total: totalUsers,
        withActiveSubscription: activeSubscriptions,
      },
      performance: {
        successRate: totalLogs > 0 ? (successCount / totalLogs) * 100 : 0,
        totalChecks: totalLogs,
        successfulChecks: successCount,
        failedChecks: totalLogs - successCount,
      },
      adsBySource: adsBySource.map((item) => ({
        source: item.site,
        count: item._count,
      })),
    };

    res.json(overview);
  } catch (error: any) {
    console.error('Error fetching overview metrics:', error);
    res.status(500).json({ error: 'Erro ao buscar métricas' });
  }
});

/**
 * GET /api/metrics/performance
 * Métricas de performance por fonte ao longo do tempo
 */
router.get('/performance', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const days = parseInt((req.query.days as string) || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Buscar logs com monitor incluído
    const logs = await prisma.monitorLog.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      include: {
        monitor: {
          select: { site: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Agrupar por fonte
    const bySource: { [key: string]: any } = {};

    logs.forEach((log) => {
      const source = log.monitor.site;

      if (!bySource[source]) {
        bySource[source] = {
          source,
          totalChecks: 0,
          successfulChecks: 0,
          failedChecks: 0,
          totalAdsFound: 0,
          totalNewAds: 0,
          avgExecutionTime: 0,
          executionTimes: [],
        };
      }

      bySource[source].totalChecks++;
      bySource[source].totalAdsFound += log.adsFound || 0;
      bySource[source].totalNewAds += log.newAds || 0;

      if (log.status === 'SUCCESS') {
        bySource[source].successfulChecks++;
      } else {
        bySource[source].failedChecks++;
      }

      if (log.executionTime) {
        bySource[source].executionTimes.push(log.executionTime);
      }
    });

    // Calcular métricas médias
    const performance = Object.values(bySource).map((source: any) => {
      const avgTime = source.executionTimes.length > 0
        ? source.executionTimes.reduce((a: number, b: number) => a + b, 0) / source.executionTimes.length
        : 0;

      return {
        source: source.source,
        totalChecks: source.totalChecks,
        successRate: (source.successfulChecks / source.totalChecks) * 100,
        avgAdsPerCheck: source.totalAdsFound / source.totalChecks,
        avgNewAdsPerCheck: source.totalNewAds / source.totalChecks,
        avgExecutionTime: Math.round(avgTime),
        failedChecks: source.failedChecks,
      };
    });

    res.json(performance);
  } catch (error: any) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({ error: 'Erro ao buscar métricas de performance' });
  }
});

/**
 * GET /api/metrics/timeline
 * Métricas ao longo do tempo (gráfico de linha)
 */
router.get('/timeline', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const days = parseInt((req.query.days as string) || '7');
    const startDate = new Date();
    startDate.setDate(startDate.setDate(-days));

    const logs = await prisma.monitorLog.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Agrupar por dia
    const byDay: { [key: string]: any } = {};

    logs.forEach((log) => {
      const day = log.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!byDay[day]) {
        byDay[day] = {
          date: day,
          checks: 0,
          successes: 0,
          failures: 0,
          adsFound: 0,
          newAds: 0,
        };
      }

      byDay[day].checks++;
      byDay[day].adsFound += log.adsFound || 0;
      byDay[day].newAds += log.newAds || 0;

      if (log.status === 'SUCCESS') {
        byDay[day].successes++;
      } else {
        byDay[day].failures++;
      }
    });

    const timeline = Object.values(byDay).map((day: any) => ({
      ...day,
      successRate: (day.successes / day.checks) * 100,
    }));

    res.json(timeline);
  } catch (error: any) {
    console.error('Error fetching timeline metrics:', error);
    res.status(500).json({ error: 'Erro ao buscar timeline' });
  }
});

/**
 * GET /api/metrics/errors
 * Top erros mais comuns
 */
router.get('/errors', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const limit = parseInt((req.query.limit as string) || '10');
    const days = parseInt((req.query.days as string) || '7');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const errorLogs = await prisma.monitorLog.findMany({
      where: {
        status: 'ERROR',
        createdAt: { gte: startDate },
        error: { not: null },
      },
      select: {
        error: true,
        createdAt: true,
        monitor: {
          select: { site: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    // Agrupar erros similares
    const errorMap: { [key: string]: any } = {};

    errorLogs.forEach((log) => {
      const errorKey = log.error || 'Unknown error';

      if (!errorMap[errorKey]) {
        errorMap[errorKey] = {
          error: errorKey,
          count: 0,
          sources: new Set(),
          lastOccurrence: log.createdAt,
        };
      }

      errorMap[errorKey].count++;
      errorMap[errorKey].sources.add(log.monitor.site);

      if (log.createdAt > errorMap[errorKey].lastOccurrence) {
        errorMap[errorKey].lastOccurrence = log.createdAt;
      }
    });

    const errors = Object.values(errorMap)
      .map((error: any) => ({
        error: error.error,
        count: error.count,
        sources: Array.from(error.sources),
        lastOccurrence: error.lastOccurrence,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    res.json(errors);
  } catch (error: any) {
    console.error('Error fetching error metrics:', error);
    res.status(500).json({ error: 'Erro ao buscar erros' });
  }
});

/**
 * GET /api/metrics/sessions
 * Métricas de sessões (conexões de conta)
 */
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const days = parseInt((req.query.days as string) || '7');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Buscar sessões
    const [
      totalSessions,
      sessionsByStatus,
      monitorsBlockedBySession,
      sessionsBySite,
    ] = await Promise.all([
      // Total de sessões
      prisma.userSession.count(),

      // Sessões por status
      prisma.userSession.groupBy({
        by: ['status'],
        _count: true,
      }),

      // Monitores bloqueados por falta de sessão (SKIPPED com erro de sessão)
      prisma.monitorLog.count({
        where: {
          status: 'SKIPPED',
          createdAt: { gte: startDate },
          error: { contains: 'SESSION' },
        },
      }),

      // Sessões por site
      prisma.userSession.groupBy({
        by: ['site'],
        _count: true,
      }),
    ]);

    // Montar resposta
    const statusLabels: Record<string, string> = {
      ACTIVE: 'Conectado',
      NEEDS_REAUTH: 'Precisa reconectar',
      EXPIRED: 'Expirado',
      INVALID: 'Inválido',
    };

    const sessionMetrics = {
      total: totalSessions,
      byStatus: sessionsByStatus.map((item) => ({
        status: item.status,
        label: statusLabels[item.status] || item.status,
        count: item._count,
      })),
      bySite: sessionsBySite.map((item) => ({
        site: item.site,
        count: item._count,
      })),
      monitorsBlockedBySession,
      activeRate: totalSessions > 0
        ? (sessionsByStatus.find((s) => s.status === 'ACTIVE')?._count || 0) / totalSessions * 100
        : 0,
    };

    res.json(sessionMetrics);
  } catch (error: any) {
    console.error('Error fetching session metrics:', error);
    res.status(500).json({ error: 'Erro ao buscar métricas de sessões' });
  }
});

export default router;

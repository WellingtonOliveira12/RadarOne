/**
 * audit-ml-prod.ts — post-deploy audit for the proxy rollback.
 * READ-ONLY: prints recent ML stats, session health, notifications.
 */

import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  console.log('=== 1. ML SiteExecutionStats (last 30 min) ===');
  const stats = await prisma.siteExecutionStats.findMany({
    where: { site: 'MERCADO_LIVRE', startedAt: { gte: since } },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
  console.log(`count=${stats.length}`);
  for (const s of stats) {
    console.log(
      `  ${s.startedAt.toISOString()} pageType=${s.pageType} ads=${s.adsFound} ` +
      `success=${s.success} dur=${s.durationMs}ms monId=${s.monitorId.slice(0, 10)}`
    );
  }

  console.log('\n=== 2. ML MonitorLogs (last 30 min) ===');
  const logs = await prisma.monitorLog.findMany({
    where: {
      createdAt: { gte: since },
      monitor: { site: 'MERCADO_LIVRE' },
    },
    include: { monitor: { select: { name: true, searchUrl: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  console.log(`count=${logs.length}`);
  for (const l of logs) {
    const diag = (l.diagnosis as any) || {};
    console.log(
      `  ${l.createdAt.toISOString()} status=${l.status} ` +
      `adsFound=${l.adsFound} newAds=${l.newAds} alertsSent=${l.alertsSent} ` +
      `pageType=${diag.pageType || '-'} bodyLength=${diag.bodyLength || '-'} ` +
      `err=${l.error?.slice(0, 60) || '-'} mon="${l.monitor?.name?.slice(0, 30) || '-'}"`
    );
  }

  console.log('\n=== 3. ML pageType distribution (last 24h) ===');
  const page24h = await prisma.siteExecutionStats.groupBy({
    by: ['pageType'],
    where: { site: 'MERCADO_LIVRE', startedAt: { gte: since24h } },
    _count: true,
    _sum: { adsFound: true },
  });
  for (const p of page24h) {
    console.log(`  ${p.pageType}: count=${p._count} totalAds=${p._sum.adsFound || 0}`);
  }

  console.log('\n=== 4. ML UserSession status ===');
  const sessions = await prisma.userSession.findMany({
    where: { site: 'MERCADO_LIVRE' },
    select: { id: true, userId: true, status: true, updatedAt: true, metadata: true },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  console.log(`count=${sessions.length}`);
  const byStatus: Record<string, number> = {};
  for (const s of sessions) {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    console.log(
      `  ${s.status.padEnd(14)} user=${s.userId.slice(0, 10)} updated=${s.updatedAt.toISOString()}`
    );
  }
  console.log(`  ---summary: ${JSON.stringify(byStatus)}`);

  console.log('\n=== 5. FB/OLX regression check (last 30 min) ===');
  for (const site of ['FACEBOOK_MARKETPLACE', 'OLX'] as const) {
    const row = await prisma.siteExecutionStats.groupBy({
      by: ['pageType'],
      where: { site, startedAt: { gte: since } },
      _count: true,
      _sum: { adsFound: true },
    });
    const total = row.reduce((a, r) => a + r._count, 0);
    const totalAds = row.reduce((a, r) => a + (r._sum.adsFound || 0), 0);
    console.log(`  ${site}: exec=${total} totalAds=${totalAds} ${JSON.stringify(row.map(r=>({pt:r.pageType,c:r._count})))}`);
  }

  console.log('\n=== 6. ML NotificationLog system messages PT-BR (last 24h) ===');
  const notifs = await prisma.notificationLog.findMany({
    where: {
      createdAt: { gte: since24h },
      OR: [
        { title: { contains: 'SESSION', mode: 'insensitive' } },
        { title: { contains: 'Sessão', mode: 'insensitive' } },
        { title: { contains: 'Alerta', mode: 'insensitive' } },
        { title: { contains: 'RadarOne', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log(`count=${notifs.length}`);
  for (const n of notifs) {
    console.log(
      `  ${n.createdAt.toISOString()} ch=${n.channel} status=${n.status} title="${n.title.slice(0, 60)}"`
    );
  }

  console.log('\n=== 7. Monitors with remaining hack segments in searchUrl ===');
  const hackMonitors = await prisma.monitor.findMany({
    where: {
      site: 'MERCADO_LIVRE',
      OR: [
        { searchUrl: { contains: '_PublishedToday_YES' } },
        { searchUrl: { contains: '_NoIndex_True' } },
      ],
    },
    select: { id: true, userId: true, name: true, searchUrl: true, active: true },
  });
  console.log(`count=${hackMonitors.length} (runtime preprocessing strips these before navigation)`);
  for (const m of hackMonitors) {
    console.log(`  ${m.id} active=${m.active} "${m.name}" url=${m.searchUrl?.slice(0, 100)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('AUDIT FAILED:', e);
  process.exit(1);
});

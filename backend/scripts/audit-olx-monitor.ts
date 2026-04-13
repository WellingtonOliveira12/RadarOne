import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  console.log('=== 1. All OLX monitors ===');
  const olxMons = await prisma.monitor.findMany({
    where: { site: 'OLX' },
    select: {
      id: true, userId: true, name: true, active: true,
      searchUrl: true, priceMin: true, priceMax: true,
      mode: true, filtersJson: true, keywords: true,
      country: true, stateRegion: true, city: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`count=${olxMons.length}`);
  for (const m of olxMons) {
    console.log(`\n  id=${m.id}`);
    console.log(`  active=${m.active} name="${m.name}"`);
    console.log(`  mode=${m.mode} price=[${m.priceMin}..${m.priceMax}]`);
    console.log(`  location=${m.country || '-'}/${m.stateRegion || '-'}/${m.city || '-'}`);
    console.log(`  keywords=${JSON.stringify(m.keywords)}`);
    console.log(`  filtersJson=${JSON.stringify(m.filtersJson)?.slice(0,200)}`);
    console.log(`  url=${m.searchUrl?.slice(0,200)}`);
  }

  console.log('\n\n=== 2. OLX recent executions (6h) ===');
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const stats = await prisma.siteExecutionStats.findMany({
    where: { site: 'OLX', startedAt: { gte: since } },
    orderBy: { startedAt: 'desc' },
    take: 15,
  });
  for (const s of stats) {
    console.log(
      `  ${s.startedAt.toISOString()} pageType=${s.pageType} ads=${s.adsFound} success=${s.success} dur=${s.durationMs}ms monId=${s.monitorId.slice(0, 10)}`
    );
  }

  console.log('\n=== 3. OLX recent MonitorLog (6h) ===');
  const logs = await prisma.monitorLog.findMany({
    where: { createdAt: { gte: since }, monitor: { site: 'OLX' } },
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: { monitor: { select: { name: true } } },
  });
  for (const l of logs) {
    const d = (l.diagnosis as any) || {};
    console.log(
      `  ${l.createdAt.toISOString()} status=${l.status} ads=${l.adsFound} new=${l.newAds} sent=${l.alertsSent} ` +
      `pt=${d.pageType || '-'} bl=${d.bodyLength || '-'} skipped=${JSON.stringify(d.skippedReasons || {})} ` +
      `mon="${l.monitor?.name || '-'}" err=${l.error?.slice(0, 60) || '-'}`
    );
  }

  console.log('\n\n=== 4. Recent ML ads sent (for ML monitor price issue) ===');
  const mlLogs = await prisma.monitorLog.findMany({
    where: {
      createdAt: { gte: since },
      monitor: { site: 'MERCADO_LIVRE' },
      alertsSent: { gt: 0 },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { monitor: { select: { name: true, priceMin: true, priceMax: true, searchUrl: true } } },
  });
  console.log(`ML logs with alertsSent>0 in 6h: ${mlLogs.length}`);
  for (const l of mlLogs) {
    const d = (l.diagnosis as any) || {};
    console.log(
      `  ${l.createdAt.toISOString()} ads=${l.adsFound} new=${l.newAds} sent=${l.alertsSent} ` +
      `mon="${l.monitor?.name}" dbPrice=[${l.monitor?.priceMin}..${l.monitor?.priceMax}]`
    );
    if (d.skippedReasons) {
      console.log(`    skipped=${JSON.stringify(d.skippedReasons)}`);
    }
  }

  console.log('\n\n=== 5. Sample real ads sent to Telegram (last 4h) — check price vs configured range ===');
  const recentNotifs = await prisma.notificationLog.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 4 * 60 * 60 * 1000) },
      status: 'SUCCESS',
      channel: 'TELEGRAM',
      title: { not: { startsWith: '[SESSION' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });
  for (const n of recentNotifs) {
    console.log(
      `  ${n.createdAt.toISOString()} title="${n.title.slice(0, 60)}" msg="${(n.message || '').slice(0, 100).replace(/\n/g, ' ')}"`
    );
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

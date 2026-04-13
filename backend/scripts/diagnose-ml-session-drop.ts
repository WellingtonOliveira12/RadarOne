/**
 * diagnose-ml-session-drop.ts
 *
 * Post-reconnect forensics: why does the ML session get dropped?
 * Traces the full session lifecycle + surrounding executions.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  console.log('=== 1. ALL ML sessions (full state) ===');
  const sessions = await prisma.userSession.findMany({
    where: { site: 'MERCADO_LIVRE' },
    orderBy: { updatedAt: 'desc' },
  });
  for (const s of sessions) {
    const md = (s.metadata as any) || {};
    console.log(`\n  id=${s.id}`);
    console.log(`  user=${s.userId}`);
    console.log(`  status=${s.status}`);
    console.log(`  created=${s.createdAt.toISOString()}`);
    console.log(`  updated=${s.updatedAt.toISOString()}`);
    console.log(`  lastUsedAt=${s.lastUsedAt?.toISOString() || '-'}`);
    console.log(`  expiresAt=${s.expiresAt?.toISOString() || '-'}`);
    console.log(`  label=${s.accountLabel || '-'}`);
    console.log(`  metadata:`);
    for (const [k, v] of Object.entries(md)) {
      const val = typeof v === 'string' ? v.slice(0, 200) : JSON.stringify(v).slice(0, 200);
      console.log(`    ${k}=${val}`);
    }
  }

  console.log('\n\n=== 2. ML Session status timeline (last 6h — via stats + logs) ===');
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000);

  // Interleave SiteExecutionStats and MonitorLog in chrono order
  const stats = await prisma.siteExecutionStats.findMany({
    where: { site: 'MERCADO_LIVRE', startedAt: { gte: since } },
    orderBy: { startedAt: 'asc' },
  });
  const logs = await prisma.monitorLog.findMany({
    where: { createdAt: { gte: since }, monitor: { site: 'MERCADO_LIVRE' } },
    orderBy: { createdAt: 'asc' },
    include: { monitor: { select: { name: true, userId: true } } },
  });

  type Row = { ts: Date; kind: 'STAT' | 'LOG'; line: string };
  const rows: Row[] = [];
  for (const s of stats) {
    rows.push({
      ts: s.startedAt,
      kind: 'STAT',
      line: `STAT pageType=${s.pageType} ads=${s.adsFound} success=${s.success} dur=${s.durationMs}ms mon=${s.monitorId.slice(0, 10)} err=${s.errorCode || '-'}`,
    });
  }
  for (const l of logs) {
    const diag = (l.diagnosis as any) || {};
    rows.push({
      ts: l.createdAt,
      kind: 'LOG',
      line: `LOG  status=${l.status} ads=${l.adsFound} newAds=${l.newAds} alerts=${l.alertsSent} pt=${diag.pageType || '-'} bl=${diag.bodyLength || '-'} auth=${diag.authenticated ?? '-'} src=${diag.authSource || '-'} mon="${l.monitor?.name || '-'}" err=${l.error?.slice(0, 80) || '-'}`,
    });
  }
  rows.sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const last = rows.slice(-60);
  console.log(`showing last ${last.length} of ${rows.length} events`);
  for (const r of last) {
    console.log(`  ${r.ts.toISOString()} ${r.kind} ${r.line}`);
  }

  console.log('\n\n=== 3. Recent CONTENT executions (24h) — did they actually scrape? ===');
  const content = await prisma.siteExecutionStats.findMany({
    where: {
      site: 'MERCADO_LIVRE',
      pageType: 'CONTENT',
      startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { startedAt: 'desc' },
    take: 15,
  });
  console.log(`CONTENT count (24h)=${content.length}`);
  for (const c of content) {
    console.log(
      `  ${c.startedAt.toISOString()} ads=${c.adsFound} dur=${c.durationMs}ms mon=${c.monitorId.slice(0, 10)} user=${c.userId.slice(0, 10)}`
    );
  }

  console.log('\n\n=== 4. Session lifecycle events in MonitorLog error messages ===');
  const errLogs = await prisma.monitorLog.findMany({
    where: {
      createdAt: { gte: since },
      monitor: { site: 'MERCADO_LIVRE' },
      OR: [
        { error: { contains: 'NEEDS_REAUTH' } },
        { error: { contains: 'LOGIN_REQUIRED' } },
        { error: { contains: 'CHECKPOINT' } },
        { error: { contains: 'VERIFICATION' } },
        { error: { contains: 'BACKOFF' } },
        { error: { contains: 'account-verification' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  console.log(`error events (6h)=${errLogs.length}`);
  for (const l of errLogs) {
    console.log(`  ${l.createdAt.toISOString()} err="${l.error?.slice(0, 120)}"`);
  }

  console.log('\n\n=== 5. Notifications sent to affected user (24h) ===');
  const userIds = [...new Set(sessions.map((s) => s.userId))];
  const notifs = await prisma.notificationLog.findMany({
    where: {
      userId: { in: userIds },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  for (const n of notifs) {
    console.log(
      `  ${n.createdAt.toISOString()} ch=${n.channel} st=${n.status} title="${n.title.slice(0, 60)}" msg="${(n.message || '').slice(0, 80)}"`
    );
  }

  console.log('\n\n=== 6. ML reconnection activity: look at UserSession updatedAt deltas ===');
  // Any session created or status-changed in last 3h?
  const recentSessions = sessions.filter(
    (s) => s.updatedAt.getTime() > Date.now() - 3 * 60 * 60 * 1000
  );
  console.log(`sessions updated in last 3h: ${recentSessions.length}`);
  for (const s of recentSessions) {
    console.log(`  ${s.updatedAt.toISOString()} status=${s.status} user=${s.userId.slice(0, 10)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('DIAGNOSE FAILED:', e);
  process.exit(1);
});

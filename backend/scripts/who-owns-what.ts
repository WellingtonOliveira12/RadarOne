import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const ms = await prisma.monitor.findMany({
    where: { site: 'MERCADO_LIVRE' },
    select: { id: true, userId: true, name: true, searchUrl: true, active: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`ML monitors: ${ms.length}`);
  const byUser: Record<string, any[]> = {};
  for (const m of ms) {
    (byUser[m.userId] ||= []).push(m);
  }
  for (const [uid, list] of Object.entries(byUser)) {
    console.log(`\n--- user=${uid} (${list.length} monitors) ---`);
    for (const m of list) {
      console.log(`  id=${m.id.slice(0,10)} active=${m.active} name="${m.name}"`);
      console.log(`  url=${m.searchUrl}`);
    }
  }

  console.log('\n=== sessions per user ===');
  const s = await prisma.userSession.findMany({
    where: { site: 'MERCADO_LIVRE' },
    orderBy: { updatedAt: 'desc' },
  });
  for (const x of s) {
    const md = (x.metadata as any) || {};
    console.log(
      `  user=${x.userId} status=${x.status} updated=${x.updatedAt.toISOString()} lastUsed=${x.lastUsedAt?.toISOString() || '-'} uploadedAt=${md.uploadedAt || '-'}`
    );
  }

  console.log('\n=== recent LOGIN_REQUIRED executions (last 2h) — with monitor owner ===');
  const recent = await prisma.siteExecutionStats.findMany({
    where: {
      site: 'MERCADO_LIVRE',
      pageType: 'LOGIN_REQUIRED',
      startedAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    },
    orderBy: { startedAt: 'desc' },
  });
  for (const r of recent) {
    const mon = await prisma.monitor.findUnique({
      where: { id: r.monitorId },
      select: { name: true, userId: true },
    });
    console.log(
      `  ${r.startedAt.toISOString()} dur=${r.durationMs}ms monId=${r.monitorId.slice(0,10)} mon="${mon?.name || '-'}" owner=${mon?.userId.slice(0,10) || '-'}`
    );
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });

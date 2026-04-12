import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const ms = await prisma.monitor.findMany({
    where: { site: 'MERCADO_LIVRE', active: true },
    select: { id: true, name: true, searchUrl: true, priceMin: true, priceMax: true },
  });
  console.log(`ML active monitors: ${ms.length}`);
  for (const m of ms) {
    console.log(`\n  id=${m.id} name="${m.name}" price=[${m.priceMin}..${m.priceMax}]`);
    console.log(`  url=${m.searchUrl}`);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });

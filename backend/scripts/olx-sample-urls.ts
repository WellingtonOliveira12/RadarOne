import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  // Fetch some real OLX ads from AdsSeen for detail-page inspection
  const rows = await prisma.$queryRaw<Array<{ external_id: string; url: string; title: string }>>`
    SELECT a.external_id, a.url, a.title
    FROM ads_seen a
    JOIN monitors m ON a.monitor_id = m.id
    WHERE m.site = 'OLX'
      AND a.url LIKE '%olx.com.br%'
    ORDER BY a.last_seen_at DESC
    LIMIT 6
  `;
  for (const r of rows) {
    console.log(`TITLE=${r.title}`);
    console.log(`URL=${r.url}`);
    console.log('---');
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const ids = ['cmj5rgrkf00003iklpvjs5m0j', 'cmjnqgqhw000030gnmh8swg8p'];
  for (const id of ids) {
    const u = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        role: true,
      },
    });
    const monCount = await prisma.monitor.count({
      where: { userId: id, site: 'MERCADO_LIVRE', active: true },
    });
    const sessCount = await prisma.userSession.count({
      where: { userId: id, site: 'MERCADO_LIVRE' },
    });
    console.log(`\n=== ${id} ===`);
    console.log(`  email=${u?.email || 'NOT FOUND'}`);
    console.log(`  name=${u?.name || '-'}`);
    console.log(`  role=${u?.role || '-'}`);
    console.log(`  created=${u?.createdAt?.toISOString() || '-'}`);
    console.log(`  ml monitors active=${monCount}`);
    console.log(`  ml sessions in DB=${sessCount}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

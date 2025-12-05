import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  await prisma.$connect();
  console.log("✅ Prisma connected successfully with Postgres adapter");
  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => {
  console.error("❌ Prisma connection failed:", e);
  process.exit(1);
});

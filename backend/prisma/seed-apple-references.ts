/**
 * Seed Apple Price References from the provided spreadsheet data.
 * Run: cd backend && npm run seed:apple
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const APPLE_REFERENCES = [
  { model: 'iPhone 11', storage: '64 GB', referencePrice: 650 },
  { model: 'iPhone 11', storage: '128 GB', referencePrice: 800 },
  { model: 'iPhone 12', storage: '64 GB', referencePrice: 800 },
  { model: 'iPhone 12', storage: '128 GB', referencePrice: 1000 },
  { model: 'iPhone 13', storage: '128 GB', referencePrice: 1500 },
  { model: 'iPhone 13', storage: '256 GB', referencePrice: 1800 },
  { model: 'iPhone 13 Pro', storage: '128 GB', referencePrice: 1900 },
  { model: 'iPhone 13 Pro', storage: '256 GB', referencePrice: 2100 },
  { model: 'iPhone 13 Pro', storage: '512 GB', referencePrice: 2300 },
  { model: 'iPhone 13 Pro Max', storage: '128 GB', referencePrice: 2500 },
  { model: 'iPhone 13 Pro Max', storage: '256 GB', referencePrice: 2700 },
  { model: 'iPhone 13 Pro Max', storage: '512 GB', referencePrice: 2900 },
  { model: 'iPhone 14', storage: '128 GB', referencePrice: 1800 },
  { model: 'iPhone 14', storage: '256 GB', referencePrice: 2200 },
  { model: 'iPhone 14 Pro', storage: '128 GB', referencePrice: 2400 },
  { model: 'iPhone 14 Pro', storage: '256 GB', referencePrice: 2700 },
  { model: 'iPhone 14 Pro Max', storage: '128 GB', referencePrice: 2800 },
  { model: 'iPhone 14 Pro Max', storage: '256 GB', referencePrice: 3200 },
  { model: 'iPhone 15', storage: '128 GB', referencePrice: 2600 },
  { model: 'iPhone 15', storage: '256 GB', referencePrice: 2950 },
  { model: 'iPhone 15 Pro', storage: '128 GB', referencePrice: 3200 },
  { model: 'iPhone 15 Pro', storage: '256 GB', referencePrice: 3500 },
  { model: 'iPhone 15 Pro Max', storage: '256 GB', referencePrice: 3900 },
  { model: 'iPhone 16', storage: '128 GB', referencePrice: 3100 },
  { model: 'iPhone 16', storage: '256 GB', referencePrice: 3300 },
  { model: 'iPhone 16 Pro', storage: '128 GB', referencePrice: 4100 },
  { model: 'iPhone 16 Pro', storage: '256 GB', referencePrice: 4400 },
  { model: 'iPhone 16 Pro Max', storage: '256 GB', referencePrice: 4900 },
  { model: 'iPhone 16 Pro Max', storage: '512 GB', referencePrice: 5200 },
  { model: 'iPhone 16 Pro Max', storage: '1 TB', referencePrice: 5400 },
];

async function main() {
  console.log('Seeding Apple price references...');

  let created = 0;
  let updated = 0;

  for (const item of APPLE_REFERENCES) {
    const existing = await prisma.applePriceReference.findUnique({
      where: { model_storage: { model: item.model, storage: item.storage } },
    });

    if (existing) {
      await prisma.applePriceReference.update({
        where: { id: existing.id },
        data: { referencePrice: item.referencePrice },
      });
      updated++;
    } else {
      await prisma.applePriceReference.create({ data: item });
      created++;
    }
  }

  console.log(`Done! Created: ${created}, Updated: ${updated}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

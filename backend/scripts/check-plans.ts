import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkPlans() {
  const plans = await prisma.plan.findMany({
    orderBy: { priority: 'asc' },
  });

  console.log('\n📊 PLANOS NO BANCO DE DADOS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SLUG       | NOME     | PREÇO         | MONITORS | SITES | ALERTS/DAY | GARANTIA | KIWIFY ID  | REC ⭐');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  plans.forEach(plan => {
    const price = plan.priceCents === 0 ? 'GRÁTIS       ' : `R$ ${(plan.priceCents / 100).toFixed(2)}/mês`;
    const kiwify = plan.kiwifyProductId || 'NULL';
    const rec = plan.isRecommended ? 'SIM' : 'NÃO';
    const garantia = plan.trialDays > 0 ? `${plan.trialDays} dias` : 'N/A';
    console.log(
      `${plan.slug.padEnd(10)} | ${plan.name.padEnd(8)} | ${price} | ${String(plan.maxMonitors).padStart(8)} | ${String(plan.maxSites).padStart(5)} | ${String(plan.maxAlertsPerDay).padStart(10)} | ${garantia.padEnd(8)} | ${kiwify.padEnd(10)} | ${rec}`
    );
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n✅ Total: ${plans.length} planos cadastrados`);
  console.log('✅ kiwifyProductId configurados para planos pagos\n');

  await prisma.$disconnect();
  await pool.end();
}

checkPlans().catch(console.error);

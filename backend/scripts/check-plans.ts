/**
 * Script para verificar planos e intervalos
 */
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ['error'] });

async function checkPlans() {
  console.log('📋 PLANOS E INTERVALOS DE VERIFICAÇÃO');
  console.log('='.repeat(60));

  try {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' },
    });

    console.log(`\nEncontrados ${plans.length} planos ativos:\n`);

    for (const plan of plans) {
      console.log(`  ${plan.name} (${plan.slug})`);
      console.log(`    checkInterval: ${plan.checkInterval} minutos`);
      console.log(`    maxMonitors: ${plan.maxMonitors}`);
      console.log(`    maxAlertsPerDay: ${plan.maxAlertsPerDay}`);
      console.log('');
    }

    // Verificar subscriptions ativas
    console.log('\n📊 SUBSCRIPTIONS ATIVAS COM PLANO');
    console.log('-'.repeat(50));

    const subscriptions = await prisma.subscription.findMany({
      where: { status: 'ACTIVE' },
      include: {
        plan: true,
        user: {
          select: { email: true },
        },
      },
    });

    for (const sub of subscriptions) {
      console.log(`  ${sub.user.email}`);
      console.log(`    Plano: ${sub.plan.name} (checkInterval: ${sub.plan.checkInterval} min)`);
      console.log(`    isLifetime: ${sub.isLifetime}`);
      console.log('');
    }

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

checkPlans();

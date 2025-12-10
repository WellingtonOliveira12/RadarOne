import dotenv from 'dotenv';
dotenv.config();

import { encryptCpf, decryptCpf, validateCpf, formatCpf } from './src/utils/crypto';
import { applyCouponIfValid, startTrialForUser } from './src/services/billingService';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function testCryptoService() {
  console.log('\n=== TESTANDO CRYPTO SERVICE ===\n');

  const testCpf = '12345678901';

  // Teste 1: Validação de CPF
  console.log('1. Validação de CPF:');
  const isValid = validateCpf(testCpf);
  console.log(`   CPF ${testCpf} é válido: ${isValid}`);

  // Teste 2: Encriptação
  console.log('\n2. Encriptação de CPF:');
  const { encrypted, last4 } = encryptCpf(testCpf);
  console.log(`   CPF original: ${testCpf}`);
  console.log(`   CPF encriptado: ${encrypted.substring(0, 50)}...`);
  console.log(`   Últimos 4 dígitos: ${last4}`);

  // Teste 3: Decriptação
  console.log('\n3. Decriptação de CPF:');
  const decrypted = decryptCpf(encrypted);
  console.log(`   CPF decriptado: ${decrypted}`);
  console.log(`   Match com original: ${decrypted === testCpf}`);

  // Teste 4: Formatação
  console.log('\n4. Formatação de CPF:');
  const formatted = formatCpf(testCpf);
  console.log(`   CPF formatado: ${formatted}`);

  console.log('\n✅ Crypto Service OK!\n');
}

async function testBillingService() {
  console.log('\n=== TESTANDO BILLING SERVICE ===\n');

  try {
    // Teste 1: Buscar plano FREE
    console.log('1. Buscando plano FREE:');
    const freePlan = await prisma.plan.findUnique({ where: { slug: 'free' } });
    if (freePlan) {
      console.log(`   ✅ Plano FREE encontrado: ${freePlan.name}`);
      console.log(`   - Preço: R$ ${(freePlan.priceCents / 100).toFixed(2)}`);
      console.log(`   - Max monitores: ${freePlan.maxMonitors}`);
      console.log(`   - Max sites: ${freePlan.maxSites}`);
      console.log(`   - Max alertas/dia: ${freePlan.maxAlertsPerDay}`);
    } else {
      console.log('   ❌ Plano FREE não encontrado!');
    }

    // Teste 2: Buscar plano PRO
    console.log('\n2. Buscando plano PRO:');
    const proPlan = await prisma.plan.findUnique({ where: { slug: 'pro' } });
    if (proPlan) {
      console.log(`   ✅ Plano PRO encontrado: ${proPlan.name}`);
      console.log(`   - Preço: R$ ${(proPlan.priceCents / 100).toFixed(2)}`);
      console.log(`   - Max monitores: ${proPlan.maxMonitors}`);
      console.log(`   - Max sites: ${proPlan.maxSites}`);
      console.log(`   - Recommended: ${proPlan.isRecommended}`);
    } else {
      console.log('   ❌ Plano PRO não encontrado!');
    }

    // Teste 3: Listar todos os planos
    console.log('\n3. Listando todos os planos:');
    const allPlans = await prisma.plan.findMany({ orderBy: { priority: 'asc' } });
    console.log(`   Total de planos: ${allPlans.length}`);
    allPlans.forEach(plan => {
      const recommended = plan.isRecommended ? ' ⭐ RECOMENDADO' : '';
      console.log(`   - ${plan.name}: R$ ${(plan.priceCents / 100).toFixed(2)}/mês${recommended}`);
    });

    console.log('\n✅ Billing Service OK!\n');
  } catch (error) {
    console.error('❌ Erro no Billing Service:', error);
  }
}

async function testPlanLimits() {
  console.log('\n=== TESTANDO PLAN LIMITS ===\n');

  try {
    const plans = await prisma.plan.findMany({ orderBy: { priority: 'asc' } });

    console.log('Comparação de limites por plano:\n');
    console.log('Plano       | Preço    | Monitores | Sites | Alertas/dia | Intervalo');
    console.log('------------|----------|-----------|-------|-------------|----------');

    plans.forEach(plan => {
      const price = `R$ ${(plan.priceCents / 100).toFixed(2)}`.padEnd(8);
      const monitors = plan.maxMonitors.toString().padEnd(9);
      const sites = plan.maxSites.toString().padEnd(5);
      const alerts = plan.maxAlertsPerDay.toString().padEnd(11);
      const interval = `${plan.checkInterval}min`;

      console.log(`${plan.name.padEnd(11)} | ${price} | ${monitors} | ${sites} | ${alerts} | ${interval}`);
    });

    console.log('\n✅ Plan Limits OK!\n');
  } catch (error) {
    console.error('❌ Erro ao testar Plan Limits:', error);
  }
}

async function main() {
  console.log('\n🧪 INICIANDO TESTES DOS SERVIÇOS SAAS\n');
  console.log('='.repeat(50));

  await testCryptoService();
  await testBillingService();
  await testPlanLimits();

  console.log('='.repeat(50));
  console.log('\n🎉 TODOS OS TESTES CONCLUÍDOS!\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error('❌ Erro fatal:', e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Seed dos Planos Comerciais do RadarOne
 *
 * Planos:
 * - FREE: Plano gratuito básico (1 monitor, 1 site, sem trial)
 * - STARTER: Plano inicial (5 monitores, 2 sites, 7 dias garantia) - R$ 29,00 - kiwifyProductId: qyvPYUx
 * - PRO: Plano recomendado ⭐ (10 monitores, 3 sites, 7 dias garantia) - R$ 49,00 - kiwifyProductId: giCvSH0
 * - PREMIUM: Plano avançado (20 monitores, 5 sites, 7 dias garantia) - R$ 97,00 - kiwifyProductId: 76JoTEL
 * - ULTRA: Plano ilimitado (999 monitores, 999 sites, 7 dias garantia) - R$ 149,00 - kiwifyProductId: 6MgOUyL
 *
 * IMPORTANTE: A Kiwify cobra imediatamente, mas oferece 7 dias de garantia para estorno.
 * O trial interno do RadarOne (trialDays) é usado para controlar acesso durante esse período.
 */

async function main() {
  console.log('🌱 Seeding planos comerciais do RadarOne...\n');

  // ============================================
  // 1. PLANO FREE
  // ============================================
  const planFree = await prisma.plan.upsert({
    where: { slug: 'free' },
    update: {
      name: 'Free',
      description: 'Plano gratuito para testar o RadarOne',
      priceCents: 0,
      billingPeriod: 'MONTHLY',
      trialDays: 0, // FREE não tem trial
      maxMonitors: 1,
      maxSites: 1,
      maxAlertsPerDay: 10,
      checkInterval: 60,
      isRecommended: false,
      priority: 1,
      isActive: true,
      isLifetime: false,
      kiwifyProductId: null, // TODO: preencher após criar produto na Kiwify
    },
    create: {
      name: 'Free',
      slug: 'free',
      description: 'Plano gratuito para testar o RadarOne',
      priceCents: 0,
      billingPeriod: 'MONTHLY',
      trialDays: 0,
      maxMonitors: 1,
      maxSites: 1,
      maxAlertsPerDay: 10,
      checkInterval: 60,
      isRecommended: false,
      priority: 1,
      isActive: true,
      isLifetime: false,
      kiwifyProductId: null,
    },
  });
  console.log('✅ FREE:', planFree.slug, '- GRÁTIS');

  // ============================================
  // 2. PLANO STARTER
  // ============================================
  const planStarter = await prisma.plan.upsert({
    where: { slug: 'starter' },
    update: {
      name: 'Starter',
      description: 'Até 5 monitores em 2 sites. Ideal para uso pessoal ou leve. Experimente sem risco com 7 dias de garantia.',
      priceCents: 2900, // R$ 29,00
      billingPeriod: 'MONTHLY',
      trialDays: 7,
      maxMonitors: 5,
      maxSites: 2,
      maxAlertsPerDay: 50,
      checkInterval: 30,
      isRecommended: false,
      priority: 2,
      isActive: true,
      isLifetime: false,
      kiwifyProductId: 'qyvPYUx', // Checkout Kiwify: https://pay.kiwify.com.br/qyvPYUx
    },
    create: {
      name: 'Starter',
      slug: 'starter',
      description: 'Até 5 monitores em 2 sites. Ideal para uso pessoal ou leve. Experimente sem risco com 7 dias de garantia.',
      priceCents: 2900,
      billingPeriod: 'MONTHLY',
      trialDays: 7,
      maxMonitors: 5,
      maxSites: 2,
      maxAlertsPerDay: 50,
      checkInterval: 30,
      isRecommended: false,
      priority: 2,
      isActive: true,
      isLifetime: false,
      kiwifyProductId: 'qyvPYUx',
    },
  });
  console.log('✅ STARTER:', planStarter.slug, '- R$ 29,00/mês - 7 dias de garantia');

  // ============================================
  // 3. PLANO PRO ⭐ (RECOMENDADO)
  // ============================================
  const planPro = await prisma.plan.upsert({
    where: { slug: 'pro' },
    update: {
      name: 'Pro',
      description: 'Até 10 monitores em 3 sites. Recomendado para quem compra e vende com frequência. Inclui 7 dias de garantia.',
      priceCents: 4900, // R$ 49,00
      billingPeriod: 'MONTHLY',
      trialDays: 7,
      maxMonitors: 10,
      maxSites: 3,
      maxAlertsPerDay: 100,
      checkInterval: 15,
      isRecommended: true, // ⭐ Plano em destaque
      priority: 3,
      isActive: true,
      isLifetime: false,
      kiwifyProductId: 'giCvSH0', // Checkout Kiwify: https://pay.kiwify.com.br/giCvSH0
    },
    create: {
      name: 'Pro',
      slug: 'pro',
      description: 'Até 10 monitores em 3 sites. Recomendado para quem compra e vende com frequência. Inclui 7 dias de garantia.',
      priceCents: 4900,
      billingPeriod: 'MONTHLY',
      trialDays: 7,
      maxMonitors: 10,
      maxSites: 3,
      maxAlertsPerDay: 100,
      checkInterval: 15,
      isRecommended: true,
      priority: 3,
      isActive: true,
      isLifetime: false,
      kiwifyProductId: 'giCvSH0',
    },
  });
  console.log('✅ PRO ⭐:', planPro.slug, '- R$ 49,00/mês - 7 dias de garantia - RECOMENDADO');

  // ============================================
  // 4. PLANO PREMIUM
  // ============================================
  const planPremium = await prisma.plan.upsert({
    where: { slug: 'premium' },
    update: {
      name: 'Premium',
      description: 'Até 20 monitores em 5 sites. Ideal para profissionais e lojistas. Inclui 7 dias de garantia.',
      priceCents: 9700, // R$ 97,00
      billingPeriod: 'MONTHLY',
      trialDays: 7,
      maxMonitors: 20,
      maxSites: 5,
      maxAlertsPerDay: 200,
      checkInterval: 10,
      isRecommended: false,
      priority: 4,
      isActive: true,
      isLifetime: false,
      kiwifyProductId: '76JoTEL', // Checkout Kiwify: https://pay.kiwify.com.br/76JoTEL
    },
    create: {
      name: 'Premium',
      slug: 'premium',
      description: 'Até 20 monitores em 5 sites. Ideal para profissionais e lojistas. Inclui 7 dias de garantia.',
      priceCents: 9700,
      billingPeriod: 'MONTHLY',
      trialDays: 7,
      maxMonitors: 20,
      maxSites: 5,
      maxAlertsPerDay: 200,
      checkInterval: 10,
      isRecommended: false,
      priority: 4,
      isActive: true,
      isLifetime: false,
      kiwifyProductId: '76JoTEL',
    },
  });
  console.log('✅ PREMIUM:', planPremium.slug, '- R$ 97,00/mês - 7 dias de garantia');

  // ============================================
  // 5. PLANO ULTRA
  // ============================================
  const planUltra = await prisma.plan.upsert({
    where: { slug: 'ultra' },
    update: {
      name: 'Ultra',
      description: 'Monitores ilimitados e sites ilimitados para operações em escala. Inclui 7 dias de garantia.',
      priceCents: 14900, // R$ 149,00
      billingPeriod: 'MONTHLY',
      trialDays: 7,
      maxMonitors: 999,
      maxSites: 999,
      maxAlertsPerDay: 999,
      checkInterval: 5,
      isRecommended: false,
      priority: 5,
      isActive: true,
      isLifetime: false,
      kiwifyProductId: '6MgOUyL', // Checkout Kiwify: https://pay.kiwify.com.br/6MgOUyL
    },
    create: {
      name: 'Ultra',
      slug: 'ultra',
      description: 'Monitores ilimitados e sites ilimitados para operações em escala. Inclui 7 dias de garantia.',
      priceCents: 14900,
      billingPeriod: 'MONTHLY',
      trialDays: 7,
      maxMonitors: 999,
      maxSites: 999,
      maxAlertsPerDay: 999,
      checkInterval: 5,
      isRecommended: false,
      priority: 5,
      isActive: true,
      isLifetime: false,
      kiwifyProductId: '6MgOUyL',
    },
  });
  console.log('✅ ULTRA:', planUltra.slug, '- R$ 149,00/mês - 7 dias de garantia');

  // ============================================
  // RESUMO FINAL
  // ============================================
  console.log('\n📊 RESUMO DOS PLANOS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const allPlans = await prisma.plan.findMany({
    orderBy: { priority: 'asc' },
  });

  allPlans.forEach((plan) => {
    const price = plan.priceCents === 0 ? 'GRÁTIS    ' : `R$ ${(plan.priceCents / 100).toFixed(2)}/mês`;
    const recommended = plan.isRecommended ? ' ⭐ RECOMENDADO' : '';
    const garantia = plan.trialDays > 0 ? ` (${plan.trialDays}d garantia)` : ' (sem garantia)';
    console.log(
      `  ${plan.priority}. ${plan.name.padEnd(8)} | ${price} | ${String(plan.maxMonitors).padStart(3)} monitores | ${plan.maxSites} sites${garantia}${recommended}`
    );
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n✅ Total de planos no banco: ${allPlans.length}`);
  console.log('\n✅ kiwifyProductId já configurados para todos os planos pagos!');
  console.log('\n📋 PRÓXIMOS PASSOS:');
  console.log('   1. Configurar webhook da Kiwify:');
  console.log('      - URL: https://seu-dominio.com/api/webhooks/kiwify');
  console.log('      - Secret: adicionar KIWIFY_WEBHOOK_SECRET no .env');
  console.log('      - Eventos: marcar todos (compra, renovação, cancelamento, etc.)');
  console.log('   2. Testar fluxo de compra:');
  console.log('      - Fazer compra de teste em um dos checkouts');
  console.log('      - Verificar se webhook chegou e subscription foi criada');
  console.log('   3. Ajustar textos do frontend para "7 dias de garantia"\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error('❌ Erro ao executar seed:', e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });

#!/usr/bin/env ts-node-dev
/**
 * Script para configurar cenários de trial para testes
 *
 * Uso:
 *   npx ts-node-dev scripts/setup-trial-scenario.ts --expired
 *   npx ts-node-dev scripts/setup-trial-scenario.ts --expiring=2
 *   npx ts-node-dev scripts/setup-trial-scenario.ts --active=14
 *   npx ts-node-dev scripts/setup-trial-scenario.ts --paid
 *   npx ts-node-dev scripts/setup-trial-scenario.ts --list
 *
 * Cenários disponíveis:
 *   --expired          : Trial expirado (trialEndsAt = ontem)
 *   --expiring=N       : Trial expirando em N dias (1-7)
 *   --active=N         : Trial ativo com N dias restantes (> 7)
 *   --paid             : Assinatura paga ativa (sem trial)
 *   --list             : Listar status atual do usuário de teste
 *   --create           : Criar usuário de teste se não existir
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Dados do usuário de teste padrão
const TEST_USER = {
  email: 'e2e-test@radarone.com',
  name: 'E2E Test User',
  cpf: '000.000.000-00', // CPF fictício para testes
  phone: '(11) 99999-0000',
  password: 'Test@123456',
};

/**
 * Cria usuário de teste se não existir
 */
async function createTestUser() {
  const existing = await prisma.user.findUnique({
    where: { email: TEST_USER.email },
  });

  if (existing) {
    console.log('✅ Usuário de teste já existe:', TEST_USER.email);
    return existing;
  }

  console.log('📝 Criando usuário de teste...');
  const hashedPassword = await bcrypt.hash(TEST_USER.password, 10);

  const user = await prisma.user.create({
    data: {
      email: TEST_USER.email,
      name: TEST_USER.name,
      cpf: TEST_USER.cpf,
      phone: TEST_USER.phone,
      password: hashedPassword,
    },
  });

  console.log('✅ Usuário criado com sucesso!');
  console.log('   Email:', TEST_USER.email);
  console.log('   Senha:', TEST_USER.password);

  return user;
}

/**
 * Configura trial expirado
 */
async function setupExpiredTrial(userId: string) {
  console.log('\n🔧 Configurando trial EXPIRADO...');

  // Buscar plano FREE
  const freePlan = await prisma.plan.findUnique({
    where: { slug: 'free' },
  });

  if (!freePlan) {
    throw new Error('Plano FREE não encontrado no banco');
  }

  // Atualizar ou criar subscription
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  await prisma.subscription.upsert({
    where: {
      userId_planId: {
        userId,
        planId: freePlan.id,
      },
    },
    create: {
      userId,
      planId: freePlan.id,
      status: 'TRIAL',
      trialEndsAt: yesterday,
      currentPeriodStart: new Date(),
      currentPeriodEnd: yesterday,
    },
    update: {
      status: 'TRIAL',
      trialEndsAt: yesterday,
      currentPeriodEnd: yesterday,
    },
  });

  console.log('✅ Trial configurado como EXPIRADO');
  console.log('   trialEndsAt:', yesterday.toISOString());
}

/**
 * Configura trial expirando em N dias
 */
async function setupExpiringTrial(userId: string, daysRemaining: number) {
  console.log(`\n🔧 Configurando trial expirando em ${daysRemaining} dias...`);

  if (daysRemaining < 1 || daysRemaining > 7) {
    throw new Error('daysRemaining deve estar entre 1 e 7');
  }

  // Buscar plano FREE
  const freePlan = await prisma.plan.findUnique({
    where: { slug: 'free' },
  });

  if (!freePlan) {
    throw new Error('Plano FREE não encontrado no banco');
  }

  // Calcular data de expiração
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + daysRemaining);

  await prisma.subscription.upsert({
    where: {
      userId_planId: {
        userId,
        planId: freePlan.id,
      },
    },
    create: {
      userId,
      planId: freePlan.id,
      status: 'TRIAL',
      trialEndsAt: expirationDate,
      currentPeriodStart: new Date(),
      currentPeriodEnd: expirationDate,
    },
    update: {
      status: 'TRIAL',
      trialEndsAt: expirationDate,
      currentPeriodEnd: expirationDate,
    },
  });

  console.log(`✅ Trial configurado para expirar em ${daysRemaining} dias`);
  console.log('   trialEndsAt:', expirationDate.toISOString());
}

/**
 * Configura trial ativo com N dias restantes (> 7)
 */
async function setupActiveTrial(userId: string, daysRemaining: number) {
  console.log(`\n🔧 Configurando trial ATIVO com ${daysRemaining} dias...`);

  if (daysRemaining <= 7) {
    throw new Error('Para trial ativo, use mais de 7 dias');
  }

  // Buscar plano FREE
  const freePlan = await prisma.plan.findUnique({
    where: { slug: 'free' },
  });

  if (!freePlan) {
    throw new Error('Plano FREE não encontrado no banco');
  }

  // Calcular data de expiração
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + daysRemaining);

  await prisma.subscription.upsert({
    where: {
      userId_planId: {
        userId,
        planId: freePlan.id,
      },
    },
    create: {
      userId,
      planId: freePlan.id,
      status: 'TRIAL',
      trialEndsAt: expirationDate,
      currentPeriodStart: new Date(),
      currentPeriodEnd: expirationDate,
    },
    update: {
      status: 'TRIAL',
      trialEndsAt: expirationDate,
      currentPeriodEnd: expirationDate,
    },
  });

  console.log(`✅ Trial ativo configurado com ${daysRemaining} dias restantes`);
  console.log('   trialEndsAt:', expirationDate.toISOString());
}

/**
 * Configura assinatura paga ativa
 */
async function setupPaidSubscription(userId: string) {
  console.log('\n🔧 Configurando assinatura PAGA...');

  // Buscar plano BASIC (ou primeiro plano pago)
  const paidPlan = await prisma.plan.findFirst({
    where: {
      slug: { not: 'free' },
    },
    orderBy: {
      priceCents: 'asc',
    },
  });

  if (!paidPlan) {
    throw new Error('Nenhum plano pago encontrado no banco');
  }

  // Configurar período de 30 dias
  const now = new Date();
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30);

  await prisma.subscription.upsert({
    where: {
      userId_planId: {
        userId,
        planId: paidPlan.id,
      },
    },
    create: {
      userId,
      planId: paidPlan.id,
      status: 'ACTIVE',
      trialEndsAt: null,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      kiwifySubscriptionId: 'test-sub-id',
    },
    update: {
      status: 'ACTIVE',
      trialEndsAt: null,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      kiwifySubscriptionId: 'test-sub-id',
    },
  });

  console.log('✅ Assinatura paga configurada');
  console.log('   Plano:', paidPlan.name);
  console.log('   Período:', `${now.toISOString()} → ${periodEnd.toISOString()}`);
}

/**
 * Lista status atual do usuário
 */
async function listUserStatus(userId: string) {
  console.log('\n📊 STATUS ATUAL DO USUÁRIO DE TESTE\n');
  console.log('━'.repeat(80));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        include: {
          plan: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });

  if (!user) {
    console.log('❌ Usuário não encontrado');
    return;
  }

  console.log(`Email: ${user.email}`);
  console.log(`Nome: ${user.name}`);
  console.log(`ID: ${user.id}`);
  console.log('━'.repeat(80));

  if (user.subscriptions.length === 0) {
    console.log('\n⚠️  Nenhuma assinatura encontrada');
    return;
  }

  console.log('\nAssinaturas:\n');

  for (const sub of user.subscriptions) {
    const now = new Date();
    const isExpired = sub.trialEndsAt && sub.trialEndsAt < now;
    const daysRemaining = sub.trialEndsAt
      ? Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    console.log(`  📦 ${sub.plan.name} (${sub.plan.slug})`);
    console.log(`     Status: ${sub.status}`);
    console.log(`     Trial Ends: ${sub.trialEndsAt ? sub.trialEndsAt.toISOString() : 'N/A'}`);

    if (sub.status === 'TRIAL' && sub.trialEndsAt) {
      if (isExpired) {
        console.log('     ❌ TRIAL EXPIRADO');
      } else if (daysRemaining !== null && daysRemaining <= 7) {
        console.log(`     ⚠️  EXPIRANDO EM ${daysRemaining} DIAS`);
      } else {
        console.log(`     ✅ TRIAL ATIVO (${daysRemaining} dias restantes)`);
      }
    } else if (sub.status === 'ACTIVE') {
      console.log('     ✅ ASSINATURA PAGA ATIVA');
    }

    console.log(`     Período: ${sub.currentPeriodStart.toISOString()} → ${sub.currentPeriodEnd.toISOString()}`);
    console.log('');
  }

  console.log('━'.repeat(80));
}

/**
 * Main
 */
async function main() {
  try {
    const args = process.argv.slice(2);

    if (args.length === 0) {
      console.log('❌ Nenhum argumento fornecido');
      console.log('\nUso:');
      console.log('  npx ts-node-dev scripts/setup-trial-scenario.ts --expired');
      console.log('  npx ts-node-dev scripts/setup-trial-scenario.ts --expiring=2');
      console.log('  npx ts-node-dev scripts/setup-trial-scenario.ts --active=14');
      console.log('  npx ts-node-dev scripts/setup-trial-scenario.ts --paid');
      console.log('  npx ts-node-dev scripts/setup-trial-scenario.ts --list');
      console.log('  npx ts-node-dev scripts/setup-trial-scenario.ts --create');
      process.exit(1);
    }

    // Criar usuário se necessário
    const user = await createTestUser();

    // Processar comando
    const command = args[0];

    if (command === '--create') {
      console.log('\n✅ Usuário criado/verificado com sucesso!');
    } else if (command === '--list') {
      await listUserStatus(user.id);
    } else if (command === '--expired') {
      await setupExpiredTrial(user.id);
      await listUserStatus(user.id);
    } else if (command.startsWith('--expiring=')) {
      const days = parseInt(command.split('=')[1]);
      await setupExpiringTrial(user.id, days);
      await listUserStatus(user.id);
    } else if (command.startsWith('--active=')) {
      const days = parseInt(command.split('=')[1]);
      await setupActiveTrial(user.id, days);
      await listUserStatus(user.id);
    } else if (command === '--paid') {
      await setupPaidSubscription(user.id);
      await listUserStatus(user.id);
    } else {
      console.log('❌ Comando desconhecido:', command);
      process.exit(1);
    }

    console.log('\n✅ Operação concluída com sucesso!\n');
  } catch (error) {
    console.error('\n❌ Erro:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();

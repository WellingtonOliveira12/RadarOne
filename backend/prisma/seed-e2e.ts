/**
 * Seed de dados determinísticos para testes E2E
 *
 * Cria:
 * - Plano FREE
 * - Usuário E2E (e2e-test@radarone.com) com subscription ACTIVE
 * - Admin E2E (e2e-admin@radarone.com) com subscription ACTIVE
 * - Monitores de exemplo
 * - NotificationSettings
 *
 * Uso:
 * npm run seed:e2e
 *
 * IMPORTANTE: Este seed é idempotente - pode rodar múltiplas vezes sem criar duplicatas.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed E2E...');

  // ============================================
  // 1. PLANO FREE
  // ============================================
  console.log('📦 Criando plano FREE...');
  const freePlan = await prisma.plan.upsert({
    where: { slug: 'free' },
    update: {},
    create: {
      name: 'Free',
      slug: 'free',
      description: 'Plano gratuito com funcionalidades básicas',
      priceCents: 0,
      billingPeriod: 'MONTHLY',
      trialDays: 7,
      maxMonitors: 3,
      maxSites: 2,
      maxAlertsPerDay: 10,
      checkInterval: 60,
      isActive: true,
      isRecommended: false,
      priority: 1,
    },
  });
  console.log('✅ Plano FREE criado:', freePlan.id);

  // ============================================
  // 2. USUÁRIO E2E (USER)
  // ============================================
  console.log('👤 Criando usuário E2E...');
  const passwordHash = await bcrypt.hash('Test123456!', 10);

  const userE2E = await prisma.user.upsert({
    where: { email: 'e2e-test@radarone.com' },
    update: {
      passwordHash,
      name: 'E2E Test User',
      role: 'USER',
      isActive: true,
      blocked: false,
    },
    create: {
      email: 'e2e-test@radarone.com',
      passwordHash,
      name: 'E2E Test User',
      role: 'USER',
      phone: '(11) 98765-4321',
      isActive: true,
      blocked: false,
    },
  });
  console.log('✅ Usuário E2E criado:', userE2E.id);

  // Subscription ACTIVE para usuário E2E
  console.log('💳 Criando subscription ACTIVE para usuário E2E...');
  const userSubscription = await prisma.subscription.upsert({
    where: {
      id: `sub-e2e-user-${userE2E.id}`,
    },
    update: {
      status: 'ACTIVE',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 dias
      trialEndsAt: null, // Não está em trial
      queriesUsed: 5,
      queriesLimit: 100,
      isLifetime: false,
      isTrial: false,
    },
    create: {
      id: `sub-e2e-user-${userE2E.id}`,
      userId: userE2E.id,
      planId: freePlan.id,
      status: 'ACTIVE',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      trialEndsAt: null,
      queriesUsed: 5,
      queriesLimit: 100,
      isLifetime: false,
      isTrial: false,
    },
  });
  console.log('✅ Subscription ACTIVE criada:', userSubscription.id);

  // NotificationSettings para usuário E2E
  console.log('🔔 Criando notification settings para usuário E2E...');
  await prisma.notificationSettings.upsert({
    where: { userId: userE2E.id },
    update: {
      emailEnabled: true,
      telegramEnabled: false,
      telegramUsername: null,
      telegramChatId: null,
      telegramLinkCode: null,
      telegramLinkExpiresAt: null,
    },
    create: {
      userId: userE2E.id,
      emailEnabled: true,
      telegramEnabled: false,
    },
  });
  console.log('✅ Notification settings criadas para usuário E2E');

  // Monitores para usuário E2E
  console.log('📡 Criando monitores para usuário E2E...');
  await prisma.monitor.upsert({
    where: { id: `monitor-e2e-user-1-${userE2E.id}` },
    update: {
      name: 'Monitor Mercado Livre E2E',
      site: 'MERCADO_LIVRE',
      searchUrl: 'https://lista.mercadolivre.com.br/iphone',
      active: true,
      keywords: ['iphone', '15'],
      excludeKeywords: ['usado'],
      priceMin: 1000,
      priceMax: 5000,
      alertsEnabled: true,
    },
    create: {
      id: `monitor-e2e-user-1-${userE2E.id}`,
      userId: userE2E.id,
      name: 'Monitor Mercado Livre E2E',
      site: 'MERCADO_LIVRE',
      searchUrl: 'https://lista.mercadolivre.com.br/iphone',
      active: true,
      keywords: ['iphone', '15'],
      excludeKeywords: ['usado'],
      priceMin: 1000,
      priceMax: 5000,
      alertsEnabled: true,
    },
  });

  await prisma.monitor.upsert({
    where: { id: `monitor-e2e-user-2-${userE2E.id}` },
    update: {
      name: 'Monitor OLX E2E',
      site: 'OLX',
      searchUrl: 'https://olx.com.br/carros',
      active: false,
      keywords: ['honda', 'civic'],
      excludeKeywords: [],
      priceMin: 20000,
      priceMax: 80000,
      alertsEnabled: true,
    },
    create: {
      id: `monitor-e2e-user-2-${userE2E.id}`,
      userId: userE2E.id,
      name: 'Monitor OLX E2E',
      site: 'OLX',
      searchUrl: 'https://olx.com.br/carros',
      active: false,
      keywords: ['honda', 'civic'],
      excludeKeywords: [],
      priceMin: 20000,
      priceMax: 80000,
      alertsEnabled: true,
    },
  });
  console.log('✅ 2 monitores criados para usuário E2E');

  // ============================================
  // 3. ADMIN E2E
  // ============================================
  console.log('👤 Criando admin E2E...');
  const adminPasswordHash = await bcrypt.hash('Admin123456!', 10);

  const adminE2E = await prisma.user.upsert({
    where: { email: 'e2e-admin@radarone.com' },
    update: {
      passwordHash: adminPasswordHash,
      name: 'E2E Admin User',
      role: 'ADMIN',
      isActive: true,
      blocked: false,
    },
    create: {
      email: 'e2e-admin@radarone.com',
      passwordHash: adminPasswordHash,
      name: 'E2E Admin User',
      role: 'ADMIN',
      phone: '(11) 91234-5678',
      isActive: true,
      blocked: false,
    },
  });
  console.log('✅ Admin E2E criado:', adminE2E.id);

  // Subscription ACTIVE para admin E2E
  console.log('💳 Criando subscription ACTIVE para admin E2E...');
  const adminSubscription = await prisma.subscription.upsert({
    where: {
      id: `sub-e2e-admin-${adminE2E.id}`,
    },
    update: {
      status: 'ACTIVE',
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // +1 ano
      trialEndsAt: null,
      queriesUsed: 0,
      queriesLimit: 1000,
      isLifetime: false,
      isTrial: false,
    },
    create: {
      id: `sub-e2e-admin-${adminE2E.id}`,
      userId: adminE2E.id,
      planId: freePlan.id,
      status: 'ACTIVE',
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      trialEndsAt: null,
      queriesUsed: 0,
      queriesLimit: 1000,
      isLifetime: false,
      isTrial: false,
    },
  });
  console.log('✅ Subscription ACTIVE criada para admin:', adminSubscription.id);

  // NotificationSettings para admin E2E
  console.log('🔔 Criando notification settings para admin E2E...');
  await prisma.notificationSettings.upsert({
    where: { userId: adminE2E.id },
    update: {
      emailEnabled: true,
      telegramEnabled: false,
      telegramUsername: null,
      telegramChatId: null,
      telegramLinkCode: null,
      telegramLinkExpiresAt: null,
    },
    create: {
      userId: adminE2E.id,
      emailEnabled: true,
      telegramEnabled: false,
    },
  });
  console.log('✅ Notification settings criadas para admin E2E');

  // ============================================
  // 4. USUÁRIO COM TRIAL EXPIRANDO (para testes de trial)
  // ============================================
  console.log('👤 Criando usuário com trial expirando...');
  const trialUserPasswordHash = await bcrypt.hash('Trial123456!', 10);

  const trialUser = await prisma.user.upsert({
    where: { email: 'e2e-trial@radarone.com' },
    update: {
      passwordHash: trialUserPasswordHash,
      name: 'E2E Trial User',
      role: 'USER',
      isActive: true,
      blocked: false,
    },
    create: {
      email: 'e2e-trial@radarone.com',
      passwordHash: trialUserPasswordHash,
      name: 'E2E Trial User',
      role: 'USER',
      phone: '(11) 99999-9999',
      isActive: true,
      blocked: false,
    },
  });
  console.log('✅ Usuário trial criado:', trialUser.id);

  // Subscription TRIAL expirando em 2 dias
  console.log('💳 Criando subscription TRIAL expirando...');
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 2); // +2 dias

  await prisma.subscription.upsert({
    where: {
      id: `sub-e2e-trial-${trialUser.id}`,
    },
    update: {
      status: 'TRIAL',
      trialEndsAt: trialEndsAt,
      validUntil: trialEndsAt,
      queriesUsed: 3,
      queriesLimit: 50,
      isLifetime: false,
      isTrial: true,
    },
    create: {
      id: `sub-e2e-trial-${trialUser.id}`,
      userId: trialUser.id,
      planId: freePlan.id,
      status: 'TRIAL',
      trialEndsAt: trialEndsAt,
      validUntil: trialEndsAt,
      queriesUsed: 3,
      queriesLimit: 50,
      isLifetime: false,
      isTrial: true,
    },
  });
  console.log('✅ Subscription TRIAL criada (expira em 2 dias)');

  // NotificationSettings para trial user
  await prisma.notificationSettings.upsert({
    where: { userId: trialUser.id },
    update: {
      emailEnabled: true,
      telegramEnabled: false,
    },
    create: {
      userId: trialUser.id,
      emailEnabled: true,
      telegramEnabled: false,
    },
  });

  console.log('\n✨ Seed E2E concluído com sucesso!\n');
  console.log('📋 Credenciais criadas:');
  console.log('┌─────────────────────────────────────────────────────┐');
  console.log('│ USUÁRIO E2E (USER)                                   │');
  console.log('│ Email: e2e-test@radarone.com                         │');
  console.log('│ Senha: Test123456!                                   │');
  console.log('│ Status: ACTIVE (30 dias restantes)                   │');
  console.log('├─────────────────────────────────────────────────────┤');
  console.log('│ ADMIN E2E                                            │');
  console.log('│ Email: e2e-admin@radarone.com                        │');
  console.log('│ Senha: Admin123456!                                  │');
  console.log('│ Status: ACTIVE (1 ano restante)                      │');
  console.log('├─────────────────────────────────────────────────────┤');
  console.log('│ TRIAL USER (para testes de trial)                   │');
  console.log('│ Email: e2e-trial@radarone.com                        │');
  console.log('│ Senha: Trial123456!                                  │');
  console.log('│ Status: TRIAL (expira em 2 dias)                     │');
  console.log('└─────────────────────────────────────────────────────┘');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Erro ao rodar seed E2E:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Script de Teste - Validação da Correção de Notificações
 *
 * Verifica se a query inclui notificationSettings e telegramAccounts
 * e se os alertas seriam enviados corretamente.
 *
 * Uso: npx ts-node scripts/test-notification-fix.ts
 */

import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

dotenv.config();

// Inicializa o Prisma Client com adapter Postgres
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

async function testNotificationFix() {
  console.log('='.repeat(60));
  console.log('🔍 TESTE DE CORREÇÃO DE NOTIFICAÇÕES');
  console.log('='.repeat(60));

  try {
    // 1. Verificar conexão
    await prisma.$connect();
    console.log('\n✅ Conectado ao banco de dados');

    // 2. Buscar monitores com a query corrigida
    console.log('\n📊 Buscando monitores ativos com dados de notificação...');

    const monitors = await prisma.monitor.findMany({
      where: {
        active: true,
      },
      include: {
        user: {
          include: {
            subscriptions: {
              where: {
                status: 'ACTIVE',
              },
            },
            // FIX: Incluir notificationSettings para ter telegramChatId
            notificationSettings: true,
            // FIX: Incluir telegramAccounts como fallback
            telegramAccounts: {
              where: { active: true },
              take: 1,
            },
          },
        },
      },
      take: 10, // Limitar para teste
    });

    console.log(`\n📌 ${monitors.length} monitores encontrados\n`);

    // 3. Analisar cada monitor
    let monitorsComTelegram = 0;
    let monitorsComEmail = 0;
    let monitorsSemCanal = 0;

    for (const monitor of monitors) {
      console.log('-'.repeat(50));
      console.log(`Monitor: ${monitor.name} (${monitor.site})`);
      console.log(`  ID: ${monitor.id}`);
      console.log(`  alertsEnabled: ${monitor.alertsEnabled}`);
      console.log(`  User: ${monitor.user.email}`);

      // Verificar Telegram
      const telegramChatId =
        monitor.user.notificationSettings?.telegramChatId ||
        monitor.user.telegramAccounts?.[0]?.chatId ||
        null;

      const telegramEnabled =
        monitor.user.notificationSettings?.telegramEnabled !== false;

      const hasTelegram = !!(telegramChatId && telegramEnabled);

      console.log(`  notificationSettings: ${monitor.user.notificationSettings ? 'SIM' : 'NÃO'}`);
      console.log(`  telegramAccounts: ${monitor.user.telegramAccounts?.length || 0}`);
      console.log(`  telegramChatId: ${telegramChatId ? '***' + telegramChatId.slice(-4) : 'NULL'}`);
      console.log(`  telegramEnabled: ${telegramEnabled}`);
      console.log(`  hasTelegram: ${hasTelegram ? '✅' : '❌'}`);
      console.log(`  hasEmail: ${monitor.user.email ? '✅' : '❌'}`);

      if (hasTelegram) monitorsComTelegram++;
      if (monitor.user.email) monitorsComEmail++;
      if (!hasTelegram && !monitor.user.email) monitorsSemCanal++;
    }

    // 4. Resumo
    console.log('\n' + '='.repeat(60));
    console.log('📈 RESUMO');
    console.log('='.repeat(60));
    console.log(`Total de monitores ativos: ${monitors.length}`);
    console.log(`Monitores com Telegram configurado: ${monitorsComTelegram}`);
    console.log(`Monitores com Email configurado: ${monitorsComEmail}`);
    console.log(`Monitores SEM canal de notificação: ${monitorsSemCanal}`);

    // 5. Verificar envvars do worker
    console.log('\n' + '='.repeat(60));
    console.log('🔐 VARIÁVEIS DE AMBIENTE (verificar no .env do WORKER)');
    console.log('='.repeat(60));

    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const resendKey = process.env.RESEND_API_KEY;

    console.log(`TELEGRAM_BOT_TOKEN: ${telegramToken ? (telegramToken.startsWith('your') ? '⚠️  PLACEHOLDER' : '✅ Configurado') : '❌ NÃO CONFIGURADO'}`);
    console.log(`RESEND_API_KEY: ${resendKey ? '✅ Configurado' : '❌ NÃO CONFIGURADO'}`);

    // 6. Diagnóstico
    console.log('\n' + '='.repeat(60));
    console.log('🩺 DIAGNÓSTICO');
    console.log('='.repeat(60));

    if (monitorsComTelegram === 0) {
      console.log('⚠️  Nenhum usuário tem Telegram configurado!');
      console.log('   → Usuários precisam vincular o bot via /settings no frontend');
    } else {
      console.log(`✅ ${monitorsComTelegram} usuário(s) com Telegram configurado`);
    }

    if (!telegramToken || telegramToken.startsWith('your')) {
      console.log('⚠️  TELEGRAM_BOT_TOKEN não está configurado corretamente AQUI!');
      console.log('   → Verificar .env do worker em produção');
    }

    if (!resendKey) {
      console.log('⚠️  RESEND_API_KEY não está configurado!');
      console.log('   → Alertas por email estão desabilitados');
    }

    // 7. Query direta para ver todos os telegramChatIds
    console.log('\n' + '='.repeat(60));
    console.log('📋 USUÁRIOS COM TELEGRAM CONFIGURADO (DB)');
    console.log('='.repeat(60));

    const usersWithTelegram = await prisma.notificationSettings.findMany({
      where: {
        telegramChatId: { not: null },
        telegramEnabled: true,
      },
      select: {
        userId: true,
        telegramChatId: true,
        telegramEnabled: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    console.log(`Encontrados ${usersWithTelegram.length} usuários com telegramChatId configurado:`);
    for (const u of usersWithTelegram) {
      console.log(`  - ${u.user.email}: chatId=***${u.telegramChatId?.slice(-4)}`);
    }

    // 8. TelegramAccounts
    const telegramAccounts = await prisma.telegramAccount.findMany({
      where: { active: true },
      select: {
        chatId: true,
        user: {
          select: { email: true },
        },
      },
    });

    console.log(`\nEncontrados ${telegramAccounts.length} TelegramAccounts ativos:`);
    for (const ta of telegramAccounts) {
      console.log(`  - ${ta.user.email}: chatId=***${ta.chatId.slice(-4)}`);
    }

    console.log('\n✅ Teste concluído');
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testNotificationFix();

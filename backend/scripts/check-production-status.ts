/**
 * Script de Diagnóstico - Verifica estado dos monitores em produção
 *
 * Uso: npx ts-node scripts/check-production-status.ts
 */

import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ['error'] });

async function checkProductionStatus() {
  console.log('='.repeat(70));
  console.log('🔍 DIAGNÓSTICO DE PRODUÇÃO - RadarOne');
  console.log('='.repeat(70));

  try {
    await prisma.$connect();
    console.log('\n✅ Conectado ao banco de dados\n');

    // 1. Monitores ativos
    console.log('📊 MONITORES ATIVOS');
    console.log('-'.repeat(50));
    const monitors = await prisma.monitor.findMany({
      where: { active: true },
      include: {
        user: {
          select: { email: true },
        },
      },
    });
    console.log(`Total de monitores ativos: ${monitors.length}`);
    for (const m of monitors) {
      console.log(`  - ${m.name} (${m.site}) - User: ${m.user.email}`);
      console.log(`    lastCheckedAt: ${m.lastCheckedAt || 'NUNCA'}`);
      console.log(`    alertsEnabled: ${m.alertsEnabled}`);
    }

    // 2. Últimos logs de monitor
    console.log('\n📋 ÚLTIMOS 20 MONITOR_LOGS');
    console.log('-'.repeat(50));
    const logs = await prisma.monitorLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        monitor: {
          select: { name: true },
        },
      },
    });

    if (logs.length === 0) {
      console.log('⚠️  NENHUM LOG ENCONTRADO - Worker NUNCA rodou!');
    } else {
      console.log(`Encontrados ${logs.length} logs:`);
      for (const log of logs) {
        console.log(`  ${log.createdAt.toISOString()} | ${log.monitor.name} | status=${log.status} | ads_found=${log.adsFound} | new_ads=${log.newAds} | alerts_sent=${log.alertsSent}`);
      }

      // Verificar última execução
      const lastLog = logs[0];
      const hoursSinceLastRun = (Date.now() - lastLog.createdAt.getTime()) / (1000 * 60 * 60);
      console.log(`\n⏱️  Última execução: ${hoursSinceLastRun.toFixed(1)} horas atrás`);
      if (hoursSinceLastRun > 1) {
        console.log('⚠️  Worker pode estar parado ou com erro!');
      }
    }

    // 3. Últimos ads vistos
    console.log('\n📦 ÚLTIMOS 20 ADS_SEEN');
    console.log('-'.repeat(50));
    const ads = await prisma.adSeen.findMany({
      orderBy: { firstSeenAt: 'desc' },
      take: 20,
      select: {
        title: true,
        alertSent: true,
        alertSentAt: true,
        firstSeenAt: true,
        monitor: {
          select: { name: true },
        },
      },
    });

    if (ads.length === 0) {
      console.log('⚠️  NENHUM AD VISTO - Scraping não está funcionando!');
    } else {
      let alertsSent = 0;
      let alertsNotSent = 0;
      for (const ad of ads) {
        const status = ad.alertSent ? '✅' : '❌';
        console.log(`  ${status} ${ad.firstSeenAt.toISOString().slice(0,16)} | ${ad.monitor.name} | ${ad.title.slice(0,40)}...`);
        if (ad.alertSent) alertsSent++;
        else alertsNotSent++;
      }
      console.log(`\nResumo: ${alertsSent} alertas enviados, ${alertsNotSent} NÃO enviados`);
    }

    // 4. Usuários com Telegram configurado
    console.log('\n📱 USUÁRIOS COM TELEGRAM CONFIGURADO');
    console.log('-'.repeat(50));
    const usersWithTelegram = await prisma.notificationSettings.findMany({
      where: {
        telegramChatId: { not: null },
        telegramEnabled: true,
      },
      select: {
        telegramChatId: true,
        user: { select: { email: true } },
      },
    });
    console.log(`Total: ${usersWithTelegram.length}`);
    for (const u of usersWithTelegram) {
      console.log(`  - ${u.user.email}: chatId=***${u.telegramChatId?.slice(-4)}`);
    }

    // 5. Diagnóstico final
    console.log('\n' + '='.repeat(70));
    console.log('🩺 DIAGNÓSTICO FINAL');
    console.log('='.repeat(70));

    if (logs.length === 0) {
      console.log('\n🔴 PROBLEMA CRÍTICO: Worker NUNCA rodou!');
      console.log('   → Ação: Criar/deployar radarone-worker no Render');
    } else if (logs.length > 0 && ads.length === 0) {
      console.log('\n🔴 PROBLEMA: Worker roda mas não encontra anúncios');
      console.log('   → Ação: Verificar scraper/seletores CSS');
    } else if (ads.some(a => !a.alertSent)) {
      console.log('\n🟡 PROBLEMA: Anúncios encontrados mas alertas não enviados');
      console.log('   → Ação: Verificar TELEGRAM_BOT_TOKEN e RESEND_API_KEY');
    } else {
      console.log('\n🟢 Sistema parece OK baseado nos dados');
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

checkProductionStatus();

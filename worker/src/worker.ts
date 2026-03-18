/**
 * Worker Principal - RadarOne
 *
 * IMPORTANTE: Este arquivo NÃO deve ser o entrypoint direto.
 * Use bootstrap.ts como entrypoint para garantir que
 * PLAYWRIGHT_BROWSERS_PATH seja configurado antes dos imports.
 *
 * Este arquivo é importado dinamicamente pelo bootstrap.ts
 */

import { prisma } from './lib/prisma';
import { MonitorRunner } from './services/monitor-runner';
import {
  enqueueMonitors,
  startWorkers,
  getQueueStats,
  shutdown as shutdownQueue,
  isHealthy as isQueueHealthy,
  isRedisConfigured,
} from './services/queue-manager';
import { initSentry, captureException } from './monitoring/sentry';
import { startHealthServer } from './health-server';
import { browserManager } from './engine/browser-manager';

// Inicializa Sentry para monitoramento de erros
initSentry();

// Inicia health check server
startHealthServer();

/**
 * Worker de Scraping - RadarOne
 *
 * INTERVALO POR PLANO:
 * - Free: 60 min
 * - Starter: 30 min
 * - Pro: 15 min
 * - Premium: 10 min
 * - Ultra: 5 min
 *
 * Estratégia: Worker roda a cada 1 minuto (tick) e filtra monitores
 * elegíveis baseado em lastCheckedAt + checkInterval do plano.
 */

// Modo de operação - usa fila apenas se Redis estiver configurado
const USE_QUEUE = isRedisConfigured();
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5');

// Intervalo padrão para usuários sem plano (Free)
const DEFAULT_CHECK_INTERVAL_MINUTES = 60;

class Worker {
  private isRunning = false;
  private isExecuting = false; // Guard against overlapping cycles
  private checkInterval: NodeJS.Timeout | null = null;
  private worker: any = null;
  private cycleCount = 0;

  async start() {
    console.log('='.repeat(60));
    console.log('🚀 RadarOne Worker iniciado');
    console.log('='.repeat(60));
    console.log(`⏰ Tick interval: ${this.getTickIntervalMinutes()} minuto(s)`);
    console.log(`🔧 Modo: ${USE_QUEUE ? 'QUEUE (BullMQ)' : 'LOOP (Sequencial)'}`);
    console.log('📋 Intervalo por plano: Free=60min, Starter=30min, Pro=15min, Premium=10min, Ultra=5min');

    // Log de configuração para diagnóstico
    console.log('\n📋 Configuração:');
    console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Configurado' : '❌ NÃO CONFIGURADO'}`);
    console.log(`   REDIS_URL: ${process.env.REDIS_URL ? '✅ Configurado' : '⚠️  Não configurado (modo LOOP)'}`);
    console.log(`   TELEGRAM_BOT_TOKEN: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Configurado' : '❌ NÃO CONFIGURADO'}`);
    console.log(`   RESEND_API_KEY: ${process.env.RESEND_API_KEY ? '✅ Configurado' : '⚠️  Não configurado (email desabilitado)'}`);
    console.log(`   PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH || '❌ NÃO CONFIGURADO'}`);

    if (USE_QUEUE) {
      console.log(`👷 Concurrency: ${CONCURRENCY} workers`);
    } else {
      console.log('ℹ️  Modo LOOP: processamento sequencial (sem Redis)');
    }

    // Testa conexão com o banco
    try {
      await prisma.$connect();
      console.log('✅ Conectado ao banco de dados');
    } catch (error: any) {
      console.error('❌ Erro ao conectar ao banco:', error);
      captureException(error, { context: 'database_connection' });
      process.exit(1);
    }

    // Testa conexão com Redis (se usar fila)
    if (USE_QUEUE) {
      const healthy = await isQueueHealthy();
      if (!healthy) {
        console.error('❌ Erro ao conectar ao Redis');
        process.exit(1);
      }
      console.log('✅ Conectado ao Redis');
    }

    this.isRunning = true;

    // Inicia workers (se usar fila)
    if (USE_QUEUE) {
      this.worker = startWorkers(CONCURRENCY);
    }

    // Executa imediatamente
    await this.runMonitors();

    // Agenda execuções periódicas (tick a cada X minutos)
    const intervalMs = this.getTickIntervalMinutes() * 60 * 1000;
    this.checkInterval = setInterval(() => {
      this.runMonitors();
    }, intervalMs);
  }

  /**
   * Busca monitores elegíveis e executa
   * Monitores são filtrados pelo intervalo do plano
   */
  async runMonitors() {
    if (!this.isRunning) return;

    // Prevent overlapping cycles — this is the #1 cause of notification bursts.
    // If a cycle takes longer than the tick interval (e.g. 9 monitors × 15-30s = 135-270s),
    // the next setInterval tick would start a new cycle while the old one is still running,
    // causing the same monitors to be executed in parallel → duplicate ads → burst notifications.
    if (this.isExecuting) {
      console.log(`⚠️  [${new Date().toISOString()}] CYCLE_SKIPPED: previous cycle still running — no overlap allowed`);
      return;
    }

    this.isExecuting = true;
    this.cycleCount++;
    const cycleId = this.cycleCount;

    const now = new Date();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 [${now.toISOString()}] CYCLE_START #${cycleId}`);
    const startTime = Date.now();

    try {
      // Busca monitores ativos com dados do plano
      const allMonitors = await prisma.monitor.findMany({
        where: {
          active: true,
        },
        include: {
          user: {
            include: {
              subscriptions: {
                where: {
                  OR: [
                    { status: 'ACTIVE' },
                    { status: 'TRIAL' },
                  ],
                },
                include: {
                  plan: true,  // Inclui o plano para pegar checkInterval
                },
                take: 1,  // Pega apenas a subscription ativa
              },
              notificationSettings: true,
              telegramAccounts: {
                where: { active: true },
                take: 1,
              },
            },
          },
        },
      });

      console.log(`📌 ${allMonitors.length} monitores ativos no total`);

      // Filtra monitores elegíveis baseado no intervalo do plano
      const eligibleMonitors = allMonitors.filter((monitor) => {
        const subscription = monitor.user.subscriptions[0];
        const plan = subscription?.plan;
        const checkIntervalMin = plan?.checkInterval || DEFAULT_CHECK_INTERVAL_MINUTES;

        // Skip monitors without active subscription
        if (!subscription) {
          return false;
        }

        // Se nunca rodou, é elegível
        if (!monitor.lastCheckedAt) {
          console.log(`   ✅ ${monitor.name} [${monitor.site}] - NUNCA RODOU (plano: ${plan?.name || 'Free'}, interval: ${checkIntervalMin}min)`);
          return true;
        }

        // Clock drift protection: if lastCheckedAt is in the future, skip
        if (monitor.lastCheckedAt.getTime() > now.getTime() + 60000) {
          console.warn(`   ⚠️  ${monitor.name} [${monitor.site}] - CLOCK_DRIFT: lastCheckedAt in future, skipping`);
          return false;
        }

        // Calcula se está "due" (lastCheckedAt + interval <= agora)
        const nextRunAt = new Date(monitor.lastCheckedAt.getTime() + checkIntervalMin * 60 * 1000);
        const isDue = now >= nextRunAt;

        if (isDue) {
          const minSinceLastRun = Math.round((now.getTime() - monitor.lastCheckedAt.getTime()) / 60000);
          console.log(`   ✅ ${monitor.name} [${monitor.site}] - DUE (plano: ${plan?.name || 'Free'}, interval: ${checkIntervalMin}min, last: ${minSinceLastRun}min atrás)`);
        } else {
          const minUntilNext = Math.round((nextRunAt.getTime() - now.getTime()) / 60000);
          console.log(`   ⏳ ${monitor.name} [${monitor.site}] - SKIP (plano: ${plan?.name || 'Free'}, interval: ${checkIntervalMin}min, próximo em: ${minUntilNext}min)`);
        }

        return isDue;
      });

      console.log(`\n🎯 ${eligibleMonitors.length} monitores elegíveis para execução`);

      if (eligibleMonitors.length === 0) {
        console.log('   Nenhum monitor precisa rodar agora.');
        const duration = Date.now() - startTime;
        console.log(`✅ Ciclo concluído em ${(duration / 1000).toFixed(2)}s (0 executados)`);
        return;
      }

      if (USE_QUEUE) {
        // Modo FILA: Adiciona apenas elegíveis à fila
        await enqueueMonitors(eligibleMonitors);

        const stats = await getQueueStats();
        console.log(`📊 Fila: ${stats.total} total (${stats.active} processando, ${stats.waiting} aguardando)`);
      } else {
        // Modo LOOP: Processa sequencialmente with stagger to prevent bursts
        let processed = 0;
        for (const monitor of eligibleMonitors) {
          const monitorStart = Date.now();
          try {
            console.log(`MONITOR_EXECUTION_START: name=${monitor.name} site=${monitor.site} monitorId=${monitor.id}`);
            await MonitorRunner.run(monitor);
            processed++;
            const monitorDuration = Date.now() - monitorStart;
            console.log(`MONITOR_EXECUTION_END: name=${monitor.name} site=${monitor.site} duration=${monitorDuration}ms status=SUCCESS`);
          } catch (error: any) {
            const monitorDuration = Date.now() - monitorStart;
            console.error(`MONITOR_EXECUTION_END: name=${monitor.name} site=${monitor.site} duration=${monitorDuration}ms status=ERROR error=${error.message}`);
          }
          // Stagger: 3s between monitors to spread out execution and reduce memory pressure
          await this.delay(3000);
        }
        console.log(`📊 Processados: ${processed}/${eligibleMonitors.length}`);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ CYCLE_END #${cycleId} duration=${(duration / 1000).toFixed(2)}s monitors=${eligibleMonitors.length}`);
    } catch (error: any) {
      console.error('❌ Erro ao executar monitores:', error);
      captureException(error, { context: 'monitor_execution_cycle' });
    } finally {
      this.isExecuting = false;
    }
  }

  async stop() {
    console.log('\n⏳ Encerrando worker...');
    this.isRunning = false;

    // 1. Stop scheduler
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // 2. Await jobs / close queue workers
    if (this.worker) {
      await this.worker.close();
    }

    if (USE_QUEUE) {
      await shutdownQueue();
    }

    // 3. Graceful browser shutdown (waits for active contexts)
    await browserManager.shutdown();

    // 4. Disconnect database
    await prisma.$disconnect();
    console.log('✅ Worker encerrado');
  }

  private getTickIntervalMinutes(): number {
    return parseInt(process.env.CHECK_INTERVAL_MINUTES || '1');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Inicializa worker
const worker = new Worker();

// Unified graceful shutdown (single handler for both signals)
let shuttingDown = false;
const gracefulShutdown = async (signal: string) => {
  if (shuttingDown) return; // Prevent double shutdown
  shuttingDown = true;
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  try {
    await worker.stop();
  } catch (e) {
    console.error('Shutdown error:', e);
  }
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Inicia worker
worker.start().catch((error) => {
  console.error('❌ Erro fatal:', error);
  captureException(error, { context: 'worker_startup_fatal' });
  process.exit(1);
});

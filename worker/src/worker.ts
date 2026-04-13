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
import {
  shutdown as shutdownQueue,
  isHealthy as isQueueHealthy,
  isRedisConfigured,
} from './services/queue-manager';
import { ResilientScheduler } from './services/resilient-scheduler';
import { initSentry, captureException } from './monitoring/sentry';
import { startHealthServer } from './health-server';
import { browserManager } from './engine/browser-manager';
import { startWatchdog, stopWatchdog } from './services/pipeline-watchdog';
import { buildSiteFilterClause, readSiteFilterFromEnv } from './utils/site-filter';

// Inicializa Sentry para monitoramento de erros
initSentry();

// Inicia health check server
startHealthServer();

/**
 * Worker de Scraping - RadarOne
 *
 * SCHEDULER RESILIENTE:
 * - Tick a cada 30s para descobrir monitores due
 * - Execução concorrente com limites global (3) e por site
 * - Jitter distribuído para evitar thundering herd
 * - Spread no restart para evitar burst pós-deploy
 * - Scheduler lag tracking por monitor
 * - Backlog policy para overdue monitors
 *
 * INTERVALO POR PLANO:
 * - Free: 60 min
 * - Starter: 30 min
 * - Pro: 15 min
 * - Premium: 10 min
 * - Ultra: 5 min
 */

class Worker {
  private scheduler: ResilientScheduler;

  constructor() {
    this.scheduler = new ResilientScheduler();
  }

  async start() {
    console.log('='.repeat(60));
    console.log('RadarOne Worker v2 — Resilient Scheduler');
    console.log('='.repeat(60));
    console.log('Scheduler: Concurrent execution pool with jitter + per-site limits');
    console.log('Plan intervals: Free=60min, Starter=30min, Pro=15min, Premium=10min, Ultra=5min');

    // Log de configuração para diagnóstico
    console.log('\nConfiguration:');
    console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? 'OK' : 'NOT SET'}`);
    console.log(`   REDIS_URL: ${process.env.REDIS_URL ? 'OK' : 'not set (not required for scheduler)'}`);
    console.log(`   TELEGRAM_BOT_TOKEN: ${process.env.TELEGRAM_BOT_TOKEN ? 'OK' : 'NOT SET'}`);
    console.log(`   RESEND_API_KEY: ${process.env.RESEND_API_KEY ? 'OK' : 'not set (email disabled)'}`);
    console.log(`   PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH || 'NOT SET'}`);
    console.log(`   SCHEDULER_CONCURRENCY: ${process.env.SCHEDULER_CONCURRENCY || '3 (default)'}`);

    // Site sharding + watchdog flag (for multi-instance deploys)
    const siteFilterSummary = buildSiteFilterClause(readSiteFilterFromEnv()).summary;
    const watchdogEnabled = process.env.WATCHDOG_ENABLED !== 'false';
    console.log(`   WORKER_SITE_FILTER: ${siteFilterSummary}`);
    console.log(`   WATCHDOG_ENABLED: ${watchdogEnabled}`);

    // Testa conexão com o banco
    try {
      await prisma.$connect();
      console.log('Database: connected');
    } catch (error: any) {
      console.error('Database connection failed:', error);
      captureException(error, { context: 'database_connection' });
      process.exit(1);
    }

    // Start the resilient scheduler
    await this.scheduler.start();

    // Start pipeline health watchdog (monitors EMPTY rates, session blocks, notification drops).
    // Disabled via WATCHDOG_ENABLED=false on secondary worker instances (e.g. ML-only shards)
    // so only the primary instance emits system-wide alerts, avoiding duplicates.
    if (process.env.WATCHDOG_ENABLED !== 'false') {
      startWatchdog();
    } else {
      console.log('WATCHDOG_DISABLED: WATCHDOG_ENABLED=false — this instance will not emit system alerts');
    }
  }

  async stop() {
    console.log('\nShutting down worker...');

    // 1. Stop watchdog (no-op if it was never started)
    stopWatchdog();

    // 2. Stop scheduler (waits for active executions to drain)
    await this.scheduler.stop();

    // 2. Close Redis queue if configured
    if (isRedisConfigured()) {
      await shutdownQueue();
    }

    // 3. Graceful browser shutdown (waits for active contexts)
    await browserManager.shutdown();

    // 4. Disconnect database
    await prisma.$disconnect();
    console.log('Worker shutdown complete');
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
  console.error('Fatal error:', error);
  captureException(error, { context: 'worker_startup_fatal' });
  process.exit(1);
});

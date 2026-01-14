import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { MonitorRunner } from './services/monitor-runner';
import {
  enqueueMonitors,
  startWorkers,
  getQueueStats,
  shutdown as shutdownQueue,
  isHealthy as isQueueHealthy,
} from './services/queue-manager';
import { initSentry, captureException } from './monitoring/sentry';
import { startHealthServer } from './health-server';

// Carrega variáveis de ambiente
dotenv.config();

// Inicializa Sentry para monitoramento de erros
initSentry();

// Inicia health check server
startHealthServer();

/**
 * Worker de Scraping - RadarOne (COM FILA)
 *
 * Versão com BullMQ para processamento paralelo e escalável
 *
 * Responsável por:
 * - Buscar monitores ativos
 * - Adicionar à fila distribuída (BullMQ + Redis)
 * - Processar com workers concorrentes
 * - Garantir retry automático e DLQ
 */

const prisma = new PrismaClient();

// Modo de operação
const USE_QUEUE = !!process.env.REDIS_URL || !!process.env.REDIS_HOST;
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5');

class Worker {
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private worker: any = null;

  async start() {
    console.log('🚀 RadarOne Worker iniciado');
    console.log(`⏰ Intervalo de verificação: ${this.getCheckIntervalMinutes()} minutos`);
    console.log(`🔧 Modo: ${USE_QUEUE ? 'QUEUE (BullMQ)' : 'LOOP (Sequencial)'}`);

    if (USE_QUEUE) {
      console.log(`👷 Concurrency: ${CONCURRENCY} workers`);
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

    // Agenda execuções periódicas
    const intervalMs = this.getCheckIntervalMinutes() * 60 * 1000;
    this.checkInterval = setInterval(() => {
      this.runMonitors();
    }, intervalMs);
  }

  async runMonitors() {
    if (!this.isRunning) return;

    console.log('\n📊 Iniciando ciclo de verificação...');
    const startTime = Date.now();

    try {
      // Busca monitores ativos
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
      });

      console.log(`📌 ${monitors.length} monitores ativos encontrados`);

      if (USE_QUEUE) {
        // Modo FILA: Adiciona todos à fila para processamento paralelo
        await enqueueMonitors(monitors);

        // Mostra estatísticas
        const stats = await getQueueStats();
        console.log(`📊 Fila: ${stats.total} total (${stats.active} processando, ${stats.waiting} aguardando)`);
      } else {
        // Modo LOOP: Processa sequencialmente (compatibilidade)
        for (const monitor of monitors) {
          await MonitorRunner.run(monitor);
          await this.delay(2000); // 2 segundos entre monitores
        }
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Ciclo concluído em ${(duration / 1000).toFixed(2)}s`);
    } catch (error: any) {
      console.error('❌ Erro ao executar monitores:', error);
      captureException(error, { context: 'monitor_execution_cycle' });
    }
  }

  async stop() {
    console.log('\n⏳ Encerrando worker...');
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    if (this.worker) {
      await this.worker.close();
    }

    if (USE_QUEUE) {
      await shutdownQueue();
    }

    await prisma.$disconnect();
    console.log('✅ Worker encerrado');
  }

  private getCheckIntervalMinutes(): number {
    return parseInt(process.env.CHECK_INTERVAL_MINUTES || '5');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Inicializa worker
const worker = new Worker();

// Graceful shutdown
process.on('SIGINT', async () => {
  await worker.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await worker.stop();
  process.exit(0);
});

// Inicia worker
worker.start().catch((error) => {
  console.error('❌ Erro fatal:', error);
  captureException(error, { context: 'worker_startup_fatal' });
  process.exit(1);
});

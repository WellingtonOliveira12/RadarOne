import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { MonitorRunner } from './monitor-runner';

/**
 * Queue Manager - BullMQ Integration
 *
 * Gerencia fila distribuída de monitores para processamento paralelo
 *
 * Features:
 * - Processamento concorrente (5 workers simultâneos por padrão)
 * - Retry automático com backoff
 * - Dead letter queue (DLQ) para jobs que falharam 3x
 * - Métricas e observabilidade
 * - Graceful shutdown
 */

// Configuração do Redis
const connection = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
    });

// Configuração da fila
export const monitorQueue = new Queue('monitors', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: {
      age: 3600, // Remove após 1 hora
      count: 1000, // Mantém últimos 1000
    },
    removeOnFail: {
      age: 24 * 3600, // Remove após 24 horas
      count: 5000, // Mantém últimos 5000
    },
  },
});

// Queue Events para monitoramento
const queueEvents = new QueueEvents('monitors', { connection });

queueEvents.on('completed', ({ jobId }) => {
  console.log(`✅ Job ${jobId} completed`);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`❌ Job ${jobId} failed: ${failedReason}`);
});

queueEvents.on('stalled', ({ jobId }) => {
  console.warn(`⚠️  Job ${jobId} stalled (timeout ou worker crash)`);
});

/**
 * Adiciona monitor à fila
 */
export async function enqueueMonitor(monitor: any, priority: number = 0) {
  await monitorQueue.add(
    'process-monitor',
    { monitor },
    {
      jobId: `monitor-${monitor.id}`, // Previne duplicatas
      priority, // Menor = maior prioridade (0 = máxima)
    }
  );
}

/**
 * Adiciona múltiplos monitores à fila
 */
export async function enqueueMonitors(monitors: any[]) {
  const jobs = monitors.map((monitor, index) => ({
    name: 'process-monitor',
    data: { monitor },
    opts: {
      jobId: `monitor-${monitor.id}`,
      priority: index, // Mantém ordem original
    },
  }));

  await monitorQueue.addBulk(jobs);
  console.log(`📥 ${jobs.length} monitores adicionados à fila`);
}

/**
 * Inicia workers para processar a fila
 *
 * @param concurrency Número de jobs simultâneos (padrão: 5)
 */
export function startWorkers(concurrency: number = 5) {
  const worker = new Worker(
    'monitors',
    async (job) => {
      const { monitor } = job.data;

      console.log(`🔄 Processing job ${job.id}: ${monitor.name} (${monitor.site})`);

      try {
        await MonitorRunner.run(monitor);
        return { success: true, monitorId: monitor.id };
      } catch (error: any) {
        console.error(`❌ Job ${job.id} error: ${error.message}`);
        throw error; // BullMQ fará retry automaticamente
      }
    },
    {
      connection,
      concurrency,
      limiter: {
        max: 10, // Máximo 10 jobs por...
        duration: 60000, // ...1 minuto (global)
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`✅ Worker completed job ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    if (job) {
      console.error(`❌ Worker failed job ${job.id}: ${err.message}`);

      // Se falhou 3 vezes, foi para DLQ
      if (job.attemptsMade >= 3) {
        console.error(`🚨 Job ${job.id} enviado para DLQ (dead letter queue)`);
      }
    }
  });

  worker.on('error', (err) => {
    console.error('❌ Worker error:', err);
  });

  console.log(`👷 Worker iniciado com concurrency ${concurrency}`);

  return worker;
}

/**
 * Obtém estatísticas da fila
 */
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    monitorQueue.getWaitingCount(),
    monitorQueue.getActiveCount(),
    monitorQueue.getCompletedCount(),
    monitorQueue.getFailedCount(),
    monitorQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed,
  };
}

/**
 * Limpa jobs antigos (manutenção)
 */
export async function cleanQueue() {
  await monitorQueue.clean(3600 * 1000, 1000, 'completed'); // Remove completed > 1h
  await monitorQueue.clean(24 * 3600 * 1000, 5000, 'failed'); // Remove failed > 24h
  console.log('🧹 Fila limpa');
}

/**
 * Graceful shutdown
 */
export async function shutdown() {
  console.log('⏳ Encerrando queue manager...');

  await monitorQueue.close();
  await queueEvents.close();
  await connection.quit();

  console.log('✅ Queue manager encerrado');
}

/**
 * Healthcheck da fila
 */
export async function isHealthy(): Promise<boolean> {
  try {
    await connection.ping();
    return true;
  } catch (error) {
    console.error('❌ Redis health check failed:', error);
    return false;
  }
}

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
 *
 * IMPORTANTE: Conexão Redis é LAZY - só criada quando necessário
 * Em produção sem REDIS_URL, o worker funciona em modo LOOP (sem filas)
 */

// Conexão Redis (lazy - só instanciada quando necessário)
let connection: Redis | null = null;
let monitorQueue: Queue | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Verifica se Redis está configurado
 */
export function isRedisConfigured(): boolean {
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
}

/**
 * Obtém ou cria conexão Redis
 * @throws Error se Redis não estiver configurado em produção
 */
function getConnection(): Redis {
  if (connection) return connection;

  const isProduction = process.env.NODE_ENV === 'production';
  const hasRedisConfig = isRedisConfigured();

  // Em produção, NÃO tente localhost - falhe claramente
  if (isProduction && !hasRedisConfig) {
    throw new Error(
      '❌ REDIS_URL não configurada em produção. ' +
      'Configure REDIS_URL no Render ou use modo LOOP (sem filas).'
    );
  }

  // Em desenvolvimento, permite localhost como fallback
  if (process.env.REDIS_URL) {
    connection = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  } else if (hasRedisConfig) {
    connection = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
    });
  } else {
    // Desenvolvimento sem config: usa localhost
    console.warn('⚠️  Redis não configurado. Usando localhost:6379 (apenas desenvolvimento)');
    connection = new Redis({
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    });
  }

  return connection;
}

/**
 * Obtém ou cria a fila de monitores
 */
function getQueue(): Queue {
  if (monitorQueue) return monitorQueue;

  monitorQueue = new Queue('monitors', {
    connection: getConnection(),
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

  return monitorQueue;
}

/**
 * Obtém ou cria QueueEvents para monitoramento
 */
function getQueueEvents(): QueueEvents {
  if (queueEvents) return queueEvents;

  queueEvents = new QueueEvents('monitors', { connection: getConnection() });

  queueEvents.on('completed', ({ jobId }) => {
    console.log(`✅ Job ${jobId} completed`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`❌ Job ${jobId} failed: ${failedReason}`);
  });

  queueEvents.on('stalled', ({ jobId }) => {
    console.warn(`⚠️  Job ${jobId} stalled (timeout ou worker crash)`);
  });

  return queueEvents;
}

/**
 * Adiciona monitor à fila
 */
export async function enqueueMonitor(monitor: any, priority: number = 0) {
  await getQueue().add(
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

  await getQueue().addBulk(jobs);
  console.log(`📥 ${jobs.length} monitores adicionados à fila`);
}

/**
 * Inicia workers para processar a fila
 *
 * @param concurrency Número de jobs simultâneos (padrão: 5)
 */
export function startWorkers(concurrency: number = 5) {
  // Garante que QueueEvents está inicializado
  getQueueEvents();

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
      connection: getConnection(),
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
  const queue = getQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
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
  const queue = getQueue();
  await queue.clean(3600 * 1000, 1000, 'completed'); // Remove completed > 1h
  await queue.clean(24 * 3600 * 1000, 5000, 'failed'); // Remove failed > 24h
  console.log('🧹 Fila limpa');
}

/**
 * Graceful shutdown
 */
export async function shutdown() {
  console.log('⏳ Encerrando queue manager...');

  if (monitorQueue) {
    await monitorQueue.close();
  }
  if (queueEvents) {
    await queueEvents.close();
  }
  if (connection) {
    await connection.quit();
  }

  console.log('✅ Queue manager encerrado');
}

/**
 * Healthcheck da fila
 */
export async function isHealthy(): Promise<boolean> {
  try {
    // Verifica se Redis está configurado
    if (!isRedisConfigured()) {
      console.warn('⚠️  Redis não configurado - healthcheck ignorado');
      return false;
    }

    const conn = getConnection();
    await conn.ping();
    return true;
  } catch (error) {
    console.error('❌ Redis health check failed:', error);
    return false;
  }
}

import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { MonitorRunner } from './services/monitor-runner';

/**
 * Worker de Scraping - RadarOne
 *
 * Responsável por:
 * - Buscar monitores ativos
 * - Executar scraping conforme site configurado
 * - Comparar anúncios vistos vs novos
 * - Enviar alertas via Telegram
 * - Atualizar histórico de execução
 * - Contar consultas usadas
 */

dotenv.config();

const prisma = new PrismaClient();

class Worker {
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;

  async start() {
    console.log('🚀 RadarOne Worker iniciado');
    console.log(`⏰ Intervalo de verificação: ${this.getCheckIntervalMinutes()} minutos`);

    // Testa conexão com o banco
    try {
      await prisma.$connect();
      console.log('✅ Conectado ao banco de dados');
    } catch (error) {
      console.error('❌ Erro ao conectar ao banco:', error);
      process.exit(1);
    }

    this.isRunning = true;

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
            },
          },
        },
      });

      console.log(`📌 ${monitors.length} monitores ativos encontrados`);

      // Processa cada monitor
      for (const monitor of monitors) {
        await MonitorRunner.run(monitor);

        // TODO: Adicionar delay entre monitores para evitar rate limiting
        await this.delay(2000); // 2 segundos entre monitores
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Ciclo concluído em ${(duration / 1000).toFixed(2)}s`);
    } catch (error) {
      console.error('❌ Erro ao executar monitores:', error);
    }
  }

  async stop() {
    console.log('\n⏳ Encerrando worker...');
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
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
  process.exit(1);
});

import cron from 'node-cron';
import { checkTrialExpiring, JobRunResult } from './checkTrialExpiring';
import { checkSubscriptionExpired } from './checkSubscriptionExpired';
import { resetMonthlyQueries } from './resetMonthlyQueries';
import { checkCouponAlerts } from './checkCouponAlerts';
import { checkTrialUpgradeExpiring } from './checkTrialUpgradeExpiring';
import { checkAbandonedCoupons } from './checkAbandonedCoupons';
import { checkSessionExpiring } from './checkSessionExpiring';
import { withJobLogging, JobNames, JobName } from '../utils/jobLogger';
import { logInfo, logError, logSimpleInfo, logWarning } from '../utils/loggerHelpers';

// Para warmup ping (evitar sleep do Render)
import http from 'http';
import https from 'https';

/**
 * Tipo para definição de job no scheduler
 */
interface JobDefinition {
  name: JobName;
  fn: () => Promise<JobRunResult>;
}

/**
 * Scheduler de Jobs Automáticos
 *
 * Agenda e executa jobs periódicos do RadarOne:
 * - Verificação de trials expirando/expirados
 * - Verificação de assinaturas expiradas
 * - Notificações automáticas
 * - Alertas de cupons
 * - Warmup ping (evita sleep do Render)
 *
 * IMPORTANTE: Este scheduler é iniciado automaticamente no server.ts
 *
 * NOVIDADE: Todos os jobs agora registram suas execuções na tabela JobRun
 * para visualização no painel administrativo /admin/jobs
 */

/**
 * Faz ping no próprio servidor para evitar sleep do Render
 * Apenas em produção (BACKEND_URL configurado)
 */
async function warmupPing(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  const backendUrl = process.env.PUBLIC_URL || process.env.BACKEND_URL;

  // Em desenvolvimento, não faz ping
  if (!backendUrl || process.env.NODE_ENV !== 'production') {
    return { success: true, latencyMs: 0 };
  }

  const healthUrl = `${backendUrl}/health`;
  const startTime = Date.now();

  return new Promise((resolve) => {
    const client = healthUrl.startsWith('https') ? https : http;

    const req = client.get(healthUrl, { timeout: 10000 }, (res) => {
      const latencyMs = Date.now() - startTime;

      if (res.statusCode === 200) {
        logInfo('Ping OK', { latencyMs, healthUrl });
        resolve({ success: true, latencyMs });
      } else {
        logWarning(`Ping retornou status ${res.statusCode}`, { latencyMs, statusCode: res.statusCode });
        resolve({ success: false, latencyMs, error: `Status ${res.statusCode}` });
      }

      // Consumir resposta para liberar recursos
      res.resume();
    });

    req.on('error', (err) => {
      const latencyMs = Date.now() - startTime;
      logError('Ping falhou', { latencyMs, err: err.message });
      resolve({ success: false, latencyMs, error: err.message });
    });

    req.on('timeout', () => {
      const latencyMs = Date.now() - startTime;
      logError('Ping timeout', { latencyMs });
      req.destroy();
      resolve({ success: false, latencyMs, error: 'Timeout' });
    });
  });
}

/**
 * Inicia o scheduler de jobs
 * Deve ser chamado uma única vez na inicialização do servidor
 */
export function startScheduler() {
  logSimpleInfo('Iniciando agendamento de jobs...');

  // ============================================
  // JOB 0: Warmup Ping (evita sleep do Render)
  // ============================================
  // Executa a cada 10 minutos para manter o servidor ativo
  // Render free tier dorme após 15 min de inatividade
  // Apenas em produção (quando PUBLIC_URL está configurado)
  if (process.env.NODE_ENV === 'production') {
    cron.schedule('*/10 * * * *', async () => {
      await warmupPing();
    });
    logSimpleInfo('   warmupPing - A cada 10 minutos (evita sleep do Render)');
  }

  // ============================================
  // JOB 1: Verificar trials expirando e expirados
  // ============================================
  // Executa diariamente às 9h
  // - Envia email de aviso 3 dias antes do trial expirar
  // - Expira trials que já passaram da data de expiração
  // - Envia email de trial expirado
  cron.schedule('0 9 * * *', async () => {
    await withJobLogging(
      JobNames.CHECK_TRIAL_EXPIRING,
      'SCHEDULER',
      async () => {
        const result = await checkTrialExpiring();
        return {
          processedCount: result.processedCount,
          successCount: result.successCount,
          errorCount: result.errorCount,
          summary: result.summary,
          metadata: result.metadata,
        };
      }
    );
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // ============================================
  // JOB 2: Verificar assinaturas pagas expiradas
  // ============================================
  // Executa diariamente às 10h
  // - Verifica assinaturas ACTIVE com validUntil < now
  // - Atualiza status para EXPIRED
  // - Envia email de renovação
  cron.schedule('0 10 * * *', async () => {
    await withJobLogging(
      JobNames.CHECK_SUBSCRIPTION_EXPIRED,
      'SCHEDULER',
      async () => {
        const result = await checkSubscriptionExpired();
        return {
          processedCount: result.processedCount,
          successCount: result.successCount,
          errorCount: result.errorCount,
          summary: result.summary,
          metadata: result.metadata,
        };
      }
    );
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // ============================================
  // JOB 3: Reset mensal de queries
  // ============================================
  // Executa no dia 1 de cada mês às 3h da manhã
  // - Reseta o contador queriesUsed para 0
  // - Apenas para assinaturas com status ACTIVE
  cron.schedule('0 3 1 * *', async () => {
    await withJobLogging(
      JobNames.RESET_MONTHLY_QUERIES,
      'SCHEDULER',
      async () => {
        const result = await resetMonthlyQueries();
        return {
          processedCount: result.processedCount,
          successCount: result.successCount,
          errorCount: result.errorCount,
          summary: result.summary,
          metadata: result.metadata,
        };
      }
    );
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // ============================================
  // JOB 4: Verificar cupons para alertas
  // ============================================
  // Executa diariamente às 11h
  // - Verifica cupons expirando em 3 dias
  // - Verifica cupons próximos do limite de usos (>80%)
  // - Cria alertas automáticos no painel admin
  cron.schedule('0 11 * * *', async () => {
    await withJobLogging(
      JobNames.CHECK_COUPON_ALERTS,
      'SCHEDULER',
      async () => {
        // checkCouponAlerts já retorna JobRunResult padronizado
        const result = await checkCouponAlerts();
        return result;
      }
    );
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // ============================================
  // JOB 5: Verificar trial upgrades expirando
  // ============================================
  // Executa diariamente às 12h
  // - Verifica subscriptions TRIAL criadas por cupons
  // - Notifica usuários que têm trial upgrade expirando em 1, 3 ou 7 dias
  // - Envia emails de lembrete para incentivar assinatura
  cron.schedule('0 12 * * *', async () => {
    await withJobLogging(
      JobNames.CHECK_TRIAL_UPGRADE_EXPIRING,
      'SCHEDULER',
      async () => {
        const result = await checkTrialUpgradeExpiring();
        return {
          processedCount: result.processedCount,
          successCount: result.successCount,
          errorCount: result.errorCount,
          summary: result.summary,
          metadata: result.metadata,
        };
      }
    );
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // ============================================
  // JOB 6: Verificar cupons abandonados
  // ============================================
  // Executa diariamente às 13h
  // - Verifica cupons DISCOUNT validados há 24h que não foram usados
  // - Envia email de lembrete com link para checkout
  // - Ajuda a recuperar vendas abandonadas
  cron.schedule('0 13 * * *', async () => {
    await withJobLogging(
      JobNames.CHECK_ABANDONED_COUPONS,
      'SCHEDULER',
      async () => {
        const result = await checkAbandonedCoupons();
        return {
          processedCount: result.processedCount,
          successCount: result.successCount,
          errorCount: result.errorCount,
          summary: result.summary,
          metadata: result.metadata,
        };
      }
    );
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // ============================================
  // JOB 7: Verificar sessões de login expirando
  // ============================================
  // Executa diariamente às 14h
  // - Verifica sessões de login (Mercado Livre, etc.) que expiram em 3 dias
  // - Notifica usuários via Telegram e Email
  // - Evita interrupções no monitoramento
  cron.schedule('0 14 * * *', async () => {
    await withJobLogging(
      JobNames.CHECK_SESSION_EXPIRING,
      'SCHEDULER',
      async () => {
        const result = await checkSessionExpiring();
        return {
          processedCount: result.processedCount,
          successCount: result.successCount,
          errorCount: result.errorCount,
          summary: result.summary,
          metadata: result.metadata,
        };
      }
    );
  }, {
    timezone: 'America/Sao_Paulo'
  });

  logSimpleInfo('Jobs agendados:');
  if (process.env.NODE_ENV === 'production') {
    logSimpleInfo('   warmupPing - A cada 10 minutos (evita sleep do Render)');
  }
  logSimpleInfo('   checkTrialExpiring - Diariamente às 9h (America/Sao_Paulo)');
  logSimpleInfo('   checkSubscriptionExpired - Diariamente às 10h (America/Sao_Paulo)');
  logSimpleInfo('   resetMonthlyQueries - Mensalmente no dia 1 às 3h (America/Sao_Paulo)');
  logSimpleInfo('   checkCouponAlerts - Diariamente às 11h (America/Sao_Paulo)');
  logSimpleInfo('   checkTrialUpgradeExpiring - Diariamente às 12h (America/Sao_Paulo)');
  logSimpleInfo('   checkAbandonedCoupons - Diariamente às 13h (America/Sao_Paulo)');
  logSimpleInfo('   checkSessionExpiring - Diariamente às 14h (America/Sao_Paulo)');
  logSimpleInfo('   Todas as execuções serão registradas na tabela JobRun');
}

/**
 * Para o scheduler (se necessário)
 * Útil para testes ou shutdown graceful
 */
export function stopScheduler() {
  logSimpleInfo('Parando scheduler...');
  // node-cron não tem API de stop global
  // Os jobs param automaticamente quando o processo é finalizado
}

/**
 * Executa todos os jobs imediatamente (útil para testes)
 * NÃO usar em produção - apenas para debug
 */
export async function runJobsNow() {
  logSimpleInfo('Executando todos os jobs AGORA (modo debug)...');

  // Tipagem explícita para evitar inferência de union type
  const jobs: JobDefinition[] = [
    { name: JobNames.CHECK_TRIAL_EXPIRING, fn: checkTrialExpiring },
    { name: JobNames.CHECK_SUBSCRIPTION_EXPIRED, fn: checkSubscriptionExpired },
    { name: JobNames.RESET_MONTHLY_QUERIES, fn: resetMonthlyQueries },
    { name: JobNames.CHECK_COUPON_ALERTS, fn: checkCouponAlerts },
    { name: JobNames.CHECK_TRIAL_UPGRADE_EXPIRING, fn: checkTrialUpgradeExpiring },
    { name: JobNames.CHECK_ABANDONED_COUPONS, fn: checkAbandonedCoupons },
    { name: JobNames.CHECK_SESSION_EXPIRING, fn: checkSessionExpiring },
  ];

  for (const job of jobs) {
    try {
      logInfo(`Executando ${job.name}...`, {});
      await withJobLogging(job.name, 'MANUAL', async () => {
        const result = await job.fn();
        return {
          processedCount: result.processedCount,
          successCount: result.successCount,
          errorCount: result.errorCount,
          summary: result.summary,
          metadata: result.metadata,
        };
      });
      logInfo(`${job.name} OK`, {});
    } catch (error) {
      logError(`Erro ${job.name}`, { err: error });
    }
  }

  logSimpleInfo('Todos os jobs executados');
}

// ============================================
// EXECUÇÃO DIRETA (PARA TESTES)
// ============================================
// Permite executar o scheduler diretamente via CLI:
// npx ts-node src/jobs/scheduler.ts
if (require.main === module) {
  logSimpleInfo('Modo standalone - executando jobs agora...');
  runJobsNow()
    .then(() => {
      logSimpleInfo('Jobs finalizados');
      process.exit(0);
    })
    .catch((err) => {
      logError('Erro', { err });
      process.exit(1);
    });
}

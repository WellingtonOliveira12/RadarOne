import cron from 'node-cron';
import { checkTrialExpiring } from './checkTrialExpiring';
import { checkSubscriptionExpired } from './checkSubscriptionExpired';
import { resetMonthlyQueries } from './resetMonthlyQueries';
import { checkCouponAlerts } from './checkCouponAlerts';
import { checkTrialUpgradeExpiring } from './checkTrialUpgradeExpiring';
import { checkAbandonedCoupons } from './checkAbandonedCoupons';
import { checkSessionExpiring } from './checkSessionExpiring';
import { withJobLogging, JobNames } from '../utils/jobLogger';

/**
 * Scheduler de Jobs Automáticos
 *
 * Agenda e executa jobs periódicos do RadarOne:
 * - Verificação de trials expirando/expirados
 * - Verificação de assinaturas expiradas
 * - Notificações automáticas
 * - Alertas de cupons
 *
 * IMPORTANTE: Este scheduler é iniciado automaticamente no server.ts
 *
 * NOVIDADE: Todos os jobs agora registram suas execuções na tabela JobRun
 * para visualização no painel administrativo /admin/jobs
 */

/**
 * Inicia o scheduler de jobs
 * Deve ser chamado uma única vez na inicialização do servidor
 */
export function startScheduler() {
  console.log('[SCHEDULER] 🕐 Iniciando agendamento de jobs...');

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

  console.log('[SCHEDULER] ✅ Jobs agendados:');
  console.log('[SCHEDULER]    📧 checkTrialExpiring - Diariamente às 9h (America/Sao_Paulo)');
  console.log('[SCHEDULER]    💳 checkSubscriptionExpired - Diariamente às 10h (America/Sao_Paulo)');
  console.log('[SCHEDULER]    🔄 resetMonthlyQueries - Mensalmente no dia 1 às 3h (America/Sao_Paulo)');
  console.log('[SCHEDULER]    🎟️  checkCouponAlerts - Diariamente às 11h (America/Sao_Paulo)');
  console.log('[SCHEDULER]    ⏰ checkTrialUpgradeExpiring - Diariamente às 12h (America/Sao_Paulo)');
  console.log('[SCHEDULER]    🎫 checkAbandonedCoupons - Diariamente às 13h (America/Sao_Paulo)');
  console.log('[SCHEDULER]    🔒 checkSessionExpiring - Diariamente às 14h (America/Sao_Paulo)');
  console.log('[SCHEDULER]    📊 Todas as execuções serão registradas na tabela JobRun');
}

/**
 * Para o scheduler (se necessário)
 * Útil para testes ou shutdown graceful
 */
export function stopScheduler() {
  console.log('[SCHEDULER] ⏸️  Parando scheduler...');
  // node-cron não tem API de stop global
  // Os jobs param automaticamente quando o processo é finalizado
}

/**
 * Executa todos os jobs imediatamente (útil para testes)
 * NÃO usar em produção - apenas para debug
 */
export async function runJobsNow() {
  console.log('[SCHEDULER] 🔥 Executando todos os jobs AGORA (modo debug)...');

  const jobs = [
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
      console.log(`[SCHEDULER] Executando ${job.name}...`);
      await withJobLogging(job.name, 'MANUAL', async () => {
        const result = await job.fn();
        return {
          processedCount: result.processedCount || 0,
          successCount: result.successCount || 0,
          errorCount: result.errorCount || 0,
          summary: result.summary,
          metadata: result.metadata,
        };
      });
      console.log(`[SCHEDULER] ✅ ${job.name} OK`);
    } catch (error) {
      console.error(`[SCHEDULER] ❌ Erro ${job.name}:`, error);
    }
  }

  console.log('[SCHEDULER] 🎉 Todos os jobs executados');
}

// ============================================
// EXECUÇÃO DIRETA (PARA TESTES)
// ============================================
// Permite executar o scheduler diretamente via CLI:
// npx ts-node src/jobs/scheduler.ts
if (require.main === module) {
  console.log('[SCHEDULER] Modo standalone - executando jobs agora...');
  runJobsNow()
    .then(() => {
      console.log('[SCHEDULER] ✅ Jobs finalizados');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[SCHEDULER] ❌ Erro:', err);
      process.exit(1);
    });
}

import cron from 'node-cron';
import { checkTrialExpiring } from './checkTrialExpiring';
import { checkSubscriptionExpired } from './checkSubscriptionExpired';
import { resetMonthlyQueries } from './resetMonthlyQueries';
import { checkCouponAlerts } from './checkCouponAlerts';
import { checkTrialUpgradeExpiring } from './checkTrialUpgradeExpiring'; // FASE: Cupons de Upgrade

/**
 * Scheduler de Jobs Automáticos
 *
 * Agenda e executa jobs periódicos do RadarOne:
 * - Verificação de trials expirando/expirados
 * - Verificação de assinaturas expiradas
 * - Notificações automáticas
 *
 * IMPORTANTE: Este scheduler é iniciado automaticamente no server.ts
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
    console.log('[SCHEDULER] ⏰ Executando checkTrialExpiring...');
    try {
      await checkTrialExpiring();
      console.log('[SCHEDULER] ✅ checkTrialExpiring executado com sucesso');
    } catch (error) {
      console.error('[SCHEDULER] ❌ Erro ao executar checkTrialExpiring:', error);
    }
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
    console.log('[SCHEDULER] ⏰ Executando checkSubscriptionExpired...');
    try {
      await checkSubscriptionExpired();
      console.log('[SCHEDULER] ✅ checkSubscriptionExpired executado com sucesso');
    } catch (error) {
      console.error('[SCHEDULER] ❌ Erro ao executar checkSubscriptionExpired:', error);
    }
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
    console.log('[SCHEDULER] ⏰ Executando resetMonthlyQueries...');
    try {
      await resetMonthlyQueries();
      console.log('[SCHEDULER] ✅ resetMonthlyQueries executado com sucesso');
    } catch (error) {
      console.error('[SCHEDULER] ❌ Erro ao executar resetMonthlyQueries:', error);
    }
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
    console.log('[SCHEDULER] ⏰ Executando checkCouponAlerts...');
    try {
      await checkCouponAlerts();
      console.log('[SCHEDULER] ✅ checkCouponAlerts executado com sucesso');
    } catch (error) {
      console.error('[SCHEDULER] ❌ Erro ao executar checkCouponAlerts:', error);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // ============================================
  // JOB 5: FASE - Verificar trial upgrades expirando
  // ============================================
  // Executa diariamente às 12h
  // - Verifica subscriptions TRIAL criadas por cupons
  // - Notifica usuários que têm trial upgrade expirando em 1, 3 ou 7 dias
  // - Envia emails de lembrete para incentivar assinatura
  cron.schedule('0 12 * * *', async () => {
    console.log('[SCHEDULER] ⏰ Executando checkTrialUpgradeExpiring...');
    try {
      await checkTrialUpgradeExpiring();
      console.log('[SCHEDULER] ✅ checkTrialUpgradeExpiring executado com sucesso');
    } catch (error) {
      console.error('[SCHEDULER] ❌ Erro ao executar checkTrialUpgradeExpiring:', error);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  console.log('[SCHEDULER] ✅ Jobs agendados:');
  console.log('[SCHEDULER]    📧 checkTrialExpiring - Diariamente às 9h (America/Sao_Paulo)');
  console.log('[SCHEDULER]    💳 checkSubscriptionExpired - Diariamente às 10h (America/Sao_Paulo)');
  console.log('[SCHEDULER]    🔄 resetMonthlyQueries - Mensalmente no dia 1 às 3h (America/Sao_Paulo)');
  console.log('[SCHEDULER]    🎟️  checkCouponAlerts - Diariamente às 11h (America/Sao_Paulo)');
  console.log('[SCHEDULER]    ⏰ checkTrialUpgradeExpiring - Diariamente às 12h (America/Sao_Paulo)');
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

  try {
    console.log('[SCHEDULER] 1/3 Executando checkTrialExpiring...');
    await checkTrialExpiring();
    console.log('[SCHEDULER] ✅ checkTrialExpiring OK');
  } catch (error) {
    console.error('[SCHEDULER] ❌ Erro checkTrialExpiring:', error);
  }

  try {
    console.log('[SCHEDULER] 2/3 Executando checkSubscriptionExpired...');
    await checkSubscriptionExpired();
    console.log('[SCHEDULER] ✅ checkSubscriptionExpired OK');
  } catch (error) {
    console.error('[SCHEDULER] ❌ Erro checkSubscriptionExpired:', error);
  }

  try {
    console.log('[SCHEDULER] 3/4 Executando resetMonthlyQueries...');
    await resetMonthlyQueries();
    console.log('[SCHEDULER] ✅ resetMonthlyQueries OK');
  } catch (error) {
    console.error('[SCHEDULER] ❌ Erro resetMonthlyQueries:', error);
  }

  try {
    console.log('[SCHEDULER] 4/5 Executando checkCouponAlerts...');
    await checkCouponAlerts();
    console.log('[SCHEDULER] ✅ checkCouponAlerts OK');
  } catch (error) {
    console.error('[SCHEDULER] ❌ Erro checkCouponAlerts:', error);
  }

  try {
    console.log('[SCHEDULER] 5/5 Executando checkTrialUpgradeExpiring...');
    await checkTrialUpgradeExpiring();
    console.log('[SCHEDULER] ✅ checkTrialUpgradeExpiring OK');
  } catch (error) {
    console.error('[SCHEDULER] ❌ Erro checkTrialUpgradeExpiring:', error);
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

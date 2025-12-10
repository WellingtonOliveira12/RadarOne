import cron from 'node-cron';
import { checkTrialExpiring } from './checkTrialExpiring';
import { checkSubscriptionExpired } from './checkSubscriptionExpired';

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

  console.log('[SCHEDULER] ✅ Jobs agendados:');
  console.log('[SCHEDULER]    📧 checkTrialExpiring - Diariamente às 9h (America/Sao_Paulo)');
  console.log('[SCHEDULER]    💳 checkSubscriptionExpired - Diariamente às 10h (America/Sao_Paulo)');
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
    console.log('[SCHEDULER] 1/2 Executando checkTrialExpiring...');
    await checkTrialExpiring();
    console.log('[SCHEDULER] ✅ checkTrialExpiring OK');
  } catch (error) {
    console.error('[SCHEDULER] ❌ Erro checkTrialExpiring:', error);
  }

  try {
    console.log('[SCHEDULER] 2/2 Executando checkSubscriptionExpired...');
    await checkSubscriptionExpired();
    console.log('[SCHEDULER] ✅ checkSubscriptionExpired OK');
  } catch (error) {
    console.error('[SCHEDULER] ❌ Erro checkSubscriptionExpired:', error);
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

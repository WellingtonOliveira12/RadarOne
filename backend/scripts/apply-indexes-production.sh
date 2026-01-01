#!/bin/bash

# Script para aplicar índices em produção de forma segura
# Usa CREATE INDEX CONCURRENTLY para não bloquear tabelas
#
# IMPORTANTE:
# - Este script deve ser rodado FORA de uma transaction
# - Em produção, rodar durante horário de baixo tráfego (se possível)
# - Monitorar uso de CPU/memória durante criação dos índices
#
# Uso:
#   ./scripts/apply-indexes-production.sh
#   DATABASE_URL="postgresql://..." ./scripts/apply-indexes-production.sh

set -e

echo "======================================================================"
echo "APLICANDO ÍNDICES DE PERFORMANCE - RADARONE PRODUCTION"
echo "======================================================================"
echo ""

# Verificar se DATABASE_URL está configurado
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL não configurado"
    echo ""
    echo "Configure a variável de ambiente:"
    echo "  export DATABASE_URL='postgresql://user:pass@host:port/db'"
    echo ""
    echo "Ou passe direto no comando:"
    echo "  DATABASE_URL='postgresql://...' ./scripts/apply-indexes-production.sh"
    exit 1
fi

echo "✅ DATABASE_URL configurado"
echo ""

# Confirmar execução
echo "⚠️  ATENÇÃO:"
echo "   Este script criará índices no banco de produção."
echo "   Índices serão criados com CONCURRENTLY (não bloqueia tabela)."
echo "   Estimativa de tempo: 1-5 minutos dependendo do tamanho da base."
echo ""
read -p "Continuar? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Operação cancelada pelo usuário"
    exit 0
fi

echo ""
echo "======================================================================"
echo "INICIANDO CRIAÇÃO DOS ÍNDICES"
echo "======================================================================"
echo ""

# Função para executar SQL
execute_sql() {
    local sql="$1"
    local description="$2"

    echo "➡️  $description"

    # Executar SQL usando psql se disponível, senão usa prisma
    if command -v psql &> /dev/null; then
        echo "$sql" | psql "$DATABASE_URL" 2>&1
    else
        # Fallback: usar node e pg
        node -e "
            const { Client } = require('pg');
            (async () => {
                const client = new Client({ connectionString: process.env.DATABASE_URL });
                await client.connect();
                try {
                    await client.query(\`$sql\`);
                    console.log('   ✅ Sucesso');
                } catch (err) {
                    if (err.message.includes('already exists')) {
                        console.log('   ⚠️  Índice já existe (pulando)');
                    } else {
                        console.error('   ❌ Erro:', err.message);
                        throw err;
                    }
                } finally {
                    await client.end();
                }
            })();
        "
    fi

    echo ""
}

# ============================================
# CRIAR ÍNDICES
# ============================================

echo "📊 TABELA: users"
echo "────────────────────────────────────────────────────────────────────"
execute_sql \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));" \
    "Criando idx_users_email_lower (busca case-insensitive)"

echo "📊 TABELA: subscriptions"
echo "────────────────────────────────────────────────────────────────────"
execute_sql \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status);" \
    "Criando idx_subscriptions_user_status (query por usuário e status)"

execute_sql \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_valid_until ON subscriptions(valid_until) WHERE status IN ('ACTIVE', 'TRIAL', 'PAST_DUE');" \
    "Criando idx_subscriptions_valid_until (expiração)"

execute_sql \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_trial_ends_at ON subscriptions(trial_ends_at) WHERE status = 'TRIAL' AND trial_ends_at IS NOT NULL;" \
    "Criando idx_subscriptions_trial_ends_at (trial expiring)"

echo "📊 TABELA: monitors"
echo "────────────────────────────────────────────────────────────────────"
execute_sql \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_monitors_user_active ON monitors(user_id, active);" \
    "Criando idx_monitors_user_active (monitores ativos por usuário)"

execute_sql \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_monitors_next_check ON monitors(next_check_at) WHERE active = true;" \
    "Criando idx_monitors_next_check (job de verificação)"

echo "📊 TABELA: ads_seen"
echo "────────────────────────────────────────────────────────────────────"
execute_sql \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ads_seen_monitor_created ON ads_seen(monitor_id, created_at DESC);" \
    "Criando idx_ads_seen_monitor_created (histórico de anúncios)"

execute_sql \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ads_seen_monitor_ad_id ON ads_seen(monitor_id, ad_id);" \
    "Criando idx_ads_seen_monitor_ad_id (detecção de duplicados)"

echo "📊 TABELA: notification_logs"
echo "────────────────────────────────────────────────────────────────────"
execute_sql \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_logs_user_sent ON notification_logs(user_id, sent_at DESC);" \
    "Criando idx_notification_logs_user_sent (histórico de notificações)"

echo "📊 TABELA: audit_logs"
echo "────────────────────────────────────────────────────────────────────"
execute_sql \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_admin_created ON audit_logs(admin_user_id, created_at DESC);" \
    "Criando idx_audit_logs_admin_created (auditoria por admin)"

execute_sql \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_action_created ON audit_logs(action, created_at DESC);" \
    "Criando idx_audit_logs_action_created (auditoria por ação)"

echo "📊 TABELA: coupons"
echo "────────────────────────────────────────────────────────────────────"
execute_sql \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coupons_code_upper ON coupons(UPPER(code));" \
    "Criando idx_coupons_code_upper (busca case-insensitive)"

execute_sql \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coupons_active_expires ON coupons(is_active, expires_at) WHERE is_active = true;" \
    "Criando idx_coupons_active_expires (cupons ativos)"

echo ""
echo "======================================================================"
echo "✅ ÍNDICES CRIADOS COM SUCESSO!"
echo "======================================================================"
echo ""
echo "📊 Próximos passos:"
echo ""
echo "1. Verificar índices criados:"
echo "   SELECT tablename, indexname FROM pg_indexes"
echo "   WHERE schemaname = 'public' AND indexname LIKE 'idx_%'"
echo "   ORDER BY tablename, indexname;"
echo ""
echo "2. Monitorar uso dos índices (após 7 dias em produção):"
echo "   SELECT schemaname, tablename, indexname, idx_scan"
echo "   FROM pg_stat_user_indexes"
echo "   WHERE schemaname = 'public' AND indexname LIKE 'idx_%'"
echo "   ORDER BY idx_scan ASC;"
echo ""
echo "3. Remover índices não utilizados (idx_scan = 0 após 30 dias):"
echo "   DROP INDEX CONCURRENTLY IF EXISTS nome_do_indice;"
echo ""
echo "======================================================================"

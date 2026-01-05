#!/bin/bash

###############################################################################
# Script de Diagnóstico do Webhook do Telegram
#
# Valida a configuração completa do webhook do Telegram em produção
#
# Uso:
#   Local (com variáveis de ambiente):
#     TELEGRAM_BOT_TOKEN=xxx TELEGRAM_WEBHOOK_SECRET=yyy bash scripts/diagnose-telegram-webhook.sh
#
#   Produção (Render shell - variáveis já configuradas):
#     bash scripts/diagnose-telegram-webhook.sh
###############################################################################

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== DIAGNÓSTICO TELEGRAM WEBHOOK ===${NC}"
echo ""

# Verificar dependências
if ! command -v curl &> /dev/null; then
    echo -e "${RED}❌ Erro: curl não encontrado${NC}"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠️  Warning: jq não encontrado (output será menos formatado)${NC}"
    JQ_AVAILABLE=false
else
    JQ_AVAILABLE=true
fi

# Variáveis de ambiente
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
BACKEND_BASE_URL="${BACKEND_BASE_URL:-${PUBLIC_URL:-https://api.radarone.com.br}}"
TELEGRAM_WEBHOOK_SECRET="${TELEGRAM_WEBHOOK_SECRET}"

# Validar variáveis obrigatórias
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo -e "${RED}❌ Erro: TELEGRAM_BOT_TOKEN não configurado${NC}"
    echo ""
    echo "Configure a variável de ambiente:"
    echo "  export TELEGRAM_BOT_TOKEN='seu-token-aqui'"
    exit 1
fi

if [ -z "$TELEGRAM_WEBHOOK_SECRET" ]; then
    echo -e "${RED}❌ Erro: TELEGRAM_WEBHOOK_SECRET não configurado${NC}"
    exit 1
fi

# 1. Verificar variáveis
echo -e "${BLUE}1. Variáveis de ambiente:${NC}"
echo "   TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:0:10}... (length: ${#TELEGRAM_BOT_TOKEN})"
echo "   BACKEND_BASE_URL: ${BACKEND_BASE_URL}"
echo "   TELEGRAM_WEBHOOK_SECRET: ${TELEGRAM_WEBHOOK_SECRET:0:5}... (length: ${#TELEGRAM_WEBHOOK_SECRET})"
echo ""

# 2. Webhook atual no Telegram
echo -e "${BLUE}2. Webhook configurado no Telegram API:${NC}"
WEBHOOK_INFO=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo")

if [ "$JQ_AVAILABLE" = true ]; then
    echo "$WEBHOOK_INFO" | jq '.'
else
    echo "$WEBHOOK_INFO"
fi
echo ""

# 3. Webhook esperado
EXPECTED_WEBHOOK="${BACKEND_BASE_URL}/api/telegram/webhook?secret=${TELEGRAM_WEBHOOK_SECRET}"
echo -e "${BLUE}3. Webhook esperado:${NC}"
echo "   ${EXPECTED_WEBHOOK}"
echo ""

# 4. Comparação
if [ "$JQ_AVAILABLE" = true ]; then
    CURRENT_WEBHOOK=$(echo "$WEBHOOK_INFO" | jq -r '.result.url // ""')
    PENDING_UPDATES=$(echo "$WEBHOOK_INFO" | jq -r '.result.pending_update_count // 0')
    LAST_ERROR=$(echo "$WEBHOOK_INFO" | jq -r '.result.last_error_message // "Nenhum erro"')
    LAST_ERROR_DATE=$(echo "$WEBHOOK_INFO" | jq -r '.result.last_error_date // 0')
else
    # Fallback sem jq (menos preciso)
    CURRENT_WEBHOOK=$(echo "$WEBHOOK_INFO" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    PENDING_UPDATES="N/A"
    LAST_ERROR="N/A"
    LAST_ERROR_DATE=0
fi

echo -e "${BLUE}4. Comparação:${NC}"
if [ "$CURRENT_WEBHOOK" == "$EXPECTED_WEBHOOK" ]; then
    echo -e "   ${GREEN}✅ WEBHOOK CORRETO${NC}"
    WEBHOOK_OK=true
else
    echo -e "   ${RED}❌ WEBHOOK INCORRETO${NC}"
    echo "   Atual:    $CURRENT_WEBHOOK"
    echo "   Esperado: $EXPECTED_WEBHOOK"
    WEBHOOK_OK=false
fi
echo ""

# 5. Teste de conectividade (health check)
echo -e "${BLUE}5. Teste de conectividade (backend):${NC}"
HEALTH_URL="${BACKEND_BASE_URL}/api/telegram/health"
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")

if [ "$HEALTH_CODE" == "200" ]; then
    echo -e "   ${GREEN}✅ Backend respondendo (HTTP $HEALTH_CODE)${NC}"
    echo "   URL: $HEALTH_URL"
else
    echo -e "   ${RED}❌ Backend não responde (HTTP $HEALTH_CODE)${NC}"
    echo "   URL: $HEALTH_URL"
fi
echo ""

# 6. Updates pendentes e último erro
echo -e "${BLUE}6. Status do Webhook:${NC}"
echo "   Updates pendentes: $PENDING_UPDATES"
echo "   Último erro: $LAST_ERROR"
if [ "$LAST_ERROR_DATE" != "0" ] && [ "$LAST_ERROR_DATE" != "N/A" ]; then
    if command -v date &> /dev/null; then
        # macOS e Linux tratam date diferente
        if date --version >/dev/null 2>&1; then
            # GNU date (Linux)
            ERROR_DATE_FORMATTED=$(date -d "@$LAST_ERROR_DATE" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "N/A")
        else
            # BSD date (macOS)
            ERROR_DATE_FORMATTED=$(date -r "$LAST_ERROR_DATE" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "N/A")
        fi
        echo "   Data do último erro: $ERROR_DATE_FORMATTED"
    fi
fi
echo ""

# 7. Resumo e ação recomendada
echo -e "${BLUE}=== RESUMO ===${NC}"
echo ""

if [ "$WEBHOOK_OK" = true ] && [ "$LAST_ERROR" == "Nenhum erro" ] && [ "$HEALTH_CODE" == "200" ]; then
    echo -e "${GREEN}✅ Tudo configurado corretamente!${NC}"
    echo ""
    echo "Próximos passos:"
    echo "  1. Teste enviar um código RADAR-XXXXXX ao bot"
    echo "  2. Verifique os logs do backend para confirmar recebimento"
    exit 0
fi

echo -e "${YELLOW}⚠️  Problemas detectados:${NC}"
echo ""

if [ "$WEBHOOK_OK" = false ]; then
    echo -e "${RED}❌ WEBHOOK INCORRETO${NC}"
    echo ""
    echo "Ação: Reconfigurar webhook"
    echo ""
    echo "OPÇÃO 1 - Via endpoint ADMIN (recomendado):"
    echo "  curl -X POST ${BACKEND_BASE_URL}/api/telegram/admin/configure-webhook \\"
    echo "    -H 'Authorization: Bearer <ADMIN_TOKEN>'"
    echo ""
    echo "OPÇÃO 2 - Via Telegram API direto:"
    echo "  curl -X POST \"https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook\" \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    -d '{\"url\": \"${EXPECTED_WEBHOOK}\"}'"
    echo ""
fi

if [ "$LAST_ERROR" != "Nenhum erro" ] && [ "$LAST_ERROR" != "N/A" ]; then
    echo -e "${YELLOW}⚠️  ÚLTIMO ERRO: $LAST_ERROR${NC}"
    echo ""
    echo "Possíveis causas:"
    echo "  - TELEGRAM_WEBHOOK_SECRET errado (401 Unauthorized)"
    echo "  - Backend não acessível pelo Telegram (timeout, SSL inválido)"
    echo "  - Rota /api/telegram/webhook não pública"
    echo ""
fi

if [ "$HEALTH_CODE" != "200" ]; then
    echo -e "${RED}❌ BACKEND NÃO RESPONDE (HTTP $HEALTH_CODE)${NC}"
    echo ""
    echo "Possíveis causas:"
    echo "  - Backend offline ou reiniciando"
    echo "  - BACKEND_BASE_URL incorreto"
    echo "  - Firewall bloqueando acesso"
    echo ""
fi

exit 1

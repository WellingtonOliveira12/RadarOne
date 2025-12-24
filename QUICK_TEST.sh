#!/bin/bash

# ============================================
# QUICK TEST - Telegram Webhook Fix
# ============================================
# Script para testar rapidamente se o fix funcionou no Render

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuração
API_URL="https://api.radarone.com.br"

echo ""
echo "======================================"
echo "  RadarOne - Telegram Webhook Test"
echo "======================================"
echo ""

# Teste 1: Meta (versão)
echo -n "1. Verificando versão da API... "
META=$(curl -s "$API_URL/api/_meta")
VERSION=$(echo $META | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
GIT_SHA=$(echo $META | grep -o '"gitSha":"[^"]*"' | cut -d'"' -f4)

if [ "$VERSION" = "1.0.1" ]; then
    echo -e "${GREEN}✓ OK${NC} (version: $VERSION)"
else
    echo -e "${RED}✗ FAIL${NC} (version: $VERSION - esperado: 1.0.1)"
fi

echo "   Git SHA: $GIT_SHA"

# Teste 2: Health do Telegram router
echo -n "2. Verificando Telegram router... "
HEALTH_RESPONSE=$(curl -s "$API_URL/api/telegram/health")
HEALTH_STATUS=$(echo $HEALTH_RESPONSE | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

if [ "$HEALTH_STATUS" = "ok" ]; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "   Response: $HEALTH_RESPONSE"
fi

# Teste 3: Webhook sem secret (deve dar 401)
echo -n "3. Testando webhook SEM secret... "
WEBHOOK_NO_SECRET=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/telegram/webhook")

if [ "$WEBHOOK_NO_SECRET" = "401" ]; then
    echo -e "${GREEN}✓ OK${NC} (401 Unauthorized como esperado)"
elif [ "$WEBHOOK_NO_SECRET" = "404" ]; then
    echo -e "${RED}✗ FAIL - AINDA 404!${NC}"
    echo "   O webhook ainda não está funcionando."
    echo "   Verifique se o deploy foi concluído no Render."
else
    echo -e "${YELLOW}⚠ ATENÇÃO${NC} (status: $WEBHOOK_NO_SECRET)"
fi

# Teste 4: Webhook com secret (opcional - requer secret)
if [ -n "$TELEGRAM_SECRET" ]; then
    echo -n "4. Testando webhook COM secret... "
    WEBHOOK_WITH_SECRET=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$API_URL/api/telegram/webhook?secret=$TELEGRAM_SECRET" \
        -H "Content-Type: application/json" \
        -d '{"update_id":1,"message":{"message_id":1,"from":{"id":123,"first_name":"Test"},"chat":{"id":123,"type":"private"},"date":1234567890,"text":"TEST"}}')

    if [ "$WEBHOOK_WITH_SECRET" = "200" ]; then
        echo -e "${GREEN}✓ OK${NC} (200 OK)"
    else
        echo -e "${RED}✗ FAIL${NC} (status: $WEBHOOK_WITH_SECRET)"
    fi
else
    echo "4. Teste com secret PULADO (defina TELEGRAM_SECRET env var)"
fi

# Teste 5: Telegram getWebhookInfo (opcional - requer token)
if [ -n "$TELEGRAM_TOKEN" ]; then
    echo -n "5. Verificando Telegram webhook info... "
    WEBHOOK_INFO=$(curl -s "https://api.telegram.org/bot$TELEGRAM_TOKEN/getWebhookInfo")
    LAST_ERROR=$(echo $WEBHOOK_INFO | grep -o '"last_error_message":"[^"]*"' | cut -d'"' -f4)

    if [ -z "$LAST_ERROR" ] || [ "$LAST_ERROR" = "" ]; then
        echo -e "${GREEN}✓ OK${NC} (sem erros)"
    else
        echo -e "${RED}✗ FAIL${NC}"
        echo "   Erro: $LAST_ERROR"
    fi
else
    echo "5. Teste Telegram info PULADO (defina TELEGRAM_TOKEN env var)"
fi

echo ""
echo "======================================"
echo "  Resumo"
echo "======================================"

if [ "$VERSION" = "1.0.1" ] && [ "$HEALTH_STATUS" = "ok" ] && [ "$WEBHOOK_NO_SECRET" = "401" ]; then
    echo -e "${GREEN}✓ TUDO OK!${NC}"
    echo ""
    echo "O webhook está funcionando corretamente."
    echo "Próximos passos:"
    echo "  1. Testar vinculação real (enviar código RADAR-XXXXX para o bot)"
    echo "  2. Verificar logs no Render para confirmar processamento"
    echo "  3. Remover handler de debug após confirmação"
else
    echo -e "${RED}✗ PROBLEMAS DETECTADOS${NC}"
    echo ""
    echo "Verifique:"
    echo "  - Deploy foi concluído no Render?"
    echo "  - Logs do Render mostram 'Server started successfully'?"
    echo "  - Clear build cache pode ser necessário"
fi

echo ""
echo "Para mais detalhes, leia: TELEGRAM_WEBHOOK_FIX.md"
echo ""

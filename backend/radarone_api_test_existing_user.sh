#!/bin/bash

# ========================================
# RadarOne API - Teste com Usuário Existente
# Para contornar erro 500 no register
# ========================================

BASE_URL="https://radarone.onrender.com"

# IMPORTANTE: Substitua com credenciais de um usuário real que exista no banco
# Ou crie um usuário manualmente no dashboard do Render/Neon
EXISTING_EMAIL="teste@example.com"
EXISTING_PASSWORD="senha123"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Função para fazer requests
make_request() {
    local response=$(curl -s -w "\nHTTPSTATUS:%{http_code}" "$@")
    local body=$(echo "$response" | sed -e 's/HTTPSTATUS\:.*//g')
    local code=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    echo "$body"
    echo "$code"
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}RadarOne API - Teste com Usuário Existente${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Email:${NC} $EXISTING_EMAIL"
echo ""

# Login
echo -e "${BLUE}[1/2] Testando POST /api/auth/login...${NC}"
LOGIN_PAYLOAD=$(jq -n \
    --arg email "$EXISTING_EMAIL" \
    --arg password "$EXISTING_PASSWORD" \
    '{email: $email, password: $password}')

RESPONSE=$(make_request \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$LOGIN_PAYLOAD" \
    "$BASE_URL/api/auth/login")

LOGIN_BODY=$(echo "$RESPONSE" | sed -n '1p')
LOGIN_CODE=$(echo "$RESPONSE" | sed -n '2p')

echo -e "${YELLOW}Status Code:${NC} $LOGIN_CODE"
echo -e "${YELLOW}Response:${NC}"
echo "$LOGIN_BODY" | jq '.' 2>/dev/null || echo "$LOGIN_BODY"
echo ""

if [ "$LOGIN_CODE" = "200" ]; then
    JWT_TOKEN=$(echo "$LOGIN_BODY" | jq -r '.token // .accessToken // .access_token // .jwt // empty' 2>/dev/null)
    
    if [ -n "$JWT_TOKEN" ] && [ "$JWT_TOKEN" != "null" ]; then
        echo -e "${GREEN}✓ Login bem-sucedido${NC}"
        echo -e "${YELLOW}Token:${NC} ${JWT_TOKEN:0:50}..."
        
        # Campo do token
        TOKEN_FIELD=$(echo "$LOGIN_BODY" | jq -r 'to_entries | map(select(.value | type == "string" and (length > 100))) | .[0].key' 2>/dev/null)
        echo -e "${YELLOW}Campo do token:${NC} $TOKEN_FIELD"
        echo ""
        
        # Testar rota protegida
        echo -e "${BLUE}[2/2] Testando GET /api/monitors (rota protegida)...${NC}"
        RESPONSE=$(make_request \
            -H "Authorization: Bearer $JWT_TOKEN" \
            "$BASE_URL/api/monitors")
        
        MONITORS_BODY=$(echo "$RESPONSE" | sed -n '1p')
        MONITORS_CODE=$(echo "$RESPONSE" | sed -n '2p')
        
        echo -e "${YELLOW}Status Code:${NC} $MONITORS_CODE"
        echo -e "${YELLOW}Response:${NC}"
        echo "$MONITORS_BODY" | jq '.' 2>/dev/null || echo "$MONITORS_BODY"
        echo ""
        
        if [ "$MONITORS_CODE" = "200" ]; then
            echo -e "${GREEN}✓ Rota protegida funcionando!${NC}"
            MONITOR_COUNT=$(echo "$MONITORS_BODY" | jq '.count // .data | length' 2>/dev/null)
            echo -e "${GREEN}✓ Retornou $MONITOR_COUNT monitor(es)${NC}"
        else
            echo -e "${RED}✗ Erro na rota protegida${NC}"
        fi
    else
        echo -e "${RED}✗ Token não encontrado na resposta${NC}"
    fi
else
    echo -e "${RED}✗ Login falhou${NC}"
fi

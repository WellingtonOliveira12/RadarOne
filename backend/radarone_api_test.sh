#!/bin/bash

# ========================================
# RadarOne API - Script de Testes Automatizado
# ========================================

BASE_URL="https://radarone.onrender.com"
TIMESTAMP=$(date +%s)
TEST_EMAIL="well-${TIMESTAMP}@radarone.test"
TEST_PASSWORD="SenhaForte123!"
TEST_NAME="Teste Usuario ${TIMESTAMP}"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variáveis de resultado
HEALTH_STATUS="FAIL"
API_TEST_STATUS="FAIL"
REGISTER_STATUS="FAIL"
LOGIN_STATUS="FAIL"
MONITORS_STATUS="FAIL"
JWT_TOKEN=""

# Função para fazer requests e separar body e status code
make_request() {
    local response=$(curl -s -w "\nHTTPSTATUS:%{http_code}" "$@")
    local body=$(echo "$response" | sed -e 's/HTTPSTATUS\:.*//g')
    local code=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    echo "$body"
    echo "$code"
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}RadarOne API - Testes Automatizados${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Base URL:${NC} $BASE_URL"
echo -e "${YELLOW}Test Email:${NC} $TEST_EMAIL"
echo ""

# ========================================
# TESTE 1: Health Check
# ========================================
echo -e "${BLUE}[1/5] Testando GET /health...${NC}"
RESPONSE=$(make_request "$BASE_URL/health")
HEALTH_BODY=$(echo "$RESPONSE" | sed -n '1p')
HEALTH_CODE=$(echo "$RESPONSE" | sed -n '2p')

echo -e "${YELLOW}URL:${NC} $BASE_URL/health"
echo -e "${YELLOW}Status Code:${NC} $HEALTH_CODE"
echo -e "${YELLOW}Response:${NC}"
echo "$HEALTH_BODY" | jq '.' 2>/dev/null || echo "$HEALTH_BODY"
echo ""

if [ "$HEALTH_CODE" = "200" ]; then
    SERVICE_NAME=$(echo "$HEALTH_BODY" | jq -r '.service' 2>/dev/null)
    if [ "$SERVICE_NAME" = "RadarOne Backend" ]; then
        HEALTH_STATUS="OK"
        echo -e "${GREEN}✓ Health check: PASSOU${NC}"
    else
        echo -e "${RED}✗ Health check: Service name incorreto (recebido: '$SERVICE_NAME')${NC}"
    fi
else
    echo -e "${RED}✗ Health check: Status code $HEALTH_CODE (esperado 200)${NC}"
fi
echo ""

# ========================================
# TESTE 2: API Test Endpoint
# ========================================
echo -e "${BLUE}[2/5] Testando GET /api/test...${NC}"
RESPONSE=$(make_request "$BASE_URL/api/test")
API_TEST_BODY=$(echo "$RESPONSE" | sed -n '1p')
API_TEST_CODE=$(echo "$RESPONSE" | sed -n '2p')

echo -e "${YELLOW}URL:${NC} $BASE_URL/api/test"
echo -e "${YELLOW}Status Code:${NC} $API_TEST_CODE"
echo -e "${YELLOW}Response:${NC}"
echo "$API_TEST_BODY" | jq '.' 2>/dev/null || echo "$API_TEST_BODY"
echo ""

if [ "$API_TEST_CODE" = "200" ]; then
    API_MESSAGE=$(echo "$API_TEST_BODY" | jq -r '.message' 2>/dev/null)
    if [[ "$API_MESSAGE" == *"RadarOne API"* ]]; then
        API_TEST_STATUS="OK"
        echo -e "${GREEN}✓ API test: PASSOU${NC}"
    else
        echo -e "${RED}✗ API test: Mensagem incorreta (recebido: '$API_MESSAGE')${NC}"
    fi
else
    echo -e "${RED}✗ API test: Status code $API_TEST_CODE (esperado 200)${NC}"
fi
echo ""

# ========================================
# TESTE 3: Register User
# ========================================
echo -e "${BLUE}[3/5] Testando POST /api/auth/register...${NC}"
REGISTER_PAYLOAD=$(jq -n \
    --arg name "$TEST_NAME" \
    --arg email "$TEST_EMAIL" \
    --arg password "$TEST_PASSWORD" \
    '{name: $name, email: $email, password: $password}')

RESPONSE=$(make_request \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$REGISTER_PAYLOAD" \
    "$BASE_URL/api/auth/register")

REGISTER_BODY=$(echo "$RESPONSE" | sed -n '1p')
REGISTER_CODE=$(echo "$RESPONSE" | sed -n '2p')

echo -e "${YELLOW}URL:${NC} $BASE_URL/api/auth/register"
echo -e "${YELLOW}Status Code:${NC} $REGISTER_CODE"
echo -e "${YELLOW}Payload:${NC}"
echo "$REGISTER_PAYLOAD" | jq '.'
echo -e "${YELLOW}Response:${NC}"
echo "$REGISTER_BODY" | jq '.' 2>/dev/null || echo "$REGISTER_BODY"
echo ""

if [ "$REGISTER_CODE" = "201" ] || [ "$REGISTER_CODE" = "200" ]; then
    REGISTER_STATUS="OK"
    echo -e "${GREEN}✓ Register: PASSOU${NC}"
else
    echo -e "${RED}✗ Register: Status code $REGISTER_CODE (esperado 201 ou 200)${NC}"
    # Mostrar erro se houver
    ERROR_MSG=$(echo "$REGISTER_BODY" | jq -r '.error // .message // empty' 2>/dev/null)
    if [ -n "$ERROR_MSG" ]; then
        echo -e "${RED}  Erro: $ERROR_MSG${NC}"
    fi
fi
echo ""

# ========================================
# TESTE 4: Login User
# ========================================
echo -e "${BLUE}[4/5] Testando POST /api/auth/login...${NC}"
LOGIN_PAYLOAD=$(jq -n \
    --arg email "$TEST_EMAIL" \
    --arg password "$TEST_PASSWORD" \
    '{email: $email, password: $password}')

RESPONSE=$(make_request \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$LOGIN_PAYLOAD" \
    "$BASE_URL/api/auth/login")

LOGIN_BODY=$(echo "$RESPONSE" | sed -n '1p')
LOGIN_CODE=$(echo "$RESPONSE" | sed -n '2p')

echo -e "${YELLOW}URL:${NC} $BASE_URL/api/auth/login"
echo -e "${YELLOW}Status Code:${NC} $LOGIN_CODE"
echo -e "${YELLOW}Payload:${NC}"
echo "$LOGIN_PAYLOAD" | jq '.'
echo -e "${YELLOW}Response:${NC}"
echo "$LOGIN_BODY" | jq '.' 2>/dev/null || echo "$LOGIN_BODY"
echo ""

if [ "$LOGIN_CODE" = "200" ]; then
    # Tentar extrair token de vários campos possíveis
    JWT_TOKEN=$(echo "$LOGIN_BODY" | jq -r '.token // .accessToken // .access_token // .jwt // empty' 2>/dev/null)
    
    if [ -n "$JWT_TOKEN" ] && [ "$JWT_TOKEN" != "null" ]; then
        LOGIN_STATUS="OK"
        echo -e "${GREEN}✓ Login: PASSOU${NC}"
        echo -e "${GREEN}✓ Token JWT extraído com sucesso${NC}"
        echo -e "${YELLOW}Token (primeiros 50 chars):${NC} ${JWT_TOKEN:0:50}..."
        
        # Detectar qual campo contém o token
        TOKEN_FIELD=$(echo "$LOGIN_BODY" | jq -r 'to_entries | .[] | select(.value == "'$JWT_TOKEN'") | .key' 2>/dev/null)
        echo -e "${YELLOW}Campo do token:${NC} $TOKEN_FIELD"
    else
        echo -e "${RED}✗ Login: Não foi possível extrair o token JWT${NC}"
        echo -e "${YELLOW}Campos disponíveis no JSON:${NC}"
        echo "$LOGIN_BODY" | jq 'keys' 2>/dev/null
    fi
else
    echo -e "${RED}✗ Login: Status code $LOGIN_CODE (esperado 200)${NC}"
    ERROR_MSG=$(echo "$LOGIN_BODY" | jq -r '.error // .message // empty' 2>/dev/null)
    if [ -n "$ERROR_MSG" ]; then
        echo -e "${RED}  Erro: $ERROR_MSG${NC}"
    fi
fi
echo ""

# ========================================
# TESTE 5: Get Monitors (Rota Protegida)
# ========================================
echo -e "${BLUE}[5/5] Testando GET /api/monitors (rota protegida)...${NC}"

if [ -n "$JWT_TOKEN" ] && [ "$JWT_TOKEN" != "null" ]; then
    RESPONSE=$(make_request \
        -H "Authorization: Bearer $JWT_TOKEN" \
        "$BASE_URL/api/monitors")
    
    MONITORS_BODY=$(echo "$RESPONSE" | sed -n '1p')
    MONITORS_CODE=$(echo "$RESPONSE" | sed -n '2p')
    
    echo -e "${YELLOW}URL:${NC} $BASE_URL/api/monitors"
    echo -e "${YELLOW}Status Code:${NC} $MONITORS_CODE"
    echo -e "${YELLOW}Authorization:${NC} Bearer ${JWT_TOKEN:0:30}..."
    echo -e "${YELLOW}Response:${NC}"
    echo "$MONITORS_BODY" | jq '.' 2>/dev/null || echo "$MONITORS_BODY"
    echo ""
    
    if [ "$MONITORS_CODE" = "200" ]; then
        MONITORS_STATUS="OK"
        echo -e "${GREEN}✓ Monitors: PASSOU${NC}"
        
        # Tentar extrair contagem de monitores
        MONITOR_COUNT=$(echo "$MONITORS_BODY" | jq '.count // .data | length' 2>/dev/null)
        if [ -n "$MONITOR_COUNT" ] && [ "$MONITOR_COUNT" != "null" ]; then
            echo -e "${GREEN}✓ Retornou $MONITOR_COUNT monitor(es)${NC}"
        fi
    else
        echo -e "${RED}✗ Monitors: Status code $MONITORS_CODE (esperado 200)${NC}"
        ERROR_MSG=$(echo "$MONITORS_BODY" | jq -r '.error // .message // empty' 2>/dev/null)
        if [ -n "$ERROR_MSG" ]; then
            echo -e "${RED}  Erro: $ERROR_MSG${NC}"
        fi
    fi
else
    echo -e "${RED}✗ Monitors: PULADO (sem token JWT)${NC}"
fi
echo ""

# ========================================
# RESUMO FINAL
# ========================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}RESUMO DOS TESTES${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

print_status() {
    if [ "$2" = "OK" ]; then
        echo -e "${GREEN}✓ $1: $2${NC}"
    else
        echo -e "${RED}✗ $1: $2${NC}"
    fi
}

print_status "HEALTH      " "$HEALTH_STATUS"
print_status "API TEST    " "$API_TEST_STATUS"
print_status "REGISTER    " "$REGISTER_STATUS"
print_status "LOGIN       " "$LOGIN_STATUS"
print_status "MONITORS    " "$MONITORS_STATUS"
echo ""

# Contar sucessos
TOTAL_TESTS=5
SUCCESS_COUNT=0
[ "$HEALTH_STATUS" = "OK" ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[ "$API_TEST_STATUS" = "OK" ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[ "$REGISTER_STATUS" = "OK" ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[ "$LOGIN_STATUS" = "OK" ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[ "$MONITORS_STATUS" = "OK" ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))

echo -e "${BLUE}Total: $SUCCESS_COUNT/$TOTAL_TESTS testes passaram${NC}"
echo ""

if [ $SUCCESS_COUNT -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}🎉 TODOS OS TESTES PASSARAM COM SUCESSO! 🎉${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Alguns testes falharam. Verifique os detalhes acima.${NC}"
    exit 1
fi

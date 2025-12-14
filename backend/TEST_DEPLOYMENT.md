# 🧪 Teste de Deploy - RadarOne Backend

Este guia contém testes rápidos para validar se o deploy no Render está funcionando corretamente.

---

## ✅ PRÉ-REQUISITOS

Antes de testar:
1. ✅ Todas as variáveis de ambiente configuradas no Render (veja RENDER_SETUP.md)
2. ✅ Deploy concluído com sucesso
3. ✅ Logs do Render sem erros críticos

---

## 🧪 TESTES MANUAIS

### 1. Health Check Simples (Render)

```bash
curl https://radarone.onrender.com/healthz
```

**Esperado:**
```
ok
```

**Status:** 200 OK

---

### 2. Health Check Detalhado

```bash
curl https://radarone.onrender.com/health
```

**Esperado:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-13T...",
  "service": "RadarOne Backend"
}
```

**Status:** 200 OK

---

### 3. Rota Raiz

```bash
curl https://radarone.onrender.com/
```

**Esperado:**
```json
{
  "service": "RadarOne API",
  "version": "1.0.0",
  "status": "running",
  "timestamp": "2025-12-13T..."
}
```

**Status:** 200 OK

---

### 4. Teste de Cadastro (POST /api/auth/register)

```bash
curl -X POST https://radarone.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Teste Deploy",
    "email": "teste.deploy@example.com",
    "password": "SenhaSegura123!"
  }'
```

**Sucesso (Status 201):**
```json
{
  "message": "Usuário criado com sucesso",
  "user": {
    "id": "...",
    "email": "teste.deploy@example.com",
    "name": "Teste Deploy",
    "role": "USER",
    "createdAt": "..."
  }
}
```

**Erro 409 (Email já existe):**
```json
{
  "error": "Email já cadastrado"
}
```

**Erro 500 (CPF_ENCRYPTION_KEY não configurada):**
```json
{
  "error": "Erro ao criar usuário"
}
```

**Nos logs do Render você verá:**
```
❌ CPF_ENCRYPTION_KEY não configurada no ambiente.

📝 Para configurar no Render:
   1. Acesse: Dashboard → Seu serviço → Environment
   2. Clique em "Add Environment Variable"
   ...
```

---

### 5. Teste de Login

```bash
curl -X POST https://radarone.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste.deploy@example.com",
    "password": "SenhaSegura123!"
  }'
```

**Sucesso (Status 200):**
```json
{
  "message": "Login realizado com sucesso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "teste.deploy@example.com",
    "name": "Teste Deploy",
    "role": "USER"
  }
}
```

---

### 6. Teste de Rate Limiting

Execute o mesmo request 11 vezes em 15 minutos:

```bash
for i in {1..11}; do
  echo "Request $i:"
  curl -X POST https://radarone.onrender.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"teste@example.com","password":"wrong"}' \
    -w "\nStatus: %{http_code}\n\n"
  sleep 1
done
```

**Esperado:**
- Requests 1-10: Status 401 (credenciais inválidas) ✅
- Request 11: Status 429 (too many requests) ✅

**Resposta do 11º request:**
```json
{
  "error": "Muitas tentativas de autenticação. Tente novamente em 15 minutos."
}
```

---

### 7. Teste de CORS

```bash
curl -X OPTIONS https://radarone.onrender.com/api/auth/login \
  -H "Origin: https://radarone.app" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

**Verifique nos headers:**
```
< Access-Control-Allow-Origin: https://radarone.app
< Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
< Access-Control-Allow-Credentials: true
```

---

### 8. Teste de Request ID

Faça qualquer requisição e verifique o header de resposta:

```bash
curl -I https://radarone.onrender.com/health
```

**Esperado nos headers:**
```
HTTP/1.1 200 OK
x-request-id: 550e8400-e29b-41d4-a716-446655440000
```

O `x-request-id` deve ser um UUID único.

---

## 🔍 VERIFICAÇÃO NOS LOGS DO RENDER

Após fazer as requisições, verifique os logs:

### ✅ Logs Esperados (Sucesso):

```json
{"level":30,"time":...,"requestId":"...","method":"POST","url":"/api/auth/register","msg":"Incoming request"}
{"level":30,"time":...,"userId":"...","email":"t***@example.com","msg":"User registered successfully"}
{"level":30,"time":...,"requestId":"...","statusCode":201,"duration":245,"msg":"Request completed"}
```

### ❌ Logs de Erro (Proxy):

**ANTES da correção:**
```
ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false
```

**DEPOIS da correção:**
✅ Este erro NÃO deve mais aparecer

### ❌ Logs de Erro (CPF_ENCRYPTION_KEY):

```
CPF_ENCRYPTION_KEY não configurada no ambiente.

📝 Para configurar no Render:
   1. Acesse: Dashboard → Seu serviço → Environment
   ...
```

**Solução:** Configure a variável conforme RENDER_SETUP.md

---

## 📊 CHECKLIST DE VALIDAÇÃO

Marque cada item após testar:

### Health Checks
- [ ] GET `/healthz` retorna 200 OK
- [ ] GET `/health` retorna JSON com status ok
- [ ] GET `/` retorna JSON da API

### Trust Proxy & Rate Limiting
- [ ] Cadastro NÃO retorna erro `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`
- [ ] Rate limiting funciona (11º request retorna 429)
- [ ] Logs mostram IPs corretos (não 127.0.0.1 em produção)

### CPF Encryption
- [ ] Se `CPF_ENCRYPTION_KEY` configurada: cadastro funciona
- [ ] Se `CPF_ENCRYPTION_KEY` ausente: erro claro com instruções

### Request ID
- [ ] Todas as respostas incluem header `x-request-id`
- [ ] RequestId aparece nos logs

### Autenticação
- [ ] Cadastro funciona (POST /api/auth/register)
- [ ] Login funciona (POST /api/auth/login)
- [ ] Token JWT é retornado

### CORS
- [ ] Requests do frontend são aceitos
- [ ] Headers CORS corretos

---

## 🚨 TROUBLESHOOTING RÁPIDO

### Problema: 404 em `/healthz`

**Solução:**
1. Confirme que está usando a última versão do código
2. Verifique se o deploy incluiu as mudanças em `server.ts`
3. Force rebuild no Render: Manual Deploy → Clear build cache & deploy

### Problema: Erro de Proxy

**Sintoma:**
```
ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
```

**Solução:**
1. Confirme que `app.set('trust proxy', 1)` está no `server.ts`
2. Confirme que está ANTES de qualquer middleware
3. Force rebuild

### Problema: CPF_ENCRYPTION_KEY

**Sintoma:**
```
Erro ao criar usuário (500)
```

**Solução:**
1. Gere chave: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Adicione no Render: Environment → Add Environment Variable
3. Key: `CPF_ENCRYPTION_KEY`
4. Value: (cole a chave de 64 caracteres)
5. Salve (redeploy automático)

### Problema: Rate Limiting Não Funciona

**Sintoma:**
Mais de 10 requests são aceitos

**Solução:**
1. Confirme que `trust proxy` está configurado
2. Verifique se `apiRateLimiter` está aplicado no `server.ts`
3. Confirme que os requests estão vindo do mesmo IP

---

## 📝 EXEMPLO DE TESTE COMPLETO

Execute este script bash para testar tudo de uma vez:

```bash
#!/bin/bash

BASE_URL="https://radarone.onrender.com"
echo "🧪 Testando deploy do RadarOne..."
echo ""

# 1. Health check simples
echo "1️⃣ Health check simples (/healthz):"
curl -s "$BASE_URL/healthz"
echo -e "\n"

# 2. Health check detalhado
echo "2️⃣ Health check detalhado (/health):"
curl -s "$BASE_URL/health" | jq .
echo ""

# 3. Rota raiz
echo "3️⃣ Rota raiz (/):"
curl -s "$BASE_URL/" | jq .
echo ""

# 4. Cadastro de teste
echo "4️⃣ Teste de cadastro:"
curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Teste Automatizado",
    "email": "teste.auto.'$(date +%s)'@example.com",
    "password": "SenhaSegura123!"
  }' | jq .
echo ""

echo "✅ Testes concluídos!"
echo ""
echo "📋 Verifique os logs do Render para mais detalhes."
```

Salve como `test-deploy.sh`, dê permissão de execução e rode:
```bash
chmod +x test-deploy.sh
./test-deploy.sh
```

---

*Última atualização: 13/12/2025*

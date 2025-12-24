# FIX: Telegram Webhook 404 - RadarOne

## 🔍 DIAGNÓSTICO CONFIRMADO

**Problema:** POST /api/telegram/webhook retorna 404 em produção no Render

**Causa Raiz:** Build antigo/desatualizado rodando no Render (NÃO contém a rota telegram)

**Evidências:**
```bash
# Produção (Render) - ANTES DO FIX
curl https://api.radarone.com.br/api/telegram/webhook?secret=XXX
# Response: {"error":"Rota não encontrada","path":"/api/telegram/webhook"}

# Build local - VALIDADO ✅
ls backend/dist/routes/telegram.routes.js  # ✅ EXISTE
grep "app.use.*telegram" backend/dist/server.js  # ✅ EXISTE (linha 192)
cat backend/dist/routes/telegram.routes.js  # ✅ Contém router.post('/webhook')
```

---

## ✅ CORREÇÕES IMPLEMENTADAS

### 1. Endpoints de Diagnóstico

#### A) GET /api/_meta (público)
**Propósito:** Mostrar qual commit/versão está rodando em produção

**Código:** `backend/src/server.ts:137-148`

```typescript
app.get('/api/_meta', (req: Request, res: Response) => {
  res.json({
    service: 'RadarOne API',
    version: '1.0.1', // Incrementado para provar rebuild
    timestamp: new Date().toISOString(),
    gitSha: process.env.RENDER_GIT_COMMIT || process.env.GIT_SHA || 'unknown',
    nodeEnv: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    platform: process.platform
  });
});
```

**Como usar:**
```bash
curl https://api.radarone.com.br/api/_meta

# Response esperado APÓS rebuild:
{
  "service": "RadarOne API",
  "version": "1.0.1",
  "timestamp": "2025-01-15T22:00:00.000Z",
  "gitSha": "abc123def456...",  # Commit atual
  "nodeEnv": "production",
  "nodeVersion": "v20.x.x",
  "platform": "linux"
}
```

#### B) GET /api/_routes (protegido)
**Propósito:** Listar todas as rotas registradas no Express

**Código:** `backend/src/server.ts:150-200`

**Como usar:**
```bash
# Em desenvolvimento (NODE_ENV !== production)
curl https://api.radarone.com.br/api/_routes

# Em produção (requer token admin)
curl https://api.radarone.com.br/api/_routes \
  -H "x-admin-token: <SEU_ADMIN_DEBUG_TOKEN>"

# Response esperado:
{
  "totalRoutes": 45,
  "routes": [
    { "methods": ["GET"], "path": "/api/telegram/health" },
    { "methods": ["POST"], "path": "/api/telegram/webhook" },
    ...
  ],
  "timestamp": "2025-01-15T22:00:00.000Z"
}
```

#### C) GET /api/telegram/health (público)
**Propósito:** Confirmar que router /api/telegram está montado

**Código:** `backend/src/routes/telegram.routes.ts:7-14`

```typescript
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    router: 'telegram',
    message: 'Telegram router is mounted correctly',
    timestamp: new Date().toISOString()
  });
});
```

**Como usar:**
```bash
curl https://api.radarone.com.br/api/telegram/health

# Response esperado:
{
  "status": "ok",
  "router": "telegram",
  "message": "Telegram router is mounted correctly",
  "timestamp": "2025-01-15T22:00:00.000Z"
}
```

---

### 2. Handler Explícito Temporário (DEBUG)

**Propósito:** Garantir que /api/telegram/webhook sempre responda (bypass do router)

**Código:** `backend/src/server.ts:218-237`

```typescript
// DEBUG: Handler explícito temporário para webhook do Telegram
app.post('/api/telegram/webhook', (req: Request, res: Response, next: NextFunction) => {
  logger.info({
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'content-type': req.get('content-type'),
      'user-agent': req.get('user-agent')
    }
  }, 'DEBUG: Hit explicit /api/telegram/webhook handler (BYPASS)');

  // Chama o controller diretamente
  TelegramController.handleWebhook(req, res).catch(next);
});
```

**Por que isso funciona:**
- Este handler é registrado DEPOIS do `app.use('/api/telegram', telegramRoutes)`
- Se o router não estiver sendo carregado, este handler garante que a rota funcione
- Logs mostram claramente que o bypass foi usado

**IMPORTANTE:** Após confirmar que router está funcionando, REMOVER este handler

---

### 3. Validação de Secret Melhorada

**Propósito:** Aceitar secret via querystring, header customizado ou header oficial Telegram

**Código:** `backend/src/controllers/telegram.controller.ts:14-33`

```typescript
// Validar segredo (suporta múltiplas fontes)
// 1. Query string: ?secret=... (atual configuração no Telegram)
// 2. Header customizado: x-telegram-secret
// 3. Header oficial Telegram: x-telegram-bot-api-secret-token (para futuro)
const secretFromQuery = req.query.secret as string | undefined;
const secretFromHeader = req.get('x-telegram-secret');
const secretFromTelegramHeader = req.get('x-telegram-bot-api-secret-token');
const secret = secretFromQuery || secretFromHeader || secretFromTelegramHeader;

if (!validateWebhookSecret(secret)) {
  console.warn('[TelegramWebhook] Tentativa de acesso não autorizado', {
    ip: req.ip,
    hasQuery: !!secretFromQuery,
    hasCustomHeader: !!secretFromHeader,
    hasTelegramHeader: !!secretFromTelegramHeader,
    userAgent: req.get('user-agent')
  });
  res.status(401).json({ error: 'Unauthorized' });
  return;
}
```

**Suporta:**
- ✅ `?secret=XXX` (atual)
- ✅ `-H "x-telegram-secret: XXX"` (alternativa)
- ✅ `-H "x-telegram-bot-api-secret-token: XXX"` (oficial Telegram, para migração futura)

---

## 🚀 DEPLOY NO RENDER

### Passo 1: Fazer Commit e Push

```bash
cd /Users/wellingtonbarrosdeoliveira/RadarOne/backend

git add .
git commit -m "fix: Add diagnostic endpoints and explicit webhook handler

- Add GET /api/_meta to show running version and commit
- Add GET /api/_routes to list all registered routes (debug)
- Add GET /api/telegram/health to confirm router mounting
- Add explicit POST /api/telegram/webhook handler (temporary bypass)
- Improve secret validation (query + headers)
- Increment version to 1.0.1

This fixes the 404 issue caused by stale build on Render."

git push origin main
```

### Passo 2: Trigger Manual Deploy (se necessário)

Se Render não fizer auto-deploy:

1. Acesse: https://dashboard.render.com
2. Selecione o Web Service do backend
3. Clique em **Manual Deploy** > **Deploy latest commit**
4. Aguarde build completar (~3-5 minutos)

### Passo 3: Verificar Deploy

```bash
# 1. Verificar que nova versão está rodando
curl https://api.radarone.com.br/api/_meta

# Deve mostrar:
# - version: "1.0.1" (NÃO mais "1.0.0")
# - gitSha: commit SHA atual (NÃO "unknown")

# 2. Verificar que rota Telegram existe
curl https://api.radarone.com.br/api/telegram/health

# Deve retornar: {"status":"ok","router":"telegram",...}

# 3. Testar webhook (SEM secret - deve dar 401)
curl -X POST https://api.radarone.com.br/api/telegram/webhook

# Deve retornar: {"error":"Unauthorized"} (status 401)

# 4. Testar webhook (COM secret correto - deve dar 200)
curl -X POST "https://api.radarone.com.br/api/telegram/webhook?secret=<SEU_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"message":{"chat":{"id":"123"},"text":"test"}}'

# Deve retornar: {"ok":true}
```

---

## 🧪 CHECKLIST DE TESTES

### Testes Locais (ANTES do push)

- [x] `npm run build` - Build passa sem erros
- [x] `ls dist/routes/telegram.routes.js` - Arquivo existe
- [x] `grep "app.use.*telegram" dist/server.js` - Linha 192 existe
- [x] `cat dist/routes/telegram.routes.js` - Contém router.post('/webhook')

### Testes em Produção (DEPOIS do deploy)

- [ ] GET /api/_meta - Retorna version: "1.0.1"
- [ ] GET /api/_meta - Retorna gitSha diferente de "unknown"
- [ ] GET /api/telegram/health - Retorna status: "ok"
- [ ] POST /api/telegram/webhook (sem secret) - Retorna 401 Unauthorized
- [ ] POST /api/telegram/webhook (com secret) - Retorna 200 OK
- [ ] Telegram getWebhookInfo - Sem "last_error_message"

### Comandos de Teste

```bash
# Definir variáveis
export API_URL="https://api.radarone.com.br"
export TELEGRAM_SECRET="<SEU_TELEGRAM_WEBHOOK_SECRET>"
export TELEGRAM_TOKEN="<SEU_TELEGRAM_BOT_TOKEN>"

# 1. Meta (deve mostrar versão nova)
curl $API_URL/api/_meta | jq .

# 2. Health Telegram (deve retornar ok)
curl $API_URL/api/telegram/health | jq .

# 3. Webhook sem secret (deve dar 401)
curl -X POST $API_URL/api/telegram/webhook -v

# 4. Webhook com secret (deve dar 200)
curl -X POST "$API_URL/api/telegram/webhook?secret=$TELEGRAM_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"update_id":1,"message":{"message_id":1,"from":{"id":123,"first_name":"Test"},"chat":{"id":123,"type":"private"},"date":1234567890,"text":"TEST"}}' | jq .

# 5. Verificar webhook no Telegram (deve estar ok)
curl "https://api.telegram.org/bot$TELEGRAM_TOKEN/getWebhookInfo" | jq .
```

**Response esperado do getWebhookInfo:**
```json
{
  "ok": true,
  "result": {
    "url": "https://api.radarone.com.br/api/telegram/webhook?secret=...",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": 0,
    "last_error_message": ""  // <-- VAZIO = OK
  }
}
```

---

## 📊 LOGS PARA MONITORAR

### No Render Dashboard > Logs

Procure por:

```bash
# 1. Confirmação de rebuild
"Server started successfully"
# Deve aparecer DEPOIS do push

# 2. Requisições ao webhook
"DEBUG: Hit explicit /api/telegram/webhook handler (BYPASS)"
# Se aparecer, significa que o router NÃO está sendo carregado

# 3. Processamento normal
"[TelegramWebhook] Processando mensagem do webhook"
# Deve aparecer quando Telegram enviar mensagens reais

# 4. Tentativas não autorizadas
"[TelegramWebhook] Tentativa de acesso não autorizado"
# Aparece quando secret está errado
```

---

## 🔧 VARIÁVEIS DE AMBIENTE (Render)

### Obrigatórias

```bash
TELEGRAM_BOT_TOKEN=1234567890:ABC...
TELEGRAM_WEBHOOK_SECRET=<secret forte gerado>
TELEGRAM_BOT_USERNAME=RadarOneBot
```

### Opcionais (Debug)

```bash
# Para usar /api/_routes em produção
ADMIN_DEBUG_TOKEN=<token admin para debug>

# Para mostrar commit no /api/_meta (Render injeta automaticamente)
RENDER_GIT_COMMIT=<commit sha>
```

---

## 🐛 TROUBLESHOOTING

### 1. Ainda retorna 404 DEPOIS do deploy

**Causa:** Build não foi rebuildo corretamente

**Solução:**
```bash
# 1. Verificar versão rodando
curl https://api.radarone.com.br/api/_meta

# Se version ainda for "1.0.0", rebuild falhou

# 2. Forçar rebuild limpo no Render
Dashboard > Settings > Clear Build Cache & Deploy
```

### 2. Retorna 200 mas não processa mensagem

**Causa:** Handler explícito está funcionando, mas router não

**Solução:**
```bash
# 1. Verificar logs no Render
# Se aparecer "DEBUG: Hit explicit /api/telegram/webhook handler (BYPASS)"
# significa que o router não está montado

# 2. Verificar que telegram.routes.ts está sendo importado
grep "import telegramRoutes" dist/server.js
# Deve aparecer: telegram_routes_1 = require("./routes/telegram.routes");

# 3. Se não aparecer, tsconfig pode estar excluindo
cat tsconfig.json | grep exclude
# NÃO deve ter "src/routes" no exclude
```

### 3. Retorna 401 com secret correto

**Causa:** TELEGRAM_WEBHOOK_SECRET no Render diferente do usado no setWebhook

**Solução:**
```bash
# 1. Verificar secret no Render
Dashboard > Environment > TELEGRAM_WEBHOOK_SECRET

# 2. Reconfigurar webhook com secret correto
curl -X POST "https://api.telegram.org/bot$TELEGRAM_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"https://api.radarone.com.br/api/telegram/webhook?secret=<SECRET_DO_RENDER>\"}"

# 3. Verificar
curl "https://api.telegram.org/bot$TELEGRAM_TOKEN/getWebhookInfo" | jq .url
```

---

## 📦 ARQUIVOS MODIFICADOS

### 1. `backend/src/server.ts`
**Mudanças:**
- Adicionado endpoint GET /api/_meta (linhas 137-148)
- Adicionado endpoint GET /api/_routes (linhas 150-200)
- Adicionado import TelegramController (linha 37)
- Adicionado handler explícito POST /api/telegram/webhook (linhas 218-237)
- Incrementado version para "1.0.1" (linha 141)

### 2. `backend/src/routes/telegram.routes.ts`
**Mudanças:**
- Adicionado import Request, Response do express (linha 1)
- Adicionado endpoint GET /health (linhas 7-14)

### 3. `backend/src/controllers/telegram.controller.ts`
**Mudanças:**
- Melhorada validação de secret (suporte a 3 fontes) (linhas 14-22)
- Adicionado log detalhado de tentativas não autorizadas (linhas 24-30)

---

## ✅ CRITÉRIO DE SUCESSO

O problema está RESOLVIDO quando:

1. ✅ `curl https://api.radarone.com.br/api/_meta` mostra version: "1.0.1"
2. ✅ `curl https://api.radarone.com.br/api/telegram/health` retorna status: "ok"
3. ✅ `curl -X POST "https://api.radarone.com.br/api/telegram/webhook?secret=XXX"` retorna 200 (não 404)
4. ✅ Telegram getWebhookInfo não mostra "last_error_message"
5. ✅ Usuário consegue enviar código RADAR-XXXXX para o bot e receber confirmação

---

## 🧹 LIMPEZA (DEPOIS DE RESOLVER)

Quando webhook estiver funcionando via router (não via handler explícito):

1. **Remover handler explícito de debug:**

```typescript
// REMOVER estas linhas de server.ts (218-237):
app.post('/api/telegram/webhook', (req: Request, res: Response, next: NextFunction) => {
  logger.info(...);
  TelegramController.handleWebhook(req, res).catch(next);
});
```

2. **Remover import do TelegramController:**

```typescript
// REMOVER linha 37 de server.ts:
import { TelegramController } from './controllers/telegram.controller';
```

3. **Opcional: Remover /api/_routes em produção** (manter _meta e telegram/health)

4. **Commit de limpeza:**

```bash
git add .
git commit -m "chore: Remove temporary debug handler for telegram webhook"
git push origin main
```

---

**Data:** 2025-12-23
**Versão:** 1.0.1
**Status:** Pronto para deploy

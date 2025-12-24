# COMMIT E DEPLOY - Fix Telegram Webhook 404

## 📋 RESUMO EXECUTIVO

**Problema:** Telegram webhook retorna 404 em produção (Render)

**Causa:** Build antigo/desatualizado rodando no Render

**Solução:** Implementado endpoints de diagnóstico e handler explícito temporário

**Status:** ✅ Pronto para commit e deploy

---

## 📦 ARQUIVOS ALTERADOS

### Modificados (3 arquivos)

1. **backend/src/server.ts**
   - Adicionado GET /api/_meta (mostra versão e commit)
   - Adicionado GET /api/_routes (lista rotas registradas)
   - Adicionado handler explícito POST /api/telegram/webhook (bypass temporário)
   - Import do TelegramController
   - Incrementado version para "1.0.1"

2. **backend/src/routes/telegram.routes.ts**
   - Adicionado GET /health (confirma montagem do router)
   - Imports de Request e Response

3. **backend/src/controllers/telegram.controller.ts**
   - Melhorada validação de secret (3 fontes: query, header custom, header oficial)
   - Log detalhado de tentativas não autorizadas

### Criados (3 arquivos)

1. **TELEGRAM_WEBHOOK_FIX.md**
   - Documentação completa do problema e solução
   - Guia de deploy e troubleshooting
   - Checklist de testes

2. **QUICK_TEST.sh**
   - Script bash para testar rapidamente
   - Valida versão, health, webhook
   - Output colorido e claro

3. **COMMIT_AND_DEPLOY.md**
   - Este arquivo (guia de commit e deploy)

---

## 🚀 PASSO A PASSO PARA DEPLOY

### 1. Verificar Build Local

```bash
cd /Users/wellingtonbarrosdeoliveira/RadarOne/backend

# Build deve passar sem erros
npm run build

# Validar que arquivos foram gerados
ls -la dist/routes/telegram.routes.js
grep "app.use.*telegram" dist/server.js
```

**Resultado esperado:**
```
✓ Build completado sem erros
✓ dist/routes/telegram.routes.js existe
✓ dist/server.js contém app.use('/api/telegram', telegram_routes_1.default)
```

---

### 2. Fazer Commit

```bash
cd /Users/wellingtonbarrosdeoliveira/RadarOne

# Verificar arquivos alterados
git status

# Adicionar todos os arquivos
git add backend/src/server.ts
git add backend/src/routes/telegram.routes.ts
git add backend/src/controllers/telegram.controller.ts
git add TELEGRAM_WEBHOOK_FIX.md
git add QUICK_TEST.sh
git add COMMIT_AND_DEPLOY.md

# Commit com mensagem descritiva
git commit -m "fix: Add diagnostic endpoints and explicit webhook handler

PROBLEMA:
- POST /api/telegram/webhook retorna 404 em produção
- Telegram getWebhookInfo mostra 'Wrong response from webhook: 404 Not Found'
- Build antigo/desatualizado rodando no Render

SOLUÇÃO:
1. Endpoints de diagnóstico:
   - GET /api/_meta - Mostra versão e commit rodando
   - GET /api/_routes - Lista todas as rotas registradas (debug)
   - GET /api/telegram/health - Confirma montagem do router

2. Handler explícito temporário:
   - POST /api/telegram/webhook - Bypass direto ao controller
   - Garante que rota funcione mesmo se router não carregar
   - REMOVER após confirmar que router está funcionando

3. Melhorias na validação:
   - Suporte a secret via query, header custom e header oficial Telegram
   - Logs detalhados de tentativas não autorizadas

ARQUIVOS ALTERADOS:
- backend/src/server.ts - Endpoints de diagnóstico e handler explícito
- backend/src/routes/telegram.routes.ts - Endpoint /health
- backend/src/controllers/telegram.controller.ts - Validação melhorada

ARQUIVOS CRIADOS:
- TELEGRAM_WEBHOOK_FIX.md - Documentação completa
- QUICK_TEST.sh - Script de teste rápido
- COMMIT_AND_DEPLOY.md - Guia de commit e deploy

VERSÃO: 1.0.1

Refs: Telegram webhook 404 issue
"

# Push para origin
git push origin main
```

---

### 3. Monitorar Deploy no Render

#### A) Via Dashboard

1. Acesse: https://dashboard.render.com
2. Selecione o Web Service do backend (api.radarone.com.br)
3. Clique na aba **Events**
4. Aguarde aparecer "Deploy started" (automático após push)
5. Aguarde "Deploy live" (~3-5 minutos)

#### B) Via Logs (em tempo real)

1. Na aba **Logs**, acompanhe o build:
   ```
   Building...
   Installing dependencies...
   Running build script...
   tsc
   Build succeeded
   Starting server...
   Server started successfully
   ```

2. Procure por:
   ```
   [INFO] Server started successfully
   [INFO] Database connected successfully
   ```

---

### 4. Testar em Produção

#### A) Teste Automático (Recomendado)

```bash
cd /Users/wellingtonbarrosdeoliveira/RadarOne

# Executar script de teste
./QUICK_TEST.sh

# Com variáveis opcionais (para testes completos)
TELEGRAM_SECRET=<seu-secret> TELEGRAM_TOKEN=<seu-token> ./QUICK_TEST.sh
```

**Output esperado:**
```
======================================
  RadarOne - Telegram Webhook Test
======================================

1. Verificando versão da API... ✓ OK (version: 1.0.1)
   Git SHA: abc123def456...
2. Verificando Telegram router... ✓ OK
3. Testando webhook SEM secret... ✓ OK (401 Unauthorized como esperado)
4. Testando webhook COM secret... ✓ OK (200 OK)
5. Verificando Telegram webhook info... ✓ OK (sem erros)

======================================
  Resumo
======================================
✓ TUDO OK!
```

#### B) Teste Manual

```bash
# 1. Verificar versão (deve ser 1.0.1)
curl https://api.radarone.com.br/api/_meta | jq .

# 2. Verificar health do Telegram router
curl https://api.radarone.com.br/api/telegram/health | jq .

# 3. Testar webhook sem secret (deve dar 401, NÃO 404)
curl -X POST https://api.radarone.com.br/api/telegram/webhook -v

# 4. Testar webhook com secret (deve dar 200)
curl -X POST "https://api.radarone.com.br/api/telegram/webhook?secret=<SEU_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"message":{"chat":{"id":"123"},"text":"test"}}' | jq .

# 5. Verificar webhook no Telegram
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | jq .
```

---

### 5. Validar Integração Completa

#### A) Testar Vinculação Real

1. Acesse: https://radarone.com.br/settings/notifications
2. Digite seu @username do Telegram
3. Clique em **Salvar configurações**
4. Clique em **Vincular Telegram**
5. Copie o código (ex: RADAR-A1B2C3)
6. Abra Telegram e procure @RadarOneBot
7. Envie `/start`
8. Cole o código
9. Deve receber: "✅ Conta vinculada com sucesso!"

#### B) Testar Envio de Mensagem

1. No frontend, clique em **Testar Telegram**
2. Deve receber no Telegram:
   ```
   🎉 Teste de notificação!

   Sua conta do Telegram está vinculada corretamente ao RadarOne.
   ```

---

## 🔍 TROUBLESHOOTING

### Problema 1: Ainda retorna 404 DEPOIS do deploy

**Solução:**

```bash
# 1. Verificar qual versão está rodando
curl https://api.radarone.com.br/api/_meta | jq .version

# Se ainda for "1.0.0", rebuild falhou

# 2. No Render Dashboard:
Settings > Clear Build Cache & Deploy

# 3. Aguardar rebuild completo (pode demorar mais)
```

---

### Problema 2: Version é 1.0.1 mas webhook ainda 404

**Solução:**

```bash
# 1. Verificar se handler explícito está funcionando
# Verificar logs do Render, deve aparecer:
"DEBUG: Hit explicit /api/telegram/webhook handler (BYPASS)"

# Se aparecer, handler está funcionando (good)
# Se NÃO aparecer, requisição nem chegou ao Express

# 2. Verificar Cloudflare não está bloqueando
# Pode ser cache ou firewall do Cloudflare

# 3. Testar direto no Render (sem Cloudflare)
curl -X POST https://radarone-api.onrender.com/api/telegram/webhook?secret=XXX

# Se funcionar direto mas não via api.radarone.com.br:
# Problema é no Cloudflare (verificar Page Rules, Firewall, WAF)
```

---

### Problema 3: Retorna 200 mas não vincula conta

**Solução:**

```bash
# 1. Verificar logs do Telegram service
# Render Logs > procurar por:
"[TelegramService] Processando mensagem do webhook"
"[TelegramService] Código de vínculo gerado"
"[TelegramService] Conta vinculada com sucesso"

# 2. Se não aparecer, verificar:
# - TELEGRAM_BOT_TOKEN está configurado?
# - DATABASE_URL está acessível?
# - Código não expirou? (30 min de validade)

# 3. Testar banco de dados
# Executar query no Neon/Postgres:
SELECT "telegramLinkCode", "telegramLinkExpiresAt"
FROM "NotificationSettings"
WHERE "userId" = '<seu-user-id>';
```

---

## 📊 CHECKLIST PÓS-DEPLOY

### Imediato (primeiros 5 minutos)

- [ ] Build completou sem erros no Render
- [ ] Logs mostram "Server started successfully"
- [ ] GET /api/_meta retorna version: "1.0.1"
- [ ] GET /api/telegram/health retorna status: "ok"
- [ ] POST /api/telegram/webhook retorna 401 (sem secret) ou 200 (com secret)

### Funcional (primeiros 30 minutos)

- [ ] Telegram getWebhookInfo não mostra "last_error_message"
- [ ] Vinculação de conta funciona (RADAR-XXXXX)
- [ ] Teste de envio de mensagem funciona
- [ ] Logs do Render mostram processamento correto

### Limpeza (depois de confirmar funcionamento)

- [ ] Remover handler explícito de debug de server.ts
- [ ] Remover import do TelegramController de server.ts
- [ ] Opcional: Remover /api/_routes (manter _meta e telegram/health)
- [ ] Commit de limpeza e redeploy

---

## 🎯 PRÓXIMOS PASSOS (DEPOIS DE RESOLVER)

### 1. Limpeza do Código

```bash
# Remover handler de debug
# Editar backend/src/server.ts:
# - Remover linhas 218-237 (handler explícito)
# - Remover linha 37 (import TelegramController)

git add backend/src/server.ts
git commit -m "chore: Remove temporary debug handler for telegram webhook

Router is working correctly, debug handler no longer needed."
git push origin main
```

### 2. Monitoramento Contínuo

```bash
# Adicionar ao cron ou monitoring tool:
*/5 * * * * curl -sf https://api.radarone.com.br/api/telegram/health || alert

# Ou usar serviço como:
# - UptimeRobot (https://uptimerobot.com)
# - Better Uptime (https://betteruptime.com)
```

### 3. Migrar para Header Oficial (Opcional)

```bash
# Atualmente usa: ?secret=XXX
# Telegram recomenda: header X-Telegram-Bot-Api-Secret-Token

# Para migrar:
# 1. Reconfigurar webhook com secret_token:
curl -X POST "https://api.telegram.org/bot$TELEGRAM_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://api.radarone.com.br/api/telegram/webhook", "secret_token": "<SECRET>"}'

# 2. Código já suporta! Linha 20 do controller:
# const secretFromTelegramHeader = req.get('x-telegram-bot-api-secret-token');
```

---

## 📞 CONTATOS E REFERÊNCIAS

### Documentação Oficial

- **Telegram Bot API:** https://core.telegram.org/bots/api
- **Telegram Webhooks:** https://core.telegram.org/bots/webhooks
- **Render Docs:** https://render.com/docs
- **Express Router:** https://expressjs.com/en/guide/routing.html

### Logs e Monitoring

- **Render Dashboard:** https://dashboard.render.com
- **Render Logs:** Dashboard > Logs (tempo real)
- **Sentry:** (se configurado) para erros em produção

### Arquivos de Referência

- `TELEGRAM_WEBHOOK_FIX.md` - Documentação completa
- `TELEGRAM_SETUP.md` - Guia de setup inicial do Telegram
- `DEPLOYMENT_CHECKLIST.md` - Checklist geral de deploy

---

## ✅ RESUMO FINAL

### O que foi feito:

1. ✅ Implementado endpoints de diagnóstico (_meta, _routes, telegram/health)
2. ✅ Adicionado handler explícito temporário para webhook
3. ✅ Melhorada validação de secret (3 fontes)
4. ✅ Build local validado (dist/ correto)
5. ✅ Documentação completa criada
6. ✅ Script de teste automatizado criado

### O que você precisa fazer:

1. [ ] Fazer commit e push (comando acima)
2. [ ] Aguardar deploy no Render (~3-5 min)
3. [ ] Executar ./QUICK_TEST.sh
4. [ ] Testar vinculação real no Telegram
5. [ ] Remover handler de debug após confirmar

### Tempo estimado:

- Commit e push: **1 minuto**
- Deploy no Render: **3-5 minutos**
- Testes: **5 minutos**
- **Total: ~10 minutos**

---

**Status:** ✅ Pronto para commit e deploy
**Data:** 2025-12-23
**Versão:** 1.0.1

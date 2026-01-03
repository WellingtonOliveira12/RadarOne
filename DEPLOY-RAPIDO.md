# ⚡ DEPLOY RÁPIDO - 5 Minutos

## 🎯 Objetivo: Colocar Worker em Produção AGORA

---

## Passo 1: Commit e Push (30 segundos)

```bash
git add .
git commit -m "feat: worker production ready - BullMQ, Sentry, Circuit Breaker, Healthcheck"
git push origin main
```

---

## Passo 2: Render - Criar Worker (2 minutos)

1. **Acesse:** https://dashboard.render.com
2. **Clique:** "New +" → "Background Worker"
3. **Configure:**
   - Repository: RadarOne
   - Name: radarone-worker
   - Root Directory: `worker`
   - Build Command: `npm install && npm run playwright:install && npx prisma generate && npm run build`
   - Start Command: `npm start`
   - Plan: Starter ($7/mês) ou Free (para teste)

---

## Passo 3: Env Vars (1 minuto)

**Adicione estas variáveis:**

```
DATABASE_URL = [COPIAR DO BACKEND]
TELEGRAM_BOT_TOKEN = [COPIAR DO BACKEND]
CHECK_INTERVAL_MINUTES = 5
NODE_ENV = production
LOG_LEVEL = info
```

**Opcional (recomendado):**
```
SENTRY_DSN = https://...@sentry.io/...
WORKER_CONCURRENCY = 5
```

**Como obter env vars do backend:**
- Render Dashboard → radarone-backend → Environment → Copy values

---

## Passo 4: Deploy (1 minuto)

1. **Clique:** "Create Background Worker"
2. **Aguarde:** Build (~3 minutos)
3. **Logs devem mostrar:**
   ```
   🚀 RadarOne Worker iniciado
   ✅ Conectado ao banco de dados
   🏥 Health check server listening on port 8080
   ```

---

## Passo 5: Aplicar Migration (30 segundos)

```bash
# Local ou via Cloud Shell
psql $DATABASE_URL -c "
DO \$\$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'MonitorSite' AND e.enumlabel = 'LEILAO'
    ) THEN
        ALTER TYPE \"MonitorSite\" ADD VALUE 'LEILAO';
    END IF;
END\$\$;
"
```

---

## ✅ VALIDAÇÃO (30 segundos)

### Teste 1: Healthcheck
```bash
curl https://radarone-worker.onrender.com/health
# Deve retornar: {"status":"healthy", ...}
```

### Teste 2: Logs
- Render Dashboard → radarone-worker → Logs
- Procure por: "📊 Iniciando ciclo de verificação"

### Teste 3: Banco
```sql
SELECT * FROM monitor_logs ORDER BY created_at DESC LIMIT 5;
-- Deve ter registros recentes
```

---

## 🎉 PRONTO!

**Worker está rodando em produção!**

### Próximos passos opcionais:

**1. Adicionar Redis (escalabilidade):**
- Render → New → Redis → radarone-redis
- Copiar REDIS_URL
- Adicionar em worker env vars
- Restart worker

**2. Configurar Sentry:**
- https://sentry.io → Create Project → Node.js
- Copiar DSN
- Adicionar SENTRY_DSN em worker env vars

**3. Monitoramento:**
- UptimeRobot: https://radarone-worker.onrender.com/health (cada 5 min)

---

## 🆘 Problemas?

### Worker não inicia
- Verificar env vars (DATABASE_URL, TELEGRAM_BOT_TOKEN)
- Ver logs para erro específico

### Scrapers falhando
- Normal nos primeiros minutos (rate limiting)
- Circuit breaker pode estar ativo (aguardar 15 min)

### Sem alertas
- Verificar TELEGRAM_BOT_TOKEN
- Verificar usuários têm telegramChatId configurado
- Verificar monitores têm alertsEnabled=true

---

**Leia RESUMO-EXECUTIVO.md para mais detalhes**
**Leia IMPLEMENTACAO-COMPLETA.md para guia completo**

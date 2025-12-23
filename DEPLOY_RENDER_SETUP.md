# Deploy RadarOne no Render - Guia Completo

## Pré-requisitos

- [x] Conta no Render (https://render.com)
- [x] Conta no Sentry (https://sentry.io) - opcional mas recomendado
- [x] Conta no Google Analytics (https://analytics.google.com) - opcional
- [x] Chave API Resend (https://resend.com) - para emails
- [x] Repositório Git (GitHub/GitLab/Bitbucket)

---

## Arquitetura no Render

```
┌─────────────────────────────────────────────┐
│  RadarOne Production Architecture           │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐    ┌──────────────┐     │
│  │   Frontend   │    │   Backend    │     │
│  │  Static Site │────│  Web Service │     │
│  │  (SPA React) │    │  (Node.js)   │     │
│  └──────────────┘    └──────┬───────┘     │
│                             │              │
│  ┌──────────────┐    ┌──────▼───────┐     │
│  │    Worker    │    │  PostgreSQL  │     │
│  │ (Background) │────│   Database   │     │
│  └──────────────┘    └──────────────┘     │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 1. PostgreSQL Database

### Criar Database

1. Dashboard Render → New → PostgreSQL
2. Configurações:
   - **Name:** `radarone-db`
   - **Database:** `radarone_prod`
   - **User:** (auto-gerado)
   - **Region:** Oregon (us-west) ou mais próximo do Brasil
   - **Plan:** Starter ($7/mês) ou Free (para testes)

3. Após criação, copie:
   - **Internal Database URL** (para conectar services no Render)
   - **External Database URL** (para administração local)

### Exemplo URLs

```
# Internal (usar nos services)
postgresql://radarone_user:***@dpg-abc123/radarone_prod

# External (admin local)
postgresql://radarone_user:***@dpg-abc123.oregon-postgres.render.com/radarone_prod
```

---

## 2. Backend API (Web Service)

### Criar Web Service

1. Dashboard → New → Web Service
2. Conecte seu repositório Git
3. Configurações:

#### Basic Settings
- **Name:** `radarone-backend`
- **Region:** Oregon (mesma do database)
- **Branch:** `main`
- **Root Directory:** `backend`
- **Environment:** Node
- **Build Command:**
  ```bash
  npm install && npm run build && npx prisma generate
  ```
- **Start Command:**
  ```bash
  npm run prisma:migrate:deploy && npm start
  ```

#### Environment Variables

Adicione estas variáveis (Settings → Environment):

```bash
# Database
DATABASE_URL=${{radarone-db.DATABASE_URL}}

# Node
NODE_ENV=production
PORT=10000

# JWT
JWT_SECRET=<gere-uma-chave-segura-aleatoria-min-32-chars>

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=noreply@seudominio.com

# Frontend URL
FRONTEND_URL=https://radarone.com
PUBLIC_URL=https://radarone-backend.onrender.com

# Sentry (opcional)
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx

# Kiwify (Pagamentos)
KIWIFY_API_KEY=seu_kiwify_api_key
KIWIFY_WEBHOOK_SECRET=seu_webhook_secret

# Telegram (Notificações)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

#### Gerar JWT_SECRET

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# OpenSSL
openssl rand -hex 32

# Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

#### Advanced Settings
- **Auto-Deploy:** Yes
- **Health Check Path:** `/health`
- **Plan:** Starter ($7/mês) ou Free

---

## 3. Worker (Background Service)

### Criar Background Worker

1. Dashboard → New → Background Worker
2. Mesmas configurações de repositório do Backend

#### Basic Settings
- **Name:** `radarone-worker`
- **Region:** Oregon
- **Branch:** `main`
- **Root Directory:** `worker`
- **Build Command:**
  ```bash
  npm install && npm run build
  ```
- **Start Command:**
  ```bash
  npm start
  ```

#### Environment Variables

```bash
# Database
DATABASE_URL=${{radarone-db.DATABASE_URL}}

# Worker Config
CHECK_INTERVAL_MINUTES=5
MONITOR_DELAY_MS=2000
REQUEST_DELAY_MS=3000
REQUEST_TIMEOUT_MS=30000
MAX_RETRIES=3

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz

# Backend API
BACKEND_URL=https://radarone-backend.onrender.com
```

#### Cron Jobs (Scheduler)

Os jobs automáticos rodam no Backend (não no Worker). Configurar no Backend:

```javascript
// backend/src/jobs/scheduler.ts
import cron from 'node-cron';

// Jobs configurados:
// - checkTrialExpiring: Diariamente às 9h (America/Sao_Paulo)
// - checkSubscriptionExpired: Diariamente às 10h
// - resetMonthlyQueries: 1º dia do mês às 3h
```

---

## 4. Frontend (Static Site)

### Criar Static Site

1. Dashboard → New → Static Site
2. Conecte repositório

#### Basic Settings
- **Name:** `radarone-frontend`
- **Branch:** `main`
- **Root Directory:** `frontend`
- **Build Command:**
  ```bash
  npm install && npm run build
  ```
- **Publish Directory:** `dist`

#### Environment Variables

```bash
# Backend API (SEM /api no final - os endpoints já incluem /api)
VITE_API_BASE_URL=https://radarone.onrender.com

# Analytics (opcional)
VITE_ANALYTICS_ID=G-XXXXXXXXXX

# Sentry (opcional)
VITE_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
VITE_APP_VERSION=1.0.0
```

**⚠️ IMPORTANTE:** A variável `VITE_API_BASE_URL` deve conter **apenas** a URL base do backend, **sem** o prefixo `/api`. Os endpoints no código já incluem `/api` (ex: `/api/auth/login`), então a URL final será `https://radarone.onrender.com/api/auth/login`.

#### Custom Domain (opcional)

Settings → Custom Domain:
1. Add Custom Domain: `radarone.com` e `www.radarone.com`
2. Configure DNS:
   ```
   Type: CNAME
   Name: www
   Value: radarone-frontend.onrender.com

   Type: A
   Name: @
   Value: [Render IP fornecido]
   ```
3. SSL certificado é automático (Let's Encrypt)

---

## 5. Prisma Migrations em Produção

### Executar Migrations Manualmente

Se precisar rodar migrations manualmente (não recomendado, use auto-deploy):

```bash
# Local com DATABASE_URL de produção
DATABASE_URL="postgresql://..." npm run prisma:migrate:deploy

# Ou via Render Shell
# Dashboard → Backend Service → Shell
npm run prisma:migrate:deploy
```

### Verificar Migrations

```bash
# Listar migrations aplicadas
npx prisma migrate status

# Ver schema atual
npx prisma db pull
```

### Rollback (Emergência)

```bash
# Não há rollback automático no Prisma
# Você precisa criar uma migration reversa manualmente

# 1. Criar migration reversa
npx prisma migrate dev --name rollback_feature_x

# 2. Editar o SQL da migration para reverter mudanças

# 3. Deploy
npm run prisma:migrate:deploy
```

---

## 6. Configurar Alertas no Sentry

### Alerts Automáticos

No Sentry Dashboard:

1. **Project Settings → Alerts → New Alert Rule**

2. **Alert #1: Job Failures**
   ```yaml
   Conditions:
     - When an event is captured
     - AND event.tags.source equals "automated_job"
     - AND event.level equals "error"

   Actions:
     - Send a notification via Email
     - Send to Slack channel #alerts

   Name: "[RadarOne] Job Failure Alert"
   ```

3. **Alert #2: High Error Rate**
   ```yaml
   Conditions:
     - When error count
     - is above 10
     - in 5 minutes

   Actions:
     - Send email to team@radarone.com
     - Create GitHub issue

   Name: "[RadarOne] High Error Rate"
   ```

4. **Alert #3: Specific Job Failures**
   ```yaml
   Conditions:
     - When an event is captured
     - AND event.tags.job is one of:
       * checkTrialExpiring
       * checkSubscriptionExpired
       * resetMonthlyQueries
     - AND event.level equals "error"

   Actions:
     - Send email immediately
     - Post to Slack

   Name: "[RadarOne] Critical Job Failure"
   ```

### Exportar Configuração

Arquivo: `sentry-alerts.json`
```json
{
  "alerts": [
    {
      "name": "[RadarOne] Job Failure Alert",
      "conditions": [
        {
          "id": "sentry.rules.conditions.event_attribute.EventAttributeCondition",
          "attribute": "tags.source",
          "match": "eq",
          "value": "automated_job"
        },
        {
          "id": "sentry.rules.conditions.level.LevelCondition",
          "level": "40"
        }
      ],
      "actions": [
        {
          "id": "sentry.mail.actions.NotifyEmailAction",
          "targetType": "IssueOwners"
        }
      ]
    },
    {
      "name": "[RadarOne] High Error Rate",
      "conditions": [
        {
          "id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
          "value": 10,
          "interval": "5m"
        }
      ],
      "actions": [
        {
          "id": "sentry.mail.actions.NotifyEmailAction",
          "targetType": "Team"
        }
      ]
    }
  ]
}
```

---

## 7. Checklist de Go-Live

### Backend Health Checks

```bash
# Health endpoint
curl https://radarone-backend.onrender.com/health

# Resposta esperada:
{
  "status": "ok",
  "timestamp": "2025-01-10T12:00:00.000Z",
  "uptime": 3600,
  "database": "connected"
}

# Test API
curl https://radarone-backend.onrender.com/api/test

# Resposta esperada:
{
  "success": true,
  "message": "API está funcionando",
  "timestamp": "..."
}
```

### Database

```bash
# Verificar conexão
npx prisma db pull

# Ver migrations
npx prisma migrate status

# Confirmar que todas migrations foram aplicadas
✓ All migrations applied
```

### Frontend

```bash
# Testar build local
cd frontend
npm run build
npm run preview

# Verificar envs
cat .env.production
```

### Jobs Scheduler

```bash
# Verificar logs do scheduler
# Render Dashboard → Backend Service → Logs

# Buscar por:
[SCHEDULER] Iniciando sistema de jobs automáticos
[SCHEDULER] Job checkTrialExpiring agendado
```

### Monitoramento

- [ ] Sentry capturando erros (force um erro de teste)
- [ ] Google Analytics rastreando pageviews
- [ ] Emails sendo enviados (Resend)
- [ ] Webhooks Kiwify configurados
- [ ] Telegram bot respondendo

---

## 8. Manutenção e Troubleshooting

### Logs

```bash
# Backend logs
Render Dashboard → radarone-backend → Logs

# Worker logs
Render Dashboard → radarone-worker → Logs

# Database logs
Render Dashboard → radarone-db → Logs
```

### Restart Services

```bash
# Manual restart
Render Dashboard → Service → Manual Deploy → Clear build cache & deploy
```

### Database Backup

```bash
# Backup automático (Render)
Dashboard → radarone-db → Backups
# Mantém 7 dias de backups automáticos

# Backup manual
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < backup_20250110.sql
```

### Performance

```bash
# Otimizar queries Prisma
npx prisma studio

# Analisar performance
# Sentry → Performance → Web Vitals

# Database queries lentas
# Render Dashboard → radarone-db → Metrics
```

---

## 9. Custos Estimados (Render)

### Plano Starter (Recomendado)

| Service | Plan | Cost/mês |
|---------|------|----------|
| Backend Web Service | Starter | $7 |
| Worker Background | Starter | $7 |
| PostgreSQL Database | Starter | $7 |
| Frontend Static Site | **FREE** | $0 |
| **Total** | | **$21/mês** |

### Plano Free (Para Testes)

| Service | Plan | Cost/mês |
|---------|------|----------|
| Backend Web Service | Free* | $0 |
| Worker Background | Free* | $0 |
| PostgreSQL Database | Free** | $0 |
| Frontend Static Site | Free | $0 |
| **Total** | | **$0/mês** |

*Free tier: 750 horas/mês, sleep após 15min inativo
**Free DB: Expira após 90 dias

---

## 10. Próximos Passos

- [ ] Configurar Custom Domain
- [ ] Ativar CDN (Cloudflare)
- [ ] Configurar rate limiting (backend)
- [ ] Implementar cache (Redis)
- [ ] Monitorar custos (Render + Resend)
- [ ] Setup CI/CD completo
- [ ] Testes de carga
- [ ] Documentação API (Swagger)

---

## Suporte

- **Render Docs:** https://render.com/docs
- **Prisma Docs:** https://www.prisma.io/docs
- **Sentry Docs:** https://docs.sentry.io
- **Resend Docs:** https://resend.com/docs

---

**Data:** Janeiro 2025
**Versão:** 1.0.0
**Mantido por:** Time RadarOne

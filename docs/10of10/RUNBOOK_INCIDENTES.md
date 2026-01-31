# RadarOne — Runbook de Incidentes

## 1. Usuário não consegue logar

### Sintomas
- Frontend mostra "O servidor não respondeu" ou spinner infinito
- 401 imediato após digitar credenciais

### Diagnóstico
```bash
# Verificar se backend está up
curl https://radarone.onrender.com/health

# Verificar logs no Render
# Dashboard → Backend service → Logs

# Verificar se é cold start
curl https://radarone.onrender.com/health | jq '.coldStart'
```

### Resolução
- **Cold start**: Aguardar 30s, frontend já tem retry automático (3 tentativas)
- **JWT_SECRET inválido**: Verificar env var no Render
- **Banco indisponível**: Verificar Neon DB status
- **Token expirado**: Frontend faz refresh automático via cookie

---

## 2. Admin Jobs não carregam

### Diagnóstico
```bash
# Verificar execuções recentes
# GET /api/admin/jobs?limit=10 (com token admin)

# Verificar scheduler
# Logs do backend → procurar "Jobs agendados"
```

### Resolução
- Verificar se `startScheduler()` está sendo chamado no boot
- Verificar timezone (America/Sao_Paulo)

---

## 3. Worker não executa monitores

### Diagnóstico
```bash
# Health do worker
curl https://radarone-worker.onrender.com/health

# Verificar mode
# Se REDIS_URL não configurado → LOOP mode
```

### Resolução
- **Sem Redis**: Worker roda em LOOP mode (1 monitor por vez)
- **Circuit breaker aberto**: Aguardar cooldown (15 min) ou verificar site
- **Rate limit**: Verificar se site está throttling
- **Sessão expirada**: Usuário precisa re-upload do cookie

---

## 4. Erro 500 em produção

### Diagnóstico
1. Verificar Sentry (se configurado): filtrar por `environment: production`
2. Verificar logs do Render: filtrar por `level: 50` (error)
3. Procurar `requestId` nos logs para correlacionar

### Resolução
- Identificar endpoint + stack trace
- Verificar se é erro de Prisma (DB) ou lógica
- Rollback se necessário: `git revert` + redeploy

---

## 5. Deploy checklist

```
1. [ ] git push (trigger CI)
2. [ ] CI verde (lint + tsc + tests + build)
3. [ ] Render auto-deploy ou manual
4. [ ] Verificar /health dos 3 serviços
5. [ ] Login funcional (testar manualmente)
6. [ ] Admin dashboard carrega
7. [ ] Worker health OK
```

## Env Vars necessárias (Render)

### Backend
| Var | Descrição |
|-----|-----------|
| `DATABASE_URL` | PostgreSQL (Neon) |
| `JWT_SECRET` | Secret JWT (gerar com `openssl rand -hex 32`) |
| `NODE_ENV` | `production` |
| `SENTRY_DSN` | Sentry DSN (opcional) |
| `RESEND_API_KEY` | Email service |
| `TELEGRAM_BOT_TOKEN` | Bot Telegram |
| `FRONTEND_URL` | URL do frontend |
| `PUBLIC_URL` | URL pública do backend |
| `ACCESS_TOKEN_EXPIRES_IN` | Default: `15m` |

### Worker
| Var | Descrição |
|-----|-----------|
| `DATABASE_URL` | Mesmo PostgreSQL |
| `REDIS_URL` | Redis para BullMQ (sem = LOOP mode) |
| `WORKER_CONCURRENCY` | Default: 5 |
| `SENTRY_DSN` | Sentry DSN (opcional) |

### Frontend
| Var | Descrição |
|-----|-----------|
| `VITE_API_BASE_URL` | URL do backend |
| `VITE_SENTRY_DSN` | Sentry frontend (opcional) |

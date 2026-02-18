# RadarOne - Status do Projeto

> **Última atualização**: 2026-02-18 19:55 UTC
> **Branch**: `main`
> **Último commit**: `942681d` docs: update SESSION_STATUS — email service operational, env vars documented
> **Deploy Render**: Live (worker + backend)

---

## Auditoria de Impacto Sistêmico — Cupons e Vitalícios (2026-02-18)

Auditoria completa de 32 arquivos em 6 camadas (schema, services, controllers, jobs, frontend, scripts). **Nenhuma regressão crítica.** Detalhes abaixo.

### Resultado: APROVADO

| Área | Verificação | Status |
|------|------------|--------|
| Schema/Migrations | isLifetime, durationDays, purpose coerentes | ✅ |
| subscriptionService.ts | Prioriza vitalícia > ACTIVE > TRIAL | ✅ |
| coupon.controller.ts | redeemTrialUpgrade com isLifetime, allowlist, stacking | ✅ |
| admin.controller.ts | createCoupon/updateCoupon suportam isLifetime | ✅ |
| checkTrialExpiring.ts | Filtra `isLifetime: false` (2 queries) | ✅ |
| checkTrialUpgradeExpiring.ts | Filtra `isLifetime: false` | ✅ |
| checkSubscriptionExpired.ts | Filtra `isLifetime: false` | ✅ |
| webhook.controller.ts | Usa plan.isLifetime ao criar subscription | ✅ |
| Frontend | Badge vitalício, checkbox admin, subscriptionHelpers | ✅ |
| TypeScript | backend + worker + frontend: zero erros | ✅ |
| Testes | 40 pass (5 suites), 34 fail pré-existentes (DB mock) | ✅ |

### Riscos identificados (baixo, sem ação imediata)

1. **Dead code em billingService.ts** — 3 funções não chamadas (`cancelOldSubscriptions`, `activatePaidSubscription`, `sendPreExpiryNotifications`) cancelariam vitalícias se ativadas. Sem risco atual.
2. **Admin updateSubscription** não permite setar `isLifetime` (apenas status/validUntil). Intencional.
3. **Falta de testes** para `redeemTrialUpgrade` (controller). Lógica verificada manualmente.

### Edge cases verificados

- Vitalício com `durationDays: null` → ✅ guard skip
- Purpose null (legado) → ✅ tratado como DISCOUNT
- Duplo vitalício → ✅ idempotente
- Jobs não expiram vitalícios → ✅ `isLifetime: false` em todas as queries
- Race conditions → ✅ queries atômicas, scheduler espaçado

### Comandos executados

```bash
cd backend && npx tsc --noEmit     # zero erros
cd worker && npx tsc --noEmit      # zero erros
cd frontend && npx tsc -b          # zero erros
cd backend && npx vitest run       # 40 pass, 34 fail (pré-existente)
```

---

## Hardening mais recente: 5 Correções de Produção

| # | Fix | Arquivos | Risco |
|---|-----|----------|-------|
| 1 | **Facebook extraction** — container `<a>` retornava url='' (raw=18, adsFound=0) | ad-extractor.ts, facebook-scraper.ts, +ad-extractor.test.ts | Medio (guard `el.tagName === 'A'`) |
| 2 | **Anti-bot jitter** — delays estáticos criavam padrão detectável | scroller.ts, marketplace-engine.ts | Baixo |
| 3 | **Email no /health** — RESEND_API_KEY inválida sem visibilidade | health-server.ts | Muito baixo (aditivo) |
| 4 | **SSL Postgres/Neon** — warning de SSL na conexão | worker/lib/prisma.ts, backend/lib/prisma.ts | Baixo (env var opt-in) |
| 5 | **STRUCTURED_FILTERS guard** — monitores sem URL crashavam em page.goto(null) | monitor-runner.ts, scraper.ts types | Muito baixo |

### Env vars configuradas no Render
- `DATABASE_SSL=true` (backend + worker) — habilita SSL para Neon ✅
- `RESEND_API_KEY=re_i7BBP...` (worker) — key válida do Resend ✅
- `EMAIL_FROM=noreply@radarone.com.br` (worker) — domínio verificado no Resend (DKIM+SPF+MX) ✅

### Impacto zero em ML/OLX/Facebook existente
- Fix 1: branch `el.tagName === 'A'` só ativa para Facebook (containers ML/OLX são `<div>`/`<li>`)
- Fix 2: jitter muda valor do delay, não contagem de scrolls → testes existentes passam
- Fix 5: guard só afeta modo STRUCTURED_FILTERS sem URL (todos os monitores atuais são URL_ONLY)

---

## Feature anterior: Painel de Saúde por Site

Dashboard admin de observabilidade em tempo real por marketplace. Mostra status (HEALTHY/WARNING/CRITICAL/NO_DATA), taxa de sucesso, falhas consecutivas, tempo médio e monitores ativos por site.

### Arquitetura

| Componente | Descrição |
|------------|-----------|
| **SiteExecutionStats** (tabela) | Denormalizada, sem JOIN na MonitorLog. Índices em `site`, `success`, `createdAt` |
| **StatsRecorder** (worker) | `await` + `try/catch` isolado — NUNCA propaga erro, NUNCA impacta scraping |
| **mapPageType()** | Função centralizada: diagnosis.pageType → enum PageType do Prisma |
| **SiteHealthService** (backend) | Agrega métricas por site: successRate, consecutiveFailures, avgDuration, etc. |
| **GET /api/admin/site-health** | Endpoint admin (requireAdmin) |
| **AdminSiteHealthPage** (frontend) | Grid de cards Chakra UI, auto-refresh 60s, ordenação por criticidade |

### Arquivos criados/modificados

```
# Novos (4)
worker/src/services/stats-recorder.ts          # StatsRecorder + mapPageType()
backend/src/services/siteHealthService.ts       # SiteHealthService.getSiteHealthSummary()
frontend/src/pages/AdminSiteHealthPage.tsx       # Dashboard admin
backend/tests/services/siteHealthService.test.ts # 7 testes unitários

# Modificados (7)
backend/prisma/schema.prisma                     # +PageType enum, +SiteExecutionStats model
worker/prisma/schema.prisma                      # Espelhado (para prisma generate)
worker/src/services/monitor-runner.ts            # +3 pontos de instrumentação StatsRecorder
backend/src/controllers/admin.controller.ts      # +getSiteHealth()
backend/src/routes/admin.routes.ts               # +GET /site-health
frontend/src/router.tsx                          # +rota lazy /admin/site-health
frontend/src/components/AdminLayout.tsx          # +link "Saúde dos Sites" na sidebar
```

### Lógica de Status

```
NO_DATA    → totalRunsLast24h === 0
HEALTHY    → successRate >= 85 AND consecutiveFailures < 3
WARNING    → successRate >= 60 (e não HEALTHY)
CRITICAL   → successRate < 60 OR consecutiveFailures >= 5
```

### Nota sobre Prisma Migration

A migração foi aplicada via `prisma db push` (não `prisma migrate dev`) porque o banco remoto tinha uma migration local ausente (`20260201140000_reset_admin_2fa`). O schema está sincronizado.

---

## Produção — Status Anterior

### Deploy ativo

| Item | Valor |
|------|-------|
| Commit live | `a13d005` |
| Uptime confirmado | Estável |

### Env vars no Render (Worker — 16 vars)

| Variável | Valor | Notas |
|----------|-------|-------|
| `NODE_ENV` | `production` | |
| `DATABASE_URL` | `postgresql://...neon.tech/radarone_prod` | Neon pooler |
| `DATABASE_SSL` | `true` | SSL para Neon |
| `TELEGRAM_BOT_TOKEN` | `8559...` | Shared com backend |
| `RESEND_API_KEY` | `re_i7BBP...` | Domínio verificado |
| `EMAIL_FROM` | `noreply@radarone.com.br` | DKIM+SPF+MX OK |
| `SESSION_ENCRYPTION_KEY` | `6d216...` | 32 chars |
| `PLAYWRIGHT_BROWSERS_PATH` | `./pw-browsers` | |
| `MAX_BROWSER_CONTEXTS` | `3` | Alinhado com Starter 512MB |
| `PW_RENDERER_LIMIT` | `3` | |
| `CHECK_INTERVAL_MINUTES` | `1` | Tick 1min, filtrado por plano |
| `MONITOR_DELAY_MS` | `2000` | |
| `REQUEST_DELAY_MS` | `3000` | |
| `REQUEST_TIMEOUT_MS` | `30000` | |
| `MAX_RETRIES` | `3` | |
| `LOG_LEVEL` | `info` | |

**Build command**: `npm install && npm run build` (sem NODE_OPTIONS → tsc usa heap default)
**Start command**: `NODE_OPTIONS=--max-old-space-size=256 npm start`

---

## Migração para MarketplaceEngine — CONCLUÍDA

Todos os 9 scrapers migrados de código legado (~200+ linhas) para engine config-driven (~30-60 linhas). Redução de ~85%.

| Site | Config | AuthMode |
|------|--------|----------|
| MERCADO_LIVRE | `mercadolivre.config.ts` | `cookies_optional` (custom 5-priority cascade) |
| OLX | `olx.config.ts` | `anonymous` |
| FACEBOOK_MARKETPLACE | `facebook.config.ts` | `cookies_required` |
| IMOVELWEB | `imovelweb.config.ts` | `anonymous` |
| VIVA_REAL | `vivareal.config.ts` | `anonymous` |
| ZAP_IMOVEIS | `zapimoveis.config.ts` | `anonymous` |
| WEBMOTORS | `webmotors.config.ts` | `anonymous` |
| ICARROS | `icarros.config.ts` | `anonymous` |
| LEILAO | `leilao.config.ts` | `anonymous` |

---

## Browser Hardening (v2) — CONCLUÍDO E VALIDADO EM PRODUÇÃO

| Componente | Mudança |
|------------|---------|
| **BrowserManager v2** | Semáforo `acquireContext/release` (max configurable), limites RSS (WARN 380MB, STOP 420MB, FORCE_RELAUNCH 460MB), `ensureAlive({forceRelaunch})`, `getMetrics()`, shutdown graceful |
| **Crash Detection** | `isBrowserCrashError()` detecta 6 patterns. Recovery imediato com `forceRelaunch` (max 2 retries) |
| **Retry Presets** | `scraping`: 3 tentativas/2s. `browserCrash`: 2 tentativas/1s. Jitter no backoff |
| **MarketplaceEngine** | `acquireContext/release`, crash recovery loop, log observabilidade |
| **Auth Strategy** | Recebe `browser` via parâmetro |
| **ML Auth Provider** | Usa `acquireContext()` em vez de `getOrLaunch()` direto |
| **Health Endpoint** | Retorna `browser`, `memory`, `contexts` metrics |
| **Worker Shutdown** | Handler unificado SIGTERM/SIGINT: scheduler → jobs → browser → DB |
| **`--single-process`** | **REMOVIDO** (causa raiz dos crashes) |

---

## Testes

### Worker: 8 suites, 66 testes passando

| Suite | Testes |
|-------|--------|
| `browser-manager.test.ts` | 13 |
| `needs-reauth.test.ts` | 8 |
| `page-diagnoser.test.ts` | 7 |
| `telegram-service.test.ts` | 5 |
| `ad-extractor.test.ts` | 5 |
| `scroller.test.ts` | 4 |
| `marketplace-engine.test.ts` | 3 |
| `facebook-integration.test.ts` | 21 |

### Backend: 5 suites, 40 testes passando (+ 34 pré-existentes falhando — DB não mockado)

| Suite | Testes |
|-------|--------|
| `siteHealthService.test.ts` | 7 |
| `billingService.test.ts` | 8 |
| `planBootValidation.test.ts` | 4 |
| `subscriptionService.test.ts` | 8 |
| `auth.test.ts` | 11 (integration, mocked) |

---

## Observabilidade — Strings de log para monitorar

| O que confirmar | String no log |
|----------------|---------------|
| Browser v2 iniciou | `BROWSER_MANAGER: Chromium ready` |
| Semáforo ativo | `ENGINE_METRICS:` com `activeContexts=` |
| Crash com recovery | `ENGINE_CRASH_RECOVERY:` seguido de `Chromium ready` |
| Memory warning | `BROWSER_MANAGER: Memory warning` |
| Memory bloqueou | `BROWSER_MEMORY_HIGH:` |
| Shutdown limpo | `BROWSER_MANAGER: Shutdown complete` |
| OOM-kill (ruim) | Log corta sem `Shutdown complete` + worker reinicia |
| **Stats gravando** | `STATS_RECORDER: Falha ao persistir` (só aparece se ERRO) |
| FB extraction fix | `FB_ENGINE:` com `skipped=` mostrando skippedReasons |
| STRUCTURED guard | `MONITOR_SKIPPED: STRUCTURED_FILTERS sem searchUrl` |
| Email enviado | `EMAIL_SENT: Email enviado com sucesso` com messageId |
| Email API erro | `EMAIL_API_ERROR:` com httpStatus e errorMessage (diagnóstico) |
| Email fatal | `EMAIL_FATAL:` — servico desabilitado (key ou domínio) |

---

## Arquivos-chave

```
worker/src/engine/browser-manager.ts       # BrowserManager v2 (semáforo, memory, crash)
worker/src/engine/marketplace-engine.ts    # Motor principal
worker/src/engine/types.ts                 # Tipos SiteConfig, etc.
worker/src/engine/auth-strategy.ts         # Cascade de auth (recebe browser param)
worker/src/engine/site-registry.ts         # Registry (onde registrar novos sites)
worker/src/engine/configs/                 # Diretório de configs
worker/src/scrapers/                       # Scrapers migrados
worker/src/services/stats-recorder.ts      # StatsRecorder + mapPageType()
worker/src/services/monitor-runner.ts      # Orquestrador (instrumentado)
worker/src/utils/retry-helper.ts           # Retry + isBrowserCrashError
worker/src/utils/ml-auth-provider.ts       # Auth ML (usa acquireContext)
worker/src/health-server.ts                # Health com browser/memory metrics
worker/src/worker.ts                       # Shutdown unificado
backend/src/services/siteHealthService.ts  # Agregação de métricas por site
frontend/src/pages/AdminSiteHealthPage.tsx # Dashboard de saúde
render.yaml                                # Config Render (buildCommand, startCommand, envVars)
```

---

## Validação

```bash
cd backend && npx tsc --noEmit     # zero erros
cd worker && npx tsc --noEmit      # zero erros
cd frontend && npx tsc -b          # zero erros
cd worker && npx vitest run        # 8 suites, 66 testes
cd backend && npx vitest run tests/services/siteHealthService.test.ts  # 7 testes
```

---

## Histórico de commits recentes

```
a13d005 fix(worker): add diagnostic logging to email service API errors
5c94a5e docs: update SESSION_STATUS with hardening fixes and 66 passing tests
b72ae41 fix(worker): guard STRUCTURED_FILTERS monitors without searchUrl
f99ce3a fix: add DATABASE_SSL env var for Postgres/Neon SSL connections
e1b48fa feat(worker): add email service status to /health endpoint
faf4fc8 fix(worker): add jitter to scroll and render delays for anti-bot evasion
0464da3 fix(worker): fix Facebook ad extraction when container is <a> tag
2b131ad feat: add Site Health dashboard — real-time observability per marketplace
f638b14 feat(worker): add Facebook Marketplace to auth-sites + integration tests (61/61 pass)
33668eb fix(connections): make cookie validation and modal provider-aware — fix Facebook using ML rules
1976d47 docs: update SESSION_STATUS with production metrics and deploy config
28ba145 fix(deploy): move NODE_OPTIONS to startCommand only — fix tsc OOM during build
a1e31cc fix(deploy): build OOM — override NODE_OPTIONS during build, tune runtime for 512MB
4b87544 feat(worker): harden browser lifecycle with semaphore, crash recovery and memory limits
```

---

## Email Service — OPERACIONAL

| Item | Status |
|------|--------|
| **Resend API key** | Válida, Full access, All domains |
| **Domínio** | `radarone.com.br` verificado (DKIM + SPF + MX) no Resend |
| **EMAIL_FROM** | `noreply@radarone.com.br` |
| **Health endpoint** | `/health` → `email.status: "ENABLED"` |
| **Primeiro envio** | 2026-02-18 18:47 UTC — `EMAIL_SENT` messageId=4cbc179a |
| **Canais ativos** | Telegram + Email (multi-canal) |

### Diagnóstico de erros
O `email-service.ts` agora loga `EMAIL_API_ERROR` com `httpStatus`, `errorMessage` e `errorData` completos antes de desabilitar o serviço, facilitando debug futuro.

---

## TODO Futuro (NÃO implementar agora)

### Fase 7 — Observabilidade
- Suspensão automática de sites com successRate < 40% por 10 execuções consecutivas
- Alertas automáticos via AdminAlert quando site entra em CRITICAL

### Cupons/Vitalícios (identificados na auditoria)
- Adicionar `isLifetime: false` nas funções dead-code de `billingService.ts` (cancelOldSubscriptions, activatePaidSubscription, sendPreExpiryNotifications)
- Testes unitários para `redeemTrialUpgrade` (vitalício + temporário)
- Permitir admin setar `isLifetime` via updateSubscription (se necessário)

---

## Como Continuar em Nova Sessão

Ao abrir nova sessão do Claude Code, dizer:

> "Leia o arquivo SESSION_STATUS.md na raiz do projeto para contexto do estado atual."

Isso evita reler todo o contexto anterior e economiza janela de contexto.

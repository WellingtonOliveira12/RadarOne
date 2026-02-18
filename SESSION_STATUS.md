# RadarOne - Status do Projeto

> **Última atualização**: 2026-02-18 13:10 UTC
> **Branch**: `main`
> **Último commit**: `2b131ad feat: add Site Health dashboard — real-time observability per marketplace`
> **Deploy Render**: Pendente push (commit feito e pushado)

---

## Feature mais recente: Painel de Saúde por Site

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
| Commit live anterior | `f638b14` |
| Uptime confirmado | Estável |

### Env vars no Render (Worker)

| Variável | Valor | Onde |
|----------|-------|------|
| `MAX_BROWSER_CONTEXTS` | `3` | Env var |
| `PW_RENDERER_LIMIT` | `3` | Env var |
| `NODE_OPTIONS` | `--max-old-space-size=256` | **startCommand** (NÃO env var) |

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

### Worker: 7 suites, 61 testes passando

| Suite | Testes |
|-------|--------|
| `browser-manager.test.ts` | 13 |
| `needs-reauth.test.ts` | 8 |
| `page-diagnoser.test.ts` | 7 |
| `telegram-service.test.ts` | 5 |
| `scroller.test.ts` | 4 |
| `marketplace-engine.test.ts` | 3 |
| `facebook-integration.test.ts` | 21 |

### Backend: 5 suites, 47 testes passando (+ 34 pré-existentes falhando em telegramService)

| Suite | Testes |
|-------|--------|
| `siteHealthService.test.ts` | 7 |
| `billingService.test.ts` | 8 |
| `planBootValidation.test.ts` | 4 |
| `subscriptionService.test.ts` | 5 |
| `auth.test.ts` | 23 |

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
cd worker && npx vitest run        # 7 suites, 61 testes
cd backend && npx vitest run tests/services/siteHealthService.test.ts  # 7 testes
```

---

## Histórico de commits recentes

```
2b131ad feat: add Site Health dashboard — real-time observability per marketplace
f638b14 feat(worker): add Facebook Marketplace to auth-sites + integration tests (61/61 pass)
33668eb fix(connections): make cookie validation and modal provider-aware — fix Facebook using ML rules
1976d47 docs: update SESSION_STATUS with production metrics and deploy config
28ba145 fix(deploy): move NODE_OPTIONS to startCommand only — fix tsc OOM during build
a1e31cc fix(deploy): build OOM — override NODE_OPTIONS during build, tune runtime for 512MB
4b87544 feat(worker): harden browser lifecycle with semaphore, crash recovery and memory limits
```

---

## TODO Futuro (Fase 7 — NÃO implementar agora)

- Suspensão automática de sites com successRate < 40% por 10 execuções consecutivas
- Alertas automáticos via AdminAlert quando site entra em CRITICAL

---

## Como Continuar em Nova Sessão

Ao abrir nova sessão do Claude Code, dizer:

> "Leia o arquivo SESSION_STATUS.md na raiz do projeto para contexto do estado atual."

Isso evita reler todo o contexto anterior e economiza janela de contexto.

# RadarOne - Status do Projeto

> **Última atualização**: 2026-02-17 22:30 UTC
> **Branch**: `main`
> **Último commit**: `28ba145 fix(deploy): move NODE_OPTIONS to startCommand only — fix tsc OOM during build`
> **Deploy Render**: **LIVE** desde 21:15 UTC — estável +1h, zero crashes

---

## Produção — Status Atual

### Deploy ativo

| Item | Valor |
|------|-------|
| Commit live | `28ba145` |
| Instância | `srv-d5jv813e5dus73a8rv8g-tjm8m` |
| Uptime confirmado | +1h09min sem crash, OOM ou restart |
| Erro "Target page, context or browser has been closed" | **ELIMINADO** (0 ocorrências) |

### Métricas de runtime (16 samples, +1h)

| Métrica | Min | Max | Média |
|---------|-----|-----|-------|
| RSS (MB) | 165 | 172 | **168** |
| Heap Used (MB) | 43 | 54 | **49** |
| Scrape duration (ms) | 7458 | 10475 | **8753** |
| activeContexts | 0 | 0 | 0 |
| Crashes | 0 | 0 | **0** |

### Env vars no Render (Worker)

| Variável | Valor | Onde |
|----------|-------|------|
| `MAX_BROWSER_CONTEXTS` | `3` | Env var |
| `PW_RENDERER_LIMIT` | `3` | Env var |
| `NODE_OPTIONS` | `--max-old-space-size=256` | **startCommand** (NÃO env var) |

**Build command**: `npm install && npm run build` (sem NODE_OPTIONS → tsc usa heap default)
**Start command**: `NODE_OPTIONS=--max-old-space-size=256 npm start`

### Problema resolvido: Build OOM

`NODE_OPTIONS=--max-old-space-size=384` como env var limitava o `tsc` durante build, causando OOM.
Fix: moveu para `startCommand` inline. Build usa heap default (~4GB), runtime usa 256MB.

### Rollback plan

| Cenário | Ação |
|---------|------|
| Worker instável | Render → Deploys → Rollback para `4b87544` |
| Build falha | Verificar se `NODE_OPTIONS` não voltou como env var |
| Git revert | `git revert 28ba145 && git push` |

### Se houver OOM futuro — redução em camadas

1. `MAX_BROWSER_CONTEXTS=2` → aguardar 15min
2. `NODE_OPTIONS=--max-old-space-size=192` (no startCommand) → aguardar 15min
3. `MAX_BROWSER_CONTEXTS=1` → processamento sequencial
4. Upgrade Render para Standard (2GB)

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

6 suites, 40 testes passando:

| Suite | Testes |
|-------|--------|
| `browser-manager.test.ts` | 13 (crash detection, semáforo, metrics, ensureAlive) |
| `needs-reauth.test.ts` | 8 |
| `page-diagnoser.test.ts` | 7 |
| `telegram-service.test.ts` | 5 |
| `scroller.test.ts` | 4 |
| `marketplace-engine.test.ts` | 3 |

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
worker/src/utils/retry-helper.ts           # Retry + isBrowserCrashError
worker/src/utils/ml-auth-provider.ts       # Auth ML (usa acquireContext)
worker/src/health-server.ts                # Health com browser/memory metrics
worker/src/worker.ts                       # Shutdown unificado
worker/tests/engine/browser-manager.test.ts # Testes BrowserManager
render.yaml                                # Config Render (buildCommand, startCommand, envVars)
```

---

## Validação

```bash
cd worker && npx tsc --noEmit     # zero erros
cd worker && npx vitest run       # 6 suites, 40 testes passando
```

---

## Histórico de commits recentes

```
28ba145 fix(deploy): move NODE_OPTIONS to startCommand only — fix tsc OOM during build
a1e31cc fix(deploy): build OOM — override NODE_OPTIONS during build, tune runtime for 512MB
4b87544 feat(worker): harden browser lifecycle with semaphore, crash recovery and memory limits
52d6f82 fix(audit): ML browser leak, Telegram HTML safety, NEEDS_REAUTH tests
3b322fe fix(notifications): re-notify user on NEEDS_REAUTH with 6h cooldown
408d93e fix(worker): resolve OOM by sharing single Chromium instance
95aa2c0 feat(engine): migrate all 9 scrapers to MarketplaceEngine architecture
```

---

## Como Continuar em Nova Sessão

Ao abrir nova sessão do Claude Code, dizer:

> "Leia o arquivo SESSION_STATUS.md na raiz do projeto para contexto do estado atual."

Isso evita reler todo o contexto anterior e economiza janela de contexto.

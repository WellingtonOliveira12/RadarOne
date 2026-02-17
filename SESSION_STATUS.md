# RadarOne - Status do Projeto

> **Última atualização**: 2026-02-17
> **Branch**: `main`
> **Último commit**: `4b87544 feat(worker): harden browser lifecycle with semaphore, crash recovery and memory limits`

---

## Migração para MarketplaceEngine — CONCLUÍDA

Todos os 9 scrapers foram migrados de código legado (~200+ linhas cada) para o padrão engine config-driven (~30-60 linhas cada). Redução de ~85% no código.

| Site | Config | Registry | Scraper | AuthMode |
|------|--------|----------|---------|----------|
| MERCADO_LIVRE | `mercadolivre.config.ts` | Registrado | ~61 linhas | `cookies_optional` (custom 5-priority cascade) |
| OLX | `olx.config.ts` | Registrado | ~32 linhas | `anonymous` |
| FACEBOOK_MARKETPLACE | `facebook.config.ts` | Registrado | ~45 linhas | `cookies_required` |
| IMOVELWEB | `imovelweb.config.ts` | Registrado | ~32 linhas | `anonymous` |
| VIVA_REAL | `vivareal.config.ts` | Registrado | ~32 linhas | `anonymous` |
| ZAP_IMOVEIS | `zapimoveis.config.ts` | Registrado | ~32 linhas | `anonymous` |
| WEBMOTORS | `webmotors.config.ts` | Registrado | ~32 linhas | `anonymous` |
| ICARROS | `icarros.config.ts` | Registrado | ~32 linhas | `anonymous` |
| LEILAO | `leilao.config.ts` | Registrado | ~33 linhas | `anonymous` |

---

## Browser Hardening (v2) — CONCLUÍDO

Causa raiz resolvida: `--single-process` no Chromium fazia todos renderers rodarem no mesmo processo. Crash em qualquer página matava o browser inteiro.

### Mudanças implementadas

| Componente | Mudança |
|------------|---------|
| **BrowserManager v2** | Semáforo `acquireContext/release` (max 5 concurrent), limites RSS (WARN 380MB, STOP 420MB, FORCE_RELAUNCH 460MB), `ensureAlive({forceRelaunch})`, `getMetrics()`, shutdown graceful |
| **Crash Detection** | `isBrowserCrashError()` detecta 6 patterns Playwright. Recovery imediato com `forceRelaunch` (max 2 retries) em vez de backoff longo |
| **Retry Presets** | `scraping`: 3 tentativas/2s (era 7/3s). Novo `browserCrash`: 2 tentativas/1s. Jitter no backoff |
| **MarketplaceEngine** | Usa `acquireContext/release`, crash recovery loop, log de observabilidade (RSS, heap, contexts) |
| **Auth Strategy** | Recebe `browser` via parâmetro (não chama `getOrLaunch` direto) |
| **ML Auth Provider** | Usa `acquireContext()` em vez de `getOrLaunch()` direto |
| **Health Endpoint** | Retorna `browser`, `memory`, `contexts` metrics |
| **Worker Shutdown** | Handler unificado SIGTERM/SIGINT: scheduler → jobs → browser → DB |

### Flags de ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `MAX_BROWSER_CONTEXTS` | `5` | Máximo de contextos simultâneos |
| `PW_RENDERER_LIMIT` | não definido | Se definido, aplica `--renderer-process-limit` |

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

## Arquitetura do Engine (worker/src/engine/)

| Arquivo | Função |
|---------|--------|
| `types.ts` | Tipos centrais: SiteConfig, PageDiagnosis, ExtractionResult, AuthMode |
| `marketplace-engine.ts` | Motor principal: acquire → auth → anti-detection → nav → diagnosis → scroll → extract → release |
| `browser-manager.ts` | Singleton Chromium com semáforo, memory limits, crash recovery |
| `auth-strategy.ts` | Cascade de autenticação: custom provider → DB cookies → anonymous |
| `page-diagnoser.ts` | Diagnóstico: CONTENT, BLOCKED, CAPTCHA, LOGIN_REQUIRED, CHECKPOINT, NO_RESULTS, EMPTY, UNKNOWN |
| `ad-extractor.ts` | Extração de anúncios com validação de URL, ID, título, preço |
| `anti-detection.ts` | Anti-bot: stealth scripts, route blocking, viewport randomizado |
| `scroller.ts` | Scroll fixo ou adaptativo (infinite scroll) |
| `container-waiter.ts` | Espera por container de resultados com fallback progressivo |
| `session-pool.ts` | Pool de sessões com health scoring |
| `site-registry.ts` | Registry de sites com auto-boot |
| `configs/` | 9 configs site-specific |

---

## Arquivos-chave para referência rápida

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
```

---

## Validação

```bash
cd worker && npx tsc --noEmit     # zero erros
cd worker && npx vitest run       # 40 testes passando
```

---

## Como Continuar em Nova Sessão

Ao abrir nova sessão do Claude Code, dizer:

> "Leia o arquivo SESSION_STATUS.md na raiz do projeto para contexto do estado atual."

Isso evita reler todo o contexto anterior e economiza janela de contexto.

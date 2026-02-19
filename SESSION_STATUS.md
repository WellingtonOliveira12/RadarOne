# RadarOne - Status do Projeto

> **Última atualização**: 2026-02-18 23:30 UTC
> **Branch**: `main`
> **Último commit**: `8869ed0` feat(monitors): global country list + remove redundant filters
> **Deploy Render**: Live (worker + backend)

---

## PR: Produto Global — i18n + Notificações + Países + Filtros (2026-02-18)

### Resumo

4 melhorias para evolução do RadarOne para produto global, em 3 commits:

| # | Feature | Arquivos | Migration | Risco |
|---|---------|----------|-----------|-------|
| 1 | **i18n PT/EN/ES** — react-i18next + LanguageSwitcher com bandeiras na navbar | 9 (6 novos + 3 mod) | Não | Baixo |
| 2 | **Telegram toggle** — pausar sem desconectar + validação "ao menos 1 canal" | 2 modificados | Não | Baixo |
| 3 | **Países global** — select com 249 nações (i18n-iso-countries) + remove filtros duplicados | 10 (2 novos + 8 mod) | Sim (ALTER COLUMN) | Médio |

### Commits

```
54cb988 feat(i18n): add pt-BR/en/es translations + language switcher
20c72ad feat(notifications): telegram toggle + channel validation
8869ed0 feat(monitors): global country list + remove redundant filters
```

### Arquivos novos

```
frontend/src/i18n/config.ts                    # Configuração i18next (fallback pt-BR, localStorage)
frontend/src/i18n/locales/pt-BR.json           # Traduções português
frontend/src/i18n/locales/en.json              # Traduções inglês
frontend/src/i18n/locales/es.json              # Traduções espanhol
frontend/src/components/LanguageSwitcher.tsx    # Seletor 🇧🇷/🇺🇸/🇪🇸 (Chakra UI Menu)
frontend/src/utils/countries.ts                # Helper i18n-iso-countries (pt-BR→pt mapping)
backend/prisma/migrations/20260218200000_make_country_nullable/migration.sql
```

### Arquivos modificados

```
frontend/package.json                           # +react-i18next +i18next +i18next-browser-languagedetector +i18n-iso-countries
frontend/src/main.tsx                           # Import i18n config
frontend/src/components/AppLayout.tsx           # LanguageSwitcher na navbar + strings i18n
frontend/src/pages/NotificationSettingsPage.tsx # Toggle Telegram independente + i18n
frontend/src/pages/MonitorsPage.tsx             # Select global de países + remove city/state de filtros + i18n
backend/src/controllers/notification.controller.ts # telegramEnabled explícito, não apaga vínculo
backend/src/controllers/monitorController.ts    # Validação ISO-2 com 400 + normaliza '' → null
backend/src/services/monitorService.ts          # Types country?: string | null
backend/prisma/schema.prisma                    # country String → String? (nullable)
worker/src/engine/location-matcher.ts           # null → early return, outros países só state/city
worker/src/engine/ad-extractor.ts               # Remove check WORLDWIDE
worker/src/types/scraper.ts                     # country?: string | null
worker/tests/engine/location-matcher.test.ts    # +6 testes novos (null, empty, outros países)
```

### Decisões de design

- **country NULL no DB** = sem filtro (worldwide). Frontend usa `''`, API normaliza para `null`
- **Country inválido** retorna 400 (não salva null silenciosamente)
- **Uppercase antes de validar**: `country = country?.trim().toUpperCase()` aceita 'br'/'us'
- **Telegram desativado preserva vínculo**: chatId e username intactos (apenas pausa envio)
- **Validação "ao menos 1 canal"**: backend e frontend
- **Location matcher para países sem patterns** (não BR/US): apenas state/city, sem match por nome do país
- **i18n-iso-countries**: mapeamento `pt-BR → pt`, `en → en`, `es → es` para locales da lib
- **StructuredFilters**: removido `city` e `state` da interface (ficam só em Localização)
- **Migração existente WORLDWIDE → NULL**: migration SQL converte rows existentes

### Validação

```
worker: tsc --noEmit ✅ zero erros
backend: tsc --noEmit ✅ zero erros
frontend: tsc --noEmit ✅ zero erros
worker: vitest run ✅ 9 suites, 87 testes (incluindo 6 novos do location-matcher)
```

### Produção (deploy)

```bash
# Migration (já aplicada):
npx prisma migrate deploy
# Resultado: ALTER COLUMN country DROP NOT NULL + DROP DEFAULT
# + UPDATE monitors SET country = NULL WHERE country = 'WORLDWIDE'
```

---

## PR anterior: Email Opcional + Default URL + Filtro Localização Global (2026-02-18)

### Resumo

3 features implementadas em 4 commits lógicos:

| # | Feature | Arquivos | Migration | Risco |
|---|---------|----------|-----------|-------|
| 1 | **Email opcional** — toggle para desabilitar email (requer Telegram ativo) | 3 modificados | Não | Baixo |
| 2 | **Default URL** — fallback defensivo por plataforma no worker | 1 novo + 1 mod | Não | Baixo |
| 3 | **Localização global** — filtro country/state/city por monitor (best-effort) | 2 novos + 5 mod | Sim (ADD COLUMN) | Médio |
| 4 | **Testes** — location-matcher.test.ts (14 testes) | 1 novo | Não | Nenhum |

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

---

## Testes

### Worker: 9 suites, 87 testes passando

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
| `location-matcher.test.ts` | 20 |

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
worker/src/engine/location-matcher.ts      # Matcher de localização (country/state/city)
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
frontend/src/i18n/config.ts               # Configuração i18next
frontend/src/i18n/locales/                # Traduções PT/EN/ES
frontend/src/components/LanguageSwitcher.tsx # Seletor de idioma
frontend/src/utils/countries.ts           # Helper i18n-iso-countries
render.yaml                                # Config Render (buildCommand, startCommand, envVars)
```

---

## Produção — Status

### Deploy ativo

| Item | Valor |
|------|-------|
| Commit live | `8869ed0` |
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

## Email Service — OPERACIONAL

| Item | Status |
|------|--------|
| **Resend API key** | Válida, Full access, All domains |
| **Domínio** | `radarone.com.br` verificado (DKIM + SPF + MX) no Resend |
| **EMAIL_FROM** | `noreply@radarone.com.br` |
| **Health endpoint** | `/health` → `email.status: "ENABLED"` |
| **Primeiro envio** | 2026-02-18 18:47 UTC — `EMAIL_SENT` messageId=4cbc179a |
| **Canais ativos** | Telegram + Email (multi-canal) |

---

## TODO Futuro (NÃO implementar agora)

### Fase 7 — Observabilidade
- Suspensão automática de sites com successRate < 40% por 10 execuções consecutivas
- Alertas automáticos via AdminAlert quando site entra em CRITICAL

### i18n — Próximas telas
- Traduzir telas públicas (Landing, Planos, Login, Register, FAQ, Manual, Contato)
- Traduzir dashboard
- Traduzir admin pages

### Cupons/Vitalícios (identificados na auditoria)
- Testes unitários para `redeemTrialUpgrade` (vitalício + temporário)
- Permitir admin setar `isLifetime` via updateSubscription (se necessário)

---

## Como Continuar em Nova Sessão

Ao abrir nova sessão do Claude Code, dizer:

> "Leia o arquivo SESSION_STATUS.md na raiz do projeto para contexto do estado atual."

Isso evita reler todo o contexto anterior e economiza janela de contexto.

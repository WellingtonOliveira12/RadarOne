# RadarOne - Status da Migração para MarketplaceEngine

> **Última atualização**: 2026-02-17
> **Objetivo**: Migrar todos os 9 scrapers legados para o novo MarketplaceEngine (arquitetura config-driven)

---

## Arquitetura do Engine (worker/src/engine/)

O engine já está 100% implementado com os seguintes componentes:

| Arquivo | Função |
|---------|--------|
| `types.ts` | Tipos centrais: SiteConfig, PageDiagnosis, ExtractionResult, AuthMode |
| `marketplace-engine.ts` | Motor principal: auth → anti-detection → nav → diagnosis → scroll → extract |
| `auth-strategy.ts` | Cascade de autenticação: custom provider → DB cookies → anonymous |
| `page-diagnoser.ts` | Diagnóstico de página: CONTENT, BLOCKED, CAPTCHA, LOGIN_REQUIRED, etc. |
| `ad-extractor.ts` | Extração de anúncios com validação de URL, ID, título, preço |
| `anti-detection.ts` | Anti-bot: stealth scripts, route blocking, viewport randomizado |
| `scroller.ts` | Scroll fixo ou adaptativo (infinite scroll) |
| `container-waiter.ts` | Espera por container de resultados com fallback progressivo |
| `session-pool.ts` | Pool de sessões com health scoring (+100 sucesso, -20 bloqueio, etc.) |
| `site-registry.ts` | Registry de sites com auto-boot |

---

## Status por Site

### ✅ CONCLUÍDO (PR1-PR3)

| Site | Config | Registry | Scraper Migrado | Notas |
|------|--------|----------|-----------------|-------|
| MERCADO_LIVRE | ✅ `mercadolivre.config.ts` | ✅ Registrado | ✅ ~61 linhas | Auth custom com 5-priority cascade |
| OLX | ✅ `olx.config.ts` | ✅ Registrado | ✅ ~32 linhas | AuthMode: anonymous |
| FACEBOOK_MARKETPLACE | ✅ `facebook.config.ts` | ✅ Registrado | ✅ ~45 linhas | AuthMode: cookies_required, scroll adaptativo |

### 🟡 PR4 - Real Estate (Configs existem, scrapers NÃO migrados)

| Site | Config | Registry | Scraper Migrado | Notas |
|------|--------|----------|-----------------|-------|
| IMOVELWEB | ✅ `imovelweb.config.ts` | ❌ NÃO registrado | ❌ Legado (239 linhas) | AuthMode: anonymous |
| VIVA_REAL | ✅ `vivareal.config.ts` | ❌ NÃO registrado | ❌ Legado (234 linhas) | AuthMode: anonymous |
| ZAP_IMOVEIS | ✅ `zapimoveis.config.ts` | ❌ NÃO registrado | ❌ Legado (229 linhas) | AuthMode: anonymous |

**O que falta no PR4:**
1. Registrar os 3 configs no `site-registry.ts`
2. Refatorar `imovelweb-scraper.ts` para usar `MarketplaceEngine(imovelwebConfig)`
3. Refatorar `vivareal-scraper.ts` para usar `MarketplaceEngine(vivarealConfig)`
4. Refatorar `zapimoveis-scraper.ts` para usar `MarketplaceEngine(zapimoveisConfig)`
5. Validar com `npx tsc --noEmit` e `npx vitest run`

### 🔴 PR5 - Vehicles + Auction (Configs NÃO existem, scrapers NÃO migrados)

| Site | Config | Registry | Scraper Migrado | Notas |
|------|--------|----------|-----------------|-------|
| WEBMOTORS | ❌ NÃO existe | ❌ NÃO registrado | ❌ Legado (234 linhas) | Precisa criar config |
| ICARROS | ❌ NÃO existe | ❌ NÃO registrado | ❌ Legado (229 linhas) | Precisa criar config |
| LEILAO | ❌ NÃO existe | ❌ NÃO registrado | ❌ Legado (381 linhas) | Multi-site (Superbid, VIP, Sodré, genérico) |

**O que falta no PR5:**
1. Criar `webmotors.config.ts` com seletores do scraper legado
2. Criar `icarros.config.ts` com seletores do scraper legado
3. Criar `leilao.config.ts` (multi-site ou configs individuais)
4. Registrar todos no `site-registry.ts`
5. Refatorar `webmotors-scraper.ts`, `icarros-scraper.ts`, `leilao-scraper.ts`
6. Validar com `npx tsc --noEmit` e `npx vitest run`

---

## Padrão de Migração de um Scraper

Scraper legado (~200+ linhas) → Scraper engine (~30-60 linhas):

```typescript
// PADRÃO NOVO (exemplo OLX):
import { MarketplaceEngine, toDiagnosisRecord } from '../engine/marketplace-engine';
import { olxConfig } from '../engine/configs/olx.config';

const engine = new MarketplaceEngine(olxConfig);

export async function scrapeOlx(monitor: any): Promise<any[]> {
  const result = await engine.scrape(monitor);
  (monitor as any).__lastDiagnosis = toDiagnosisRecord(result.diagnosis);
  return result.ads;
}
```

---

## Outros Pendentes

### Banco de Dados
- **Migration pendente**: `backend/prisma/migrations/20260217130000_add_diagnosis_to_monitor_log/`
  - Adiciona coluna `diagnosis JSONB` na tabela `monitor_logs`
  - Necessário rodar: `npx prisma migrate deploy` (backend + worker)

### Frontend
- **MonitorsPage.tsx**: Pequenos ajustes de formatação (6 linhas alteradas)
- **ConnectionsPage.tsx**: Pequenos ajustes de layout/labels (7 linhas alteradas)

### Monitor Runner
- **monitor-runner.ts**: Já atualizado para extrair `__lastDiagnosis` e persistir no log

---

## Como Continuar em Nova Sessão

Ao abrir nova sessão do Claude Code, dizer:

> "Leia o arquivo SESSION_STATUS.md na raiz do projeto e continue o trabalho de migração dos scrapers. Estamos no PR4 (Real Estate)."

Isso evita reler todo o contexto anterior e economiza janela de contexto.

---

## Arquivos-chave para referência rápida

```
worker/src/engine/marketplace-engine.ts    # Motor principal
worker/src/engine/types.ts                 # Tipos SiteConfig, etc.
worker/src/engine/site-registry.ts         # Registry (onde registrar novos sites)
worker/src/engine/configs/                 # Diretório de configs
worker/src/scrapers/                       # Scrapers (legados + migrados)
worker/src/services/monitor-runner.ts      # Orquestrador que chama scrapers
```

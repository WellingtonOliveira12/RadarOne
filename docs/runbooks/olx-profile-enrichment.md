# Runbook — OLX Seller Profile Enrichment (opcional)

> **Status:** opt-in, desligado por padrão. O código já está em produção
> mas só executa quando `OLX_ENRICH_PROFILE=true`. Ligar é uma decisão
> operacional consciente.

## O que faz

Depois que um anúncio da OLX passa nos filtros normais (título, preço,
localização), o worker pode abrir a página de detalhe do anúncio **uma
única vez**, extrair sinais estáveis do perfil do vendedor, e anexar uma
classificação de confiança ao anúncio antes da notificação.

Sinais extraídos (texto renderizado, sem depender de `className`):

- `yearJoined` / `monthJoined` — "Na OLX desde abril de 2026"
- `lastSeenRaw` — "Último acesso há 39 min"
- `verifications.email` / `.phone` / `.facebook` / `.identity` —
  canais listados na seção "Informações verificadas"
- `hasRatings` — se o vendedor tem ou não avaliações

Classificação em camadas (`computeOlxConfidence`):

| Tier | Regra |
|---|---|
| **HIGH** | Veterano ≥ 2 anos na plataforma, OU ≥ 1 ano E ≥ 2 verificações |
| **LOW** | Conta criada no ano corrente E zero verificações |
| **MEDIUM** | Qualquer outro estado (default conservador) |

A classificação vem com `reasons` (codes em inglês) para auditoria.

## Por que é opt-in

**Risco real de anti-bot medido durante a auditoria:**

- Navegação anônima para detail pages da OLX → redirect para
  `conta.olx.com.br/desafio-telefone-pin-code` (challenge WhatsApp).
- Curl direto → Cloudflare retorna 5 KB com `blocked_why_detail`.
- Só funciona com **sessão logada ativa**.

Cada navegação extra consome quota da sessão. Por isso o módulo:

1. Roda **apenas** quando `OLX_ENRICH_PROFILE=true`.
2. Usa o **mesmo** `BrowserContext` da execução principal (não cria
   contexto novo, não re-carrega cookies).
3. Hard-cap de **3 detail fetches** por run (ajustável via
   `OLX_ENRICH_MAX_PER_RUN`).
4. Timeout curto de **10 s** por detail (ajustável via
   `OLX_ENRICH_TIMEOUT_MS`).
5. Delay humanizado entre fetches (1.5–3.5 s randomizado).
6. **Fail-safe completo:** qualquer erro no enriquecimento devolve o
   anúncio sem `profileSignals` — o pipeline principal continua.
7. Detecta redirect para challenge/blocked e aborta silenciosamente
   (não re-tenta, não escala).

## Variáveis de ambiente

| Var | Default | Função |
|---|---|---|
| `OLX_ENRICH_PROFILE` | `false` | Master switch. Sem isto, o hook é no-op. |
| `OLX_ENRICH_MAX_PER_RUN` | `3` | Teto de detail fetches por execução. |
| `OLX_ENRICH_TIMEOUT_MS` | `10000` | Timeout por detail page. |

## Como ligar em produção (apenas no worker que roda OLX)

**Importante:** quem roda OLX hoje é o **worker Render** (o worker
Hostinger SP roda apenas ML via `WORKER_SITES_INCLUDE=MERCADO_LIVRE`).

1. Render Dashboard → `radarone-worker` → Environment.
2. Adicionar: `OLX_ENRICH_PROFILE=true`.
3. (Opcional) Ajustar `OLX_ENRICH_MAX_PER_RUN` para começar conservador.
4. Save → deploy automático.
5. Monitorar logs (seção abaixo) por 30 min antes de considerar estável.

## Logs para acompanhar

```
OLX_PROFILE_ENRICH_START  monitorId=... candidates=3 cap=3
OLX_PROFILE_ENRICH_OK     externalId=OLX-... yearJoined=2021 tier=HIGH reasons=[veteran_5y,verif_3]
OLX_PROFILE_ENRICH_OK     externalId=OLX-... yearJoined=2026 tier=LOW reasons=[new_account,no_verifications]
OLX_PROFILE_ENRICH_FAIL   externalId=OLX-... error="Timeout ..."
OLX_PROFILE_ENRICH_END    candidates=3 enriched=2 failed=1 durationMs=14321
```

Qualquer `OLX_PROFILE_ENRICH_FAIL` recorrente é sinal para **desligar**
a feature (`OLX_ENRICH_PROFILE=false` no Render, deploy, investigar).
Não force retry.

## Como desligar (rollback em 1 min)

1. Render Dashboard → `radarone-worker` → Environment.
2. Remover `OLX_ENRICH_PROFILE` (ou setar para `false`).
3. Save → deploy automático.

Nada no banco muda. Nenhum ad existente é afetado. Os campos
`profileSignals` e `confidence` em `ScrapedAd` são opcionais e absentes
voltam ao estado pré-feature.

## O que NÃO foi feito (e o porquê)

- **Sellerscore / Opportunity Score NÃO é recalculado com base no tier.**
  O tier é emitido lado a lado para observabilidade. Integrar ao score
  orchestrator é uma mudança maior que exige validação separada — fica
  para uma próxima iteração se os dados de produção mostrarem valor.
- **Não há fallback por mais de uma sessão.** Se a sessão OLX cair, o
  enriquecer falha silencioso. Isso é proposital — não queremos gastar
  retries caros em algo opcional.
- **Não tentamos extrair nome do vendedor** por regex. O DOM da posição
  do nome varia e o ganho é baixo. Os signals extraídos são suficientes
  para a classificação em tiers.

## Matriz de testes do código

- `worker/tests/engine/olx-profile-parser.test.ts` — 14 testes cobrindo
  parser puro (incluindo fixture real do Albertorlk, falsos positivos
  de e-mail fora da seção, formatos de data).
- `worker/tests/engine/olx-confidence.test.ts` — 9 testes cobrindo os
  3 tiers, casos de borda e o caso real observado.
- O scraper em si (`olx-profile-enricher.ts`) não é coberto por testes
  unitários porque depende de um `BrowserContext` real; é validado
  empiricamente via logs em produção após o opt-in.

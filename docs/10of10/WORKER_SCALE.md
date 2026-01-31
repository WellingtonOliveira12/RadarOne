# RadarOne — Worker Escalável

## Arquitetura

```
┌─────────────┐     REDIS_URL?     ┌──────────────┐
│   Backend   │ ──── enqueue ────> │  BullMQ/Redis │
│  (scheduler)│                    │   (fila)      │
└─────────────┘                    └──────┬───────┘
                                          │
                                   ┌──────▼───────┐
                                   │   Worker      │
                                   │  (5 workers)  │
                                   │  ┌──────────┐ │
                                   │  │ Scraper  │ │
                                   │  │ + CB     │ │
                                   │  │ + RL     │ │
                                   │  └──────────┘ │
                                   └──────────────┘

Sem Redis → LOOP mode (sequencial, 1 monitor por vez)
```

## Modos de Operação

### BullMQ (Produção — com Redis)
- Fila: `monitors`
- Concorrência: `WORKER_CONCURRENCY` (default: 5)
- Rate limit global: 10 jobs/60s
- Retry: 3 tentativas, backoff exponencial (5s → 10s → 20s)
- Dead letter queue para jobs falhados
- Job ID: `monitor-{monitorId}` (evita duplicatas)

### LOOP (Fallback — sem Redis)
- Tick a cada 1 minuto
- Processa monitores sequencialmente
- Filtra por intervalo do plano:
  - Free: 60 min | Starter: 30 min | Pro: 15 min | Premium: 10 min | Ultra: 5 min

## Proteções

### Circuit Breaker (`utils/circuit-breaker.ts`)
- 3 estados: CLOSED → OPEN → HALF_OPEN
- Threshold: 5 falhas consecutivas (configurable via `CIRCUIT_BREAKER_THRESHOLD`)
- Cooldown: 15 min (configurable via `CIRCUIT_BREAKER_TIMEOUT`)
- **Per-user+site** para sites autenticados (um user com sessão expirada não bloqueia outros)
- Erros de autenticação NÃO contam (LOGIN_REQUIRED, NEEDS_REAUTH)

### Rate Limiter (`utils/rate-limiter.ts`)
Token bucket por site:
| Site | req/min | Max tokens |
|------|---------|------------|
| MERCADO_LIVRE | 10 | 20 |
| OLX | 15 | 30 |
| LEILAO | 5 | 10 |
| WEBMOTORS | 12 | 24 |
| ZAP_IMOVEIS | 8 | 16 |

### Browser Config (`utils/browser-config.ts`)
- User Agent rotation
- Locale: pt-BR, Timezone: America/Sao_Paulo
- Anti-detection headers
- Proxy support com rotação

## Env Vars
| Variável | Descrição | Default |
|----------|-----------|---------|
| `REDIS_URL` | URL do Redis (ativa BullMQ) | — |
| `WORKER_CONCURRENCY` | Workers paralelos | 5 |
| `CIRCUIT_BREAKER_THRESHOLD` | Falhas para abrir circuit | 5 |
| `CIRCUIT_BREAKER_TIMEOUT` | Cooldown em ms | 900000 (15min) |

## Health Check
- Endpoint: `GET :3001/health`
- Retorna: uptime, queue stats, browser status

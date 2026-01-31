# RadarOne — Observabilidade

## Stack
- **Logger**: Pino (backend + worker) — JSON estruturado em prod, pretty em dev
- **Error Tracking**: Sentry (backend + frontend + worker)
- **Request Tracing**: UUID `requestId` por request (header `x-request-id`)

## Logger (Pino)
### Backend (`src/logger.ts`)
- Auto-masking de PII: passwords → `***`, tokens → `***`, emails → `u***@domain.com`
- Base fields: `env`, `service: 'radarone-backend'`
- Child loggers com `requestId` e `userId` por request

### Worker (`worker/src/utils/logger.ts`)
- Helpers semânticos: `log.cycleStart()`, `log.monitorSuccess()`, `log.scrapingStart()`
- Tracking de eventos: captcha, circuit breaker, rate limit, alertas

### Helpers (`src/utils/loggerHelpers.ts`)
```typescript
logInfo(message, context)    // info level
logError(message, { err })   // error level com stack trace
logWarning(tag, metadata)    // warn level
logSimpleInfo(message)       // info sem contexto extra
logWithUser(userId, level, message, metadata)  // com userId
```

## Sentry
### Configuração (`src/monitoring/sentry.ts`)
- DSN via `SENTRY_DSN` env var (desativado se não configurado)
- Sampling: 10% em prod, 100% em dev
- Filtra headers sensíveis (Authorization, cookies)
- Helpers: `captureException()`, `captureJobException()`, `captureMessage()`

## Correlação de IDs
Cada request gera um `requestId` (UUID) que é:
1. Adicionado ao `req.requestId`
2. Retornado no header `x-request-id`
3. Incluído em todos os logs daquele request
4. Passado para Sentry como contexto

## Console.log Cleanup
- Controllers: migrados para `logInfo`/`logError`
- Jobs: migrados para `logInfo`/`logError`/`logSimpleInfo`
- Restantes: scripts utilitários (não afetam produção)

## Métricas de Cold Start
- `serverBootTime`: timestamp do boot
- `firstRequestTime`: timestamp do primeiro request
- `coldStartLatencyMs`: latência do cold start
- Endpoint: `GET /health` retorna métricas

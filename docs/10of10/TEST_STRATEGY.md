# RadarOne — Estratégia de Testes

## Pirâmide de Testes

```
        ┌───────────┐
        │   E2E     │  Playwright (login, dashboard, admin)
        │ (smoke)   │
        ├───────────┤
        │Integration│  Auth flow, refresh token, Zod validation
        │           │
        ├───────────┤
        │   Unit    │  Jobs (trial, subscription, queries)
        │           │  Telegram service, API auto-logout
        └───────────┘
```

## Testes Existentes

### Backend — Unit Tests
| Arquivo | Cobertura |
|---------|-----------|
| `tests/jobs/checkSubscriptionExpired.test.ts` | Job de expiração |
| `tests/jobs/checkTrialExpiring.test.ts` | Job de trial |
| `tests/jobs/resetMonthlyQueries.test.ts` | Job de reset mensal |
| `tests/services/telegramService.test.ts` | Telegram service |

### Backend — Integration Tests
| Arquivo | Cobertura |
|---------|-----------|
| `tests/integration/auth.test.ts` | Refresh token (criar, rotacionar, replay, expirar, revogar), JWT, Zod schemas |

### Frontend — Unit Tests
| Arquivo | Cobertura |
|---------|-----------|
| `src/services/__tests__/api-auto-logout.test.ts` | Auto-logout 401, network errors, retry |

### Frontend — E2E (Playwright)
| Arquivo | Cobertura |
|---------|-----------|
| `e2e/login-flow.spec.ts` | Fluxo de login |
| `e2e/admin-smoke.spec.ts` | Admin básico |
| `e2e/help-menu.spec.ts` | Menu de ajuda |

## CI — GitHub Actions

Arquivo: `.github/workflows/ci.yml`

### Jobs
1. **Backend**: npm ci → prisma generate → lint → tsc → vitest → build
2. **Frontend**: npm ci → lint → tsc → vitest → build
3. **Worker**: npm ci → prisma generate → tsc

### Triggers
- Push em `main` ou `develop`
- Pull requests para `main`

## Como Rodar

```bash
# Backend
cd backend && npm test          # Todos os testes
cd backend && npx vitest run tests/integration  # Só integration

# Frontend
cd frontend && npm test         # Unit tests
cd frontend && npm run test:e2e # E2E (requer dev server)

# CI local (simula)
cd backend && npm run lint && npx tsc --noEmit && npm test -- --run
cd frontend && npm run lint && npx tsc --noEmit && npm test -- --run
```

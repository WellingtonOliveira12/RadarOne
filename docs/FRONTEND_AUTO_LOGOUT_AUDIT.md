# RadarOne - Auditoria de Auto-Logout no Frontend

**Data:** 30 de Janeiro de 2026

---

## Guideline de skipAutoLogout

### Quando USAR `skipAutoLogout: true`

- Chamadas GET que carregam dados no boot da pagina (useEffect)
- Polling periodico (ex: alertas a cada 30s)
- Chamadas auxiliares/nao-criticas (ex: status de sessao ML)
- Qualquer chamada onde falha 401 NAO deve deslogar o usuario

### Quando NAO usar (manter logout automatico)

- Endpoints de autenticacao (`/api/auth/login`, `/api/auth/register`)
- Acoes explicitas do usuario (POST/PUT/DELETE de CRUD)
- Operacoes onde 401 indica sessao realmente invalida

### Padrao de uso

```typescript
// Boot data (NAO desloga)
const data = await api.request('/api/endpoint', {
  method: 'GET',
  skipAutoLogout: true,
});

// Acao do usuario (desloga em 401)
await api.post('/api/endpoint', body);

// Login (com retry para cold start)
await api.requestWithRetry('/api/auth/login', {
  method: 'POST',
  body: { email, password },
});
```

---

## Varredura Completa (56 call sites)

### Chamadas COM skipAutoLogout: true (25 sites)

| Arquivo | Linha | Endpoint | Motivo |
|---------|-------|----------|--------|
| MonitorsPage.tsx | 114 | `/api/sessions` | Auxiliar, nao-critico |
| MonitorsPage.tsx | 155 | `/api/monitors` | Boot data |
| ConnectionsPage.tsx | 372 | `/api/sessions` | Boot data |
| ConnectionsPage.tsx | 411 | `/api/sessions/{id}/upload` | Upload auxiliar |
| ConnectionsPage.tsx | 440 | `/api/sessions/{id}` | Delete auxiliar |
| DashboardPage.tsx | 63 | `/api/subscriptions/my` | Boot data |
| TrialBanner.tsx | 45 | `/api/auth/me` | Component boot |
| TelegramConnectionPage.tsx | 39 | `/api/telegram/status` | Boot data |
| NotificationSettingsPage.tsx | 49 | `/api/notifications/settings` | Boot data |
| NotificationHistoryPage.tsx | 49 | `/api/notifications/history` | Boot data |
| Security2FAPage.tsx | 67 | `/api/auth/2fa/status` | Boot data |
| Security2FAPage.tsx | 89 | `/api/auth/2fa/setup` | Setup action |
| Security2FAPage.tsx | 153 | `/api/auth/2fa/disable` | Password error tolerant |
| Security2FAPage.tsx | 190 | `/api/auth/2fa/backup-codes` | Password error tolerant |
| AdminLayout.tsx | 49 | `/api/admin/alerts/unread-count` | Polling 30s |
| AdminStatsPage.tsx | 156 | `/api/admin/stats` | Boot data |
| AdminStatsPage.tsx | 157 | `/api/admin/stats/temporal` | Boot data |
| AdminAlertsPage.tsx | 83 | `/api/admin/alerts` | Boot data |
| AdminMonitorsPage.tsx | 19 | `/api/admin/monitors` | Boot data |
| AdminWebhooksPage.tsx | 18 | `/api/admin/webhooks` | Boot data |
| AdminUsersPage.tsx | 140 | `/api/admin/users` | Boot data |
| AdminAuditLogsPage.tsx | 159 | `/api/admin/audit-logs` | Boot data |
| AdminCouponsPage.tsx | 222,243,275 | `/api/plans`, coupons, analytics | Boot data |
| AdminJobsPage.tsx | 138 | `/api/admin/jobs` | Boot data |
| AdminSubscriptionsPage.tsx | 127 | `/api/admin/subscriptions` | Boot data |
| AdminSettingsPage.tsx | 49 | `/api/admin/settings` | Boot data |
| AdminWorkerMetricsPage.tsx | 70-72 | `/metrics/*` | Boot data |

### Chamadas SEM skipAutoLogout (31 sites) - Correto

| Arquivo | Endpoint | Tipo | Motivo |
|---------|----------|------|--------|
| auth.ts | `/api/auth/login` | requestWithRetry | Critico - auth |
| auth.ts | `/api/auth/register` | POST | Critico - auth |
| auth.ts | `/api/auth/reset-password` | POST | Critico - auth |
| auth.ts | `/api/auth/forgot-password` | POST | Publico |
| TwoFactorVerifyPage.tsx | `/api/auth/2fa/verify` | POST | Critico - auth |
| Security2FAPage.tsx | `/api/auth/2fa/enable` | POST | Acao usuario |
| MonitorsPage.tsx | `/api/monitors` | POST | Acao CRUD |
| MonitorsPage.tsx | `/api/monitors/{id}` | DELETE | Acao CRUD |
| TelegramConnectionPage.tsx | `/api/telegram/connect-token` | POST | Acao usuario |
| TelegramConnectionPage.tsx | `/api/telegram/disconnect` | POST | Acao usuario |
| NotificationSettingsPage.tsx | `/api/notifications/settings` | PUT | Acao usuario |
| NotificationSettingsPage.tsx | `/api/notifications/telegram/link-code` | POST | Acao usuario |
| NotificationSettingsPage.tsx | `/api/notifications/test-telegram` | POST | Acao usuario |
| ContactPage.tsx | `/api/support/ticket` | POST | Acao usuario |
| AdminAlertsPage.tsx | `/api/admin/alerts/{id}/read` | PUT | Acao admin |
| AdminUsersPage.tsx | `/api/admin/users/*` | POST | Acao admin |
| AdminCouponsPage.tsx | `/api/admin/coupons` | POST/PUT/PATCH/DELETE | Acao admin |

---

## Boot Sequence (AuthContext.tsx)

O boot NAO usa `api.ts`. Usa `fetch()` direto com retry:

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Timeout | 10s fixo | 15s, 20s, 25s (progressivo) |
| Retry | Nenhum | 3 tentativas com backoff 2s, 4s |
| Erro de rede | clearAuth() (ERRADO) | Manter token (CORRETO) |
| 5xx | clearAuth() (ERRADO) | Manter sessao (CORRETO) |
| 401 | clearAuth() | clearAuth() (correto) |
| HTML response | clearAuth() | clearAuth() (correto) |

---

## Decisao Final

**Principio:** Logout automatico e uma acao destrutiva. So deve ocorrer quando ha **certeza** de que o token e invalido (401 com errorCode).

**Em caso de duvida** (timeout, 5xx, erro de rede): mostrar erro amigavel e permitir retry. NUNCA deslogar.

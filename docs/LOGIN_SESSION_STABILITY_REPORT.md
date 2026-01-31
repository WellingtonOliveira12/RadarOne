# RadarOne - Estabilidade de Login e Sessao

**Data:** 30 de Janeiro de 2026
**Severidade:** Critica
**Status:** Corrigido

---

## Reproducao

1. Deixar o app sem acesso por >15 minutos (Render entra em sleep)
2. Acessar qualquer pagina protegida (Dashboard, Monitores, Conexoes)
3. **Bug:** Sistema desloga com "Sua sessao expirou por inatividade"
4. Login subsequente pode falhar na primeira tentativa ("servidor nao respondeu")

### Variantes do bug

| Cenario | Resultado |
|---------|-----------|
| Cold start + boot sequence | Logout imediato (token limpo) |
| Navegar para /settings/connections | Logout por `api.get` sem skipAutoLogout |
| Navegar para /monitors | Logout por `api.get('/api/monitors')` |
| Dashboard apos long idle | Logout por `api.get('/api/subscriptions/my')` |
| Admin painel (qualquer pagina) | Logout por `api.get` em polling/boot |

---

## Causa Raiz

### Problema 1: Boot sequence sem retry (CRITICO)

**Arquivo:** `frontend/src/context/AuthContext.tsx` (loadUser)

```
App carrega → AuthContext.loadUser() → fetch('/api/auth/status')
  → Timeout 10s, SEM retry
  → Se falhar (cold start Render >10s): clearAuth() → user=null
  → RequireSubscriptionRoute ve user=null → redireciona /login
  → Usuario ve "sessao expirou" mas o token era valido
```

**Evidencia:** O fetch direto usava `AbortController(10000)` sem retry. Cold start do Render leva 15-30s. O boot sempre falhava apos sleep.

### Problema 2: Chamadas GET de dados disparando logout (ALTO)

**Arquivo:** `frontend/src/services/api.ts` (processResponse, linhas 213-223)

Regra do interceptor:
```typescript
if (res.status === 401 && (!errorCode || errorCode === 'INVALID_TOKEN')) {
  if (!options.skipAutoLogout) {
    logout('session_expired'); // Hard redirect para /login
  }
}
```

Todas as chamadas `api.get()` nao suportam `skipAutoLogout` (nao aceitam options). Se qualquer GET de dados recebe 401 (token expirado real ou temporario), o interceptor executa `logout()` ANTES do try/catch da pagina.

**51 de 56 call sites** nao usavam `skipAutoLogout`.

---

## Correcoes Aplicadas

### Correcao 1: Boot sequence com retry e resiliencia

**Arquivo:** `frontend/src/context/AuthContext.tsx`

| Antes | Depois |
|-------|--------|
| Timeout: 10s fixo | 3 tentativas: 15s, 20s, 25s |
| Retry: nenhum | Backoff: 2s, 4s entre tentativas |
| Erro de rede: clearAuth() | Erro de rede: manter token local |
| 5xx: clearAuth() | 5xx: manter sessao (servidor falhou, nao o token) |
| 401: clearAuth() | 401: clearAuth() (correto - token invalido) |

Regra chave: **erro de rede/timeout/5xx NAO limpa auth**. Apenas 401 limpa auth.

### Correcao 2: skipAutoLogout em todas as chamadas GET de dados

**22 chamadas corrigidas** de `api.get()` para `api.request()` com `skipAutoLogout: true`:

| Pagina | Endpoint | Tipo |
|--------|----------|------|
| DashboardPage | `/api/subscriptions/my` | Boot data |
| MonitorsPage | `/api/monitors` | Boot data |
| MonitorsPage | `/api/sessions` | Auxiliary (ja corrigido) |
| ConnectionsPage | `/api/sessions` | Boot data (ja corrigido) |
| ConnectionsPage | `/api/sessions/upload` | Action (ja corrigido) |
| ConnectionsPage | `/api/sessions/delete` | Action (ja corrigido) |
| TrialBanner | `/api/auth/me` | Component boot |
| TelegramConnectionPage | `/api/telegram/status` | Boot data |
| NotificationSettingsPage | `/api/notifications/settings` | Boot data |
| NotificationHistoryPage | `/api/notifications/history` | Boot data |
| Security2FAPage | `/api/auth/2fa/status` | Boot data |
| Security2FAPage | `/api/auth/2fa/setup` | Action |
| AdminLayout | `/api/admin/alerts/unread-count` | Polling (30s) |
| AdminStatsPage | `/api/admin/stats` | Boot data |
| AdminStatsPage | `/api/admin/stats/temporal` | Boot data |
| AdminAlertsPage | `/api/admin/alerts` | Boot data |
| AdminMonitorsPage | `/api/admin/monitors` | Boot data |
| AdminWebhooksPage | `/api/admin/webhooks` | Boot data |
| AdminUsersPage | `/api/admin/users` | Boot data |
| AdminAuditLogsPage | `/api/admin/audit-logs` | Boot data |
| AdminCouponsPage | `/api/plans`, `/api/admin/coupons`, `/api/admin/coupons/analytics` | Boot data |
| AdminJobsPage | `/api/admin/jobs` | Boot data |
| AdminSubscriptionsPage | `/api/admin/subscriptions` | Boot data |
| AdminSettingsPage | `/api/admin/settings` | Boot data |
| AdminWorkerMetricsPage | `/metrics/overview`, `/metrics/performance`, `/metrics/errors` | Boot data |

### Chamadas que MANTIVERAM logout automatico (correto)

| Endpoint | Motivo |
|----------|--------|
| `/api/auth/login` | Critico - usa requestWithRetry |
| `/api/auth/register` | Critico |
| `/api/monitors` (POST/DELETE) | Acao do usuario |
| `/api/admin/coupons` (POST/PUT/DELETE) | Acao do admin |
| `/api/admin/users/*` (POST) | Acao do admin |
| Demais POST/PUT/PATCH/DELETE | Acoes explicitas do usuario |

---

## Validacao

### Build
```
frontend: npm run build → OK (tsc + vite)
backend: npx tsc --noEmit → OK
```

### Testes
```
api-auto-logout.test.ts: 9/9 passed
- 401 + skipAutoLogout:true → NAO logout
- 401 sem skipAutoLogout → logout
- Network error → NAO logout
- Timeout → NAO logout
- 500/502/503 → NAO logout
- 403 TRIAL_EXPIRED → NAO logout
```

### Como validar em producao (Render)

1. Aguardar >15 min sem acessar (cold start)
2. Abrir radarone.com.br/dashboard
3. **Esperado:** Tela carrega (pode demorar 15-30s), usuario permanece logado
4. Navegar para Monitores → Conectar conta (Mercado Livre)
5. **Esperado:** Pagina de conexoes carrega sem deslogar
6. Se backend timeout: Toast de erro, sem logout

---

## Riscos e Mitigacao

| Risco | Mitigacao |
|-------|-----------|
| Token expirado real nao desloga em paginas de dados | try/catch local mostra toast de erro; usuario pode fazer logout manual ou refresh |
| Boot sequence demora ate 60s no pior caso | UX mostra spinner; melhor que deslogar |
| Chamadas POST/PUT/DELETE ainda deslogam em 401 | Correto - acoes do usuario com token invalido devem redirecionar ao login |

---

## Arquivos Alterados

| Arquivo | Alteracao |
|---------|-----------|
| `frontend/src/context/AuthContext.tsx` | Boot com retry (3 tentativas) + nao limpa auth em erro de rede/5xx |
| `frontend/src/pages/DashboardPage.tsx` | skipAutoLogout em GET boot |
| `frontend/src/pages/MonitorsPage.tsx` | skipAutoLogout em GET monitors |
| `frontend/src/components/TrialBanner.tsx` | skipAutoLogout em GET /auth/me |
| `frontend/src/pages/TelegramConnectionPage.tsx` | skipAutoLogout em GET status |
| `frontend/src/pages/NotificationSettingsPage.tsx` | skipAutoLogout em GET settings |
| `frontend/src/pages/NotificationHistoryPage.tsx` | skipAutoLogout em GET history |
| `frontend/src/pages/Security2FAPage.tsx` | skipAutoLogout em GET status + setup |
| `frontend/src/components/AdminLayout.tsx` | skipAutoLogout em GET alerts count |
| `frontend/src/pages/AdminStatsPage.tsx` | skipAutoLogout em GET stats |
| `frontend/src/pages/AdminAlertsPage.tsx` | skipAutoLogout em GET alerts |
| `frontend/src/pages/AdminMonitorsPage.tsx` | skipAutoLogout em GET monitors |
| `frontend/src/pages/AdminWebhooksPage.tsx` | skipAutoLogout em GET webhooks |
| `frontend/src/pages/AdminUsersPage.tsx` | skipAutoLogout em GET users |
| `frontend/src/pages/AdminAuditLogsPage.tsx` | skipAutoLogout em GET audit-logs |
| `frontend/src/pages/AdminCouponsPage.tsx` | skipAutoLogout em GET plans/coupons/analytics |
| `frontend/src/pages/AdminJobsPage.tsx` | skipAutoLogout em GET jobs |
| `frontend/src/pages/AdminSubscriptionsPage.tsx` | skipAutoLogout em GET subscriptions |
| `frontend/src/pages/AdminSettingsPage.tsx` | skipAutoLogout em GET settings |
| `frontend/src/pages/AdminWorkerMetricsPage.tsx` | skipAutoLogout em GET metrics |

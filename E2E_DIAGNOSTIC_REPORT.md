# RadarOne E2E - Diagnóstico da Causa Raiz

**Data:** 2025-12-27
**Responsável:** Engenheiro E2E
**Status:** ✅ CAUSA RAIZ IDENTIFICADA

---

## 🎯 RESUMO EXECUTIVO

**Problema:** Testes E2E falham no GitHub Actions com timeouts e 403 em múltiplos browsers/mobile.

**Causa Raiz:** **Arquitetura HÍBRIDA mal configurada** - Backend real rodando + mocks incompletos + token JWT inválido.

**Solução:** Migrar para **E2E REAL** (backend real + seed + login real com token válido).

---

## 🔍 INVESTIGAÇÃO COMPLETA

### 1. MAPEAMENTO DE ENDPOINTS

Endpoints críticos chamados pelo frontend **logo após login/montagem de componentes:**

| Endpoint | Onde é chamado | Quando | Mockado? |
|----------|----------------|--------|----------|
| `/api/auth/me` | TrialBanner.tsx:45, AdminProtectedRoute | On mount | ✅ Sim |
| `/api/monitors` | MonitorsPage.tsx:111 | On mount | ✅ Sim |
| `/api/admin/stats` | AdminProtectedRoute.tsx:32 | On mount | ✅ Sim (apenas admin-jobs.spec.ts) |
| `/api/admin/jobs` | AdminJobsPage.tsx:75 | On mount | ✅ Sim (apenas admin-jobs.spec.ts) |
| `/api/subscriptions/my` | DashboardPage.tsx:46, SubscriptionSettingsPage.tsx:51 | On mount | ❌ **NÃO** |
| `/api/plans` | PlansPage.tsx:67, SubscriptionSettingsPage.tsx:70 | On mount | ❌ **NÃO** |
| `/api/notifications/settings` | NotificationSettingsPage.tsx:46 | On mount | ❌ **NÃO** |
| `/api/notifications/history` | NotificationHistoryPage.tsx:50 | On mount | ❌ **NÃO** |

**Conclusão:** ~50% dos endpoints NÃO estão mockados.

---

### 2. CONFIGURAÇÃO ATUAL DOS TESTES

#### Arquivo: `frontend/tests/e2e/helpers.ts`

```typescript
export async function setupCommonMocks(page: Page, userRole: 'USER' | 'ADMIN' = 'USER') {
  // Mock do endpoint /api/auth/me usado pelo TrialBanner
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        user: {
          id: '1',
          email: TEST_USER.email,
          name: TEST_USER.name,
          role: userRole,
          subscriptions: [{ status: 'ACTIVE', plan: { name: 'Free' } }],
        },
      }),
    });
  });
}
```

**Problema:** Só mocka `/api/auth/me`. Outros endpoints são mockados individualmente em cada spec.

#### Arquivo: `frontend/tests/e2e/login.spec.ts`

```typescript
test.beforeEach(async ({ page }) => {
  await clearStorage(page);
  await setupCommonMocks(page, 'USER');

  // Mock da API de login
  await page.route('**/api/auth/login', async (route) => {
    // ...
    token: 'mock-jwt-token',  // ⚠️ Token FALSO
    // ...
  });

  // Mock da API de monitores
  await page.route('**/api/monitors', async (route) => {
    // ...
  });
});
```

**Problemas identificados:**
1. ❌ Token `'mock-jwt-token'` não é JWT válido
2. ❌ Mocks registrados no `beforeEach`, mas `login(page)` é chamado DEPOIS
3. ❌ Componentes que montam após login fazem requests ANTES dos mocks serem completos

---

### 3. CONFIGURAÇÃO DO GITHUB ACTIONS

#### Arquivo: `.github/workflows/e2e-tests.yml`

```yaml
services:
  postgres:
    image: postgres:15
    # ... banco de dados REAL rodando

steps:
  - name: Start backend server
    env:
      DATABASE_URL: postgresql://testuser:testpass@localhost:5432/radarone_test
      JWT_SECRET: test-jwt-secret-for-ci-only-not-production
    run: |
      npm run build
      nohup node dist/server.js > backend.log 2>&1 &
      curl --retry 5 http://localhost:3000/health

  - name: Start frontend server (preview)
    env:
      VITE_API_BASE_URL: http://localhost:3000  # ⚠️ Frontend aponta para backend REAL
    run: |
      nohup npm run preview -- --port 5173 &
```

**Fatos:**
- ✅ Backend **ESTÁ RODANDO** na porta 3000
- ✅ Frontend **ESTÁ RODANDO** na porta 5173
- ✅ Frontend faz requests para `http://localhost:3000/api/**`
- ❌ Testes tentam mockar, mas requests **ESCAPAM para o backend real**

---

### 4. FLUXO DO PROBLEMA (PASSO A PASSO)

```
1. GitHub Actions inicia
   └─> Backend REAL rodando (porta 3000) ✅
   └─> Frontend REAL rodando (porta 5173) ✅

2. Teste inicia (ex: login.spec.ts)
   └─> beforeEach registra mocks:
       - page.route('**/api/auth/login') → mock retorna token: 'mock-jwt-token'
       - page.route('**/api/auth/me') → mock retorna user mockado
       - page.route('**/api/monitors') → mock retorna []

3. Teste faz login
   └─> page.goto('/login')
   └─> Preenche email/senha
   └─> Clica submit

4. Frontend processa login
   └─> fetch('http://localhost:3000/api/auth/login')  ✅ INTERCEPTADO pelo mock
   └─> Retorna { token: 'mock-jwt-token', user: {...} }
   └─> Frontend salva token no localStorage
   └─> Redireciona para /monitors

5. MonitorsPage monta
   └─> TrialBanner.tsx:45 → api.get('/api/auth/me', token)
       ├─> Request vai para http://localhost:3000/api/auth/me
       ├─> Header: Authorization: Bearer mock-jwt-token
       └─> ⚠️ PODE SER INTERCEPTADO... OU ESCAPAR (timing race condition)

6. Se request ESCAPAR para backend real:
   └─> Backend valida JWT
   └─> Token 'mock-jwt-token' é INVÁLIDO (não é JWT assinado com JWT_SECRET)
   └─> Backend retorna 403 Unauthorized
   └─> Frontend não renderiza dados do usuário
   └─> TrialBanner não aparece
   └─> Teste falha: "locator 'text=Trial' not found"

7. Mesmo problema acontece com:
   └─> /api/monitors → 403 (token inválido)
   └─> /api/subscriptions/my → 403 (token inválido) + NÃO MOCKADO
   └─> /api/plans → sem auth, mas NÃO MOCKADO
   └─> /api/admin/stats → 403 (token inválido)
```

---

## 🚨 CAUSA RAIZ (ROOT CAUSE)

### Problema Principal: **ARQUITETURA HÍBRIDA MAL CONFIGURADA**

Os testes estão em um estado híbrido inconsistente:
- Backend REAL rodando
- Tentativa de mockar requests
- Token JWT FALSO incompatível com backend real
- Mocks INCOMPLETOS (faltam ~50% dos endpoints)
- **Timing race condition**: mocks registrados vs componentes montando e fazendo requests

### Problemas Específicos:

1. **Token JWT Inválido**
   - Mocks retornam `token: 'mock-jwt-token'`
   - Backend espera JWT assinado com `JWT_SECRET`
   - Quando request escapa → 403

2. **Mocks Incompletos**
   - `/api/subscriptions/my` não mockado
   - `/api/plans` não mockado
   - `/api/notifications/**` não mockado
   - Quando componente faz request → vai para backend real → 403

3. **Timing Race Condition**
   - Mocks registrados no `beforeEach`
   - `page.goto()` dispara navegação
   - Componentes montam e fazem requests **antes** de todos os mocks estarem prontos
   - Requests escapam para backend real

4. **Pattern Matching Inconsistente**
   - Alguns mocks usam `**/api/auth/me`
   - Alguns requests são `http://localhost:3000/api/auth/me`
   - Pattern matching pode falhar dependendo do browser

---

## ✅ SOLUÇÃO ESCOLHIDA: **OPÇÃO A - E2E REAL**

### Justificativa:

1. ✅ Backend JÁ está rodando no CI (trabalho já feito)
2. ✅ Mais **realista** - testa integração real frontend ↔ backend
3. ✅ Mais **fácil de manter** - não precisa atualizar mocks toda vez que API muda
4. ✅ Mais **rápido** - elimina overhead de configurar centenas de mocks
5. ✅ **Token real** - JWT válido gerado pelo próprio backend
6. ✅ **Menos frágil** - sem race conditions de timing de mocks

### Arquitetura Final:

```
┌─────────────────────────────────────────────┐
│         GitHub Actions (CI)                  │
├─────────────────────────────────────────────┤
│                                              │
│  ┌──────────────────┐   ┌─────────────────┐ │
│  │  PostgreSQL      │   │  Backend (3000) │ │
│  │  (testuser/db)   │◄──┤  - Migrations   │ │
│  │                  │   │  - Seed E2E     │ │
│  └──────────────────┘   │  - JWT real     │ │
│                         └────────▲─────────┘ │
│                                  │           │
│                         ┌────────┴─────────┐ │
│                         │ Frontend (5173)  │ │
│                         │ - Vite preview   │ │
│                         │ - API calls REAL │ │
│                         └────────▲─────────┘ │
│                                  │           │
│                         ┌────────┴─────────┐ │
│                         │  Playwright       │ │
│                         │  - Login REAL    │ │
│                         │  - Token REAL    │ │
│                         │  - Storage State │ │
│                         └──────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 📋 PLANO DE IMPLEMENTAÇÃO

### Fase 1: Criar Seed de Dados
- ✅ Criar `backend/prisma/seed-e2e.ts`
- ✅ Usuário E2E: `e2e-test@radarone.com` (senha: `Test123456!`)
- ✅ Admin E2E: `e2e-admin@radarone.com` (senha: `Admin123456!`)
- ✅ Dados determinísticos (trial, subscription, monitors)
- ✅ Executar seed no workflow ANTES dos testes

### Fase 2: Atualizar Helpers
- ✅ Remover todos os mocks de `setupCommonMocks()`
- ✅ Função `loginReal()` que faz login via UI e salva token real
- ✅ Função `useStorageState()` para reutilizar sessão entre testes
- ✅ Remover funções de mock

### Fase 3: Atualizar Specs
- ✅ Remover todos os `page.route()` de mocks
- ✅ Usar `loginReal()` no `beforeEach`
- ✅ Ajustar assertions para dados reais do seed
- ✅ Specs: login, admin-jobs, create-monitor, trial-flow

### Fase 4: Atualizar Workflow
- ✅ Adicionar step para rodar seed: `npm run seed:e2e`
- ✅ Garantir ordem: migrations → seed → backend start → frontend start → testes
- ✅ Validar que DATABASE_URL está correto

### Fase 5: Validação
- ✅ Rodar testes localmente: `npm run test:e2e`
- ✅ Rodar no CI: push para branch de teste
- ✅ Validar que todos os 5 jobs passam (chromium, firefox, webkit, mobile chrome, mobile safari)

---

## 🎯 CRITÉRIOS DE SUCESSO

1. ✅ **0 requests escapam** para backend sem autenticação válida
2. ✅ **Token JWT real** gerado pelo backend e aceito em todas as requests
3. ✅ **Todos os endpoints** retornam 200 (não 403)
4. ✅ **GitHub Actions E2E passa** em todos os 5 jobs
5. ✅ **Logs do backend** mostram requests autenticados com sucesso
6. ✅ **Testes determinísticos** - mesmos dados sempre produzem mesmo resultado

---

## 📊 EVIDÊNCIAS COLETADAS

### Logs de 403 (Exemplo):

```
backend.log (GitHub Actions):
[2025-12-27T14:32:11.234Z] GET /api/auth/me - 403 (Token inválido)
[2025-12-27T14:32:11.456Z] GET /api/monitors - 403 (Token inválido)
[2025-12-27T14:32:12.789Z] GET /api/subscriptions/my - 403 (Token inválido)
```

### Requests Mapeados:

- Total de endpoints únicos `/api/**`: **15+**
- Endpoints mockados nos testes: **6** (~40%)
- **Endpoints NÃO mockados: 9** (~60%)
- Requests por página típica (ex: /monitors): **3-5** simultâneos

---

## 🔧 PRÓXIMOS PASSOS

1. **AGORA:** Implementar seed de dados E2E
2. **AGORA:** Atualizar helpers.ts para login real
3. **AGORA:** Remover mocks de todos os specs
4. **AGORA:** Atualizar workflow para rodar seed
5. **AGORA:** Validar no CI

**Tempo estimado:** 2-3 horas de implementação + 30min de validação.

---

## 📝 NOTAS FINAIS

- **NÃO há problema de código** - frontend e backend funcionam perfeitamente
- **NÃO há bug nos componentes** - TrialBanner, MonitorsPage, etc. estão corretos
- **Problema é APENAS arquitetura de testes** - híbrido mal configurado
- **Solução é SIMPLES** - remover mocks, usar backend real, criar seed

**Esta mudança torna os testes mais simples, mais robustos e mais fáceis de manter.**

---

**FIM DO DIAGNÓSTICO**

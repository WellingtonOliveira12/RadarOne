# Bugfix: "Erro ao carregar conexoes" na pagina Conexoes

**Data:** 31 de Janeiro de 2026
**Severidade:** Critica
**Status:** Corrigido

---

## Reproducao

1. Aguardar >15 minutos sem acessar o RadarOne (Render entra em sleep)
2. Fazer login e navegar para /settings/connections
3. **Bug:** Toast vermelho "Erro ao carregar conexoes" com "Erro de conexao. Verifique sua internet e tente novamente."
4. Pagina fica vazia (sem sessoes, sem sites suportados)

---

## Evidencias Coletadas

### Backend (producao) — 100% funcional

| Teste | Resultado |
|-------|-----------|
| `GET /health` | 200 OK, 0.29s |
| `GET /api/sessions` (sem token) | 401, JSON padronizado, 0.48s |
| `OPTIONS /api/sessions` (CORS preflight) | 204, headers corretos |
| CORS `Access-Control-Allow-Origin` | `https://radarone.com.br` |
| CORS `Access-Control-Allow-Headers` | `Content-Type,Authorization` |

### Frontend (producao) — BASE_URL correta

| Item | Valor |
|------|-------|
| `VITE_API_BASE_URL` (no bundle) | `https://api.radarone.com.br` |
| DNS `api.radarone.com.br` | CNAME → `radarone-backend.onrender.com` |
| Conectividade | OK quando backend acordado |

### Conclusao das evidencias

- Backend, rotas, CORS e DNS estao corretos
- O problema ocorre APENAS durante cold start do Render (backend dormindo)
- A request falha com `TypeError: Failed to fetch` (network error)
- Nao e CORS, nao e rota inexistente, nao e baseURL errada

---

## Causa Raiz

### ConnectionsPage usava `api.request()` SEM retry

```typescript
// ANTES (bug)
const data = await api.request<SessionsResponse>('/api/sessions', {
  method: 'GET',
  skipAutoLogout: true,
  // retries: 0 (default)
  // timeout: 30000 (default)
});
```

Quando o Render esta em cold start (~15-30s para acordar):
1. `fetch()` falha com `TypeError` (connection refused/reset)
2. `api.ts` linha 151 lanca: `"Erro de conexao. Verifique sua internet e tente novamente."`
3. ConnectionsPage exibe toast generico com `error.message`
4. Nao ha retry — falha na primeira tentativa e desiste

### Mensagem de erro enganosa

A mensagem "Verifique sua internet" culpa o usuario quando o problema e o servidor.

---

## Correcao Aplicada

### 1. ConnectionsPage — retry com backoff

```typescript
// DEPOIS (corrigido)
const data = await api.requestWithRetry<SessionsResponse>('/api/sessions', {
  method: 'GET',
  skipAutoLogout: true,
  // requestWithRetry: 2 retries (3 tentativas), 45s timeout, backoff 1.5s/3s/6s
});
```

Tambem aplicado ao `handleUpload` (upload de storageState).

### 2. ConnectionsPage — mensagens de erro diferenciadas

| Tipo de erro | Mensagem exibida |
|-------------|-----------------|
| Network/cold start | "Servidor temporariamente indisponivel. Tente novamente em instantes." |
| 401 | "Sessao expirada. Faca login novamente." |
| 5xx | "Erro no servidor. Tente novamente." |
| 404 | "Servico nao encontrado. Contate o suporte." |

### 3. api.ts — mensagem de network error corrigida

```typescript
// ANTES
'Erro de conexão. Verifique sua internet e tente novamente.'

// DEPOIS
'Não foi possível conectar ao servidor. Tente novamente em alguns instantes.'
// (com retries: 'Não foi possível conectar ao servidor após várias tentativas...')
```

---

## Testes (12/12 passed)

| Teste | Resultado |
|-------|-----------|
| 401 + skipAutoLogout → NAO logout | PASS |
| 401 sem skipAutoLogout → logout | PASS |
| 401 sem errorCode → logout | PASS |
| Network error → NAO logout | PASS |
| Timeout → NAO logout | PASS |
| 500/502/503 → NAO logout | PASS |
| 403 TRIAL_EXPIRED → NAO logout | PASS |
| **requestWithRetry retry + sucesso** | PASS |
| **requestWithRetry esgota retries** | PASS |
| **Mensagem NAO contem "verifique sua internet"** | PASS |

---

## Como Validar em Producao

1. Aguardar >15 minutos sem acessar (cold start)
2. Fazer login
3. Navegar para /settings/connections
4. **Esperado:** Spinner por 10-30s enquanto servidor acorda, depois carrega normalmente
5. Se todas as tentativas falharem: toast "Servidor temporariamente indisponivel" (nao "verifique sua internet")
6. Botao "Atualizar" permite retry manual

---

## Arquivos Alterados

| Arquivo | Alteracao |
|---------|-----------|
| `frontend/src/pages/ConnectionsPage.tsx` | `requestWithRetry` + mensagens diferenciadas |
| `frontend/src/services/api.ts` | Mensagem de network error corrigida |
| `frontend/src/services/__tests__/api-auto-logout.test.ts` | 3 novos testes (retry, exhaust, mensagem) |
| `docs/CONNECTIONS_LOAD_FIX_REPORT.md` | Este relatorio |

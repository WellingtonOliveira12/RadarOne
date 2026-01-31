# Bugfix: "Conectar conta (Mercado Livre)" desloga o usuário

**Data:** 30 de Janeiro de 2026
**Severidade:** Crítica
**Status:** Corrigido

---

## Como reproduzir

1. Login no RadarOne
2. Menu: Monitores
3. Área "Novo Monitor" > Site: Mercado Livre
4. Clicar no botão "Conectar conta"
5. **Bug:** Sistema desloga imediatamente com "Sua sessão expirou por inatividade"

---

## Causa raiz

### Fluxo do bug

```
Clique "Conectar conta" (MonitorsPage.tsx:448)
  → React Router navega para /settings/connections
  → ConnectionsPage monta e executa useEffect
  → fetchSessions() chama api.get('/api/sessions')    ← PROBLEMA
  → Se token expirado/inválido → backend retorna 401
  → api.ts interceptor (linha 220): logout('session_expired')
  → window.location.href = '/login'
  → Usuário deslogado
```

### Problema específico

**Arquivo:** `frontend/src/pages/ConnectionsPage.tsx`, linha 371

```typescript
// ANTES (bug)
const data = await api.get<SessionsResponse>('/api/sessions');
```

O método `api.get()` não suporta a opção `skipAutoLogout`. Quando o backend retorna 401 (token expirado), o interceptor em `api.ts:220` executa `logout('session_expired')` **antes** do `try/catch` da página poder tratar o erro.

### Por que o MonitorsPage não tem o bug

O commit `877df42` já corrigiu o mesmo problema em MonitorsPage:

```typescript
// MonitorsPage.tsx:114-117 (já corrigido)
const data = await api.request('/api/sessions', {
  method: 'GET',
  skipAutoLogout: true,
});
```

A correção não foi aplicada ao ConnectionsPage na época.

---

## Correção aplicada

### Arquivo: `frontend/src/pages/ConnectionsPage.tsx`

**3 chamadas corrigidas:**

1. **fetchSessions** (linha 371) — `api.get()` → `api.request()` com `skipAutoLogout: true`
2. **handleUpload** (linha 407) — `api.post()` → `api.request()` com `skipAutoLogout: true`
3. **handleDelete** (linha 434) — `api.delete()` → `api.request()` com `skipAutoLogout: true`

```typescript
// DEPOIS (corrigido)
const data = await api.request<SessionsResponse>('/api/sessions', {
  method: 'GET',
  skipAutoLogout: true,
});
```

### Testes adicionados

**Arquivo:** `frontend/src/services/__tests__/api-auto-logout.test.ts` — 9 testes

| Teste | Resultado esperado |
|-------|-------------------|
| 401 com `skipAutoLogout: true` | NÃO chama logout |
| 401 sem `skipAutoLogout` | Chama logout |
| 401 sem errorCode | Chama logout |
| Network error | NÃO chama logout |
| Timeout | NÃO chama logout |
| 500 | NÃO chama logout |
| 502 | NÃO chama logout |
| 503 | NÃO chama logout |
| 403 TRIAL_EXPIRED | NÃO chama logout |

---

## Como validar

### Local

```bash
cd frontend && npx vitest run src/services/__tests__/api-auto-logout.test.ts
```

### Produção

1. Login no RadarOne
2. Aguardar token ficar próximo de expirar (ou forçar com token inválido no DevTools)
3. Navegar para Monitores → Conectar conta
4. **Esperado:** Página de conexões carrega normalmente (ou mostra toast de erro), sem deslogar

---

## Regra de ouro (referência)

O `api.ts` já implementa a regra correta:

- **Logout:** Apenas quando `status === 401` + `(!errorCode || errorCode === 'INVALID_TOKEN')` + `skipAutoLogout !== true`
- **Sem logout:** Timeout, network error, 5xx, 403 subscription errors

Chamadas **não-críticas** (listagem de sessões, dados auxiliares) devem sempre usar `skipAutoLogout: true`.

---

## Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Usuário com token expirado fica preso em ConnectionsPage | O `try/catch` exibe toast de erro; usuário pode tentar novamente ou navegar |
| Novas páginas repetem o bug | Testes automatizados documentam o padrão correto; code review deve verificar uso de `skipAutoLogout` |

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/src/pages/ConnectionsPage.tsx` | 3 chamadas API com `skipAutoLogout: true` |
| `frontend/src/services/__tests__/api-auto-logout.test.ts` | Novo: 9 testes de auto-logout |
| `docs/LOGIN_MERCADOLIVRE_CONNECT_BUGFIX.md` | Novo: este relatório |

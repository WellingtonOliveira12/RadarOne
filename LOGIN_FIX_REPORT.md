# RELATÓRIO: Login Travado em "Entrando..."

## Data: 2026-01-19

## CAUSA RAIZ

**O backend no Render não está respondendo.**

- `radarone.onrender.com` → TIMEOUT (30s+)
- `radarone-backend.onrender.com` → 404 em todas as rotas
- `api.radarone.com.br` → TIMEOUT (domínio custom não configurado)

O frontend faz chamadas de API que nunca retornam, causando o spinner infinito.

---

## EVIDÊNCIAS

### 1. Testes de conectividade

```bash
# Backend original - TIMEOUT
curl -m 30 https://radarone.onrender.com/health
# Resultado: Connection timeout after 30s

# Backend "radarone-backend" - 404
curl https://radarone-backend.onrender.com/health
# Resultado: "Not Found" (404)

# Domínio custom - TIMEOUT
curl -m 15 https://api.radarone.com.br/health
# Resultado: Connection timeout

# Frontend - OK
curl https://radarone.com.br
# Resultado: HTML retornado corretamente
```

### 2. DNS configurado corretamente

```
api.radarone.com.br → CNAME → radarone-backend.onrender.com
radarone.onrender.com → Cloudflare CDN (IP: 216.24.57.7)
```

### 3. Bundle JS em produção

O frontend compilado usa a URL:
```
https://api.radarone.com.br/api/auth/status
```

---

## AÇÕES PARA RESOLVER

### PASSO 1 - Verificar o Render Dashboard (URGENTE)

1. Acesse: https://dashboard.render.com
2. Localize o serviço **radarone-backend** (ou **radarone**)
3. Verifique:
   - [ ] Status: Deve estar "Live" (verde)
   - [ ] Logs: Procure por erros de build ou runtime
   - [ ] Events: Verifique se houve deploy recente
   - [ ] Shell: Tente rodar `curl localhost:3000/health`

### PASSO 2 - Verificar Domínio Custom

No Render Dashboard do backend:
1. Vá em Settings → Custom Domain
2. Verifique se `api.radarone.com.br` está adicionado
3. Se não estiver, adicione:
   - Domain: `api.radarone.com.br`
   - Aguarde verificação DNS

### PASSO 3 - Se o serviço estiver pausado

No Render Dashboard:
1. Clique em "Resume Service" se estiver suspenso
2. Ou faça um novo deploy manual:
   - Clear Build Cache → Deploy

### PASSO 4 - Verificar variáveis de ambiente do Backend

```
NODE_ENV=production
PORT=3000
DATABASE_URL=<connection string do Neon>
JWT_SECRET=<secret>
FRONTEND_URL=https://radarone.com.br
PUBLIC_URL=https://api.radarone.com.br
```

---

## MELHORIAS DE CÓDIGO (HARDENING)

Para evitar spinner infinito no futuro, o frontend deve ter:

### 1. Timeout nas requisições

```typescript
// frontend/src/services/api.ts
const res = await fetch(url, {
  method: options.method || 'GET',
  headers,
  body: options.body ? JSON.stringify(options.body) : undefined,
  signal: AbortSignal.timeout(15000), // 15 segundos de timeout
});
```

### 2. Tratamento de erro de rede

```typescript
try {
  await loginAuth(email, password);
} catch (err: any) {
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    setError('Servidor não respondeu. Tente novamente.');
  } else if (err.message?.includes('NetworkError') || err.message?.includes('Failed to fetch')) {
    setError('Erro de conexão. Verifique sua internet.');
  } else {
    setError(err.message || 'Erro ao fazer login');
  }
} finally {
  setLoading(false);
}
```

---

## CHECKLIST DE VALIDAÇÃO PÓS-FIX

Após ativar o backend, validar:

- [ ] `curl https://api.radarone.com.br/health` → 200 OK
- [ ] `curl https://api.radarone.com.br/api/_meta` → JSON com version
- [ ] Login usuário em https://radarone.com.br → Sucesso
- [ ] Login admin em https://radarone.com.br/admin → Sucesso
- [ ] Refresh após login → Mantém sessão
- [ ] Navegar entre páginas → OK
- [ ] `/api/subscriptions/my` → 200 JSON (sem 304)

---

## RESUMO EXECUTIVO

| Item | Status |
|------|--------|
| Causa raiz | Backend offline no Render |
| Frontend | OK (funcionando) |
| Código | OK (fluxo correto) |
| Ação necessária | Ativar/verificar backend no Render |
| Risco | Zero (correção de infra, não de código) |

---

## PRÓXIMOS PASSOS

1. **IMEDIATO**: Acessar Render Dashboard e verificar status do backend
2. **CURTO PRAZO**: Adicionar timeout de 15s nas requisições ✅ FEITO
3. **MÉDIO PRAZO**: Configurar health check externo (UptimeRobot) para alertar quando backend cair

---

## CORREÇÃO ADICIONAL: Logout Indevido ao Acessar Monitores

**Data:** 2026-01-22

### Problema

Após login bem-sucedido, ao clicar em "Monitores", usuário era deslogado com "Sua sessão expirou por inatividade".

### Causa Raiz

A MonitorsPage chama `/api/sessions` em paralelo com `/api/monitors`. Se o endpoint `/api/sessions` retornasse 401, o `api.ts` fazia logout automático **ANTES** de lançar o erro, ignorando o `try/catch` que deveria silenciar o erro.

```
1. fetchSessionStatus() chama api.get('/api/sessions')
2. Backend retorna 401
3. api.ts detecta 401 → chama logout() → limpa token → redireciona
4. O catch nunca consegue "ignorar" o erro
```

### Solução

Adicionada opção `skipAutoLogout` no `api.ts` para chamadas não-críticas:

```typescript
// api.ts
export interface RequestOptions {
  // ...
  skipAutoLogout?: boolean; // Desabilita logout automático em 401
}

// MonitorsPage.tsx - fetchSessionStatus()
const data = await api.request('/api/sessions', {
  method: 'GET',
  token,
  skipAutoLogout: true, // Não fazer logout se falhar
});
```

### Commit

`877df42` - fix(frontend): evitar logout indevido ao navegar para Monitores

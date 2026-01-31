# Relatório: Fix do fluxo "Conectar conta — Mercado Livre"

## Causa raiz

**NÃO é CORS, NÃO é rota quebrada.** O problema é cold start do Render.

### Evidências (curl)

```
# Health check — servidor online responde em <1s
$ curl -w "HTTP %{http_code} TIME %{time_total}s" https://radarone.onrender.com/health
HTTP 200 TIME 0.559s

# CORS preflight — funciona corretamente
$ curl -X OPTIONS -H "Origin: https://radarone.com.br" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  https://radarone.onrender.com/api/sessions/MERCADO_LIVRE/upload
HTTP/2 204
access-control-allow-origin: https://radarone.com.br
access-control-allow-methods: GET,POST,PUT,DELETE,OPTIONS
access-control-allow-headers: Content-Type,Authorization

# POST sem auth — retorna 401 corretamente (rota existe)
$ curl -X POST -H "Content-Type: application/json" \
  https://radarone.onrender.com/api/sessions/MERCADO_LIVRE/upload \
  -d '{"storageState":"{}"}'
{"errorCode":"INVALID_TOKEN","message":"Token de autenticação não fornecido"}
```

### Diagnóstico

O screenshot do bug mostra **dois erros simultâneos**:
1. Banner "Erro ao carregar conexões — Servidor temporariamente indisponível" (GET /api/sessions falhou)
2. Toast "Erro ao conectar conta — Não foi possível conectar ao servidor após várias tentativas" (POST upload falhou)

Ambos indicam que o servidor estava em cold start (Render free tier). O `requestWithRetry` tentou 3× com 45s timeout cada, mas o servidor demorou mais de 135s para acordar, ou o usuário recarregou antes de completar.

A mensagem de erro `"Não foi possível conectar ao servidor após várias tentativas"` vem de `api.ts:152` — é disparada quando `fetch()` lança `TypeError` (erro de rede) em todas as tentativas.

## Correções implementadas

### 1. Health pre-check antes do upload
Antes de enviar o upload, o wizard faz um `GET /health` (15s timeout) para "acordar" o servidor. Isso aumenta a chance de o POST subsequente funcionar.

### 2. Erros inline no wizard (não mais apenas toast)
- Erro aparece **dentro do modal** com mensagem clara e botão "Tentar novamente"
- Mensagens diferenciadas por tipo:
  - **Network/cold start**: "O servidor não respondeu. Ele pode estar iniciando (até 60 segundos no primeiro acesso do dia)."
  - **401**: "Sua sessão de login expirou. Faça login novamente no RadarOne."
  - **400**: "O servidor rejeitou o arquivo. Verifique se é um arquivo de sessão válido."
  - **5xx**: "Erro interno no servidor."
- **Detalhes técnicos** visíveis para suporte (ex: "Código: NETWORK_ERROR | Tentativas: 3")

### 3. Aviso de servidor indisponível no wizard
Quando o `GET /api/sessions` da página já falhou (`fetchError`), o wizard mostra um alerta amarelo "Servidor iniciando" antes mesmo de tentar o upload.

### 4. Status de progresso durante upload
Botão mostra "Verificando servidor..." e depois "Enviando arquivo de sessão..." durante o processo.

## Arquivos alterados

- `frontend/src/pages/ConnectionsPage.tsx` — wizard com health pre-check, erros inline, status de progresso
- `frontend/src/pages/__tests__/ConnectionsPage.test.tsx` — 16 testes (server warning, submit disabled, etc.)

## Como testar em produção

1. Acesse `/settings/connections` quando o servidor estiver em cold start (espere >15 min sem acessar)
2. Verá o banner "Erro ao carregar conexões" + card ML via fallback
3. Clique "Conectar conta" → wizard deve mostrar alerta amarelo "Servidor iniciando"
4. Selecione um .json válido → badge verde
5. Clique "Conectar conta":
   - Se servidor ainda dormindo → erro inline com "Tentar novamente"
   - Se servidor acordou → sucesso
6. Clique "Tentar novamente" → segundo attempt geralmente funciona (server já acordou com o health ping)

## Configuração CORS atual (já correta)

```typescript
// backend/src/server.ts
const allowedOrigins = [
  'https://radarone-frontend.onrender.com',
  'https://radarone.com.br',
  'https://www.radarone.com.br',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost',
  process.env.FRONTEND_URL,
];
```

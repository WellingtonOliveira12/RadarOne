# RadarOne - Contrato de Códigos de Erro (errorCode)

## Introdução

Este documento define o contrato oficial de códigos de erro (`errorCode`) entre o backend e o frontend do RadarOne.

### O que é errorCode?

`errorCode` é um identificador único, determinístico e padronizado que o backend retorna em todas as respostas de erro. Ele permite que o frontend tome decisões precisas sobre como lidar com cada tipo de erro, sem depender de mensagens de texto (que podem mudar ou variar).

### Por que existe?

- **Determinismo**: Decisões baseadas em código, não em texto
- **Manutenibilidade**: Alterações em mensagens não quebram lógica do frontend
- **Internacionalização**: Mensagens podem ser traduzidas sem afetar a lógica
- **Segurança**: Evita vazamento de informações sensíveis em mensagens de erro
- **Debugging**: Facilita rastreamento e análise de erros

### Garantia de Estabilidade

Este é um **contrato público** entre backend e frontend:
- ✅ Backend **SEMPRE** retorna `errorCode` em respostas de erro
- ✅ Frontend **NUNCA** infere erros por texto (`includes`, `match`, etc.)
- ✅ Novos códigos serão adicionados a este documento
- ✅ Códigos existentes **NÃO** serão removidos (apenas deprecated)
- ✅ Mudanças seguem versionamento semântico

---

## Tabela Oficial de errorCodes

| errorCode | HTTP | Significado | Ação Frontend | Categoria |
|-----------|------|-------------|---------------|-----------|
| `INVALID_TOKEN` | 401 | Token ausente, inválido ou expirado | Logout → `/login?reason=session_expired` | Autenticação |
| `UNAUTHORIZED` | 401 | Requisição não autenticada | Logout → `/login` | Autenticação |
| `TRIAL_EXPIRED` | 403 | Período de trial finalizado | Redirect → `/plans?reason=trial_expired` (SEM logout) | Assinatura |
| `SUBSCRIPTION_REQUIRED` | 403 | Plano inexistente ou inválido | Redirect → `/plans?reason=subscription_required` (SEM logout) | Assinatura |
| `FORBIDDEN` | 403 | Acesso negado ao recurso | Mostrar erro ao usuário | Autorização |
| `NOT_FOUND` | 404 | Recurso não encontrado | Mostrar erro ao usuário | Cliente |
| `VALIDATION_ERROR` | 400 | Dados de entrada inválidos | Mostrar erros de validação | Cliente |
| `CONFLICT` | 409 | Conflito de estado (ex: email duplicado) | Mostrar erro específico | Cliente |
| `RATE_LIMIT_EXCEEDED` | 429 | Limite de requisições excedido | Mostrar erro e aguardar | Cliente |
| `INTERNAL_ERROR` | 500 | Erro interno do servidor | Mostrar erro genérico | Servidor |
| `SERVICE_UNAVAILABLE` | 503 | Serviço temporariamente indisponível | Mostrar erro e sugerir retry | Servidor |

---

## Estrutura de Resposta de Erro

Todas as respostas de erro do backend seguem este formato:

```json
{
  "errorCode": "TRIAL_EXPIRED",
  "message": "Seu período de teste terminou. Escolha um plano para continuar.",
  "details": {
    "trialEndedAt": "2025-12-15T10:30:00Z"
  }
}
```

### Campos Obrigatórios

- **errorCode** (string): Código único do erro (ver tabela acima)
- **message** (string): Mensagem legível para o usuário (pode ser internacionalizada)

### Campos Opcionais

- **details** (object): Informações adicionais específicas do erro

---

## Regras do Contrato

### Backend DEVE:

1. ✅ **Sempre retornar errorCode** em respostas de erro
2. ✅ **Usar códigos desta tabela** (ou documentar novos aqui)
3. ✅ **Retornar status HTTP correto** de acordo com a categoria
4. ✅ **Não expor stack traces** em produção
5. ✅ **Logar erros internos** para debugging

### Frontend DEVE:

1. ✅ **Basear decisões em errorCode + status HTTP**
2. ✅ **NUNCA inferir por texto** (`includes`, `match`, regex)
3. ✅ **Tratar errorCode ausente** como erro genérico
4. ✅ **Validar status HTTP primeiro**, depois errorCode
5. ✅ **Propagar erros não reconhecidos** para componentes de erro

---

## Exemplos de Uso

### Exemplo 1: Token Inválido (Logout)

**Request:**
```http
GET /api/admin/users
Authorization: Bearer <token-invalido>
```

**Response:**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "errorCode": "INVALID_TOKEN",
  "message": "Token inválido ou expirado"
}
```

**Ação Frontend:**
```typescript
// Interceptor detecta: status === 401 && errorCode === 'INVALID_TOKEN'
clearToken();
window.location.href = '/login?reason=session_expired';
```

---

### Exemplo 2: Trial Expirado (NÃO desloga)

**Request:**
```http
GET /api/keywords/search?keyword=exemplo
Authorization: Bearer <token-valido>
```

**Response:**
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "errorCode": "TRIAL_EXPIRED",
  "message": "Seu período de teste terminou",
  "details": {
    "trialEndedAt": "2025-12-15T10:30:00Z"
  }
}
```

**Ação Frontend:**
```typescript
// Interceptor detecta: status === 403 && errorCode === 'TRIAL_EXPIRED'
// NÃO limpa token
if (window.location.pathname !== '/plans') {
  window.location.href = '/plans?reason=trial_expired';
}
```

---

### Exemplo 3: Erro de Validação

**Request:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "invalid-email",
  "password": "123"
}
```

**Response:**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "errorCode": "VALIDATION_ERROR",
  "message": "Dados inválidos",
  "details": {
    "email": "Email inválido",
    "password": "Senha deve ter no mínimo 8 caracteres"
  }
}
```

**Ação Frontend:**
```typescript
// Mostrar erros de validação nos campos do formulário
setErrors(error.details);
```

---

## Lógica de Tratamento no Frontend

### Ordem de Avaliação (frontend/src/services/api.ts)

```typescript
if (!res.ok) {
  const errorCode = getErrorCode(data);

  // 1. Tratar erros de subscription/trial (403) - NÃO DESLOGA
  if (res.status === 403 && (errorCode === 'TRIAL_EXPIRED' || errorCode === 'SUBSCRIPTION_REQUIRED')) {
    // Redirecionar para /plans SEM limpar token
    if (window.location.pathname !== '/plans') {
      window.location.href = '/plans?reason=' + (errorCode === 'TRIAL_EXPIRED' ? 'trial_expired' : 'subscription_required');
    }
  }

  // 2. Tratar erros de autenticação (401) - DESLOGA
  const isAuthError =
    res.status === 401 &&
    (!errorCode || errorCode === 'INVALID_TOKEN');

  if (isAuthError) {
    clearToken();
    if (window.location.pathname !== '/login') {
      window.location.href = '/login?reason=session_expired';
    }
  }

  // 3. Propagar erro para componente
  const error: any = new Error(data.message || `Erro na requisição (${res.status})`);
  error.status = res.status;
  error.errorCode = errorCode;
  error.data = data;
  throw error;
}
```

### Regras Críticas

| Condição | Ação | Limpa Token? | Redirect |
|----------|------|--------------|----------|
| `status === 401` | Logout | ✅ Sim | `/login?reason=session_expired` |
| `status === 403 && errorCode === 'TRIAL_EXPIRED'` | Planos | ❌ Não | `/plans?reason=trial_expired` |
| `status === 403 && errorCode === 'SUBSCRIPTION_REQUIRED'` | Planos | ❌ Não | `/plans?reason=subscription_required` |
| `status === 403 && errorCode === 'FORBIDDEN'` | Erro | ❌ Não | Nenhum |

---

## Adicionando Novos errorCodes

1. ✅ Definir código único (UPPER_SNAKE_CASE)
2. ✅ Escolher status HTTP apropriado
3. ✅ Adicionar à tabela oficial acima
4. ✅ Documentar exemplos de uso
5. ✅ Implementar no backend
6. ✅ Atualizar frontend se necessário
7. ✅ Adicionar testes E2E

---

## Versionamento

- **Versão:** 1.0.0
- **Última atualização:** 2025-12-29
- **Responsável:** Equipe RadarOne

### Changelog

| Data | Versão | Mudanças |
|------|--------|----------|
| 2025-12-29 | 1.0.0 | Criação do contrato inicial com 11 errorCodes padronizados |

---

## Recursos Relacionados

- **Implementação Backend:** `backend/src/types/errors.ts`
- **Implementação Frontend:** `frontend/src/services/api.ts`
- **Testes E2E:** `frontend/tests/e2e/auth-*.spec.ts`
- **Analytics:** Eventos de erro são rastreados no Google Analytics 4

---

## Contato

Dúvidas ou sugestões sobre errorCodes:
- Abra uma issue no repositório
- Documente SEMPRE mudanças neste arquivo

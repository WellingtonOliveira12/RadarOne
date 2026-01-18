# Correção: Login Loop com 2FA Habilitado

**Data:** 2026-01-18
**Autor:** Claude Code
**Versão:** 1.0

## Resumo

Correção do bug de "login loop" que ocorria quando o 2FA (Two-Factor Authentication) estava habilitado no painel administrativo.

## Causa Raiz

Quando o 2FA estava habilitado para um usuário admin:

1. **Backend** retornava `{requiresTwoFactor: true, userId}` **SEM token e SEM user**
2. **Frontend (AuthContext)** tentava fazer:
   - `setToken(response.token)` → token era `undefined`
   - `setUser(response.user)` → user era `undefined`
3. **AdminProtectedRoute** verificava `user === null` e redirecionava para `/login`
4. **Resultado:** Loop infinito de redirecionamento

## Solução Implementada

### 1. Backend - Novo Enum AuthStep

Arquivo: `backend/src/controllers/auth.controller.ts`

```typescript
export enum AuthStep {
  NONE = 'NONE',
  TWO_FACTOR_REQUIRED = 'TWO_FACTOR_REQUIRED',
  AUTHENTICATED = 'AUTHENTICATED'
}
```

### 2. Backend - Endpoint /api/auth/status

Novo endpoint que retorna o estado completo de autenticação:

```typescript
GET /api/auth/status

Response:
{
  authStep: 'NONE' | 'TWO_FACTOR_REQUIRED' | 'AUTHENTICATED',
  isAuthenticated: boolean,
  twoFactorEnabled: boolean,
  twoFactorVerified: boolean,
  requiredStep: string | null,
  user?: User
}
```

### 3. Backend - Login com Token Temporário

Quando 2FA é necessário, o login agora retorna um token temporário (5 min de validade):

```typescript
{
  authStep: 'TWO_FACTOR_REQUIRED',
  requiresTwoFactor: true,
  tempToken: 'jwt...',  // Token temporário para verificação 2FA
  userId: 'xxx',
  message: 'Digite o código do seu aplicativo autenticador'
}
```

### 4. Frontend - Tipos de Resposta

Arquivo: `frontend/src/services/auth.ts`

```typescript
export type LoginResponse = LoginSuccessResponse | LoginTwoFactorRequiredResponse;

export function isTwoFactorRequired(response: LoginResponse): response is LoginTwoFactorRequiredResponse;
```

### 5. Frontend - TwoFactorRequiredError

Arquivo: `frontend/src/context/AuthContext.tsx`

```typescript
export class TwoFactorRequiredError extends Error {
  public readonly tempToken: string;
  public readonly userId: string;
}
```

### 6. Frontend - Página de Verificação 2FA

Arquivo: `frontend/src/pages/TwoFactorVerifyPage.tsx`

Nova página que:
- Recebe tempToken e userId via state de navegação
- Permite input de código TOTP (6 dígitos)
- Permite uso de código de backup
- Redireciona para admin/dashboard após verificação

### 7. Frontend - LoginPage Atualizada

A LoginPage agora captura `TwoFactorRequiredError` e redireciona para `/2fa/verify`:

```typescript
catch (err: any) {
  if (err instanceof TwoFactorRequiredError) {
    navigate('/2fa/verify', {
      state: { tempToken: err.tempToken, userId: err.userId }
    });
    return;
  }
  // ... tratamento de outros erros
}
```

## Arquivos Modificados

### Backend
- `src/controllers/auth.controller.ts` - Adicionado AuthStep enum, endpoint /auth/status, token temporário
- `src/routes/auth.routes.ts` - Adicionada rota GET /api/auth/status

### Frontend
- `src/services/auth.ts` - Novos tipos de resposta e type guard
- `src/context/AuthContext.tsx` - TwoFactorRequiredError, authStep state, tratamento de 2FA
- `src/pages/LoginPage.tsx` - Captura TwoFactorRequiredError e redireciona
- `src/pages/TwoFactorVerifyPage.tsx` - Nova página de verificação 2FA
- `src/router.tsx` - Adicionada rota /2fa/verify
- `tests/e2e/two-factor-auth.spec.ts` - Testes E2E para fluxo 2FA

## Fluxo Corrigido

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Login     │────>│   Backend    │────>│  2FA Required?  │────>│  /2fa/verify │
│   Page      │     │   /auth/login│     │                 │     │    Page      │
└─────────────┘     └──────────────┘     └─────────────────┘     └──────────────┘
                                                │                        │
                                                │ Não                    │ Código OK
                                                ▼                        ▼
                                         ┌─────────────┐          ┌─────────────┐
                                         │  Token +    │          │  Token Final│
                                         │  User       │          │  + User     │
                                         └─────────────┘          └─────────────┘
                                                │                        │
                                                ▼                        ▼
                                         ┌─────────────────────────────────────┐
                                         │         /admin/* ou /dashboard       │
                                         └─────────────────────────────────────┘
```

## Como Validar

### Ambiente Local
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev
```

### Teste Manual
1. Ativar 2FA em um admin de teste (`/admin/security`)
2. Fazer logout
3. Fazer login novamente:
   - Deve ir para tela de OTP (`/2fa/verify`)
   - Após OTP válido, deve entrar no `/admin/stats`
4. Recarregar página do admin: deve permanecer logado
5. Testar logout e login novamente
6. Verificar se usuário SEM 2FA continua logando normalmente

### Testes E2E
```bash
cd frontend && npx playwright test tests/e2e/two-factor-auth.spec.ts
```

## Produção (Render)

Para deploy no Render:
1. Fazer commit das alterações
2. Push para branch main
3. Render detectará e fará deploy automático
4. Aguardar build completo de backend e frontend
5. Validar fluxo em produção

## Possíveis Efeitos Colaterais

- **Tokens antigos:** Tokens JWT emitidos antes desta correção não têm o claim `twoFactorVerified`. O endpoint `/auth/status` trata isso verificando se 2FA está habilitado para o usuário.

- **Sessões existentes:** Usuários com 2FA habilitado que tinham sessão ativa precisarão fazer login novamente após o deploy.

## Blindagem Extra Implementada

Conforme solicitado, foi implementado:

1. **AUTH_STEP único:** Enum com estados claros (NONE, TWO_FACTOR_REQUIRED, AUTHENTICATED)

2. **Endpoint /auth/status:** Retorna estado completo:
   - `isAuthenticated`
   - `twoFactorEnabled`
   - `twoFactorVerified`
   - `requiredStep`

3. **Token temporário:** Quando 2FA é necessário, emite token temporário de 5 min que só serve para verificação 2FA, não para acesso a recursos.

---

*Este documento foi gerado automaticamente como parte da correção do bug de login loop com 2FA.*

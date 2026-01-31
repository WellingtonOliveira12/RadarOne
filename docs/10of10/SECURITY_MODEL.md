# RadarOne — Security Model

## Modelo de Autenticação

### Arquitetura (Hybrid Token)

```
┌──────────────┐     POST /auth/login      ┌──────────────┐
│   Frontend   │ ─────────────────────────> │   Backend    │
│   (SPA)      │ <───────────────────────── │   (Express)  │
│              │  { token (15min) }         │              │
│              │  Set-Cookie: refresh       │              │
│              │  (httpOnly, Secure, 7d)    │              │
└──────────────┘                            └──────────────┘
```

1. **Access Token (JWT)**: Curto (15 min), retornado no body, armazenado em memória
2. **Refresh Token**: Longo (7 dias), httpOnly cookie, rotação on-use
3. **CSRF**: SameSite=None+Secure (cross-origin Render), path restrito a `/api/auth`

### Fluxo de Login
1. `POST /api/auth/login` com email + password
2. Backend valida credenciais (bcrypt)
3. Se 2FA habilitado: retorna `tempToken` (5min) + `authStep: TWO_FACTOR_REQUIRED`
4. Se OK: retorna access token + Set-Cookie refresh token
5. Frontend armazena access token em memória (`inMemoryToken`)
6. Frontend mantém localStorage como fallback de transição

### Fluxo de Refresh
1. Access token expira (15 min)
2. Request retorna 401
3. Frontend intercepta e chama `POST /api/auth/refresh` com `credentials: 'include'`
4. Backend valida refresh cookie, rotaciona token (invalidate-on-use)
5. Retorna novo access token + novo refresh cookie
6. Request original é retentado com novo token

### Replay Protection (Família de Tokens)
- Cada login cria uma "família" de tokens
- Quando token é rotacionado, o antigo é marcado como `revokedAt` + `replacedBy`
- Se um token JÁ REVOGADO é usado → **replay attack detectado**
- Toda a família é revogada imediatamente
- Resultado: atacante E usuário legítimo perdem acesso → forçam re-login

### Fluxo de Logout
1. Frontend chama `POST /api/auth/logout` com `credentials: 'include'`
2. Backend revoga o refresh token específico
3. Backend revoga TODOS os tokens do usuário (logout completo)
4. Cookie é limpo no response
5. Frontend limpa memória + localStorage

### Validação de Input (Zod)
- Rotas de auth usam middleware `validate(schema)`
- Schemas em `src/schemas/api-responses.ts`
- Email: trim + lowercase antes de validar
- Password: min 8 chars (registro), min 1 (login)
- Erros retornam `{ errorCode: 'VALIDATION_ERROR', details: {...} }`

### RBAC (Admin)
- Middleware `requireAdmin` verifica role no banco
- Roles: `ADMIN`, `ADMIN_SUPER`, `ADMIN_SUPPORT`, `ADMIN_FINANCE`, `ADMIN_READ`
- Todas verificadas antes de acessar `/api/admin/*`

## Env Vars de Segurança
| Variável | Descrição | Obrigatório |
|----------|-----------|-------------|
| `JWT_SECRET` | Secret para assinar JWTs | Sim |
| `ACCESS_TOKEN_EXPIRES_IN` | Expiração do access token (default: 15m) | Não |
| `PASSWORD_RESET_SECRET` | Secret separada para reset (prod) | Prod only |

## Checklist OWASP
- [x] A01 Broken Access Control: requireAdmin implementado
- [x] A02 Cryptographic Failures: bcrypt (10 rounds), AES-256-GCM para CPF
- [x] A03 Injection: Zod validation, Prisma (parameterized queries)
- [x] A04 Insecure Design: Refresh token rotation + replay detection
- [x] A05 Security Misconfiguration: CORS whitelist, trust proxy, rate limiting
- [x] A07 Auth Failures: httpOnly cookies, short-lived access tokens, 2FA support

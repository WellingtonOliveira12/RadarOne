# RadarOne — Contratos de API

## Abordagem: Zod Schemas + Validação Runtime

### Localização dos Schemas
- **Backend**: `backend/src/schemas/api-responses.ts`
- **Shared**: `shared/schemas/api-responses.ts` (cópia para frontend)
- **Frontend**: `frontend/src/validation/authSchemas.ts` (schemas de UI)

### Middleware de Validação
```typescript
// backend/src/middlewares/validate.middleware.ts
import { validate } from '../middlewares/validate.middleware';
import { LoginRequestSchema } from '../schemas/api-responses';

router.post('/login', validate(LoginRequestSchema), AuthController.login);
```

Retorna 400 com formato padronizado:
```json
{
  "errorCode": "VALIDATION_ERROR",
  "message": "Dados inválidos",
  "details": {
    "email": ["E-mail inválido"],
    "password": ["Senha é obrigatória"]
  }
}
```

### Schemas Disponíveis

#### Auth
| Schema | Uso |
|--------|-----|
| `LoginRequestSchema` | POST /api/auth/login |
| `RegisterRequestSchema` | POST /api/auth/register |
| `Verify2FARequestSchema` | POST /api/auth/2fa/verify |
| `ForgotPasswordRequestSchema` | POST /api/auth/forgot-password |
| `ResetPasswordRequestSchema` | POST /api/auth/reset-password |

#### Responses
| Schema | Uso |
|--------|-----|
| `LoginResponseSchema` | Discriminated union (AUTHENTICATED \| TWO_FACTOR_REQUIRED) |
| `RefreshResponseSchema` | POST /api/auth/refresh |
| `UserSchema` | Objeto de usuário em responses |
| `MonitorSchema` | Objeto de monitor |
| `SubscriptionSchema` | Objeto de subscription |
| `PlanSchema` | Objeto de plano |

#### Utilities
| Schema | Uso |
|--------|-----|
| `ApiErrorSchema` | Formato padrão de erro |
| `PaginationQuerySchema` | Query params de paginação |
| `PaginatedResponseSchema` | Wrapper de lista paginada |

### Response Padrão
```typescript
// Sucesso
{ data: T, meta?: { requestId, timestamp } }

// Erro (SEMPRE)
{ errorCode: string, message: string, details?: any }
```

### Tipos Exportados
Todos os schemas exportam tipos via `z.infer`:
```typescript
import type { LoginRequest, User, Monitor } from '../schemas/api-responses';
```

# FASE 4.6 - JWT Blacklist com Redis

## Objetivo

Implementar revogação imediata de tokens JWT usando Redis blacklist para melhorar segurança.

## Problema Atual

- Tokens JWT válidos continuam funcionando até expiração natural (7d user, 4h admin)
- Logout não revoga token (apenas remove do client-side)
- Mudança de senha não invalida tokens antigos
- Bloqueio de usuário não invalida tokens ativos
- Tokens roubados podem ser usados até expiração

## Solução Proposta

Implementar **blacklist de tokens** usando Redis para revogação imediata.

### Arquitetura

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Client      │      │  Backend     │      │  Redis       │
│  (Browser)   │◄────►│  (Node.js)   │◄────►│  (Blacklist) │
└──────────────┘      └──────────────┘      └──────────────┘
       │                      │                      │
       │  1. POST /logout    │                      │
       ├─────────────────────►│                      │
       │                      │  2. ADD token to     │
       │                      │     blacklist        │
       │                      ├─────────────────────►│
       │                      │  3. SET token:hash   │
       │                      │     EX ttl           │
       │                      │◄─────────────────────┤
       │  4. 200 OK          │                      │
       │◄─────────────────────┤                      │
       │                      │                      │
       │  5. API request     │                      │
       │     with token      │                      │
       ├─────────────────────►│                      │
       │                      │  6. CHECK blacklist  │
       │                      ├─────────────────────►│
       │                      │  GET token:hash      │
       │                      │◄─────────────────────┤
       │  7. 401 UNAUTHORIZED │                      │
       │◄─────────────────────┤                      │
```

## Implementação

### 1. Dependências

```bash
npm install redis ioredis
npm install -D @types/redis
```

### 2. Configuração Redis

**Variáveis de ambiente (.env):**

```env
# Redis Configuration
REDIS_URL=redis://localhost:6379
# Produção: redis://user:password@host:port/db
# Render: redis://red-xxxxx.redis.render.com:6379
```

### 3. Cliente Redis

**Arquivo:** `src/utils/redis.ts`

```typescript
import { Redis } from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      }
    });

    redisClient.on('error', (err) => {
      console.error('[REDIS] Connection error:', err);
    });

    redisClient.on('connect', () => {
      console.log('[REDIS] Connected successfully');
    });
  }

  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
```

### 4. Serviço de Blacklist

**Arquivo:** `src/services/tokenBlacklistService.ts`

```typescript
import { getRedisClient } from '../utils/redis';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Gera hash SHA256 do token para armazenamento
 * (reduz tamanho da key e evita vazamento de token em logs)
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Calcula TTL restante do token JWT
 */
function getTokenTTL(token: string): number {
  try {
    const decoded = jwt.decode(token) as any;
    if (!decoded || !decoded.exp) {
      return 0;
    }

    const now = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp - now;
    return Math.max(0, ttl);
  } catch {
    return 0;
  }
}

/**
 * Adiciona token à blacklist
 * @param token JWT token a ser revogado
 * @param reason Motivo da revogação (para auditoria)
 * @returns true se adicionado com sucesso
 */
export async function blacklistToken(
  token: string,
  reason: string = 'logout'
): Promise<boolean> {
  const redis = getRedisClient();
  const tokenHash = hashToken(token);
  const ttl = getTokenTTL(token);

  if (ttl <= 0) {
    // Token já expirado, não precisa blacklist
    return true;
  }

  // Key format: blacklist:token:hash
  const key = `blacklist:token:${tokenHash}`;

  // Value: { reason, blacklistedAt }
  const value = JSON.stringify({
    reason,
    blacklistedAt: new Date().toISOString()
  });

  // SET com TTL = tempo restante do token
  await redis.setex(key, ttl, value);

  console.log(`[BLACKLIST] Token revogado: ${reason} (TTL: ${ttl}s)`);
  return true;
}

/**
 * Verifica se token está na blacklist
 * @param token JWT token a verificar
 * @returns true se está blacklisted
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const redis = getRedisClient();
  const tokenHash = hashToken(token);
  const key = `blacklist:token:${tokenHash}`;

  const exists = await redis.exists(key);
  return exists === 1;
}

/**
 * Remove token da blacklist (caso necessário reverter)
 * @param token JWT token
 */
export async function unblacklistToken(token: string): Promise<boolean> {
  const redis = getRedisClient();
  const tokenHash = hashToken(token);
  const key = `blacklist:token:${tokenHash}`;

  const deleted = await redis.del(key);
  return deleted > 0;
}

/**
 * Conta tokens blacklisted (para monitoramento)
 */
export async function countBlacklistedTokens(): Promise<number> {
  const redis = getRedisClient();
  const keys = await redis.keys('blacklist:token:*');
  return keys.length;
}
```

### 5. Atualizar Middleware de Autenticação

**Arquivo:** `src/middlewares/auth.middleware.ts`

```typescript
import { isTokenBlacklisted } from '../services/tokenBlacklistService';

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw AppError.invalidToken('Token de autenticação não fornecido');
    }

    // NOVO: Verificar blacklist
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw AppError.invalidToken('Token revogado. Faça login novamente');
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET não configurado');
    }

    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(AppError.invalidToken('Token de autenticação inválido ou expirado'));
    }
  }
};
```

### 6. Implementar Logout

**Arquivo:** `src/controllers/auth.controller.ts`

```typescript
import { blacklistToken } from '../services/tokenBlacklistService';

/**
 * Logout (revoga token)
 * POST /api/auth/logout
 */
static async logout(req: Request, res: Response): Promise<void> {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(400).json({ error: 'Token não fornecido' });
      return;
    }

    // Adicionar token à blacklist
    await blacklistToken(token, 'user_logout');

    logInfo('User logged out', {
      userId: req.userId,
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Logout realizado com sucesso'
    });
  } catch (error) {
    logError('Failed to logout', { err: error });
    res.status(500).json({ error: 'Erro ao fazer logout' });
  }
}
```

### 7. Revogar Tokens em Eventos Críticos

**a) Mudança de Senha:**

```typescript
// src/controllers/auth.controller.ts

static async resetPassword(...) {
  // ... código existente ...

  // Atualizar senha
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newPasswordHash }
  });

  // NOVO: Buscar todos os tokens ativos do usuário (se tiver lista)
  // OU: Instruir usuário a fazer login novamente
  // (JWT stateless não permite listar tokens ativos facilmente)

  // Opção: Adicionar campo lastPasswordChanged e validar no middleware
  res.json({
    message: 'Senha alterada. Por segurança, faça login novamente.'
  });
}
```

**b) Bloqueio de Usuário:**

```typescript
// src/controllers/admin.controller.ts

static async blockUser(...) {
  // ... código existente ...

  await prisma.user.update({
    where: { id: targetUserId },
    data: { blocked: true }
  });

  // NOVO: Invalidar todos os tokens do usuário
  // Nota: JWT stateless não permite listar tokens ativos
  // Solução: Adicionar validação no middleware (user.blocked)

  res.json({
    message: 'Usuário bloqueado. Tokens serão invalidados no próximo request.'
  });
}
```

## Infraestrutura

### Redis no Render (Produção)

1. **Criar Redis instance:**
   - Dashboard → New → Redis
   - Plan: Free (25MB) ou Starter ($7/mo, 256MB)
   - Region: Same as backend (latência)

2. **Copiar REDIS_URL:**
   - Format: `redis://red-xxxxx:6379`
   - Add to Environment Variables

3. **Configurar no Backend:**
   ```env
   REDIS_URL=redis://red-xxxxx:port
   ```

### Redis Local (Desenvolvimento)

```bash
# Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Homebrew (macOS)
brew install redis
brew services start redis

# APT (Ubuntu)
sudo apt-get install redis-server
sudo systemctl start redis
```

## Testes

### 1. Teste Manual

```bash
# 1. Login
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  | jq -r '.token')

# 2. Acessar recurso protegido (deve funcionar)
curl http://localhost:3000/api/me \
  -H "Authorization: Bearer $TOKEN"

# 3. Logout
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"

# 4. Tentar acessar novamente (deve retornar 401)
curl http://localhost:3000/api/me \
  -H "Authorization: Bearer $TOKEN"
```

### 2. Teste Automatizado

```typescript
// tests/auth.blacklist.test.ts

describe('JWT Blacklist', () => {
  it('should revoke token on logout', async () => {
    // Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password' });

    const token = loginRes.body.token;

    // Access protected route (should work)
    const meRes1 = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes1.status).toBe(200);

    // Logout
    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    // Access again (should fail)
    const meRes2 = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes2.status).toBe(401);
  });
});
```

## Monitoramento

### Métricas Redis

```bash
# Conectar ao Redis CLI
redis-cli

# Ver keys blacklisted
KEYS blacklist:token:*

# Contar tokens blacklisted
DBSIZE

# Info de memória
INFO memory

# Stats
INFO stats
```

### Dashboard de Monitoramento

```typescript
// src/controllers/admin.controller.ts

static async getBlacklistStats(req: Request, res: Response) {
  const totalBlacklisted = await countBlacklistedTokens();
  const redis = getRedisClient();
  const info = await redis.info('memory');

  res.json({
    totalTokensBlacklisted: totalBlacklisted,
    redisMemoryUsed: parseInfo(info, 'used_memory_human'),
    redisConnections: parseInfo(info, 'connected_clients')
  });
}
```

## Rollout em Produção

### Fase 1: Setup Infraestrutura
1. Criar Redis instance no Render
2. Adicionar REDIS_URL ao backend
3. Deploy backend (sem usar blacklist ainda)
4. Testar conexão Redis

### Fase 2: Implementar Blacklist
5. Implementar código do blacklist
6. Deploy em staging
7. Testar logout, reset password, block user
8. Monitorar Redis metrics

### Fase 3: Produção
9. Deploy em produção
10. Monitorar logs e erros
11. Validar que tokens são revogados corretamente

## Alternativas Consideradas

### 1. Refresh Tokens

**Pros:**
- Token de acesso curto (15min)
- Refresh token de longa duração (30d)
- Revogação granular

**Cons:**
- Complexidade maior
- Dois tokens para gerenciar
- Storage no client

### 2. Session-based Auth

**Pros:**
- Revogação trivial (delete session)
- Controle total

**Cons:**
- Stateful (perde benefício de JWT)
- Requer session store (Redis)
- Não escala horizontalmente sem Redis

### 3. JWT com TTL curto

**Pros:**
- Simples
- Sem blacklist

**Cons:**
- UX ruim (relogin frequente)
- Não resolve revogação imediata

**Decisão:** **JWT Blacklist** é o melhor trade-off para RadarOne.

## Custos

### Render Redis
- **Free:** 25MB, 10 conexões
- **Starter:** $7/mo, 256MB, 50 conexões
- **Standard:** $15/mo, 1GB, 100 conexões

### Estimativa de Uso
- Token hash: 64 bytes
- Metadata: ~100 bytes
- **Total por token:** ~200 bytes

**Capacidade:**
- Free (25MB): ~125,000 tokens
- Starter (256MB): ~1,280,000 tokens

Para 1000 usuários com 2 dispositivos cada:
- 2000 tokens ativos
- ~400KB usado
- **Free tier é suficiente**

## Próximos Passos

1. ✅ Revisar documentação
2. ⏳ Criar Redis instance no Render
3. ⏳ Implementar código
4. ⏳ Testes em staging
5. ⏳ Deploy em produção
6. ⏳ Monitorar por 7 dias

## Referências

- [Redis Documentation](https://redis.io/documentation)
- [ioredis GitHub](https://github.com/redis/ioredis)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [OWASP Token Revocation](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html#token-sidejacking)

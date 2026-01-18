import rateLimit from 'express-rate-limit';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { RATE_LIMIT_CONFIG, DEFAULT_RATE_LIMITS, RATE_LIMIT_EXEMPT_PATHS } from '../config/rateLimitConfig';
import { logWarning } from '../utils/loggerHelpers';
import { prisma } from '../lib/prisma';

/**
 * Rate Limiting Middleware
 * Protege a API contra abuso e ataques de força bruta
 *
 * FASE 4.5: Rate limiting granular por endpoint e role
 *
 * NOTA: Rate limiting é DESABILITADO em ambiente de teste (NODE_ENV=test)
 * para permitir que testes E2E executem sem serem bloqueados
 */

// Middleware noop para ambiente de teste
const noopRateLimiter = (_req: Request, _res: Response, next: NextFunction) => {
  next();
};

// Rate limit para rotas de autenticação (login, register, reset password)
// Limite: 10 requisições por 15 minutos por IP
export const authRateLimiter = process.env.NODE_ENV === 'test'
  ? noopRateLimiter
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 10, // máximo 10 requisições
      message: {
        error: 'Muitas tentativas de autenticação. Tente novamente em 15 minutos.'
      },
      standardHeaders: true, // Retorna info no `RateLimit-*` headers
      legacyHeaders: false, // Desabilita `X-RateLimit-*` headers
      skipSuccessfulRequests: false, // Conta requisições bem-sucedidas também
    });

// Rate limit para API geral
// Limite: 120 requisições por minuto por IP
export const apiRateLimiter = process.env.NODE_ENV === 'test'
  ? noopRateLimiter
  : rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minuto
      max: 120, // máximo 120 requisições
      message: {
        error: 'Muitas requisições. Aguarde um momento antes de tentar novamente.'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Não aplicar rate limit em health checks e rotas de status
        return req.path === '/api/test' || req.path === '/health' || req.path === '/healthz' || req.path === '/';
      }
    });

// Rate limit estrito para rotas sensíveis (forgot password)
// Limite: 5 requisições por hora por IP
export const strictRateLimiter = process.env.NODE_ENV === 'test'
  ? noopRateLimiter
  : rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hora
      max: 5, // máximo 5 requisições
      message: {
        error: 'Muitas tentativas. Por segurança, tente novamente em 1 hora.'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

// ============================================
// FASE 4.5 - Rate Limiting Granular
// ============================================

/**
 * Extrai role do usuário do token JWT
 * Retorna 'user' se não autenticado ou 'admin' se é admin
 */
async function getUserRole(req: Request): Promise<'user' | 'admin'> {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return 'user'; // Sem token = user não autenticado
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return 'user';
    }

    const decoded = jwt.verify(token, secret) as any;
    const userId = decoded.userId;

    if (!userId) {
      return 'user';
    }

    // Buscar role do usuário no banco
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (!user) {
      return 'user';
    }

    // Qualquer role que comece com ADMIN é considerada admin
    return user.role.startsWith('ADMIN') ? 'admin' : 'user';
  } catch (error) {
    // Em caso de erro (token inválido, etc), trata como user
    return 'user';
  }
}

/**
 * Loga violação de rate limit
 */
function logRateLimitViolation(req: Request, role: 'user' | 'admin', endpointKey: string) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown') as string;
  const userAgent = req.headers['user-agent'] || 'unknown';

  logWarning('[RATE LIMIT] Violation detected', {
    endpoint: endpointKey,
    role,
    ip,
    userAgent,
    method: req.method,
    path: req.path,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Cria middleware de rate limit granular para um endpoint específico
 * Aplica limites diferentes para user vs admin
 */
function createGranularRateLimiter(endpointKey: string) {
  if (process.env.NODE_ENV === 'test') {
    return noopRateLimiter;
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Verificar se endpoint está isento
      if (RATE_LIMIT_EXEMPT_PATHS.includes(req.path)) {
        next();
        return;
      }

      // Obter role do usuário
      const role = await getUserRole(req);

      // Buscar configuração de rate limit para este endpoint e role
      const config = RATE_LIMIT_CONFIG[endpointKey];
      const limits = config ? config[role] : DEFAULT_RATE_LIMITS[role];

      // Criar rate limiter específico para este endpoint + role
      const limiter = rateLimit({
        windowMs: limits.windowMs,
        max: limits.maxRequests,
        message: {
          error: limits.message || 'Muitas requisições. Aguarde um momento.',
        },
        standardHeaders: true,
        legacyHeaders: false,
        // Key generator: usa IP + endpoint + role para segregar limites
        keyGenerator: (req) => {
          const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown') as string;
          return `${ip}:${endpointKey}:${role}`;
        },
        // Handler de violação
        handler: (req, res) => {
          logRateLimitViolation(req, role, endpointKey);
          res.status(429).json({
            error: limits.message || 'Muitas requisições. Aguarde um momento.',
          });
        },
      });

      // Aplicar o limiter
      limiter(req, res, next);
    } catch (error) {
      // Em caso de erro, permitir requisição (fail-open)
      console.error('[RATE LIMIT] Error applying granular rate limit:', error);
      next();
    }
  };
}

/**
 * Middleware genérico de rate limiting granular
 * Detecta automaticamente o endpoint e aplica o limite apropriado
 */
export const granularRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }

  try {
    // Verificar se endpoint está isento
    if (RATE_LIMIT_EXEMPT_PATHS.includes(req.path)) {
      next();
      return;
    }

    // Construir chave do endpoint (METHOD:PATH)
    // Normalizar :id para padrão consistente
    const normalizedPath = req.path.replace(/\/[a-f0-9-]{20,}/g, '/:id');
    const endpointKey = `${req.method}:${normalizedPath}`;

    // Obter role do usuário
    const role = await getUserRole(req);

    // Buscar configuração de rate limit
    const config = RATE_LIMIT_CONFIG[endpointKey];
    const limits = config ? config[role] : DEFAULT_RATE_LIMITS[role];

    // Criar rate limiter dinâmico
    const limiter = rateLimit({
      windowMs: limits.windowMs,
      max: limits.maxRequests,
      message: {
        error: limits.message || 'Muitas requisições. Aguarde um momento.',
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown') as string;
        return `${ip}:${endpointKey}:${role}`;
      },
      handler: (req, res) => {
        logRateLimitViolation(req, role, endpointKey);
        res.status(429).json({
          error: limits.message || 'Muitas requisições. Aguarde um momento.',
        });
      },
    });

    limiter(req, res, next);
  } catch (error) {
    // Em caso de erro, permitir requisição (fail-open)
    console.error('[RATE LIMIT] Error in granular rate limiter:', error);
    next();
  }
};

/**
 * Exporta função para criar rate limiters específicos
 * Útil para aplicar em rotas específicas
 */
export { createGranularRateLimiter };

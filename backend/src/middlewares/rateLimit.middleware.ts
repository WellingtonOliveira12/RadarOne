import rateLimit from 'express-rate-limit';
import { NextFunction, Request, Response } from 'express';

/**
 * Rate Limiting Middleware
 * Protege a API contra abuso e ataques de força bruta
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

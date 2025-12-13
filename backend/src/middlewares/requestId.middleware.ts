import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { createChildLogger } from '../logger';

/**
 * Middleware de Request ID
 *
 * Gera um ID único para cada requisição HTTP, permitindo correlação de logs.
 *
 * Funcionalidades:
 * - Gera requestId único (UUID v4)
 * - Anexa em req.requestId
 * - Retorna em header x-request-id
 * - Cria child logger com requestId em req.logger
 */

// Estender interface do Request do Express
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      logger?: ReturnType<typeof createChildLogger>;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Gerar requestId único
  const requestId = randomUUID();

  // Anexar ao request
  req.requestId = requestId;

  // Criar child logger com requestId para uso em controllers
  req.logger = createChildLogger({
    requestId,
    method: req.method,
    url: req.url,
    userId: (req as any).user?.id, // Se autenticado, incluir userId
  });

  // Adicionar header na resposta
  res.setHeader('x-request-id', requestId);

  // Logar requisição
  req.logger.info({
    req: {
      method: req.method,
      url: req.url,
      query: req.query,
      ip: req.ip || req.socket.remoteAddress,
    },
  }, 'Incoming request');

  // Capturar tempo de resposta
  const startTime = Date.now();

  // Hook para logar resposta
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    req.logger![logLevel]({
      res: {
        statusCode: res.statusCode,
      },
      duration,
    }, 'Request completed');
  });

  next();
}

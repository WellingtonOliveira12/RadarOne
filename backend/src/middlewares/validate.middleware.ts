import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

/**
 * Middleware de validação com Zod
 * Valida body, query ou params do request contra um schema Zod.
 *
 * Uso:
 *   router.post('/login', validate(LoginRequestSchema), AuthController.login);
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const errors = result.error.flatten();
      res.status(400).json({
        errorCode: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: errors.fieldErrors,
      });
      return;
    }

    // Substituir dados parseados (aplica transforms como .trim().toLowerCase())
    req[source] = result.data;
    next();
  };
}

/**
 * Middleware de validação de query params com paginação
 */
export function validateQuery(schema: ZodSchema) {
  return validate(schema, 'query');
}

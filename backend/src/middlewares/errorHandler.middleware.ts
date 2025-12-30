import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { ErrorCodes } from '../constants/errorCodes';
import { logAppError, logUnexpectedError } from '../utils/loggerHelpers';

/**
 * Middleware global de tratamento de erros
 * SEMPRE retorna { errorCode, message, details? }
 * Nunca retorna { error }
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Se for AppError, já temos tudo padronizado
  if (err instanceof AppError) {
    const response: any = {
      errorCode: err.errorCode,
      message: err.message,
    };

    if (err.details) {
      response.details = err.details;
    }

    // Log estruturado com helper type-safe
    logAppError({
      errorCode: err.errorCode,
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      userId: (req as any).userId,
    });

    res.status(err.statusCode).json(response);
    return;
  }

  // Erro desconhecido/não tratado → INTERNAL_ERROR
  logUnexpectedError({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    errorCode: ErrorCodes.INTERNAL_ERROR,
    message: process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor'
      : err.message,
  });
};

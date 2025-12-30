import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { ErrorCodes } from '../constants/errorCodes';
import logger from '../logger';

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

    // Log estruturado
    logger.error({
      errorCode: err.errorCode,
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      userId: (req as any).userId,
    }, 'AppError');

    res.status(err.statusCode).json(response);
    return;
  }

  // Erro desconhecido/não tratado → INTERNAL_ERROR
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  }, 'Unexpected error');

  res.status(500).json({
    errorCode: ErrorCodes.INTERNAL_ERROR,
    message: process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor'
      : err.message,
  });
};

import { ErrorCodes, ErrorCode } from '../constants/errorCodes';

/**
 * Erro padronizado da aplicação
 * Garante que SEMPRE exista errorCode em respostas de erro
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCode | string;
  public readonly details?: any;

  constructor(
    statusCode: number,
    errorCode: ErrorCode | string,
    message: string,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;

    // Mantém stack trace correto
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Factory methods para erros comuns
   */
  static invalidToken(message = 'Token de autenticação inválido ou expirado'): AppError {
    return new AppError(401, ErrorCodes.INVALID_TOKEN, message);
  }

  static unauthorized(message = 'Não autorizado'): AppError {
    return new AppError(401, ErrorCodes.UNAUTHORIZED, message);
  }

  static trialExpired(message = 'Seu período de teste gratuito expirou. Assine um plano para continuar.'): AppError {
    return new AppError(403, ErrorCodes.TRIAL_EXPIRED, message);
  }

  static subscriptionRequired(message = 'Assinatura necessária para acessar este recurso'): AppError {
    return new AppError(403, ErrorCodes.SUBSCRIPTION_REQUIRED, message);
  }

  static forbidden(message = 'Acesso negado'): AppError {
    return new AppError(403, ErrorCodes.FORBIDDEN, message);
  }

  static userAlreadyExists(message = 'Usuário já existe'): AppError {
    return new AppError(409, ErrorCodes.USER_ALREADY_EXISTS, message);
  }

  static emailNotFound(message = 'Email não encontrado'): AppError {
    return new AppError(404, ErrorCodes.EMAIL_NOT_FOUND, message);
  }

  static validationError(message: string, details?: any): AppError {
    return new AppError(400, ErrorCodes.VALIDATION_ERROR, message, details);
  }

  static internalError(message = 'Erro interno do servidor'): AppError {
    return new AppError(500, ErrorCodes.INTERNAL_ERROR, message);
  }
}

import { Response } from 'express';

/**
 * Estrutura padronizada de erro da API
 */
export interface ApiError {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}

/**
 * Códigos de erro padronizados da API
 */
export const ErrorCodes = {
  // Validação (400)
  INVALID_EMAIL: 'INVALID_EMAIL',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  INVALID_URL: 'INVALID_URL',
  INVALID_CPF: 'INVALID_CPF',
  MISSING_REQUIRED_FIELDS: 'MISSING_REQUIRED_FIELDS',
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Autenticação (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_NOT_PROVIDED: 'TOKEN_NOT_PROVIDED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // Autorização (403)
  FORBIDDEN: 'FORBIDDEN',
  TRIAL_EXPIRED: 'TRIAL_EXPIRED',
  NO_SUBSCRIPTION: 'NO_SUBSCRIPTION',
  USER_BLOCKED: 'USER_BLOCKED',
  PLAN_LIMIT_EXCEEDED: 'PLAN_LIMIT_EXCEEDED',

  // Recursos (404)
  NOT_FOUND: 'NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  MONITOR_NOT_FOUND: 'MONITOR_NOT_FOUND',

  // Conflito (409)
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',

  // Servidor (500)
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

/**
 * Envia resposta de erro padronizada
 *
 * @param res Response do Express
 * @param status Status HTTP
 * @param code Código do erro (use ErrorCodes)
 * @param message Mensagem amigável
 * @param field Campo relacionado ao erro (opcional)
 *
 * @example
 * sendError(res, 400, ErrorCodes.INVALID_EMAIL, 'Email inválido', 'email');
 */
export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  field?: string
): void {
  const errorResponse: ApiError = {
    error: {
      code,
      message,
      ...(field && { field }),
    },
  };

  res.status(status).json(errorResponse);
}

/**
 * Mapeia erros de validação do utils/validators para formato padronizado
 */
export function sendValidationError(
  res: Response,
  validationError: string,
  field?: string
): void {
  // Mapeia mensagens de validação para códigos específicos
  let code: string = ErrorCodes.VALIDATION_ERROR;

  if (validationError.includes('email')) {
    code = ErrorCodes.INVALID_EMAIL;
  } else if (validationError.includes('senha') || validationError.includes('password')) {
    code = ErrorCodes.WEAK_PASSWORD;
  } else if (validationError.includes('URL')) {
    code = ErrorCodes.INVALID_URL;
  } else if (validationError.includes('CPF')) {
    code = ErrorCodes.INVALID_CPF;
  }

  sendError(res, 400, code, validationError, field);
}

/**
 * Compatibilidade com formato antigo (transição)
 * Converte { error: string, errorCode?: string } para novo formato
 *
 * @deprecated Use sendError diretamente
 */
export function sendLegacyError(
  res: Response,
  status: number,
  error: string,
  errorCode?: string
): void {
  const code = errorCode || ErrorCodes.INTERNAL_SERVER_ERROR;
  sendError(res, status, code, error);
}

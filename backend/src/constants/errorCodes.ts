/**
 * Códigos de erro padronizados para o RadarOne
 * Usar estes códigos garantirá que o frontend trate erros de forma determinística
 */
export const ErrorCodes = {
  // Auth errors (401)
  INVALID_TOKEN: 'INVALID_TOKEN',
  UNAUTHORIZED: 'UNAUTHORIZED',

  // Subscription/Trial errors (403/409)
  TRIAL_EXPIRED: 'TRIAL_EXPIRED',
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED', // Unificado (antes era NO_SUBSCRIPTION também)
  SUBSCRIPTION_ALREADY_ACTIVE: 'SUBSCRIPTION_ALREADY_ACTIVE',
  TRIAL_ALREADY_ACTIVE: 'TRIAL_ALREADY_ACTIVE',
  TRIAL_ALREADY_USED: 'TRIAL_ALREADY_USED',
  FORBIDDEN: 'FORBIDDEN',

  // User errors (400/409)
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  EMAIL_NOT_FOUND: 'EMAIL_NOT_FOUND',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // Generic
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

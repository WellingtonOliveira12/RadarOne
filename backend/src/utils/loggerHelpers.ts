import logger from '../logger';

/**
 * Helpers de logging tipados para evitar TS2769
 *
 * Pino espera assinatura: logger.level(object, message)
 * Estes helpers garantem que sempre chamaremos com a assinatura correta.
 *
 * NUNCA use logger.error('message', {object}) diretamente!
 * Use sempre estes helpers para evitar erros de tipagem.
 */

/**
 * Metadata base para logs de erro
 */
interface ErrorLogMetadata {
  errorCode?: string;
  message?: string;
  statusCode?: number;
  path?: string;
  method?: string;
  userId?: string;
  error?: string;
  stack?: string;
  [key: string]: any;
}

/**
 * Log de AppError (erros conhecidos/tratados)
 *
 * @param metadata - Dados estruturados do erro
 */
export function logAppError(metadata: ErrorLogMetadata): void {
  logger.error(metadata, 'AppError');
}

/**
 * Log de erro inesperado (não tratado)
 *
 * @param metadata - Dados estruturados do erro
 */
export function logUnexpectedError(metadata: ErrorLogMetadata): void {
  logger.error(metadata, 'Unexpected error');
}

/**
 * Helper genérico de log de erro
 * Type-safe e com assinatura correta para Pino
 *
 * @param tag - Tag/mensagem descritiva do erro
 * @param metadata - Dados estruturados
 */
export function logError(tag: string, metadata: ErrorLogMetadata): void {
  logger.error(metadata, tag);
}

/**
 * Helper genérico de log de warning
 * Type-safe e com assinatura correta para Pino
 *
 * @param tag - Tag/mensagem descritiva
 * @param metadata - Dados estruturados
 */
export function logWarning(tag: string, metadata: Record<string, unknown>): void {
  logger.warn(metadata, tag);
}

/**
 * Helper genérico de log de info
 * Type-safe e com assinatura correta para Pino
 *
 * @param tag - Tag/mensagem descritiva
 * @param metadata - Dados estruturados
 */
export function logInfo(tag: string, metadata: Record<string, unknown>): void {
  logger.info(metadata, tag);
}

/**
 * Helper para log simples (apenas mensagem)
 * Útil quando não há metadata adicional
 *
 * @param message - Mensagem a ser logada
 */
export function logSimpleInfo(message: string): void {
  logger.info(message);
}

/**
 * Helper para log simples de warning
 *
 * @param message - Mensagem a ser logada
 */
export function logSimpleWarning(message: string): void {
  logger.warn(message);
}

/**
 * Helper para log simples de erro
 *
 * @param message - Mensagem a ser logada
 */
export function logSimpleError(message: string): void {
  logger.error(message);
}

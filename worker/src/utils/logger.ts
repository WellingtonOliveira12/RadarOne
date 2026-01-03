import pino from 'pino';

/**
 * Logger estruturado com Pino
 *
 * Logs em formato JSON para produção, formatação bonita para desenvolvimento
 *
 * Níveis:
 * - trace: Detalhes muito específicos
 * - debug: Informações de debug
 * - info: Informações gerais
 * - warn: Avisos
 * - error: Erros
 * - fatal: Erros fatais que causam shutdown
 */

const isDevelopment = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = pino({
  level: logLevel,

  // Formatação bonita em desenvolvimento, JSON em produção
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    },
  }),

  // Campos base em todos os logs
  base: {
    env: process.env.NODE_ENV || 'development',
    worker: 'radarone-worker',
  },

  // Timestamp ISO 8601
  timestamp: pino.stdTimeFunctions.isoTime,

  // Serializers personalizados
  serializers: {
    error: pino.stdSerializers.err,
  },
});

/**
 * Cria child logger com contexto específico
 *
 * @example
 * const monitorLogger = createChildLogger({ monitorId: 'abc', site: 'MERCADO_LIVRE' });
 * monitorLogger.info('Scraping iniciado');
 */
export function createChildLogger(bindings: Record<string, any>) {
  return logger.child(bindings);
}

/**
 * Helpers para logs estruturados
 */

export const log = {
  /**
   * Log de info genérico
   */
  info: (msg: string, data?: Record<string, any>) => {
    logger.info(data || {}, msg);
  },

  /**
   * Log de warn
   */
  warn: (msg: string, data?: Record<string, any>) => {
    logger.warn(data || {}, msg);
  },

  /**
   * Log de erro
   */
  error: (msg: string, error?: Error, data?: Record<string, any>) => {
    logger.error({ err: error, ...data }, msg);
  },

  /**
   * Log de debug
   */
  debug: (msg: string, data?: Record<string, any>) => {
    logger.debug(data || {}, msg);
  },

  /**
   * Log de fatal (erro crítico)
   */
  fatal: (msg: string, error?: Error, data?: Record<string, any>) => {
    logger.fatal({ err: error, ...data }, msg);
  },

  // =======================================
  // Logs específicos do worker
  // =======================================

  /**
   * Log de início de ciclo de monitores
   */
  cycleStart: (monitorsCount: number) => {
    logger.info({ monitorsCount }, 'Iniciando ciclo de verificação');
  },

  /**
   * Log de fim de ciclo
   */
  cycleEnd: (duration: number, monitorsProcessed: number) => {
    logger.info(
      { duration, monitorsProcessed, avgTimePerMonitor: duration / monitorsProcessed },
      'Ciclo concluído'
    );
  },

  /**
   * Log de execução de monitor
   */
  monitorStart: (monitorId: string, name: string, site: string) => {
    logger.info({ monitorId, name, site }, 'Executando monitor');
  },

  /**
   * Log de sucesso de monitor
   */
  monitorSuccess: (
    monitorId: string,
    adsFound: number,
    newAds: number,
    alertsSent: number,
    duration: number
  ) => {
    logger.info(
      { monitorId, adsFound, newAds, alertsSent, duration },
      'Monitor executado com sucesso'
    );
  },

  /**
   * Log de falha de monitor
   */
  monitorError: (monitorId: string, error: Error, duration: number) => {
    logger.error({ monitorId, err: error, duration }, 'Erro ao executar monitor');
  },

  /**
   * Log de scraping
   */
  scrapingStart: (site: string, url: string) => {
    logger.debug({ site, url }, 'Iniciando scraping');
  },

  /**
   * Log de scraping success
   */
  scrapingSuccess: (site: string, itemsFound: number, duration: number) => {
    logger.debug({ site, itemsFound, duration }, 'Scraping concluído');
  },

  /**
   * Log de rate limiting
   */
  rateLimitWait: (site: string, waitTime: number) => {
    logger.warn({ site, waitTime }, 'Rate limit atingido, aguardando');
  },

  /**
   * Log de captcha detectado
   */
  captchaDetected: (site: string, solved: boolean) => {
    logger.warn({ site, solved }, 'Captcha detectado');
  },

  /**
   * Log de circuit breaker
   */
  circuitBreakerOpen: (site: string, failureCount: number, cooldownTime: number) => {
    logger.error(
      { site, failureCount, cooldownTime },
      'Circuit breaker OPEN - site bloqueado temporariamente'
    );
  },

  /**
   * Log de circuit breaker recovered
   */
  circuitBreakerClosed: (site: string) => {
    logger.info({ site }, 'Circuit breaker CLOSED - site recuperado');
  },

  /**
   * Log de alerta enviado
   */
  alertSent: (monitorId: string, channel: string, success: boolean) => {
    logger.info({ monitorId, channel, success }, 'Alerta enviado');
  },

  /**
   * Log de fila (BullMQ)
   */
  queueStats: (waiting: number, active: number, total: number) => {
    logger.info({ waiting, active, total }, 'Estatísticas da fila');
  },
};

export default logger;

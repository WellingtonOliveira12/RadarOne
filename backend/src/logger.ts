import pino from 'pino';

/**
 * Logger estruturado do RadarOne
 *
 * Configuração:
 * - Desenvolvimento: pretty print, logs verbosos
 * - Produção: JSON, logs estruturados
 *
 * Mascaramento automático de dados sensíveis:
 * - password
 * - token
 * - authorization
 * - email (parcial)
 */

// Configuração do logger baseada no ambiente
const isProduction = process.env.NODE_ENV === 'production';

// Função para mascarar dados sensíveis
function maskSensitiveData(key: string, value: any): any {
  if (typeof value !== 'string') return value;

  const lowerKey = key.toLowerCase();

  // Mascarar senhas completamente
  if (lowerKey.includes('password') || lowerKey.includes('senha')) {
    return '***';
  }

  // Mascarar tokens completamente
  if (lowerKey.includes('token') || lowerKey.includes('authorization')) {
    return '***';
  }

  // Mascarar email (mostrar apenas primeira letra + domínio)
  if (lowerKey.includes('email')) {
    const [local, domain] = value.split('@');
    if (domain) {
      return `${local.charAt(0)}***@${domain}`;
    }
  }

  return value;
}

// Criar logger
export const logger = pino({
  level: isProduction ? 'info' : 'debug',

  // Formatação de desenvolvimento (pretty)
  transport: !isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,

  // Serializers customizados para mascarar dados sensíveis
  serializers: {
    req: (req: any) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      // Mascarar body sensível
      body: req.body
        ? Object.keys(req.body).reduce((acc: any, key) => {
            acc[key] = maskSensitiveData(key, req.body[key]);
            return acc;
          }, {})
        : undefined,
    }),
    res: (res: any) => ({
      statusCode: res.statusCode,
    }),
    err: (err: any) => ({
      type: err.constructor.name,
      message: err.message,
      // Em produção, não logar stack trace completo
      stack: isProduction ? undefined : err.stack,
    }),
  },

  // Base fields para todos os logs
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'radarone-backend',
  },
});

/**
 * Child logger com contexto adicional
 * Útil para adicionar requestId ou userId em todos os logs de uma requisição
 */
export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Helper para logar com contexto de usuário
 */
export function logWithUser(userId: string, level: 'info' | 'warn' | 'error', message: string, data?: any) {
  const childLogger = createChildLogger({ userId });
  childLogger[level](data, message);
}

/**
 * Helper para logar erros com contexto completo
 */
export function logError(error: Error, context?: Record<string, any>) {
  logger.error(
    {
      err: error,
      ...context,
    },
    error.message
  );
}

// Export default para uso como `import logger from './logger'`
export default logger;

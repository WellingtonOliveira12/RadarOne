/**
 * FASE 4.5 - Configuração Granular de Rate Limiting
 * Define limites específicos por endpoint e role
 */

export interface RateLimitRule {
  windowMs: number; // Janela de tempo em milissegundos
  maxRequests: number; // Máximo de requisições na janela
  message?: string; // Mensagem customizada
}

export interface EndpointRateLimits {
  user: RateLimitRule; // Limites para usuários normais
  admin: RateLimitRule; // Limites para admins (mais generosos)
}

/**
 * Configuração de rate limits por endpoint
 *
 * Filosofia:
 * - Admins têm limites 2-3x maiores que usuários
 * - Endpoints críticos têm limites mais restritivos
 * - Endpoints de leitura têm limites mais generosos
 * - Uso normal NUNCA deve atingir os limites
 */
export const RATE_LIMIT_CONFIG: Record<string, EndpointRateLimits> = {
  // ============================================
  // AUTENTICAÇÃO (mais restritivo)
  // ============================================
  'POST:/api/auth/login': {
    user: {
      windowMs: 15 * 60 * 1000, // 15 minutos
      maxRequests: 10,
      message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    },
    admin: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 20, // Admins podem errar mais vezes
      message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    },
  },

  'POST:/api/auth/register': {
    user: {
      windowMs: 60 * 60 * 1000, // 1 hora
      maxRequests: 3,
      message: 'Limite de cadastros atingido. Tente novamente em 1 hora.',
    },
    admin: {
      windowMs: 60 * 60 * 1000,
      maxRequests: 10,
      message: 'Limite de cadastros atingido. Tente novamente em 1 hora.',
    },
  },

  'POST:/api/auth/forgot-password': {
    user: {
      windowMs: 60 * 60 * 1000, // 1 hora
      maxRequests: 5,
      message: 'Muitas solicitações de reset. Tente novamente em 1 hora.',
    },
    admin: {
      windowMs: 60 * 60 * 1000,
      maxRequests: 10,
      message: 'Muitas solicitações de reset. Tente novamente em 1 hora.',
    },
  },

  'POST:/api/auth/reset-password': {
    user: {
      windowMs: 15 * 60 * 1000, // 15 minutos
      maxRequests: 10,
      message: 'Muitas tentativas de reset. Tente novamente em 15 minutos.',
    },
    admin: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 20,
      message: 'Muitas tentativas de reset. Tente novamente em 15 minutos.',
    },
  },

  // ============================================
  // 2FA (FASE 4.4) - Crítico
  // ============================================
  'POST:/api/auth/2fa/verify': {
    user: {
      windowMs: 15 * 60 * 1000, // 15 minutos
      maxRequests: 15, // Permite algumas tentativas de código errado
      message: 'Muitas tentativas de verificação 2FA. Tente novamente em 15 minutos.',
    },
    admin: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 30,
      message: 'Muitas tentativas de verificação 2FA. Tente novamente em 15 minutos.',
    },
  },

  'POST:/api/auth/2fa/enable': {
    user: {
      windowMs: 60 * 60 * 1000, // 1 hora
      maxRequests: 10,
      message: 'Muitas tentativas de ativar 2FA. Tente novamente em 1 hora.',
    },
    admin: {
      windowMs: 60 * 60 * 1000,
      maxRequests: 20,
      message: 'Muitas tentativas de ativar 2FA. Tente novamente em 1 hora.',
    },
  },

  'POST:/api/auth/2fa/disable': {
    user: {
      windowMs: 60 * 60 * 1000, // 1 hora
      maxRequests: 10,
      message: 'Muitas tentativas de desativar 2FA. Tente novamente em 1 hora.',
    },
    admin: {
      windowMs: 60 * 60 * 1000,
      maxRequests: 20,
      message: 'Muitas tentativas de desativar 2FA. Tente novamente em 1 hora.',
    },
  },

  // ============================================
  // ADMIN - Ações Críticas (muito restritivo)
  // ============================================
  'POST:/api/admin/users/:id/block': {
    user: {
      windowMs: 15 * 60 * 1000, // 15 minutos
      maxRequests: 5,
      message: 'Muitas ações administrativas. Tente novamente em 15 minutos.',
    },
    admin: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 30, // Admins podem bloquear vários usuários
      message: 'Muitas ações de bloqueio. Tente novamente em 15 minutos.',
    },
  },

  'POST:/api/admin/users/:id/unblock': {
    user: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 5,
      message: 'Muitas ações administrativas. Tente novamente em 15 minutos.',
    },
    admin: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 30,
      message: 'Muitas ações de desbloqueio. Tente novamente em 15 minutos.',
    },
  },

  'DELETE:/api/admin/users/:id': {
    user: {
      windowMs: 60 * 60 * 1000, // 1 hora
      maxRequests: 3,
      message: 'Muitas exclusões de usuários. Tente novamente em 1 hora.',
    },
    admin: {
      windowMs: 60 * 60 * 1000,
      maxRequests: 20,
      message: 'Muitas exclusões de usuários. Tente novamente em 1 hora.',
    },
  },

  'POST:/api/admin/subscriptions/:id/cancel': {
    user: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 5,
      message: 'Muitas ações de cancelamento. Tente novamente em 15 minutos.',
    },
    admin: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 50,
      message: 'Muitas ações de cancelamento. Tente novamente em 15 minutos.',
    },
  },

  // ============================================
  // ADMIN - Leitura (mais generoso)
  // ============================================
  'GET:/api/admin/users': {
    user: {
      windowMs: 1 * 60 * 1000, // 1 minuto
      maxRequests: 30,
      message: 'Muitas consultas. Aguarde um momento.',
    },
    admin: {
      windowMs: 1 * 60 * 1000,
      maxRequests: 120, // Admins podem consultar muito
      message: 'Muitas consultas. Aguarde um momento.',
    },
  },

  'GET:/api/admin/subscriptions': {
    user: {
      windowMs: 1 * 60 * 1000,
      maxRequests: 30,
      message: 'Muitas consultas. Aguarde um momento.',
    },
    admin: {
      windowMs: 1 * 60 * 1000,
      maxRequests: 120,
      message: 'Muitas consultas. Aguarde um momento.',
    },
  },

  'GET:/api/admin/audit-logs': {
    user: {
      windowMs: 1 * 60 * 1000,
      maxRequests: 20,
      message: 'Muitas consultas de logs. Aguarde um momento.',
    },
    admin: {
      windowMs: 1 * 60 * 1000,
      maxRequests: 100,
      message: 'Muitas consultas de logs. Aguarde um momento.',
    },
  },

  'GET:/api/admin/stats': {
    user: {
      windowMs: 1 * 60 * 1000,
      maxRequests: 20,
      message: 'Muitas consultas de estatísticas. Aguarde um momento.',
    },
    admin: {
      windowMs: 1 * 60 * 1000,
      maxRequests: 60,
      message: 'Muitas consultas de estatísticas. Aguarde um momento.',
    },
  },

  // ============================================
  // EXPORTAÇÕES (restritivo - operação pesada)
  // ============================================
  'GET:/api/admin/users/export': {
    user: {
      windowMs: 60 * 60 * 1000, // 1 hora
      maxRequests: 3,
      message: 'Limite de exportações atingido. Tente novamente em 1 hora.',
    },
    admin: {
      windowMs: 60 * 60 * 1000,
      maxRequests: 20, // Admins podem exportar mais
      message: 'Limite de exportações atingido. Tente novamente em 1 hora.',
    },
  },

  'GET:/api/admin/subscriptions/export': {
    user: {
      windowMs: 60 * 60 * 1000,
      maxRequests: 3,
      message: 'Limite de exportações atingido. Tente novamente em 1 hora.',
    },
    admin: {
      windowMs: 60 * 60 * 1000,
      maxRequests: 20,
      message: 'Limite de exportações atingido. Tente novamente em 1 hora.',
    },
  },

  'GET:/api/admin/audit-logs/export': {
    user: {
      windowMs: 60 * 60 * 1000,
      maxRequests: 3,
      message: 'Limite de exportações atingido. Tente novamente em 1 hora.',
    },
    admin: {
      windowMs: 60 * 60 * 1000,
      maxRequests: 20,
      message: 'Limite de exportações atingido. Tente novamente em 1 hora.',
    },
  },

  // ============================================
  // MONITORES (operações normais de usuário)
  // ============================================
  'POST:/api/monitors': {
    user: {
      windowMs: 15 * 60 * 1000, // 15 minutos
      maxRequests: 50, // Usuários podem criar vários monitores
      message: 'Muitas criações de monitores. Aguarde 15 minutos.',
    },
    admin: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 200,
      message: 'Muitas criações de monitores. Aguarde 15 minutos.',
    },
  },

  'PUT:/api/monitors/:id': {
    user: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 100, // Permitir edições frequentes
      message: 'Muitas edições de monitores. Aguarde 15 minutos.',
    },
    admin: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 300,
      message: 'Muitas edições de monitores. Aguarde 15 minutos.',
    },
  },

  'DELETE:/api/monitors/:id': {
    user: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 50,
      message: 'Muitas exclusões de monitores. Aguarde 15 minutos.',
    },
    admin: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 200,
      message: 'Muitas exclusões de monitores. Aguarde 15 minutos.',
    },
  },
};

/**
 * Limites padrão para endpoints não configurados
 */
export const DEFAULT_RATE_LIMITS: EndpointRateLimits = {
  user: {
    windowMs: 1 * 60 * 1000, // 1 minuto
    maxRequests: 60,
    message: 'Muitas requisições. Aguarde um momento.',
  },
  admin: {
    windowMs: 1 * 60 * 1000,
    maxRequests: 180, // 3x mais que usuários
    message: 'Muitas requisições. Aguarde um momento.',
  },
};

/**
 * Endpoints isentos de rate limiting
 * (health checks, status, etc)
 */
export const RATE_LIMIT_EXEMPT_PATHS = [
  '/api/test',
  '/health',
  '/healthz',
  '/',
];

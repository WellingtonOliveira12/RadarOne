/**
 * RadarOne — Contratos de API (Zod Schemas)
 *
 * Schemas compartilhados entre frontend e backend.
 * Definem a estrutura de requests e responses padronizadas.
 *
 * Uso:
 *   Backend: validação runtime de requests (middleware)
 *   Frontend: tipagem e validação de responses
 */

import { z } from 'zod';

// ============================================
// RESPONSE WRAPPER PADRÃO
// ============================================

/**
 * Envelope padrão de sucesso
 * Todos os endpoints devem seguir: { data, meta? }
 */
export const ApiSuccessSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: z.object({
      requestId: z.string().optional(),
      timestamp: z.string().optional(),
    }).optional(),
  });

/**
 * Envelope padrão de erro
 * Backend SEMPRE retorna: { errorCode, message, details? }
 */
export const ApiErrorSchema = z.object({
  errorCode: z.string(),
  message: z.string(),
  details: z.any().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

// ============================================
// AUTH SCHEMAS
// ============================================

export const LoginRequestSchema = z.object({
  email: z.string().transform(v => v.trim().toLowerCase()).pipe(z.string().email('E-mail inválido')),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export const RegisterRequestSchema = z.object({
  email: z.string().transform(v => v.trim().toLowerCase()).pipe(z.string().email('E-mail inválido')),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  phone: z.string().optional(),
  cpf: z.string().optional(),
  telegramUsername: z.string().optional(),
});

export const AuthStepEnum = z.enum(['NONE', 'TWO_FACTOR_REQUIRED', 'AUTHENTICATED']);

export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['USER', 'ADMIN', 'ADMIN_SUPER', 'ADMIN_SUPPORT', 'ADMIN_FINANCE', 'ADMIN_READ']),
  phone: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  createdAt: z.string().optional(),
  subscriptions: z.array(z.any()).optional(),
});

export const LoginResponseSchema = z.discriminatedUnion('authStep', [
  z.object({
    authStep: z.literal('AUTHENTICATED'),
    message: z.string(),
    token: z.string(),
    user: UserSchema,
  }),
  z.object({
    authStep: z.literal('TWO_FACTOR_REQUIRED'),
    requiresTwoFactor: z.literal(true),
    tempToken: z.string(),
    userId: z.string(),
    message: z.string(),
  }),
]);

export const RefreshResponseSchema = z.object({
  token: z.string(),
  expiresIn: z.string(),
});

export const Verify2FARequestSchema = z.object({
  userId: z.string().min(1, 'userId é obrigatório'),
  code: z.string().min(6, 'Código deve ter 6 dígitos').max(10),
});

export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email('E-mail inválido'),
});

export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
});

// ============================================
// MONITOR SCHEMAS
// ============================================

export const MonitorSiteEnum = z.enum([
  'MERCADO_LIVRE', 'OLX', 'FACEBOOK_MARKETPLACE', 'WEBMOTORS',
  'ICARROS', 'ZAP_IMOVEIS', 'VIVA_REAL', 'IMOVELWEB', 'LEILAO', 'OUTRO',
]);

export const CreateMonitorRequestSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  site: MonitorSiteEnum,
  searchUrl: z.string().url('URL inválida').optional(),
  priceMin: z.number().min(0).optional(),
  priceMax: z.number().min(0).optional(),
  keywords: z.array(z.string()).optional(),
  excludeKeywords: z.array(z.string()).optional(),
});

export const MonitorSchema = z.object({
  id: z.string(),
  name: z.string(),
  site: MonitorSiteEnum,
  searchUrl: z.string().nullable().optional(),
  priceMin: z.number().nullable().optional(),
  priceMax: z.number().nullable().optional(),
  active: z.boolean(),
  lastCheckedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

// ============================================
// SUBSCRIPTION SCHEMAS
// ============================================

export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  priceCents: z.number(),
  billingPeriod: z.string(),
  maxMonitors: z.number(),
  maxSites: z.number(),
  maxAlertsPerDay: z.number(),
  checkInterval: z.number(),
  isRecommended: z.boolean(),
});

export const SubscriptionSchema = z.object({
  id: z.string(),
  status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'SUSPENDED']),
  startDate: z.string(),
  validUntil: z.string().nullable().optional(),
  trialEndsAt: z.string().nullable().optional(),
  queriesUsed: z.number(),
  queriesLimit: z.number(),
  isLifetime: z.boolean(),
  plan: PlanSchema,
});

// ============================================
// ADMIN SCHEMAS
// ============================================

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const PaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  });

// ============================================
// TYPE EXPORTS
// ============================================

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type User = z.infer<typeof UserSchema>;
export type Monitor = z.infer<typeof MonitorSchema>;
export type CreateMonitorRequest = z.infer<typeof CreateMonitorRequestSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

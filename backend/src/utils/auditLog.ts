import { logInfo, logError } from './loggerHelpers';
import { prisma } from '../lib/prisma';

/**
 * Tipos de ação para audit log
 */
export const AuditAction = {
  // User actions
  USER_BLOCKED: 'USER_BLOCKED',
  USER_UNBLOCKED: 'USER_UNBLOCKED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',

  // Subscription actions
  SUBSCRIPTION_CREATED: 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_UPDATED: 'SUBSCRIPTION_UPDATED',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
  SUBSCRIPTION_EXTENDED: 'SUBSCRIPTION_EXTENDED',
  SUBSCRIPTION_TRIAL_RESET: 'SUBSCRIPTION_TRIAL_RESET',

  // Coupon actions
  COUPON_CREATED: 'COUPON_CREATED',
  COUPON_UPDATED: 'COUPON_UPDATED',
  COUPON_DELETED: 'COUPON_DELETED',
  COUPON_ACTIVATED: 'COUPON_ACTIVATED',
  COUPON_DEACTIVATED: 'COUPON_DEACTIVATED',
  COUPONS_EXPORTED: 'COUPONS_EXPORTED',

  // Monitor actions
  MONITOR_DEACTIVATED: 'MONITOR_DEACTIVATED',
  MONITOR_DELETED: 'MONITOR_DELETED',

  // System actions
  SYSTEM_SETTING_UPDATED: 'SYSTEM_SETTING_UPDATED',
  SYSTEM_MAINTENANCE_ENABLED: 'SYSTEM_MAINTENANCE_ENABLED',
  SYSTEM_MAINTENANCE_DISABLED: 'SYSTEM_MAINTENANCE_DISABLED',
} as const;

/**
 * Tipos de entidade para audit log
 */
export const AuditTargetType = {
  USER: 'USER',
  SUBSCRIPTION: 'SUBSCRIPTION',
  COUPON: 'COUPON',
  MONITOR: 'MONITOR',
  SYSTEM: 'SYSTEM',
} as const;

/**
 * Interface para parâmetros do log de auditoria
 */
export interface LogAdminActionParams {
  adminId: string;
  adminEmail: string;
  action: string;
  targetType: keyof typeof AuditTargetType;
  targetId?: string;
  beforeData?: any;
  afterData?: any;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Loga uma ação administrativa no banco de dados
 *
 * Este helper persiste todas as ações administrativas para auditoria e compliance.
 *
 * @param params - Parâmetros da ação administrativa
 * @returns Promise com o registro de audit log criado
 *
 * @example
 * await logAdminAction({
 *   adminId: req.userId!,
 *   adminEmail: 'admin@radarone.com',
 *   action: AuditAction.USER_BLOCKED,
 *   targetType: AuditTargetType.USER,
 *   targetId: userId,
 *   beforeData: { blocked: false },
 *   afterData: { blocked: true },
 *   ipAddress: req.ip,
 *   userAgent: req.get('user-agent'),
 * });
 */
export async function logAdminAction(params: LogAdminActionParams) {
  const {
    adminId,
    adminEmail,
    action,
    targetType,
    targetId,
    beforeData,
    afterData,
    ipAddress,
    userAgent,
  } = params;

  try {
    // Cria o registro no banco
    const auditLog = await prisma.auditLog.create({
      data: {
        adminId,
        adminEmail,
        action,
        targetType,
        targetId: targetId || null,
        beforeData: beforeData || null,
        afterData: afterData || null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });

    // Também loga no console/logger para manter compatibilidade
    logInfo(`[AUDIT LOG] ${action} by ${adminEmail}`, {
      auditLogId: auditLog.id,
      adminId,
      adminEmail,
      action,
      targetType,
      targetId,
    });

    return auditLog;
  } catch (error) {
    // Em caso de erro ao salvar, pelo menos loga no console
    logError('[AUDIT LOG ERROR] Failed to save audit log', {
      error: error instanceof Error ? error.message : String(error),
      adminId,
      action,
      targetType,
      targetId,
    });

    // Re-throw para que o controller possa lidar com o erro
    throw error;
  }
}

/**
 * Helper para obter IP do request
 * Lida com proxies (X-Forwarded-For, X-Real-IP)
 *
 * @param req - Request do Express
 * @returns IP address do cliente
 */
export function getClientIp(req: any): string | undefined {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.ip ||
    req.connection?.remoteAddress
  );
}

/**
 * FASE 4.1 - Alert Service
 * Serviço centralizado para gerenciar alertas administrativos
 *
 * Responsabilidades:
 * - Criar alertas com deduplicação automática
 * - Listar alertas com filtros
 * - Marcar alertas como lidos
 * - Integração com Audit Log
 */

import { AlertSeverity, AdminAlert } from '@prisma/client';
import { CreateAlertParams, AlertTypeValue, getDefaultSeverity, getAlertMessage } from '../types/alerts';
import { logInfo, logError } from '../utils/loggerHelpers';
import { prisma } from '../lib/prisma';

/**
 * Cria um alerta administrativo
 *
 * IMPORTANTE: Implementa deduplicação automática.
 * Se já existe um alerta NÃO LIDO do mesmo tipo e source, não cria duplicado.
 *
 * @param params - Parâmetros do alerta
 * @returns Alerta criado ou null se foi deduplicado
 */
export async function createAlert(params: CreateAlertParams): Promise<AdminAlert | null> {
  const { type, severity, title, message, source, metadata } = params;

  try {
    // DEDUPLICAÇÃO: Verificar se já existe alerta não lido do mesmo tipo
    const existingAlert = await prisma.adminAlert.findFirst({
      where: {
        type,
        source: source || null,
        isRead: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (existingAlert) {
      logInfo('[ALERT SERVICE] Alerta duplicado ignorado', {
        type,
        source: source || 'N/A',
      });
      return null; // Não cria duplicado
    }

    // Criar alerta
    const alert = await prisma.adminAlert.create({
      data: {
        type,
        severity,
        title,
        message,
        source: source || null,
        metadata: metadata || null,
      },
    });

    logInfo(`[ALERT SERVICE] Alerta criado: ${type} - ${title}`, {
      alertId: alert.id,
      severity: alert.severity,
    });

    return alert;
  } catch (error) {
    logError('[ALERT SERVICE] Erro ao criar alerta', {
      error: error instanceof Error ? error.message : String(error),
      type,
      source,
    });
    throw error;
  }
}

/**
 * Cria um alerta usando mensagem padrão baseada no tipo
 *
 * @param type - Tipo do alerta
 * @param source - Origem do alerta (ex: nome do job)
 * @param metadata - Dados adicionais
 * @returns Alerta criado ou null se deduplicado
 */
export async function createAlertFromType(
  type: AlertTypeValue,
  source?: string,
  metadata?: Record<string, any>
): Promise<AdminAlert | null> {
  const severity = getDefaultSeverity(type);
  const { title, message } = getAlertMessage(type, metadata);

  return createAlert({
    type,
    severity,
    title,
    message,
    source,
    metadata,
  });
}

/**
 * Lista alertas com filtros opcionais
 *
 * @param filters - Filtros de busca
 * @returns Lista de alertas
 */
export async function listAlerts(filters?: {
  type?: string;
  severity?: AlertSeverity;
  isRead?: boolean;
  limit?: number;
  offset?: number;
}) {
  const where: any = {};

  if (filters?.type) {
    where.type = filters.type;
  }

  if (filters?.severity) {
    where.severity = filters.severity;
  }

  if (filters?.isRead !== undefined) {
    where.isRead = filters.isRead;
  }

  const [alerts, total, unreadCount] = await Promise.all([
    prisma.adminAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    }),
    prisma.adminAlert.count({ where }),
    prisma.adminAlert.count({ where: { isRead: false } }),
  ]);

  return {
    alerts,
    total,
    unreadCount,
  };
}

/**
 * Marca um alerta como lido
 *
 * @param alertId - ID do alerta
 * @param adminId - ID do admin que marcou como lido
 * @returns Alerta atualizado
 */
export async function markAlertAsRead(alertId: string, adminId: string): Promise<AdminAlert> {
  try {
    const alert = await prisma.adminAlert.update({
      where: { id: alertId },
      data: {
        isRead: true,
        readBy: adminId,
        readAt: new Date(),
      },
    });

    logInfo('[ALERT SERVICE] Alerta marcado como lido', {
      alertId,
      adminId,
    });

    return alert;
  } catch (error) {
    logError('[ALERT SERVICE] Erro ao marcar alerta como lido', {
      error: error instanceof Error ? error.message : String(error),
      alertId,
      adminId,
    });
    throw error;
  }
}

/**
 * Obtém contagem de alertas não lidos
 *
 * @returns Quantidade de alertas não lidos
 */
export async function getUnreadCount(): Promise<number> {
  return prisma.adminAlert.count({
    where: { isRead: false },
  });
}

/**
 * Deleta alertas antigos já lidos (cleanup)
 * Mantém apenas alertas dos últimos 90 dias
 *
 * @returns Quantidade de alertas deletados
 */
export async function cleanupOldAlerts(): Promise<number> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  try {
    const result = await prisma.adminAlert.deleteMany({
      where: {
        isRead: true,
        createdAt: {
          lt: ninetyDaysAgo,
        },
      },
    });

    logInfo('[ALERT SERVICE] Cleanup de alertas antigos', {
      count: result.count,
    });

    return result.count;
  } catch (error) {
    logError('[ALERT SERVICE] Erro ao fazer cleanup de alertas', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

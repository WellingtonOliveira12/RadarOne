import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logAdminAction, AuditAction, AuditTargetType, getClientIp } from '../utils/auditLog';
import { logInfo, logError } from '../utils/loggerHelpers';

/**
 * Retorna nome amigável do job
 */
function getJobDisplayName(jobName: string): string {
  const names: Record<string, string> = {
    checkTrialExpiring: 'Verificar Trials Expirando',
    checkSubscriptionExpired: 'Verificar Assinaturas Expiradas',
    resetMonthlyQueries: 'Reset Mensal de Queries',
    checkCouponAlerts: 'Verificar Alertas de Cupons',
    checkTrialUpgradeExpiring: 'Verificar Trial Upgrades Expirando',
    checkAbandonedCoupons: 'Verificar Cupons Abandonados',
    checkSessionExpiring: 'Verificar Sessões Expirando',
  };
  return names[jobName] || jobName;
}

export class AdminSystemController {
  /**
   * 7. Estatísticas gerais do sistema
   * GET /api/admin/stats
   */
  static async getSystemStats(req: Request, res: Response) {
    try {
      // Buscar estatísticas em paralelo
      const [
        totalUsers,
        blockedUsers,
        activeUsers,
        subscriptionsByStatus,
        totalMonitors,
        activeMonitors,
        webhookLogs,
        topPlans,
        totalCoupons,
        activeCoupons,
        usedCoupons,
        expiringCoupons
      ] = await Promise.all([
        // Total de usuários
        prisma.user.count(),

        // Usuários bloqueados
        prisma.user.count({ where: { blocked: true } }),

        // Usuários ativos
        prisma.user.count({ where: { blocked: false, isActive: true } }),

        // Subscriptions por status
        prisma.subscription.groupBy({
          by: ['status'],
          _count: true
        }),

        // Total de monitores
        prisma.monitor.count(),

        // Monitores ativos
        prisma.monitor.count({ where: { active: true } }),

        // Webhooks dos últimos 7 dias
        prisma.webhookLog.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        }),

        // Top 5 planos mais populares
        prisma.subscription.groupBy({
          by: ['planId'],
          _count: true,
          orderBy: {
            _count: {
              planId: 'desc'
            }
          },
          take: 5
        }),

        // Total de cupons
        prisma.coupon.count(),

        // Cupons ativos
        prisma.coupon.count({ where: { isActive: true } }),

        // Cupons com pelo menos 1 uso
        prisma.coupon.count({
          where: {
            usedCount: {
              gt: 0
            }
          }
        }),

        // Cupons expirando nos próximos 7 dias
        prisma.coupon.count({
          where: {
            isActive: true,
            expiresAt: {
              gte: new Date(),
              lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            }
          }
        })
      ]);

      // Calcular receita mensal estimada
      const activeSubscriptions = await prisma.subscription.findMany({
        where: { status: 'ACTIVE' },
        include: {
          plan: {
            select: {
              priceCents: true
            }
          }
        }
      });

      const monthlyRevenue = activeSubscriptions.reduce(
        (sum, sub) => sum + sub.plan.priceCents,
        0
      );

      // Buscar detalhes dos top planos
      const topPlansWithDetails = await Promise.all(
        topPlans.map(async (item) => {
          const plan = await prisma.plan.findUnique({
            where: { id: item.planId },
            select: {
              id: true,
              name: true,
              priceCents: true
            }
          });
          return {
            plan,
            count: item._count
          };
        })
      );

      // Buscar cupons mais usados
      const topCoupons = await prisma.coupon.findMany({
        where: {
          usedCount: {
            gt: 0
          }
        },
        orderBy: {
          usedCount: 'desc'
        },
        take: 5,
        include: {
          _count: {
            select: {
              usageLogs: true
            }
          }
        }
      });

      return res.json({
        users: {
          total: totalUsers,
          active: activeUsers,
          blocked: blockedUsers
        },
        subscriptions: {
          byStatus: subscriptionsByStatus.reduce((acc, item) => {
            acc[item.status] = item._count;
            return acc;
          }, {} as Record<string, number>),
          monthlyRevenue
        },
        monitors: {
          total: totalMonitors,
          active: activeMonitors,
          inactive: totalMonitors - activeMonitors
        },
        webhooks: {
          last7Days: webhookLogs
        },
        topPlans: topPlansWithDetails,
        coupons: {
          total: totalCoupons,
          active: activeCoupons,
          inactive: totalCoupons - activeCoupons,
          used: usedCoupons,
          expiringSoon: expiringCoupons,
          topCoupons: topCoupons.map(coupon => ({
            code: coupon.code,
            description: coupon.description,
            usedCount: coupon.usedCount,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue
          }))
        }
      });

    } catch (error) {
      logError('Erro ao buscar estatísticas do sistema', { err: error });
      return res.status(500).json({ error: 'Erro ao buscar estatísticas do sistema' });
    }
  }

  /**
   * 8. Listar logs de webhooks
   * GET /api/admin/webhooks
   */
  static async listWebhookLogs(req: Request, res: Response) {
    try {
      const {
        page = '1',
        limit = '20',
        event,
        processed
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Construir filtros
      const where: any = {};

      if (event) {
        where.event = event;
      }

      if (processed !== undefined) {
        where.processed = processed === 'true';
      }

      // Buscar logs
      const [logs, total] = await Promise.all([
        prisma.webhookLog.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            event: true,
            createdAt: true,
            processed: true,
            error: true,
            // Payload resumido (primeiros 200 caracteres)
            payload: true
          }
        }),
        prisma.webhookLog.count({ where })
      ]);

      // Resumir payloads
      const logsWithSummary = logs.map(log => ({
        ...log,
        payloadSummary: typeof log.payload === 'string'
          ? log.payload.substring(0, 200) + (log.payload.length > 200 ? '...' : '')
          : JSON.stringify(log.payload).substring(0, 200) + '...'
      }));

      const totalPages = Math.ceil(total / limitNum);

      return res.json({
        logs: logsWithSummary,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages
        }
      });

    } catch (error) {
      logError('Erro ao listar logs de webhooks', { err: error });
      return res.status(500).json({ error: 'Erro ao listar logs de webhooks' });
    }
  }

  /**
   * 10. Listar execuções de jobs (FASE 3.3)
   * GET /api/admin/jobs
   */
  static async listJobRuns(req: Request, res: Response) {
    try {
      const {
        page = '1',
        pageSize = '20',
        jobName,
        status
      } = req.query;

      const pageNum = parseInt(page as string);
      const pageSizeNum = parseInt(pageSize as string);
      const skip = (pageNum - 1) * pageSizeNum;

      // Construir filtros para a nova tabela JobRun
      const where: any = {};

      // Filtrar por nome do job
      if (jobName) {
        where.jobName = jobName;
      }

      // Filtrar por status
      if (status) {
        where.status = status;
      }

      // Buscar execuções de jobs da nova tabela JobRun
      const [jobRuns, total] = await Promise.all([
        prisma.jobRun.findMany({
          where,
          skip,
          take: pageSizeNum,
          orderBy: { startedAt: 'desc' },
        }),
        prisma.jobRun.count({ where })
      ]);

      // Transformar dados para formato amigável
      const data = jobRuns.map(run => ({
        id: run.id,
        jobName: run.jobName,
        displayName: getJobDisplayName(run.jobName),
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        durationMs: run.durationMs,
        processedCount: run.processedCount,
        successCount: run.successCount,
        errorCount: run.errorCount,
        summary: run.summary,
        errorMessage: run.errorMessage,
        triggeredBy: run.triggeredBy,
        metadata: run.metadata,
      }));

      // Calcular estatísticas
      const stats = await prisma.jobRun.groupBy({
        by: ['status'],
        _count: true,
        where: {
          startedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Últimos 7 dias
          }
        }
      });

      const statsMap = stats.reduce((acc, curr) => {
        acc[curr.status] = curr._count;
        return acc;
      }, {} as Record<string, number>);

      const totalPages = Math.ceil(total / pageSizeNum);

      return res.json({
        data,
        stats: {
          last7Days: {
            success: statsMap['SUCCESS'] || 0,
            partial: statsMap['PARTIAL'] || 0,
            failed: statsMap['FAILED'] || 0,
            running: statsMap['RUNNING'] || 0,
          }
        },
        pagination: {
          page: pageNum,
          pageSize: pageSizeNum,
          total,
          totalPages
        }
      });

    } catch (error) {
      logError('Erro ao listar execuções de jobs', { err: error });
      return res.status(500).json({ error: 'Erro ao listar execuções de jobs' });
    }
  }

  /**
   * 11. Listar audit logs (FASE 3.1)
   * GET /api/admin/audit-logs
   */
  static async listAuditLogs(req: Request, res: Response) {
    try {
      const {
        page = '1',
        limit = '20',
        adminId,
        action,
        targetType,
        startDate,
        endDate
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Construir filtros
      const where: any = {};

      if (adminId) {
        where.adminId = adminId;
      }

      if (action) {
        where.action = action;
      }

      if (targetType) {
        where.targetType = targetType;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate as string);
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate as string);
        }
      }

      // Buscar logs com paginação
      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.auditLog.count({ where })
      ]);

      const totalPages = Math.ceil(total / limitNum);

      return res.json({
        logs,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages
        }
      });

    } catch (error) {
      logError('Erro ao listar audit logs', { err: error });
      return res.status(500).json({ error: 'Erro ao listar audit logs' });
    }
  }

  /**
   * 12. Listar configurações do sistema (FASE 3.5)
   * GET /api/admin/settings
   */
  static async listSettings(req: Request, res: Response) {
    try {
      const { category } = req.query;

      const where: any = {};
      if (category) {
        where.category = category;
      }

      const settings = await prisma.systemSetting.findMany({
        where,
        orderBy: [
          { category: 'asc' },
          { key: 'asc' }
        ]
      });

      return res.json({ settings });

    } catch (error) {
      logError('Erro ao listar configurações do sistema', { err: error });
      return res.status(500).json({ error: 'Erro ao listar configurações do sistema' });
    }
  }

  /**
   * 13. Atualizar configuração do sistema (FASE 3.5)
   * PATCH /api/admin/settings/:key
   */
  static async updateSetting(req: Request, res: Response) {
    try {
      const { key } = req.params;
      const { value } = req.body;
      const adminId = req.userId;

      if (!value && value !== '' && value !== false && value !== 0) {
        return res.status(400).json({ error: 'Valor é obrigatório' });
      }

      // Buscar dados do admin para audit log
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { email: true }
      });

      if (!admin) {
        return res.status(401).json({ error: 'Admin não encontrado' });
      }

      // Buscar configuração existente
      const existingSetting = await prisma.systemSetting.findUnique({
        where: { key }
      });

      const beforeData = existingSetting ? { value: existingSetting.value } : null;

      // Atualizar ou criar configuração
      const setting = await prisma.systemSetting.upsert({
        where: { key },
        update: {
          value: String(value),
          updatedBy: adminId
        },
        create: {
          key,
          value: String(value),
          type: 'STRING',
          category: 'GENERAL',
          updatedBy: adminId
        }
      });

      const afterData = { value: setting.value };

      // Registrar no audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin.email,
        action: AuditAction.SYSTEM_SETTING_UPDATED,
        targetType: AuditTargetType.SYSTEM,
        targetId: key,
        beforeData,
        afterData,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      return res.json({
        message: 'Configuração atualizada com sucesso',
        setting
      });

    } catch (error) {
      logError('Erro ao atualizar configuração', { err: error });
      return res.status(500).json({ error: 'Erro ao atualizar configuração' });
    }
  }

  /**
   * 14. Listar alertas administrativos (FASE 4.1 - Melhorado)
   * GET /api/admin/alerts
   *
   * Query params:
   * - type: Filtrar por tipo de alerta
   * - severity: Filtrar por severidade (INFO, WARNING, ERROR, CRITICAL)
   * - isRead: Filtrar por status de leitura (true/false)
   * - limit: Limite de resultados (padrão: 50)
   * - offset: Offset para paginação (padrão: 0)
   */
  static async listAlerts(req: Request, res: Response) {
    try {
      const { type, severity, isRead, limit, offset } = req.query;

      const where: any = {};

      if (type) {
        where.type = type as string;
      }

      if (severity) {
        where.severity = severity as string;
      }

      if (isRead !== undefined) {
        where.isRead = isRead === 'true';
      }

      const limitNum = limit ? parseInt(limit as string) : 50;
      const offsetNum = offset ? parseInt(offset as string) : 0;

      const [alerts, total, unreadCount] = await Promise.all([
        prisma.adminAlert.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limitNum,
          skip: offsetNum,
        }),
        prisma.adminAlert.count({ where }),
        prisma.adminAlert.count({ where: { isRead: false } }),
      ]);

      return res.json({
        alerts,
        total,
        unreadCount,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < total,
        },
      });

    } catch (error) {
      logError('Erro ao listar alertas', { err: error });
      return res.status(500).json({ error: 'Erro ao listar alertas' });
    }
  }

  /**
   * 15. Marcar alerta como lido (FASE 4.1 - Melhorado)
   * PATCH /api/admin/alerts/:id/read
   */
  static async markAlertAsRead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const adminId = req.userId;

      // Buscar dados do admin para audit log
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { email: true }
      });

      if (!admin) {
        return res.status(401).json({ error: 'Admin não encontrado' });
      }

      const alert = await prisma.adminAlert.update({
        where: { id },
        data: {
          isRead: true,
          readBy: adminId,
          readAt: new Date()
        }
      });

      // Registrar no audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin.email,
        action: 'ALERT_MARKED_READ',
        targetType: AuditTargetType.SYSTEM,
        targetId: id,
        beforeData: { type: alert.type, severity: alert.severity },
        afterData: { isRead: true, readBy: adminId },
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      return res.json({ message: 'Alerta marcado como lido', alert });

    } catch (error) {
      logError('Erro ao marcar alerta como lido', { err: error });
      return res.status(500).json({ error: 'Erro ao marcar alerta como lido' });
    }
  }

  /**
   * 16. Obter contagem de alertas não lidos (FASE 4.1)
   * GET /api/admin/alerts/unread-count
   */
  static async getUnreadAlertsCount(req: Request, res: Response) {
    try {
      const count = await prisma.adminAlert.count({
        where: { isRead: false }
      });

      return res.json({ count });

    } catch (error) {
      logError('Erro ao obter contagem de alertas', { err: error });
      return res.status(500).json({ error: 'Erro ao obter contagem de alertas' });
    }
  }

  /**
   * 17. Estatísticas temporais (FASE 4.2)
   * GET /api/admin/stats/temporal?period=7
   *
   * Query params:
   * - period: 7, 30, 60, 90 (dias)
   *
   * Retorna métricas comparativas do período atual vs anterior
   */
  static async getTemporalStats(req: Request, res: Response) {
    try {
      const { period = '7' } = req.query;
      const periodDays = parseInt(period as string);

      // Validar período
      if (![7, 30, 60, 90].includes(periodDays)) {
        return res.status(400).json({ error: 'Período inválido. Use 7, 30, 60 ou 90 dias.' });
      }

      // Calcular datas
      const now = new Date();
      const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
      const previousPeriodStart = new Date(periodStart.getTime() - periodDays * 24 * 60 * 60 * 1000);

      // Métricas do período atual vs anterior
      const [
        // Usuários
        newUsersCurrentPeriod,
        newUsersPreviousPeriod,
        totalUsersCurrent,
        totalUsersPrevious,

        // Monitores
        newMonitorsCurrentPeriod,
        newMonitorsPreviousPeriod,
        activeMonitorsCurrent,
        activeMonitorsPrevious,

        // Subscriptions
        newSubscriptionsCurrentPeriod,
        newSubscriptionsPreviousPeriod,
        activeSubscriptionsCurrent,
        activeSubscriptionsPrevious,
        cancelledCurrentPeriod,
        cancelledPreviousPeriod,

        // Monitor Logs (Jobs)
        jobsCurrentPeriod,
        jobsPreviousPeriod,
      ] = await Promise.all([
        // Novos usuários - período atual
        prisma.user.count({
          where: { createdAt: { gte: periodStart } }
        }),
        // Novos usuários - período anterior
        prisma.user.count({
          where: {
            createdAt: {
              gte: previousPeriodStart,
              lt: periodStart
            }
          }
        }),
        // Total usuários - agora
        prisma.user.count(),
        // Total usuários - início do período
        prisma.user.count({
          where: { createdAt: { lt: periodStart } }
        }),

        // Novos monitores - período atual
        prisma.monitor.count({
          where: { createdAt: { gte: periodStart } }
        }),
        // Novos monitores - período anterior
        prisma.monitor.count({
          where: {
            createdAt: {
              gte: previousPeriodStart,
              lt: periodStart
            }
          }
        }),
        // Monitores ativos - agora
        prisma.monitor.count({ where: { active: true } }),
        // Monitores ativos - início do período (aproximação)
        prisma.monitor.count({
          where: {
            active: true,
            createdAt: { lt: periodStart }
          }
        }),

        // Novas subscriptions - período atual
        prisma.subscription.count({
          where: { createdAt: { gte: periodStart } }
        }),
        // Novas subscriptions - período anterior
        prisma.subscription.count({
          where: {
            createdAt: {
              gte: previousPeriodStart,
              lt: periodStart
            }
          }
        }),
        // Subscriptions ativas - agora
        prisma.subscription.count({ where: { status: 'ACTIVE' } }),
        // Subscriptions ativas - início do período (aproximação)
        prisma.subscription.count({
          where: {
            status: 'ACTIVE',
            createdAt: { lt: periodStart }
          }
        }),
        // Cancelamentos - período atual
        prisma.subscription.count({
          where: {
            status: 'CANCELLED',
            updatedAt: { gte: periodStart }
          }
        }),
        // Cancelamentos - período anterior
        prisma.subscription.count({
          where: {
            status: 'CANCELLED',
            updatedAt: {
              gte: previousPeriodStart,
              lt: periodStart
            }
          }
        }),

        // Jobs executados - período atual
        prisma.monitorLog.count({
          where: { createdAt: { gte: periodStart } }
        }),
        // Jobs executados - período anterior
        prisma.monitorLog.count({
          where: {
            createdAt: {
              gte: previousPeriodStart,
              lt: periodStart
            }
          }
        }),
      ]);

      // Jobs com sucesso/falha - período atual
      const jobsSuccessCurrentPeriod = await prisma.monitorLog.count({
        where: {
          createdAt: { gte: periodStart },
          status: 'SUCCESS'
        }
      });

      const jobsFailureCurrentPeriod = await prisma.monitorLog.count({
        where: {
          createdAt: { gte: periodStart },
          status: 'ERROR'
        }
      });

      // Jobs com sucesso/falha - período anterior
      const jobsSuccessPreviousPeriod = await prisma.monitorLog.count({
        where: {
          createdAt: {
            gte: previousPeriodStart,
            lt: periodStart
          },
          status: 'SUCCESS'
        }
      });

      const jobsFailurePreviousPeriod = await prisma.monitorLog.count({
        where: {
          createdAt: {
            gte: previousPeriodStart,
            lt: periodStart
          },
          status: 'ERROR'
        }
      });

      // Calcular variações percentuais
      const calculateGrowth = (current: number, previous: number): number => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      // Calcular taxa de erro
      const calculateErrorRate = (errors: number, total: number): number => {
        if (total === 0) return 0;
        return (errors / total) * 100;
      };

      return res.json({
        period: periodDays,
        periodStart: periodStart.toISOString(),
        periodEnd: now.toISOString(),

        users: {
          current: {
            total: totalUsersCurrent,
            newUsers: newUsersCurrentPeriod,
          },
          previous: {
            total: totalUsersPrevious,
            newUsers: newUsersPreviousPeriod,
          },
          growth: {
            total: calculateGrowth(totalUsersCurrent, totalUsersPrevious),
            newUsers: calculateGrowth(newUsersCurrentPeriod, newUsersPreviousPeriod),
          }
        },

        monitors: {
          current: {
            active: activeMonitorsCurrent,
            newMonitors: newMonitorsCurrentPeriod,
          },
          previous: {
            active: activeMonitorsPrevious,
            newMonitors: newMonitorsPreviousPeriod,
          },
          growth: {
            active: calculateGrowth(activeMonitorsCurrent, activeMonitorsPrevious),
            newMonitors: calculateGrowth(newMonitorsCurrentPeriod, newMonitorsPreviousPeriod),
          }
        },

        subscriptions: {
          current: {
            active: activeSubscriptionsCurrent,
            new: newSubscriptionsCurrentPeriod,
            cancelled: cancelledCurrentPeriod,
          },
          previous: {
            active: activeSubscriptionsPrevious,
            new: newSubscriptionsPreviousPeriod,
            cancelled: cancelledPreviousPeriod,
          },
          growth: {
            active: calculateGrowth(activeSubscriptionsCurrent, activeSubscriptionsPrevious),
            new: calculateGrowth(newSubscriptionsCurrentPeriod, newSubscriptionsPreviousPeriod),
          },
          churnRate: {
            current: calculateErrorRate(cancelledCurrentPeriod, activeSubscriptionsCurrent + cancelledCurrentPeriod),
            previous: calculateErrorRate(cancelledPreviousPeriod, activeSubscriptionsPrevious + cancelledPreviousPeriod),
          }
        },

        jobs: {
          current: {
            total: jobsCurrentPeriod,
            success: jobsSuccessCurrentPeriod,
            failure: jobsFailureCurrentPeriod,
            errorRate: calculateErrorRate(jobsFailureCurrentPeriod, jobsCurrentPeriod),
          },
          previous: {
            total: jobsPreviousPeriod,
            success: jobsSuccessPreviousPeriod,
            failure: jobsFailurePreviousPeriod,
            errorRate: calculateErrorRate(jobsFailurePreviousPeriod, jobsPreviousPeriod),
          },
          growth: {
            total: calculateGrowth(jobsCurrentPeriod, jobsPreviousPeriod),
            success: calculateGrowth(jobsSuccessCurrentPeriod, jobsSuccessPreviousPeriod),
            failure: calculateGrowth(jobsFailureCurrentPeriod, jobsFailurePreviousPeriod),
          }
        }
      });

    } catch (error) {
      logError('Erro ao buscar estatísticas temporais', { err: error });
      return res.status(500).json({ error: 'Erro ao buscar estatísticas temporais' });
    }
  }

  /**
   * 20. Exportar audit logs em CSV (FASE 4.3)
   * GET /api/admin/audit-logs/export
   */
  static async exportAuditLogs(req: Request, res: Response) {
    try {
      const { adminId: filterAdminId, action, targetType, startDate, endDate } = req.query;
      const adminId = req.userId;

      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { email: true }
      });

      if (!admin) {
        return res.status(401).json({ error: 'Admin não encontrado' });
      }

      // Construir filtros
      const where: any = {};

      if (filterAdminId) {
        where.adminId = filterAdminId;
      }

      if (action) {
        where.action = action;
      }

      if (targetType) {
        where.targetType = targetType;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate as string);
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate as string);
        }
      }

      // Buscar logs
      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      });

      const { generateCSV, getTimestamp } = await import('../services/exportService');

      const csvData = logs.map(log => ({
        id: log.id,
        adminEmail: log.adminEmail,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId || '',
        ipAddress: log.ipAddress || '',
        createdAt: log.createdAt
      }));

      const headers = {
        id: 'ID',
        adminEmail: 'Admin',
        action: 'Ação',
        targetType: 'Tipo',
        targetId: 'ID do Alvo',
        ipAddress: 'IP',
        createdAt: 'Data/Hora'
      };

      const { csv, filename } = generateCSV(
        csvData,
        headers,
        `audit_logs_${getTimestamp()}`
      );

      // Audit log da exportação
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin.email,
        action: 'AUDIT_LOGS_EXPORTED',
        targetType: AuditTargetType.SYSTEM,
        targetId: null,
        beforeData: null,
        afterData: { count: logs.length, filters: where },
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('\ufeff' + csv);

    } catch (error) {
      logError('Erro ao exportar audit logs', { err: error });
      return res.status(500).json({ error: 'Erro ao exportar audit logs' });
    }
  }

  /**
   * 21. Exportar alertas em CSV (FASE 4.3)
   * GET /api/admin/alerts/export
   */
  static async exportAlerts(req: Request, res: Response) {
    try {
      const { type, severity, isRead } = req.query;
      const adminId = req.userId;

      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { email: true }
      });

      if (!admin) {
        return res.status(401).json({ error: 'Admin não encontrado' });
      }

      // Construir filtros
      const where: any = {};

      if (type) {
        where.type = type as string;
      }

      if (severity) {
        where.severity = severity as string;
      }

      if (isRead !== undefined) {
        where.isRead = isRead === 'true';
      }

      // Buscar alertas
      const alerts = await prisma.adminAlert.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      });

      const { generateCSV, getTimestamp } = await import('../services/exportService');

      const csvData = alerts.map(alert => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        source: alert.source || '',
        isRead: alert.isRead,
        readBy: alert.readBy || '',
        createdAt: alert.createdAt
      }));

      const headers = {
        id: 'ID',
        type: 'Tipo',
        severity: 'Severidade',
        title: 'Título',
        message: 'Mensagem',
        source: 'Origem',
        isRead: 'Lido',
        readBy: 'Lido Por',
        createdAt: 'Data/Hora'
      };

      const { csv, filename } = generateCSV(
        csvData,
        headers,
        `alertas_${getTimestamp()}`
      );

      // Audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin.email,
        action: 'ALERTS_EXPORTED',
        targetType: AuditTargetType.SYSTEM,
        targetId: null,
        beforeData: null,
        afterData: { count: alerts.length, filters: where },
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('\ufeff' + csv);

    } catch (error) {
      logError('Erro ao exportar alertas', { err: error });
      return res.status(500).json({ error: 'Erro ao exportar alertas' });
    }
  }
}

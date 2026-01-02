import { Request, Response } from 'express';
import { prisma } from '../server';
import { logAdminAction, AuditAction, AuditTargetType, getClientIp } from '../utils/auditLog';

export class AdminController {
  /**
   * 1. Listar todos os usuários com paginação e filtros
   * GET /api/admin/users
   */
  static async listUsers(req: Request, res: Response) {
    try {
      const {
        page = '1',
        limit = '20',
        status,
        role,
        email
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Construir filtros dinâmicos
      const where: any = {};

      if (status === 'blocked') {
        where.blocked = true;
      } else if (status === 'active') {
        where.blocked = false;
      }

      if (role) {
        where.role = role;
      }

      if (email) {
        where.email = {
          contains: email as string,
          mode: 'insensitive'
        };
      }

      // Buscar usuários com relacionamentos
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            blocked: true,
            createdAt: true,
            updatedAt: true,
            cpfLast4: true,
            // Incluir subscription atual
            subscriptions: {
              where: { status: 'ACTIVE' },
              take: 1,
              select: {
                id: true,
                status: true,
                validUntil: true,
                plan: {
                  select: {
                    name: true,
                    priceCents: true
                  }
                }
              }
            },
            // Contar total de monitores
            _count: {
              select: {
                monitors: true
              }
            }
          }
        }),
        prisma.user.count({ where })
      ]);

      const totalPages = Math.ceil(total / limitNum);

      return res.json({
        users,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages
        }
      });

    } catch (error) {
      console.error('Erro ao listar usuários:', error);
      return res.status(500).json({ error: 'Erro ao listar usuários' });
    }
  }

  /**
   * 2. Detalhes completos de um usuário
   * GET /api/admin/users/:id
   */
  static async getUserDetails(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          blocked: true,
          createdAt: true,
          updatedAt: true,
          cpfLast4: true,
          // Histórico completo de subscriptions
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              validUntil: true,
              createdAt: true,
              updatedAt: true,
              plan: {
                select: {
                  name: true,
                  priceCents: true,
                  maxMonitors: true
                }
              }
            }
          },
          // Todos os monitores
          monitors: {
            select: {
              id: true,
              site: true,
              keywords: true,
              active: true,
              createdAt: true,
              lastCheckedAt: true
            }
          },
          // Usage logs
          usageLogs: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              action: true,
              createdAt: true
            }
          }
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Calcular estatísticas
      const stats = {
        totalMonitors: user.monitors.length,
        activeMonitors: user.monitors.filter(m => m.active).length,
        totalSubscriptions: user.subscriptions.length,
        activeSubscription: user.subscriptions.find(s => s.status === 'ACTIVE') || null
      };

      return res.json({
        user,
        stats
      });

    } catch (error) {
      console.error('Erro ao buscar detalhes do usuário:', error);
      return res.status(500).json({ error: 'Erro ao buscar detalhes do usuário' });
    }
  }

  /**
   * 3. Bloquear usuário
   * POST /api/admin/users/:id/block
   */
  static async blockUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const adminId = req.userId; // ID do admin que executou a ação

      // Buscar dados do admin para o audit log
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { email: true }
      });

      if (!admin) {
        return res.status(401).json({ error: 'Admin não encontrado' });
      }

      // Verificar se usuário existe
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          subscriptions: {
            where: { status: 'ACTIVE' }
          },
          monitors: {
            where: { active: true }
          }
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      if (user.blocked) {
        return res.status(400).json({ error: 'Usuário já está bloqueado' });
      }

      // Dados antes do bloqueio
      const beforeData = {
        blocked: user.blocked,
        activeSubscriptions: user.subscriptions.length,
        activeMonitors: user.monitors.length
      };

      // Executar bloqueio em transação
      await prisma.$transaction(async (tx) => {
        // 1. Marcar usuário como bloqueado
        await tx.user.update({
          where: { id },
          data: { blocked: true }
        });

        // 2. Cancelar subscriptions ativas
        if (user.subscriptions.length > 0) {
          await tx.subscription.updateMany({
            where: {
              userId: id,
              status: 'ACTIVE'
            },
            data: { status: 'CANCELLED' }
          });
        }

        // 3. Desativar monitores
        if (user.monitors.length > 0) {
          await tx.monitor.updateMany({
            where: {
              userId: id,
              active: true
            },
            data: { active: false }
          });
        }
      });

      // Dados depois do bloqueio
      const afterData = {
        blocked: true,
        subscriptionsCancelled: user.subscriptions.length,
        monitorsDeactivated: user.monitors.length
      };

      // Registrar no audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin.email,
        action: AuditAction.USER_BLOCKED,
        targetType: AuditTargetType.USER,
        targetId: id,
        beforeData,
        afterData,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      return res.json({
        message: 'Usuário bloqueado com sucesso',
        user: {
          id: user.id,
          email: user.email,
          blocked: true
        },
        actions: {
          subscriptionsCancelled: user.subscriptions.length,
          monitorsDeactivated: user.monitors.length
        }
      });

    } catch (error) {
      console.error('Erro ao bloquear usuário:', error);
      return res.status(500).json({ error: 'Erro ao bloquear usuário' });
    }
  }

  /**
   * 4. Desbloquear usuário
   * POST /api/admin/users/:id/unblock
   */
  static async unblockUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const adminId = req.userId;

      // Buscar dados do admin para o audit log
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { email: true }
      });

      if (!admin) {
        return res.status(401).json({ error: 'Admin não encontrado' });
      }

      const user = await prisma.user.findUnique({
        where: { id }
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      if (!user.blocked) {
        return res.status(400).json({ error: 'Usuário não está bloqueado' });
      }

      // Dados antes
      const beforeData = { blocked: user.blocked };

      // Desbloquear usuário
      await prisma.user.update({
        where: { id },
        data: { blocked: false }
      });

      // Dados depois
      const afterData = { blocked: false };

      // Registrar no audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin.email,
        action: AuditAction.USER_UNBLOCKED,
        targetType: AuditTargetType.USER,
        targetId: id,
        beforeData,
        afterData,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      return res.json({
        message: 'Usuário desbloqueado com sucesso',
        user: {
          id: user.id,
          email: user.email,
          blocked: false
        }
      });

    } catch (error) {
      console.error('Erro ao desbloquear usuário:', error);
      return res.status(500).json({ error: 'Erro ao desbloquear usuário' });
    }
  }

  /**
   * 5. Listar todas as subscriptions
   * GET /api/admin/subscriptions
   */
  static async listSubscriptions(req: Request, res: Response) {
    try {
      const {
        page = '1',
        limit = '20',
        status,
        planId,
        userId
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Construir filtros
      const where: any = {};

      if (status) {
        where.status = status;
      }

      if (planId) {
        where.planId = planId;
      }

      if (userId) {
        where.userId = userId;
      }

      // Buscar subscriptions
      const [subscriptions, total] = await Promise.all([
        prisma.subscription.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            plan: {
              select: {
                id: true,
                name: true,
                priceCents: true,
                maxMonitors: true
              }
            }
          }
        }),
        prisma.subscription.count({ where })
      ]);

      const totalPages = Math.ceil(total / limitNum);

      return res.json({
        subscriptions,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages
        }
      });

    } catch (error) {
      console.error('Erro ao listar subscriptions:', error);
      return res.status(500).json({ error: 'Erro ao listar subscriptions' });
    }
  }

  /**
   * 6. Atualizar subscription manualmente
   * PATCH /api/admin/subscriptions/:id
   */
  static async updateSubscription(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, validUntil } = req.body;
      const adminId = req.userId;

      // Buscar dados do admin para o audit log
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { email: true }
      });

      if (!admin) {
        return res.status(401).json({ error: 'Admin não encontrado' });
      }

      // Validar se subscription existe
      const subscription = await prisma.subscription.findUnique({
        where: { id }
      });

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription não encontrada' });
      }

      // Dados antes da atualização
      const beforeData = {
        status: subscription.status,
        validUntil: subscription.validUntil
      };

      // Preparar dados para atualização
      const updateData: any = {};

      if (status) {
        // Validar status
        const validStatuses = ['ACTIVE', 'CANCELLED', 'EXPIRED', 'PENDING'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ error: 'Status inválido' });
        }
        updateData.status = status;
      }

      if (validUntil) {
        updateData.validUntil = new Date(validUntil);
      }

      // Atualizar subscription
      const updated = await prisma.subscription.update({
        where: { id },
        data: updateData,
        include: {
          user: {
            select: {
              email: true
            }
          },
          plan: {
            select: {
              name: true
            }
          }
        }
      });

      // Dados depois da atualização
      const afterData = {
        status: updated.status,
        validUntil: updated.validUntil
      };

      // Registrar no audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin.email,
        action: AuditAction.SUBSCRIPTION_UPDATED,
        targetType: AuditTargetType.SUBSCRIPTION,
        targetId: id,
        beforeData,
        afterData,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      return res.json({
        message: 'Subscription atualizada com sucesso',
        subscription: updated
      });

    } catch (error) {
      console.error('Erro ao atualizar subscription:', error);
      return res.status(500).json({ error: 'Erro ao atualizar subscription' });
    }
  }

  /**
   * 7. Estatísticas do sistema
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
      console.error('Erro ao buscar estatísticas:', error);
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
      console.error('Erro ao listar logs de webhooks:', error);
      return res.status(500).json({ error: 'Erro ao listar logs de webhooks' });
    }
  }

  /**
   * 9. Listar todos os monitores
   * GET /api/admin/monitors
   */
  static async listMonitors(req: Request, res: Response) {
    try {
      const {
        page = '1',
        limit = '20',
        userId,
        site,
        active
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Construir filtros
      const where: any = {};

      if (userId) {
        where.userId = userId;
      }

      if (site) {
        where.site = {
          contains: site as string,
          mode: 'insensitive'
        };
      }

      if (active !== undefined) {
        where.active = active === 'true';
      }

      // Buscar monitores
      const [monitors, total] = await Promise.all([
        prisma.monitor.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }),
        prisma.monitor.count({ where })
      ]);

      const totalPages = Math.ceil(total / limitNum);

      return res.json({
        monitors,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages
        }
      });

    } catch (error) {
      console.error('Erro ao listar monitores:', error);
      return res.status(500).json({ error: 'Erro ao listar monitores' });
    }
  }

  /**
   * 10. Listar execuções de jobs (dashboard de monitoramento)
   * GET /api/admin/jobs
   */
  static async listJobRuns(req: Request, res: Response) {
    try {
      const {
        page = '1',
        pageSize = '20',
        event,
        status
      } = req.query;

      const pageNum = parseInt(page as string);
      const pageSizeNum = parseInt(pageSize as string);
      const skip = (pageNum - 1) * pageSizeNum;

      // Construir filtros
      const where: any = {};

      // Filtrar apenas eventos de jobs (começam com prefixos específicos ou são conhecidos)
      const jobEvents = [
        'MONTHLY_QUERIES_RESET',
        'TRIAL_CHECK',
        'SUBSCRIPTION_CHECK'
      ];

      if (event) {
        where.event = event;
      } else {
        // Se não especificar event, mostrar apenas jobs conhecidos
        where.event = {
          in: jobEvents
        };
      }

      // Filtrar por status se fornecido
      // Status é derivado do campo 'error' e do payload
      if (status === 'ERROR') {
        where.error = {
          not: null
        };
      } else if (status === 'SUCCESS') {
        where.error = null;
      }

      // Buscar logs de jobs
      const [logs, total] = await Promise.all([
        prisma.webhookLog.findMany({
          where,
          skip,
          take: pageSizeNum,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            event: true,
            createdAt: true,
            processed: true,
            error: true,
            payload: true
          }
        }),
        prisma.webhookLog.count({ where })
      ]);

      // Transformar logs para formato mais amigável
      const data = logs.map(log => {
        const payload = typeof log.payload === 'object' ? log.payload : {};
        const hasError = log.error !== null && log.error !== undefined;

        return {
          id: log.id,
          event: log.event,
          createdAt: log.createdAt,
          status: hasError ? 'ERROR' : (payload as any)?.status || 'SUCCESS',
          updatedCount: (payload as any)?.updatedCount,
          executedAt: (payload as any)?.executedAt,
          error: log.error,
          processed: log.processed
        };
      });

      const totalPages = Math.ceil(total / pageSizeNum);

      return res.json({
        data,
        pagination: {
          page: pageNum,
          pageSize: pageSizeNum,
          total,
          totalPages
        }
      });

    } catch (error) {
      console.error('Erro ao listar execuções de jobs:', error);
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
      console.error('Erro ao listar audit logs:', error);
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
      console.error('Erro ao listar configurações:', error);
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
      console.error('Erro ao atualizar configuração:', error);
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
      console.error('Erro ao listar alertas:', error);
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
      console.error('Erro ao marcar alerta como lido:', error);
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
      console.error('Erro ao obter contagem de alertas:', error);
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
      console.error('Erro ao buscar estatísticas temporais:', error);
      return res.status(500).json({ error: 'Erro ao buscar estatísticas temporais' });
    }
  }

  /**
   * 18. Exportar usuários em CSV (FASE 4.3)
   * GET /api/admin/users/export
   *
   * Respeita os mesmos filtros de /api/admin/users
   */
  static async exportUsers(req: Request, res: Response) {
    try {
      const { status, role, email } = req.query;
      const adminId = req.userId;

      // Buscar dados do admin para audit log
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { email: true }
      });

      if (!admin) {
        return res.status(401).json({ error: 'Admin não encontrado' });
      }

      // Construir filtros (mesmos da listagem)
      const where: any = {};

      if (status === 'blocked') {
        where.blocked = true;
      } else if (status === 'active') {
        where.blocked = false;
      }

      if (role) {
        where.role = role;
      }

      if (email) {
        where.email = {
          contains: email as string,
          mode: 'insensitive'
        };
      }

      // Buscar usuários
      const users = await prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          blocked: true,
          createdAt: true,
          cpfLast4: true,
          subscriptions: {
            where: { status: 'ACTIVE' },
            take: 1,
            select: {
              plan: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      });

      // Importar funções do exportService
      const { generateCSV, getTimestamp } = await import('../services/exportService');

      // Preparar dados para CSV
      const csvData = users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        blocked: user.blocked,
        cpfLast4: user.cpfLast4 || '',
        currentPlan: user.subscriptions[0]?.plan.name || 'Nenhum',
        createdAt: user.createdAt
      }));

      const headers = {
        id: 'ID',
        name: 'Nome',
        email: 'E-mail',
        role: 'Perfil',
        isActive: 'Ativo',
        blocked: 'Bloqueado',
        cpfLast4: 'CPF (últimos 4)',
        currentPlan: 'Plano Atual',
        createdAt: 'Data de Cadastro'
      };

      const { csv, filename } = generateCSV(
        csvData,
        headers,
        `usuarios_${getTimestamp()}`
      );

      // Registrar no audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin.email,
        action: 'USERS_EXPORTED',
        targetType: AuditTargetType.USER,
        targetId: null,
        beforeData: null,
        afterData: { count: users.length, filters: where },
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      // Retornar CSV
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('\ufeff' + csv); // BOM para UTF-8

    } catch (error) {
      console.error('Erro ao exportar usuários:', error);
      return res.status(500).json({ error: 'Erro ao exportar usuários' });
    }
  }

  /**
   * 19. Exportar subscriptions em CSV (FASE 4.3)
   * GET /api/admin/subscriptions/export
   */
  static async exportSubscriptions(req: Request, res: Response) {
    try {
      const { status, planId, userId } = req.query;
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

      if (status) {
        where.status = status;
      }

      if (planId) {
        where.planId = planId;
      }

      if (userId) {
        where.userId = userId;
      }

      // Buscar subscriptions
      const subscriptions = await prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              name: true,
              email: true
            }
          },
          plan: {
            select: {
              name: true,
              priceCents: true
            }
          }
        }
      });

      const { generateCSV, getTimestamp, formatCurrency } = await import('../services/exportService');

      // Preparar dados
      const csvData = subscriptions.map(sub => ({
        id: sub.id,
        userName: sub.user.name,
        userEmail: sub.user.email,
        planName: sub.plan.name,
        planPrice: formatCurrency(sub.plan.priceCents),
        status: sub.status,
        startDate: sub.startDate,
        validUntil: sub.validUntil || '',
        isLifetime: sub.isLifetime,
        isTrial: sub.isTrial,
        createdAt: sub.createdAt
      }));

      const headers = {
        id: 'ID',
        userName: 'Nome do Usuário',
        userEmail: 'E-mail',
        planName: 'Plano',
        planPrice: 'Preço',
        status: 'Status',
        startDate: 'Data de Início',
        validUntil: 'Válido Até',
        isLifetime: 'Vitalício',
        isTrial: 'Trial',
        createdAt: 'Data de Criação'
      };

      const { csv, filename } = generateCSV(
        csvData,
        headers,
        `assinaturas_${getTimestamp()}`
      );

      // Audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin.email,
        action: 'SUBSCRIPTIONS_EXPORTED',
        targetType: AuditTargetType.SUBSCRIPTION,
        targetId: null,
        beforeData: null,
        afterData: { count: subscriptions.length, filters: where },
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('\ufeff' + csv);

    } catch (error) {
      console.error('Erro ao exportar subscriptions:', error);
      return res.status(500).json({ error: 'Erro ao exportar subscriptions' });
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
      console.error('Erro ao exportar audit logs:', error);
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
      console.error('Erro ao exportar alertas:', error);
      return res.status(500).json({ error: 'Erro ao exportar alertas' });
    }
  }

  /**
   * 22. Exportar monitores em CSV (FASE 4.3)
   * GET /api/admin/monitors/export
   */
  static async exportMonitors(req: Request, res: Response) {
    try {
      const { userId, site, active } = req.query;
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

      if (userId) {
        where.userId = userId;
      }

      if (site) {
        where.site = {
          contains: site as string,
          mode: 'insensitive'
        };
      }

      if (active !== undefined) {
        where.active = active === 'true';
      }

      // Buscar monitores
      const monitors = await prisma.monitor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });

      const { generateCSV, getTimestamp } = await import('../services/exportService');

      const csvData = monitors.map(monitor => ({
        id: monitor.id,
        userName: monitor.user.name,
        userEmail: monitor.user.email,
        name: monitor.name,
        site: monitor.site,
        active: monitor.active,
        keywords: monitor.keywords,
        priceMin: monitor.priceMin || '',
        priceMax: monitor.priceMax || '',
        lastCheckedAt: monitor.lastCheckedAt || '',
        createdAt: monitor.createdAt
      }));

      const headers = {
        id: 'ID',
        userName: 'Nome do Usuário',
        userEmail: 'E-mail',
        name: 'Nome do Monitor',
        site: 'Site',
        active: 'Ativo',
        keywords: 'Palavras-chave',
        priceMin: 'Preço Mínimo',
        priceMax: 'Preço Máximo',
        lastCheckedAt: 'Última Verificação',
        createdAt: 'Data de Criação'
      };

      const { csv, filename } = generateCSV(
        csvData,
        headers,
        `monitores_${getTimestamp()}`
      );

      // Audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin.email,
        action: 'MONITORS_EXPORTED',
        targetType: AuditTargetType.MONITOR,
        targetId: null,
        beforeData: null,
        afterData: { count: monitors.length, filters: where },
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('\ufeff' + csv);

    } catch (error) {
      console.error('Erro ao exportar monitores:', error);
      return res.status(500).json({ error: 'Erro ao exportar monitores' });
    }
  }

  /**
   * COUPONS MANAGEMENT (FASE ADMIN CUPONS)
   */

  /**
   * GET /api/admin/coupons/export
   * Exportar cupons para CSV
   */
  static async exportCoupons(req: Request, res: Response) {
    try {
      const { status, code, type } = req.query;
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

      if (status === 'active') {
        where.isActive = true;
      } else if (status === 'inactive') {
        where.isActive = false;
      }

      if (code) {
        where.code = {
          contains: (code as string).toUpperCase(),
          mode: 'insensitive'
        };
      }

      if (type) {
        where.discountType = type;
      }

      // Buscar cupons
      const coupons = await prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          plan: {
            select: {
              name: true,
              slug: true
            }
          },
          _count: {
            select: {
              usageLogs: true
            }
          }
        }
      });

      const { generateCSV, getTimestamp } = await import('../services/exportService');

      const csvData = coupons.map(coupon => ({
        id: coupon.id,
        code: coupon.code,
        description: coupon.description || '',
        discountType: coupon.discountType === 'PERCENTAGE' ? 'Percentual' : 'Fixo',
        discountValue: coupon.discountType === 'PERCENTAGE'
          ? `${coupon.discountValue}%`
          : `R$ ${(coupon.discountValue / 100).toFixed(2)}`,
        plan: coupon.plan?.name || 'Todos os planos',
        maxUses: coupon.maxUses || 'Ilimitado',
        usedCount: coupon._count.usageLogs,
        remainingUses: coupon.maxUses ? coupon.maxUses - coupon._count.usageLogs : 'Ilimitado',
        expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleString('pt-BR') : 'Sem expiração',
        isActive: coupon.isActive ? 'Ativo' : 'Inativo',
        createdAt: new Date(coupon.createdAt).toLocaleString('pt-BR'),
        updatedAt: new Date(coupon.updatedAt).toLocaleString('pt-BR')
      }));

      const headers = {
        id: 'ID',
        code: 'Código',
        description: 'Descrição',
        discountType: 'Tipo de Desconto',
        discountValue: 'Valor do Desconto',
        plan: 'Plano Aplicável',
        maxUses: 'Máximo de Usos',
        usedCount: 'Usos Realizados',
        remainingUses: 'Usos Restantes',
        expiresAt: 'Data de Expiração',
        isActive: 'Status',
        createdAt: 'Data de Criação',
        updatedAt: 'Última Atualização'
      };

      const { csv, filename } = generateCSV(
        csvData,
        headers,
        `cupons_${getTimestamp()}`
      );

      // Audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin.email,
        action: 'COUPONS_EXPORTED' as any,
        targetType: AuditTargetType.COUPON,
        targetId: null,
        beforeData: null,
        afterData: { count: coupons.length, filters: where },
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('\ufeff' + csv);

    } catch (error) {
      console.error('Erro ao exportar cupons:', error);
      return res.status(500).json({ error: 'Erro ao exportar cupons' });
    }
  }

  /**
   * GET /api/admin/coupons
   * Listar todos os cupons com paginação e filtros
   */
  static async listCoupons(req: Request, res: Response) {
    try {
      const {
        page = '1',
        limit = '20',
        status,
        code,
        type
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Construir filtros dinâmicos
      const where: any = {};

      if (status === 'active') {
        where.isActive = true;
      } else if (status === 'inactive') {
        where.isActive = false;
      }

      if (code) {
        where.code = {
          contains: (code as string).toUpperCase(),
          mode: 'insensitive'
        };
      }

      if (type) {
        where.discountType = type;
      }

      // Buscar cupons com relacionamentos
      const [coupons, total] = await Promise.all([
        prisma.coupon.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            },
            _count: {
              select: {
                usageLogs: true
              }
            }
          }
        }),
        prisma.coupon.count({ where })
      ]);

      const totalPages = Math.ceil(total / limitNum);

      return res.json({
        coupons,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages
        }
      });

    } catch (error) {
      console.error('Erro ao listar cupons:', error);
      return res.status(500).json({ error: 'Erro ao listar cupons' });
    }
  }

  /**
   * POST /api/admin/coupons
   * Criar novo cupom
   */
  static async createCoupon(req: Request, res: Response) {
    try {
      const {
        code,
        description,
        discountType,
        discountValue,
        maxUses,
        expiresAt,
        appliesToPlanId
      } = req.body;

      const adminId = req.userId;
      const admin = await prisma.user.findUnique({ where: { id: adminId! } });

      // Validações
      if (!code || !discountType || discountValue === undefined) {
        return res.status(400).json({
          error: 'Campos obrigatórios: code, discountType, discountValue'
        });
      }

      // Code deve ser uppercase e sem espaços
      const normalizedCode = code.trim().toUpperCase().replace(/\s+/g, '');

      if (normalizedCode.length < 3) {
        return res.status(400).json({
          error: 'Código deve ter pelo menos 3 caracteres'
        });
      }

      // Validar discountValue
      if (discountValue <= 0) {
        return res.status(400).json({
          error: 'Valor de desconto deve ser maior que 0'
        });
      }

      if (discountType === 'PERCENTAGE' && discountValue > 100) {
        return res.status(400).json({
          error: 'Desconto percentual não pode ser maior que 100%'
        });
      }

      // Verificar se código já existe
      const existing = await prisma.coupon.findUnique({
        where: { code: normalizedCode }
      });

      if (existing) {
        return res.status(400).json({
          error: 'Já existe um cupom com este código'
        });
      }

      // Validar plano se especificado
      if (appliesToPlanId) {
        const plan = await prisma.plan.findUnique({
          where: { id: appliesToPlanId }
        });

        if (!plan) {
          return res.status(400).json({
            error: 'Plano especificado não encontrado'
          });
        }
      }

      // Validar data de expiração
      if (expiresAt && new Date(expiresAt) <= new Date()) {
        return res.status(400).json({
          error: 'Data de expiração deve ser futura'
        });
      }

      // Criar cupom
      const coupon = await prisma.coupon.create({
        data: {
          code: normalizedCode,
          description: description || null,
          discountType,
          discountValue,
          maxUses: maxUses || null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          appliesToPlanId: appliesToPlanId || null,
          isActive: true,
          usedCount: 0
        },
        include: {
          plan: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        }
      });

      // Audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin!.email,
        action: AuditAction.COUPON_CREATED,
        targetType: AuditTargetType.COUPON,
        targetId: coupon.id,
        beforeData: null,
        afterData: coupon,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      return res.status(201).json(coupon);

    } catch (error) {
      console.error('Erro ao criar cupom:', error);
      return res.status(500).json({ error: 'Erro ao criar cupom' });
    }
  }

  /**
   * PUT /api/admin/coupons/:id
   * Atualizar cupom existente
   */
  static async updateCoupon(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        description,
        discountType,
        discountValue,
        maxUses,
        expiresAt,
        appliesToPlanId
      } = req.body;

      const adminId = req.userId;
      const admin = await prisma.user.findUnique({ where: { id: adminId! } });

      // Buscar cupom existente
      const existing = await prisma.coupon.findUnique({
        where: { id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Cupom não encontrado' });
      }

      // Validações
      if (discountValue !== undefined && discountValue <= 0) {
        return res.status(400).json({
          error: 'Valor de desconto deve ser maior que 0'
        });
      }

      if (discountType === 'PERCENTAGE' && discountValue > 100) {
        return res.status(400).json({
          error: 'Desconto percentual não pode ser maior que 100%'
        });
      }

      // Validar plano se especificado
      if (appliesToPlanId) {
        const plan = await prisma.plan.findUnique({
          where: { id: appliesToPlanId }
        });

        if (!plan) {
          return res.status(400).json({
            error: 'Plano especificado não encontrado'
          });
        }
      }

      // Validar data de expiração
      if (expiresAt && new Date(expiresAt) <= new Date()) {
        return res.status(400).json({
          error: 'Data de expiração deve ser futura'
        });
      }

      // Atualizar cupom
      const updated = await prisma.coupon.update({
        where: { id },
        data: {
          description: description !== undefined ? description : existing.description,
          discountType: discountType || existing.discountType,
          discountValue: discountValue !== undefined ? discountValue : existing.discountValue,
          maxUses: maxUses !== undefined ? maxUses : existing.maxUses,
          expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : existing.expiresAt,
          appliesToPlanId: appliesToPlanId !== undefined ? appliesToPlanId : existing.appliesToPlanId
        },
        include: {
          plan: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        }
      });

      // Audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin!.email,
        action: AuditAction.COUPON_UPDATED,
        targetType: AuditTargetType.COUPON,
        targetId: updated.id,
        beforeData: existing,
        afterData: updated,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      return res.json(updated);

    } catch (error) {
      console.error('Erro ao atualizar cupom:', error);
      return res.status(500).json({ error: 'Erro ao atualizar cupom' });
    }
  }

  /**
   * PATCH /api/admin/coupons/:id/toggle
   * Ativar/Desativar cupom
   */
  static async toggleCouponStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const adminId = req.userId;
      const admin = await prisma.user.findUnique({ where: { id: adminId! } });

      // Buscar cupom existente
      const existing = await prisma.coupon.findUnique({
        where: { id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Cupom não encontrado' });
      }

      // Toggle status
      const updated = await prisma.coupon.update({
        where: { id },
        data: {
          isActive: !existing.isActive
        },
        include: {
          plan: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        }
      });

      // Audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin!.email,
        action: updated.isActive ? AuditAction.COUPON_ACTIVATED : AuditAction.COUPON_DEACTIVATED,
        targetType: AuditTargetType.COUPON,
        targetId: updated.id,
        beforeData: { isActive: existing.isActive },
        afterData: { isActive: updated.isActive },
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      return res.json(updated);

    } catch (error) {
      console.error('Erro ao alternar status do cupom:', error);
      return res.status(500).json({ error: 'Erro ao alternar status do cupom' });
    }
  }

  /**
   * DELETE /api/admin/coupons/:id
   * Deletar cupom (soft delete via isActive)
   */
  static async deleteCoupon(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const adminId = req.userId;
      const admin = await prisma.user.findUnique({ where: { id: adminId! } });

      // Buscar cupom existente
      const existing = await prisma.coupon.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              usageLogs: true
            }
          }
        }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Cupom não encontrado' });
      }

      // Se já foi usado, apenas desativar (soft delete)
      if (existing._count.usageLogs > 0) {
        const updated = await prisma.coupon.update({
          where: { id },
          data: { isActive: false }
        });

        // Audit log
        await logAdminAction({
          adminId: adminId!,
          adminEmail: admin!.email,
          action: AuditAction.COUPON_DEACTIVATED,
          targetType: AuditTargetType.COUPON,
          targetId: updated.id,
          beforeData: existing,
          afterData: { isActive: false, reason: 'Soft delete devido a usos existentes' },
          ipAddress: getClientIp(req),
          userAgent: req.get('user-agent')
        });

        return res.json({
          message: 'Cupom desativado (possui usos registrados)',
          coupon: updated
        });
      }

      // Se nunca foi usado, pode deletar permanentemente
      await prisma.coupon.delete({
        where: { id }
      });

      // Audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin!.email,
        action: AuditAction.COUPON_DELETED,
        targetType: AuditTargetType.COUPON,
        targetId: id,
        beforeData: existing,
        afterData: null,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      return res.json({
        message: 'Cupom deletado permanentemente',
        deleted: true
      });

    } catch (error) {
      console.error('Erro ao deletar cupom:', error);
      return res.status(500).json({ error: 'Erro ao deletar cupom' });
    }
  }

  /**
   * PATCH /api/admin/coupons/bulk/toggle
   * Ativar/Desativar múltiplos cupons
   */
  static async bulkToggleCoupons(req: Request, res: Response) {
    try {
      const { couponIds, isActive } = req.body;
      const adminId = req.userId;
      const admin = await prisma.user.findUnique({ where: { id: adminId! } });

      if (!couponIds || !Array.isArray(couponIds) || couponIds.length === 0) {
        return res.status(400).json({ error: 'IDs de cupons são obrigatórios' });
      }

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive deve ser um booleano' });
      }

      // Atualizar todos de uma vez
      const result = await prisma.coupon.updateMany({
        where: {
          id: {
            in: couponIds
          }
        },
        data: {
          isActive
        }
      });

      // Audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin!.email,
        action: isActive ? AuditAction.COUPON_ACTIVATED : AuditAction.COUPON_DEACTIVATED,
        targetType: AuditTargetType.COUPON,
        targetId: null,
        beforeData: { couponIds },
        afterData: { isActive, count: result.count },
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      return res.json({
        message: `${result.count} cupons ${isActive ? 'ativados' : 'desativados'} com sucesso`,
        count: result.count
      });

    } catch (error) {
      console.error('Erro ao alternar múltiplos cupons:', error);
      return res.status(500).json({ error: 'Erro ao alternar múltiplos cupons' });
    }
  }

  /**
   * DELETE /api/admin/coupons/bulk
   * Deletar múltiplos cupons
   */
  static async bulkDeleteCoupons(req: Request, res: Response) {
    try {
      const { couponIds } = req.body;
      const adminId = req.userId;
      const admin = await prisma.user.findUnique({ where: { id: adminId! } });

      if (!couponIds || !Array.isArray(couponIds) || couponIds.length === 0) {
        return res.status(400).json({ error: 'IDs de cupons são obrigatórios' });
      }

      // Buscar cupons com contagem de usos
      const coupons = await prisma.coupon.findMany({
        where: {
          id: {
            in: couponIds
          }
        },
        include: {
          _count: {
            select: {
              usageLogs: true
            }
          }
        }
      });

      // Separar em "deletáveis" e "desativáveis"
      const toDelete = coupons.filter(c => c._count.usageLogs === 0).map(c => c.id);
      const toDeactivate = coupons.filter(c => c._count.usageLogs > 0).map(c => c.id);

      let deletedCount = 0;
      let deactivatedCount = 0;

      // Deletar permanentemente os que não foram usados
      if (toDelete.length > 0) {
        const deleteResult = await prisma.coupon.deleteMany({
          where: {
            id: {
              in: toDelete
            }
          }
        });
        deletedCount = deleteResult.count;
      }

      // Desativar os que já foram usados
      if (toDeactivate.length > 0) {
        const deactivateResult = await prisma.coupon.updateMany({
          where: {
            id: {
              in: toDeactivate
            }
          },
          data: {
            isActive: false
          }
        });
        deactivatedCount = deactivateResult.count;
      }

      // Audit log
      await logAdminAction({
        adminId: adminId!,
        adminEmail: admin!.email,
        action: AuditAction.COUPON_DELETED,
        targetType: AuditTargetType.COUPON,
        targetId: null,
        beforeData: { couponIds, total: couponIds.length },
        afterData: { deleted: deletedCount, deactivated: deactivatedCount },
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent')
      });

      return res.json({
        message: `${deletedCount} cupons deletados, ${deactivatedCount} cupons desativados`,
        deleted: deletedCount,
        deactivated: deactivatedCount
      });

    } catch (error) {
      console.error('Erro ao deletar múltiplos cupons:', error);
      return res.status(500).json({ error: 'Erro ao deletar múltiplos cupons' });
    }
  }

  /**
   * Importa cupons a partir de arquivo CSV
   * POST /api/admin/coupons/import
   * Permissão: ADMIN_SUPER ou ADMIN_FINANCE
   *
   * Formato CSV esperado:
   * code,description,discountType,discountValue,maxUses,expiresAt,planSlug
   * PROMO10,Desconto 10%,PERCENTAGE,10,100,2025-12-31,
   * SAVE50,Economize 50 reais,FIXED,5000,50,2025-12-31,premium
   */
  static async importCoupons(req: Request, res: Response) {
    try {
      const userId = req.userId!;

      // Get admin user for email
      const admin = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true }
      });

      if (!admin) {
        return res.status(401).json({ error: 'Admin não encontrado' });
      }

      const userEmail = admin.email;

      if (!req.file) {
        return res.status(400).json({ error: 'Arquivo CSV não fornecido' });
      }

      const fileContent = req.file.buffer.toString('utf-8');
      const { parse } = await import('csv-parse/sync');

      // Parse CSV
      interface CouponCsvRow {
        code: string;
        description?: string;
        discountType: string;
        discountValue: string;
        maxUses?: string;
        expiresAt?: string;
        planSlug?: string;
      }

      const records: CouponCsvRow[] = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true, // Handle UTF-8 BOM
      });

      if (records.length === 0) {
        return res.status(400).json({ error: 'Arquivo CSV vazio' });
      }

      // VALIDAÇÃO EXTRA: Limite de linhas (máximo 1000 cupons por importação)
      if (records.length > 1000) {
        return res.status(400).json({
          error: `Arquivo muito grande. Máximo de 1000 cupons por importação. Você enviou ${records.length} linhas.`
        });
      }

      const results = {
        success: [] as string[],
        errors: [] as { line: number; code: string; error: string }[],
        total: records.length,
      };

      // Process each row
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const lineNumber = i + 2; // +2 porque linha 1 é header

        try {
          // VALIDAÇÃO EXTRA: Código
          const code = row.code?.trim().toUpperCase();
          if (!code || code.length < 3) {
            throw new Error('Código inválido (mínimo 3 caracteres)');
          }

          // VALIDAÇÃO EXTRA: Tamanho máximo do código
          if (code.length > 50) {
            throw new Error('Código muito longo (máximo 50 caracteres)');
          }

          // VALIDAÇÃO EXTRA: Apenas caracteres alfanuméricos, hífens e underscores
          if (!/^[A-Z0-9_-]+$/.test(code)) {
            throw new Error('Código deve conter apenas letras, números, hífens e underscores');
          }

          const discountType = row.discountType?.toUpperCase();
          if (!['PERCENTAGE', 'FIXED'].includes(discountType)) {
            throw new Error('discountType deve ser PERCENTAGE ou FIXED');
          }

          const discountValue = parseFloat(row.discountValue);
          if (isNaN(discountValue) || discountValue <= 0) {
            throw new Error('discountValue deve ser maior que 0');
          }

          if (discountType === 'PERCENTAGE' && discountValue > 100) {
            throw new Error('Desconto percentual não pode ser maior que 100');
          }

          // Check if coupon already exists
          const existing = await prisma.coupon.findUnique({
            where: { code },
          });

          if (existing) {
            throw new Error('Cupom já existe');
          }

          // VALIDAÇÃO EXTRA: Parse optional fields com validação
          let maxUses: number | null = null;
          if (row.maxUses?.trim()) {
            maxUses = parseInt(row.maxUses.trim());
            if (isNaN(maxUses) || maxUses < 1) {
              throw new Error('maxUses deve ser um número inteiro maior ou igual a 1');
            }
            if (maxUses > 1000000) {
              throw new Error('maxUses muito alto (máximo 1.000.000)');
            }
          }

          // VALIDAÇÃO EXTRA: Data de expiração com validação de formato
          let expiresAt: Date | null = null;
          if (row.expiresAt?.trim()) {
            expiresAt = new Date(row.expiresAt.trim());
            if (isNaN(expiresAt.getTime())) {
              throw new Error('Data de expiração inválida (use formato YYYY-MM-DD)');
            }
            if (expiresAt <= new Date()) {
              throw new Error('Data de expiração deve ser futura');
            }
            // VALIDAÇÃO EXTRA: Não permitir datas muito distantes (max 10 anos)
            const tenYearsFromNow = new Date();
            tenYearsFromNow.setFullYear(tenYearsFromNow.getFullYear() + 10);
            if (expiresAt > tenYearsFromNow) {
              throw new Error('Data de expiração muito distante (máximo 10 anos)');
            }
          }

          // VALIDAÇÃO EXTRA: Descrição (se fornecida)
          let description: string | null = null;
          if (row.description?.trim()) {
            description = row.description.trim();
            if (description.length > 500) {
              throw new Error('Descrição muito longa (máximo 500 caracteres)');
            }
          }

          // Find plan by slug if provided
          let appliesToPlanId = null;
          if (row.planSlug?.trim()) {
            const plan = await prisma.plan.findUnique({
              where: { slug: row.planSlug.trim() },
            });
            if (!plan) {
              throw new Error(`Plano "${row.planSlug}" não encontrado`);
            }
            appliesToPlanId = plan.id;
          }

          // Create coupon
          await prisma.coupon.create({
            data: {
              code,
              description,
              discountType,
              discountValue,
              maxUses,
              expiresAt,
              appliesToPlanId,
              isActive: true,
            },
          });

          // Audit log
          await logAdminAction({
            adminId: userId,
            adminEmail: userEmail,
            action: AuditAction.COUPON_CREATED,
            targetType: AuditTargetType.COUPON,
            targetId: code,
            afterData: { code, discountType, discountValue, source: 'CSV Import' },
            ipAddress: getClientIp(req),
            userAgent: req.get('user-agent'),
          });

          results.success.push(code);
        } catch (error: any) {
          results.errors.push({
            line: lineNumber,
            code: row.code || 'N/A',
            error: error.message || String(error),
          });
        }
      }

      return res.json({
        message: `Importação concluída: ${results.success.length} sucesso, ${results.errors.length} erros`,
        results,
      });
    } catch (error) {
      console.error('Erro ao importar cupons:', error);
      return res.status(500).json({ error: 'Erro ao importar cupons via CSV' });
    }
  }

  /**
   * Retorna analytics de cupons para gráficos
   * GET /api/admin/coupons/analytics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&groupBy=day|week|month
   * Permissão: Qualquer ADMIN
   * MELHORIA: Com cache de 5 minutos para melhorar performance
   */
  static async getCouponAnalytics(req: Request, res: Response) {
    try {
      const { startDate, endDate, groupBy = 'day' } = req.query;

      // Define período padrão: últimos 30 dias
      const start = startDate
        ? new Date(startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      // MELHORIA: Cache key baseado nos parâmetros
      const { cache } = await import('../utils/cache');
      const cacheKey = `coupon-analytics:${start.toISOString()}:${end.toISOString()}:${groupBy}`;

      // Tentar buscar do cache primeiro
      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        return res.json(cachedData);
      }

      // Buscar usos de cupons no período
      const usages = await prisma.couponUsage.findMany({
        where: {
          usedAt: {
            gte: start,
            lte: end,
          },
        },
        include: {
          coupon: {
            select: {
              code: true,
              discountType: true,
              discountValue: true,
            },
          },
        },
        orderBy: {
          usedAt: 'asc',
        },
      });

      // Agrupar por período
      const usageByPeriod: Record<string, number> = {};
      const usageByCoupon: Record<string, { count: number; type: string; value: number }> = {};
      const usageByType: Record<string, number> = { PERCENTAGE: 0, FIXED: 0 };

      for (const usage of usages) {
        const date = new Date(usage.usedAt);
        let periodKey: string;

        if (groupBy === 'week') {
          // Agrupar por semana (início da semana)
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          periodKey = weekStart.toISOString().split('T')[0];
        } else if (groupBy === 'month') {
          // Agrupar por mês
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        } else {
          // Agrupar por dia (padrão)
          periodKey = date.toISOString().split('T')[0];
        }

        usageByPeriod[periodKey] = (usageByPeriod[periodKey] || 0) + 1;

        // Contagem por cupom
        const couponCode = usage.coupon.code;
        if (!usageByCoupon[couponCode]) {
          usageByCoupon[couponCode] = {
            count: 0,
            type: usage.coupon.discountType,
            value: usage.coupon.discountValue,
          };
        }
        usageByCoupon[couponCode].count += 1;

        // Contagem por tipo
        usageByType[usage.coupon.discountType] += 1;
      }

      // Converter para arrays para gráficos
      const timeSeriesData = Object.entries(usageByPeriod)
        .map(([period, count]) => ({ period, count }))
        .sort((a, b) => a.period.localeCompare(b.period));

      const topCoupons = Object.entries(usageByCoupon)
        .map(([code, data]) => ({
          code,
          count: data.count,
          type: data.type,
          value: data.value,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10

      const typeDistribution = Object.entries(usageByType).map(([type, count]) => ({
        type,
        count,
      }));

      // Estatísticas gerais
      const totalCoupons = await prisma.coupon.count();
      const usedCoupons = await prisma.coupon.count({
        where: {
          usageLogs: {
            some: {},
          },
        },
      });

      const totalUsages = usages.length;

      // MELHORIA: Métricas adicionais

      // Cupons ativos vs inativos
      const activeCoupons = await prisma.coupon.count({
        where: { isActive: true },
      });
      const inactiveCoupons = totalCoupons - activeCoupons;

      // Cupons expirando nos próximos 7 dias
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      const expiringSoon = await prisma.coupon.count({
        where: {
          expiresAt: {
            gte: new Date(),
            lte: sevenDaysFromNow,
          },
        },
      });

      // Cupons próximos do limite (80% ou mais do maxUses)
      const couponsWithLimit = await prisma.coupon.findMany({
        where: {
          maxUses: { not: null },
          isActive: true,
        },
        select: {
          id: true,
          usedCount: true,
          maxUses: true,
        },
      });
      const nearLimit = couponsWithLimit.filter(c =>
        c.maxUses && c.usedCount >= (c.maxUses * 0.8)
      ).length;

      // Cupons por tipo de desconto
      const percentageCoupons = await prisma.coupon.count({
        where: { discountType: 'PERCENTAGE' },
      });
      const fixedCoupons = await prisma.coupon.count({
        where: { discountType: 'FIXED' },
      });

      const responseData = {
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
          groupBy,
        },
        stats: {
          // Estatísticas básicas
          totalCoupons,
          usedCoupons,
          unusedCoupons: totalCoupons - usedCoupons,
          totalUsages,
          conversionRate: totalCoupons > 0 ? ((usedCoupons / totalCoupons) * 100).toFixed(2) : '0',

          // MELHORIA: Estatísticas adicionais
          activeCoupons,
          inactiveCoupons,
          expiringSoon,
          nearLimit,
          percentageCoupons,
          fixedCoupons,
        },
        timeSeries: timeSeriesData,
        topCoupons,
        typeDistribution,
      };

      // MELHORIA: Salvar no cache por 5 minutos (300 segundos)
      cache.set(cacheKey, responseData, 300);

      return res.json(responseData);
    } catch (error) {
      console.error('Erro ao buscar analytics de cupons:', error);
      return res.status(500).json({ error: 'Erro ao buscar analytics de cupons' });
    }
  }
}

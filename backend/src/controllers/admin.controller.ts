import { Request, Response } from 'express';
import { prisma } from '../server';

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

        // 4. Registrar log de ação (criar tabela de logs se necessário)
        console.log(`[ADMIN LOG] User ${id} bloqueado por admin ${adminId}`);
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

      const user = await prisma.user.findUnique({
        where: { id }
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      if (!user.blocked) {
        return res.status(400).json({ error: 'Usuário não está bloqueado' });
      }

      // Desbloquear usuário
      await prisma.user.update({
        where: { id },
        data: { blocked: false }
      });

      // Registrar log
      console.log(`[ADMIN LOG] User ${id} desbloqueado por admin ${adminId}`);

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

      // Validar se subscription existe
      const subscription = await prisma.subscription.findUnique({
        where: { id }
      });

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription não encontrada' });
      }

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

      // Registrar log
      console.log(`[ADMIN LOG] Subscription ${id} atualizada por admin ${adminId}`, updateData);

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
        topPlans
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
        topPlans: topPlansWithDetails
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
}

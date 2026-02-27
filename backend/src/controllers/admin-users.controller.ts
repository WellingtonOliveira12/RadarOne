import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logAdminAction, AuditAction, AuditTargetType, getClientIp } from '../utils/auditLog';
import { logInfo, logError } from '../utils/loggerHelpers';

export class AdminUsersController {
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
      logError('Erro ao listar usuários', { err: error });
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
      logError('Erro ao buscar detalhes do usuário', { err: error });
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
      logError('Erro ao bloquear usuário', { err: error });
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
      logError('Erro ao desbloquear usuário', { err: error });
      return res.status(500).json({ error: 'Erro ao desbloquear usuário' });
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
      logError('Erro ao exportar usuários', { err: error });
      return res.status(500).json({ error: 'Erro ao exportar usuários' });
    }
  }
}

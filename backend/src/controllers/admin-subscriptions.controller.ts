import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logAdminAction, AuditAction, AuditTargetType, getClientIp } from '../utils/auditLog';
import { logInfo, logError } from '../utils/loggerHelpers';

export class AdminSubscriptionsController {
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
      logError('Erro ao listar subscriptions', { err: error });
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
      logError('Erro ao atualizar subscription', { err: error });
      return res.status(500).json({ error: 'Erro ao atualizar subscription' });
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
      logError('Erro ao exportar subscriptions', { err: error });
      return res.status(500).json({ error: 'Erro ao exportar subscriptions' });
    }
  }
}

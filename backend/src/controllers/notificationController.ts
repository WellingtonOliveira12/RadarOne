import { Request, Response } from 'express';
import { prisma } from '../server';

/**
 * Controller de Notificações - RadarOne
 * Gerencia histórico de notificações do usuário
 */

/**
 * GET /api/notifications/history
 * Retorna o histórico de notificações do usuário autenticado
 *
 * Query params:
 * - page: número da página (default: 1)
 * - limit: itens por página (default: 20, max: 100)
 */
export async function getNotificationHistory(req: Request, res: Response) {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Paginação
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    // Buscar notificações do usuário com paginação
    const [notifications, total] = await Promise.all([
      prisma.notificationLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          channel: true,
          title: true,
          message: true,
          target: true,
          status: true,
          error: true,
          createdAt: true
        }
      }),
      prisma.notificationLog.count({ where: { userId } })
    ]);

    // Metadados de paginação
    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    return res.json({
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore
      }
    });
  } catch (error) {
    console.error('[NOTIFICATION_HISTORY] Erro ao buscar histórico:', error);
    return res.status(500).json({
      error: 'Erro ao buscar histórico de notificações'
    });
  }
}

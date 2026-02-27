import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logAdminAction, AuditAction, AuditTargetType, getClientIp } from '../utils/auditLog';
import { logInfo, logError } from '../utils/loggerHelpers';
import { SiteHealthService } from '../services/siteHealthService';

export class AdminMonitorsController {
  /**
   * 9. Listar monitores (admin)
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
      logError('Erro ao listar monitores', { err: error });
      return res.status(500).json({ error: 'Erro ao listar monitores' });
    }
  }

  /**
   * Exportar monitores (CSV)
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
      logError('Erro ao exportar monitores', { err: error });
      return res.status(500).json({ error: 'Erro ao exportar monitores' });
    }
  }

  /**
   * Site Health Summary
   * GET /api/admin/site-health
   */
  static async getSiteHealth(req: Request, res: Response) {
    try {
      const summary = await SiteHealthService.getSiteHealthSummary();
      return res.json(summary);
    } catch (error) {
      logError('Erro ao buscar saude dos sites', { err: error });
      return res.status(500).json({ error: 'Erro ao buscar saude dos sites' });
    }
  }
}

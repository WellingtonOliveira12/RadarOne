import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Controller de Planos
 */
export class PlanController {
  /**
   * Lista todos os planos ativos
   * GET /api/plans
   */
  static async listPlans(req: Request, res: Response): Promise<void> {
    try {
      const plans = await prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { priority: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          priceCents: true,
          billingPeriod: true,
          trialDays: true,
          maxMonitors: true,
          maxSites: true,
          maxAlertsPerDay: true,
          checkInterval: true,
          isRecommended: true,
          priority: true,
          isActive: true,
          isLifetime: true,
          checkoutUrl: true
        }
      });

      res.json(plans);
    } catch (error) {
      console.error('Erro ao listar planos:', error);
      res.status(500).json({ error: 'Erro ao listar planos' });
    }
  }

  /**
   * Busca um plano específico por slug
   * GET /api/plans/:slug
   */
  static async getPlanBySlug(req: Request, res: Response): Promise<void> {
    try {
      const { slug } = req.params;

      const plan = await prisma.plan.findUnique({
        where: { slug },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          priceCents: true,
          billingPeriod: true,
          trialDays: true,
          maxMonitors: true,
          maxSites: true,
          maxAlertsPerDay: true,
          checkInterval: true,
          isRecommended: true,
          priority: true,
          isActive: true,
          isLifetime: true,
          checkoutUrl: true
        }
      });

      if (!plan) {
        res.status(404).json({ error: 'Plano não encontrado' });
        return;
      }

      res.json(plan);
    } catch (error) {
      console.error('Erro ao buscar plano:', error);
      res.status(500).json({ error: 'Erro ao buscar plano' });
    }
  }
}

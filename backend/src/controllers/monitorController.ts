import { Request, Response } from 'express';
import * as monitorService from '../services/monitorService';
import { MonitorSite } from '@prisma/client';
import { validateUrl } from '../utils/validators';
import { sendError, sendValidationError, ErrorCodes } from '../utils/errorResponse';

/**
 * Controller de Monitores - RadarOne
 *
 * Handlers Express para o CRUD de monitores
 */

/**
 * GET /api/monitors
 * Lista todos os monitores do usuário autenticado
 */
export async function getMonitors(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId;

    if (!userId) {
      sendError(res, 401, ErrorCodes.UNAUTHORIZED, 'Não autorizado');
      return;
    }

    const monitors = await monitorService.listMonitors(userId);

    res.json({
      success: true,
      data: monitors,
      count: monitors.length,
    });
  } catch (error: any) {
    console.error('Error in getMonitors:', error);
    sendError(res, 500, ErrorCodes.INTERNAL_SERVER_ERROR, 'Falha ao buscar monitores');
  }
}

/**
 * GET /api/monitors/:id
 * Busca um monitor específico
 */
export async function getMonitor(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }

    if (!id) {
      res.status(400).json({ error: 'ID do monitor é obrigatório' });
      return;
    }

    const monitor = await monitorService.getMonitorById(userId, id);

    if (!monitor) {
      res.status(404).json({ error: 'Monitor não encontrado ou acesso negado' });
      return;
    }

    res.json({
      success: true,
      data: monitor,
    });
  } catch (error: any) {
    console.error('Error in getMonitor:', error);
    res.status(500).json({
      error: 'Falha ao buscar monitor',
      message: error.message,
    });
  }
}

/**
 * POST /api/monitors
 * Cria um novo monitor
 *
 * Body:
 * {
 *   name: string,
 *   site: "MERCADO_LIVRE" | "OLX" | "LEILAO",
 *   searchUrl: string,
 *   priceMin?: number,
 *   priceMax?: number
 * }
 */
export async function createMonitor(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.userId;
    const { name, site, searchUrl, priceMin, priceMax } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }

    // Validação de campos obrigatórios
    if (!name || !site || !searchUrl) {
      sendError(res, 400, ErrorCodes.MISSING_REQUIRED_FIELDS, 'Nome, site e URL de busca são obrigatórios');
      return;
    }

    // Validação de URL
    const urlValidation = validateUrl(searchUrl);
    if (!urlValidation.valid) {
      sendValidationError(res, urlValidation.error!, 'searchUrl');
      return;
    }
    const validatedUrl = urlValidation.value!;

    // Validação do enum site
    if (!Object.values(MonitorSite).includes(site)) {
      sendError(res, 400, ErrorCodes.VALIDATION_ERROR, `Site inválido. Deve ser um dos seguintes: ${Object.values(MonitorSite).join(', ')}`, 'site');
      return;
    }

    // Validação de preços
    if (priceMin !== undefined && priceMin < 0) {
      res.status(400).json({
        error: 'Erro de validação',
        message: 'Preço mínimo deve ser maior ou igual a 0',
      });
      return;
    }

    if (priceMax !== undefined && priceMax < 0) {
      res.status(400).json({
        error: 'Erro de validação',
        message: 'Preço máximo deve ser maior ou igual a 0',
      });
      return;
    }

    // Cria o monitor (validações de plano são feitas no service)
    const monitor = await monitorService.createMonitor(userId, {
      name,
      site,
      searchUrl: validatedUrl,
      priceMin,
      priceMax,
    });

    res.status(201).json({
      success: true,
      message: 'Monitor criado com sucesso',
      data: monitor,
    });
  } catch (error: any) {
    console.error('Error in createMonitor:', error);

    // Erros de validação de plano retornam 403
    if (
      error.message.includes('limit') ||
      error.message.includes('plan') ||
      error.message.includes('Upgrade')
    ) {
      res.status(403).json({
        error: 'Limite do plano excedido',
        message: error.message,
      });
      return;
    }

    res.status(400).json({
      error: 'Falha ao criar monitor',
      message: error.message,
    });
  }
}

/**
 * PUT /api/monitors/:id
 * Atualiza um monitor existente
 *
 * Body (todos opcionais):
 * {
 *   name?: string,
 *   site?: "MERCADO_LIVRE" | "OLX" | "LEILAO",
 *   searchUrl?: string,
 *   priceMin?: number,
 *   priceMax?: number,
 *   active?: boolean
 * }
 */
export async function updateMonitor(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { name, site, searchUrl, priceMin, priceMax, active } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }

    if (!id) {
      res.status(400).json({ error: 'ID do monitor é obrigatório' });
      return;
    }

    // Validação do enum site se fornecido
    if (site && !Object.values(MonitorSite).includes(site)) {
      res.status(400).json({
        error: 'Erro de validação',
        message: `Site inválido. Deve ser um dos seguintes: ${Object.values(MonitorSite).join(', ')}`,
      });
      return;
    }

    // Validação de URL se fornecida
    let validatedUrl = searchUrl;
    if (searchUrl) {
      const urlValidation = validateUrl(searchUrl);
      if (!urlValidation.valid) {
        res.status(400).json({
          error: 'Erro de validação',
          message: urlValidation.error,
        });
        return;
      }
      validatedUrl = urlValidation.value!;
    }

    // Validação de preços se fornecidos
    if (priceMin !== undefined && priceMin < 0) {
      res.status(400).json({
        error: 'Erro de validação',
        message: 'Preço mínimo deve ser maior ou igual a 0',
      });
      return;
    }

    if (priceMax !== undefined && priceMax < 0) {
      res.status(400).json({
        error: 'Erro de validação',
        message: 'Preço máximo deve ser maior ou igual a 0',
      });
      return;
    }

    // Atualiza o monitor
    const monitor = await monitorService.updateMonitor(userId, id, {
      name,
      site,
      searchUrl: validatedUrl,
      priceMin,
      priceMax,
      active,
    });

    res.json({
      success: true,
      message: 'Monitor atualizado com sucesso',
      data: monitor,
    });
  } catch (error: any) {
    console.error('Error in updateMonitor:', error);

    // Erros de validação de plano
    if (
      error.message.includes('limit') ||
      error.message.includes('plan') ||
      error.message.includes('Upgrade')
    ) {
      res.status(403).json({
        error: 'Limite do plano excedido',
        message: error.message,
      });
      return;
    }

    // Monitor não encontrado
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Monitor não encontrado',
        message: error.message,
      });
      return;
    }

    res.status(400).json({
      error: 'Falha ao atualizar monitor',
      message: error.message,
    });
  }
}

/**
 * DELETE /api/monitors/:id
 * Deleta um monitor
 */
export async function deleteMonitor(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }

    if (!id) {
      res.status(400).json({ error: 'ID do monitor é obrigatório' });
      return;
    }

    await monitorService.deleteMonitor(userId, id);

    res.json({
      success: true,
      message: 'Monitor excluído com sucesso',
    });
  } catch (error: any) {
    console.error('Error in deleteMonitor:', error);

    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Monitor não encontrado',
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      error: 'Falha ao excluir monitor',
      message: error.message,
    });
  }
}

/**
 * PATCH /api/monitors/:id/toggle-active
 * Alterna o estado ativo/inativo de um monitor
 */
export async function toggleMonitorActive(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }

    if (!id) {
      res.status(400).json({ error: 'ID do monitor é obrigatório' });
      return;
    }

    const monitor = await monitorService.toggleMonitorActive(userId, id);

    res.json({
      success: true,
      message: `Monitor ${monitor.active ? 'ativado' : 'desativado'} com sucesso`,
      data: monitor,
    });
  } catch (error: any) {
    console.error('Error in toggleMonitorActive:', error);

    // Erros de validação de plano
    if (
      error.message.includes('limit') ||
      error.message.includes('plan') ||
      error.message.includes('Upgrade')
    ) {
      res.status(403).json({
        error: 'Limite do plano excedido',
        message: error.message,
      });
      return;
    }

    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Monitor não encontrado',
        message: error.message,
      });
      return;
    }

    res.status(400).json({
      error: 'Falha ao alternar estado do monitor',
      message: error.message,
    });
  }
}

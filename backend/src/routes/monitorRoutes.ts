import { Router } from 'express';
import * as monitorController from '../controllers/monitorController';
import { authenticateToken, checkTrialExpired } from '../middlewares/auth.middleware';

/**
 * Rotas de Monitores - RadarOne
 *
 * Todas as rotas são protegidas com autenticação JWT
 * E verificação de trial expirado (plano FREE de 7 dias)
 */

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticateToken);

// Verificar se trial FREE não expirou (bloqueia acesso se expirado)
router.use(checkTrialExpired);

/**
 * GET /api/monitors
 * Lista todos os monitores do usuário autenticado
 */
router.get('/', monitorController.getMonitors);

/**
 * GET /api/monitors/:id
 * Busca um monitor específico por ID
 */
router.get('/:id', monitorController.getMonitor);

/**
 * POST /api/monitors
 * Cria um novo monitor
 *
 * Body:
 * {
 *   "name": "Meu Monitor",
 *   "site": "MERCADO_LIVRE" | "OLX" | "LEILAO",
 *   "searchUrl": "https://...",
 *   "priceMin": 100 (opcional),
 *   "priceMax": 500 (opcional)
 * }
 */
router.post('/', monitorController.createMonitor);

/**
 * PUT /api/monitors/:id
 * Atualiza um monitor existente
 *
 * Body (todos campos opcionais):
 * {
 *   "name": "Novo Nome",
 *   "site": "OLX",
 *   "searchUrl": "https://...",
 *   "priceMin": 100,
 *   "priceMax": 500,
 *   "active": true
 * }
 */
router.put('/:id', monitorController.updateMonitor);

/**
 * DELETE /api/monitors/:id
 * Deleta um monitor
 */
router.delete('/:id', monitorController.deleteMonitor);

/**
 * PATCH /api/monitors/:id/toggle-active
 * Alterna o estado ativo/inativo de um monitor
 */
router.patch('/:id/toggle-active', monitorController.toggleMonitorActive);

export default router;

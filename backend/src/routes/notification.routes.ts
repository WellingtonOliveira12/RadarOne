import { Router } from 'express';
import * as notificationController from '../controllers/notificationController';
import { authenticateToken, checkTrialExpired } from '../middlewares/auth.middleware';

/**
 * Rotas de Notificações - RadarOne
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
 * GET /api/notifications/history
 * Lista o histórico de notificações do usuário autenticado
 *
 * Query params:
 * - page: número da página (default: 1)
 * - limit: itens por página (default: 20, max: 100)
 */
router.get('/history', notificationController.getNotificationHistory);

export default router;

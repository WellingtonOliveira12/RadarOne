import { Router } from 'express';
import * as notificationController from '../controllers/notificationController';
import { authenticateToken } from '../middlewares/auth.middleware';

/**
 * Rotas de Notificações - RadarOne
 *
 * Todas as rotas são protegidas com autenticação JWT
 */

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticateToken);

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

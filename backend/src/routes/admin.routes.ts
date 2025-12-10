import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { requireAdmin } from '../middlewares/admin.middleware';

const router = Router();

// Todas as rotas de admin requerem: authenticate + requireAdmin
// (authenticate já aplicado no server.ts)

// Usuários
router.get('/users', requireAdmin, AdminController.listUsers);
router.get('/users/:id', requireAdmin, AdminController.getUserDetails);
router.post('/users/:id/block', requireAdmin, AdminController.blockUser);
router.post('/users/:id/unblock', requireAdmin, AdminController.unblockUser);

// Subscriptions
router.get('/subscriptions', requireAdmin, AdminController.listSubscriptions);
router.patch('/subscriptions/:id', requireAdmin, AdminController.updateSubscription);

// Sistema
router.get('/stats', requireAdmin, AdminController.getSystemStats);
router.get('/webhooks', requireAdmin, AdminController.listWebhookLogs);
router.get('/monitors', requireAdmin, AdminController.listMonitors);

export default router;

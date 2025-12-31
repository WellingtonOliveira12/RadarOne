import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { requireAdmin, requireAdminRole } from '../middlewares/admin.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

// Todas as rotas de admin requerem: authenticate + requireAdmin/requireAdminRole
// (authenticate já aplicado no server.ts)

// Usuários
router.get('/users', requireAdmin, AdminController.listUsers);
router.get('/users/:id', requireAdmin, AdminController.getUserDetails);
router.post('/users/:id/block', requireAdminRole([UserRole.ADMIN_SUPER]), AdminController.blockUser); // Apenas ADMIN_SUPER
router.post('/users/:id/unblock', requireAdminRole([UserRole.ADMIN_SUPER]), AdminController.unblockUser); // Apenas ADMIN_SUPER

// Subscriptions
router.get('/subscriptions', requireAdmin, AdminController.listSubscriptions);
router.patch('/subscriptions/:id', requireAdminRole([UserRole.ADMIN_SUPER, UserRole.ADMIN_FINANCE]), AdminController.updateSubscription); // ADMIN_SUPER ou ADMIN_FINANCE

// Sistema
router.get('/stats', requireAdmin, AdminController.getSystemStats);
router.get('/webhooks', requireAdmin, AdminController.listWebhookLogs);
router.get('/monitors', requireAdmin, AdminController.listMonitors);

// Jobs
router.get('/jobs', requireAdmin, AdminController.listJobRuns);

// Audit Logs (FASE 3.1)
router.get('/audit-logs', requireAdmin, AdminController.listAuditLogs); // Todos os admins podem visualizar

// System Settings (FASE 3.5)
router.get('/settings', requireAdmin, AdminController.listSettings);
router.patch('/settings/:key', requireAdminRole([UserRole.ADMIN_SUPER]), AdminController.updateSetting); // Apenas ADMIN_SUPER

export default router;

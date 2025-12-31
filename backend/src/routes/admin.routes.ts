import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { requireAdmin, requireAdminRole } from '../middlewares/admin.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

// Todas as rotas de admin requerem: authenticate + requireAdmin/requireAdminRole
// (authenticate já aplicado no server.ts)

// Usuários
router.get('/users/export', requireAdmin, AdminController.exportUsers); // IMPORTANTE: Vem ANTES de /users/:id
router.get('/users', requireAdmin, AdminController.listUsers);
router.get('/users/:id', requireAdmin, AdminController.getUserDetails);
router.post('/users/:id/block', requireAdminRole([UserRole.ADMIN_SUPER]), AdminController.blockUser); // Apenas ADMIN_SUPER
router.post('/users/:id/unblock', requireAdminRole([UserRole.ADMIN_SUPER]), AdminController.unblockUser); // Apenas ADMIN_SUPER

// Subscriptions
router.get('/subscriptions/export', requireAdmin, AdminController.exportSubscriptions); // IMPORTANTE: Vem ANTES de /subscriptions/:id
router.get('/subscriptions', requireAdmin, AdminController.listSubscriptions);
router.patch('/subscriptions/:id', requireAdminRole([UserRole.ADMIN_SUPER, UserRole.ADMIN_FINANCE]), AdminController.updateSubscription); // ADMIN_SUPER ou ADMIN_FINANCE

// Sistema
router.get('/stats/temporal', requireAdmin, AdminController.getTemporalStats); // IMPORTANTE: Vem ANTES de /stats
router.get('/stats', requireAdmin, AdminController.getSystemStats);
router.get('/webhooks', requireAdmin, AdminController.listWebhookLogs);
router.get('/monitors/export', requireAdmin, AdminController.exportMonitors); // IMPORTANTE: Vem ANTES de /monitors
router.get('/monitors', requireAdmin, AdminController.listMonitors);

// Jobs
router.get('/jobs', requireAdmin, AdminController.listJobRuns);

// Audit Logs (FASE 3.1)
router.get('/audit-logs/export', requireAdmin, AdminController.exportAuditLogs); // IMPORTANTE: Vem ANTES de outros
router.get('/audit-logs', requireAdmin, AdminController.listAuditLogs); // Todos os admins podem visualizar

// System Settings (FASE 3.5)
router.get('/settings', requireAdmin, AdminController.listSettings);
router.patch('/settings/:key', requireAdminRole([UserRole.ADMIN_SUPER]), AdminController.updateSetting); // Apenas ADMIN_SUPER

// Admin Alerts (FASE 4.1 + 4.3)
router.get('/alerts/export', requireAdmin, AdminController.exportAlerts); // IMPORTANTE: Vem ANTES de outros
router.get('/alerts/unread-count', requireAdmin, AdminController.getUnreadAlertsCount);
router.get('/alerts', requireAdmin, AdminController.listAlerts);
router.patch('/alerts/:id/read', requireAdmin, AdminController.markAlertAsRead);

export default router;

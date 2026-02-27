import { Router } from 'express';
import multer from 'multer';
import { AdminUsersController } from '../controllers/admin-users.controller';
import { AdminSubscriptionsController } from '../controllers/admin-subscriptions.controller';
import { AdminMonitorsController } from '../controllers/admin-monitors.controller';
import { AdminSystemController } from '../controllers/admin-system.controller';
import { AdminCouponsController } from '../controllers/admin-coupons.controller';
import { requireAdmin, requireAdminRole } from '../middlewares/admin.middleware';
import { UserRole } from '@prisma/client';

// Multer config for CSV upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos CSV são permitidos'));
    }
  },
});

const router = Router();

// Todas as rotas de admin requerem: authenticate + requireAdmin/requireAdminRole
// (authenticate já aplicado no server.ts)

// Usuários
router.get('/users/export', requireAdmin, AdminUsersController.exportUsers); // IMPORTANTE: Vem ANTES de /users/:id
router.get('/users', requireAdmin, AdminUsersController.listUsers);
router.get('/users/:id', requireAdmin, AdminUsersController.getUserDetails);
router.post('/users/:id/block', requireAdminRole([UserRole.ADMIN_SUPER]), AdminUsersController.blockUser); // Apenas ADMIN_SUPER
router.post('/users/:id/unblock', requireAdminRole([UserRole.ADMIN_SUPER]), AdminUsersController.unblockUser); // Apenas ADMIN_SUPER

// Subscriptions
router.get('/subscriptions/export', requireAdmin, AdminSubscriptionsController.exportSubscriptions); // IMPORTANTE: Vem ANTES de /subscriptions/:id
router.get('/subscriptions', requireAdmin, AdminSubscriptionsController.listSubscriptions);
router.patch('/subscriptions/:id', requireAdminRole([UserRole.ADMIN_SUPER, UserRole.ADMIN_FINANCE]), AdminSubscriptionsController.updateSubscription); // ADMIN_SUPER ou ADMIN_FINANCE

// Sistema
router.get('/stats/temporal', requireAdmin, AdminSystemController.getTemporalStats); // IMPORTANTE: Vem ANTES de /stats
router.get('/stats', requireAdmin, AdminSystemController.getSystemStats);
router.get('/webhooks', requireAdmin, AdminSystemController.listWebhookLogs);
router.get('/monitors/export', requireAdmin, AdminMonitorsController.exportMonitors); // IMPORTANTE: Vem ANTES de /monitors
router.get('/monitors', requireAdmin, AdminMonitorsController.listMonitors);

// Jobs
router.get('/jobs', requireAdmin, AdminSystemController.listJobRuns);

// Site Health (Observabilidade)
router.get('/site-health', requireAdmin, AdminMonitorsController.getSiteHealth);

// Audit Logs (FASE 3.1)
router.get('/audit-logs/export', requireAdmin, AdminSystemController.exportAuditLogs); // IMPORTANTE: Vem ANTES de outros
router.get('/audit-logs', requireAdmin, AdminSystemController.listAuditLogs); // Todos os admins podem visualizar

// System Settings (FASE 3.5)
router.get('/settings', requireAdmin, AdminSystemController.listSettings);
router.patch('/settings/:key', requireAdminRole([UserRole.ADMIN_SUPER]), AdminSystemController.updateSetting); // Apenas ADMIN_SUPER

// Admin Alerts (FASE 4.1 + 4.3)
router.get('/alerts/export', requireAdmin, AdminSystemController.exportAlerts); // IMPORTANTE: Vem ANTES de outros
router.get('/alerts/unread-count', requireAdmin, AdminSystemController.getUnreadAlertsCount);
router.get('/alerts', requireAdmin, AdminSystemController.listAlerts);
router.patch('/alerts/:id/read', requireAdmin, AdminSystemController.markAlertAsRead);

// Coupons (FASE ADMIN CUPONS)
router.get('/coupons/export', requireAdmin, AdminCouponsController.exportCoupons); // IMPORTANTE: Vem ANTES de /coupons
router.get('/coupons/analytics', requireAdmin, AdminCouponsController.getCouponAnalytics); // Analytics para gráficos
router.get('/coupons/:code/detailed-stats', requireAdmin, AdminCouponsController.getCouponDetailedStats); // Detailed stats por cupom
router.post('/coupons/import', requireAdminRole([UserRole.ADMIN_SUPER, UserRole.ADMIN_FINANCE]), upload.single('file'), AdminCouponsController.importCoupons); // CSV Import
router.patch('/coupons/bulk/toggle', requireAdminRole([UserRole.ADMIN_SUPER, UserRole.ADMIN_FINANCE]), AdminCouponsController.bulkToggleCoupons); // Bulk toggle
router.delete('/coupons/bulk', requireAdminRole([UserRole.ADMIN_SUPER]), AdminCouponsController.bulkDeleteCoupons); // Bulk delete
router.get('/coupons', requireAdmin, AdminCouponsController.listCoupons);
router.post('/coupons', requireAdminRole([UserRole.ADMIN_SUPER, UserRole.ADMIN_FINANCE]), AdminCouponsController.createCoupon); // ADMIN_SUPER ou ADMIN_FINANCE
router.put('/coupons/:id', requireAdminRole([UserRole.ADMIN_SUPER, UserRole.ADMIN_FINANCE]), AdminCouponsController.updateCoupon); // ADMIN_SUPER ou ADMIN_FINANCE
router.patch('/coupons/:id/toggle', requireAdminRole([UserRole.ADMIN_SUPER, UserRole.ADMIN_FINANCE]), AdminCouponsController.toggleCouponStatus); // ADMIN_SUPER ou ADMIN_FINANCE
router.delete('/coupons/:id', requireAdminRole([UserRole.ADMIN_SUPER]), AdminCouponsController.deleteCoupon); // Apenas ADMIN_SUPER

export default router;

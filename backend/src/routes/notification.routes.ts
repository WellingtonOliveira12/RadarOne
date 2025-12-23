import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';

const router = Router();

// Todas as rotas de notificações requerem autenticação
// O middleware authenticate é aplicado no server.ts

router.get('/settings', NotificationController.getSettings);
router.put('/settings', NotificationController.updateSettings);
router.post('/test-email', NotificationController.testEmail);

// Telegram
router.post('/telegram/link-code', NotificationController.generateTelegramLinkCode);
router.post('/test-telegram', NotificationController.testTelegram);

export default router;

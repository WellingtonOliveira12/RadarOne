import { Router, Request, Response } from 'express';
import { TelegramController } from '../controllers/telegram.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// Health check para confirmar que router /api/telegram está montado
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    router: 'telegram',
    message: 'Telegram router is mounted correctly',
    timestamp: new Date().toISOString()
  });
});

// Webhook público (NÃO requer autenticação)
// Telegram envia POST aqui quando usuário interage com bot
router.post('/webhook', TelegramController.handleWebhook);

// Rotas autenticadas
router.post('/connect-token', authenticateToken, TelegramController.generateConnectToken);
router.get('/status', authenticateToken, TelegramController.getStatus);
router.post('/disconnect', authenticateToken, TelegramController.disconnect);

// Admin only - Webhook management
router.post('/admin/configure-webhook', authenticateToken, TelegramController.configureWebhook);
router.get('/webhook-health', authenticateToken, TelegramController.webhookHealth);

export default router;

import { Router } from 'express';
import { TelegramController } from '../controllers/telegram.controller';

const router = Router();

// Webhook público (NÃO requer autenticação)
// Telegram envia POST aqui quando usuário interage com bot
router.post('/webhook', TelegramController.handleWebhook);

export default router;

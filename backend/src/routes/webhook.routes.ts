import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';

const router = Router();

/**
 * Rotas de Webhook
 *
 * IMPORTANTE:
 * - Webhooks NÃO devem ter autenticação por JWT
 * - A validação é feita via HMAC signature no header
 * - Kiwify envia webhooks via POST com JSON
 */

/**
 * POST /api/webhooks/kiwify
 * Recebe webhooks da Kiwify
 *
 * Headers esperados:
 * - x-kiwify-signature: HMAC SHA256 do payload
 * - x-kiwify-event: Tipo do evento
 *
 * Body: KiwifyWebhookPayload
 */
router.post('/kiwify', WebhookController.handleKiwifyWebhook);

export default router;

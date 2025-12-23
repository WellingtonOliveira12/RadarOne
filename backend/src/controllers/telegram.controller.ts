import { Request, Response } from 'express';
import { processWebhookMessage, validateWebhookSecret } from '../services/telegramService';

/**
 * Controller para webhook Telegram
 */
export class TelegramController {
  /**
   * Processa webhook do Telegram
   * POST /api/telegram/webhook
   */
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Validar segredo (via query ?secret=... ou header)
      const secretFromQuery = req.query.secret as string | undefined;
      const secretFromHeader = req.get('x-telegram-secret');
      const secret = secretFromQuery || secretFromHeader;

      if (!validateWebhookSecret(secret)) {
        console.warn('[TelegramWebhook] Tentativa de acesso não autorizado');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const update = req.body;

      // Telegram envia diferentes tipos de update, vamos processar mensagens
      if (update.message) {
        const result = await processWebhookMessage(update.message);

        if (result.success) {
          res.status(200).json({ ok: true });
        } else {
          res.status(200).json({ ok: true, error: result.error });
        }
      } else {
        // Outros tipos de update (callback_query, etc) - ignorar por ora
        res.status(200).json({ ok: true });
      }
    } catch (error: any) {
      console.error('[TelegramWebhook] Erro ao processar webhook', { error: error.message });
      // Sempre retornar 200 para Telegram não reenviar
      res.status(200).json({ ok: false, error: error.message });
    }
  }
}

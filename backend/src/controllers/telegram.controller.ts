import { Request, Response } from 'express';
import {
  processWebhookMessage,
  validateWebhookSecret,
  generateConnectToken,
  getTelegramStatus,
  disconnectTelegram,
  processStartCommand
} from '../services/telegramService';

/**
 * Controller para Telegram
 */
export class TelegramController {
  /**
   * Gera token de conexão
   * POST /api/telegram/connect-token
   */
  static async generateConnectToken(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const result = await generateConnectToken(userId);

      res.json({
        connectUrl: result.connectUrl,
        token: result.token,
        expiresAt: result.expiresAt,
        botUsername: 'RadarOneAlertaBot'
      });
    } catch (error: any) {
      console.error('[TelegramController] Erro ao gerar token', { error: error.message });
      res.status(500).json({ error: 'Erro ao gerar token de conexão' });
    }
  }

  /**
   * Obtém status da conexão
   * GET /api/telegram/status
   */
  static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const status = await getTelegramStatus(userId);

      res.json(status);
    } catch (error: any) {
      console.error('[TelegramController] Erro ao buscar status', { error: error.message });
      res.status(500).json({ error: 'Erro ao buscar status da conexão' });
    }
  }

  /**
   * Desconecta conta do Telegram
   * POST /api/telegram/disconnect
   */
  static async disconnect(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const result = await disconnectTelegram(userId);

      if (result.success) {
        res.json({ success: true, message: 'Telegram desconectado com sucesso' });
      } else {
        res.status(500).json({ error: result.error || 'Erro ao desconectar' });
      }
    } catch (error: any) {
      console.error('[TelegramController] Erro ao desconectar', { error: error.message });
      res.status(500).json({ error: 'Erro ao desconectar Telegram' });
    }
  }

  /**
   * Processa webhook do Telegram
   * POST /api/telegram/webhook
   */
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Validar segredo (suporta múltiplas fontes)
      // 1. Query string: ?secret=... (atual configuração no Telegram)
      // 2. Header customizado: x-telegram-secret
      // 3. Header oficial Telegram: x-telegram-bot-api-secret-token (para futuro)
      const secretFromQuery = req.query.secret as string | undefined;
      const secretFromHeader = req.get('x-telegram-secret');
      const secretFromTelegramHeader = req.get('x-telegram-bot-api-secret-token');
      const secret = secretFromQuery || secretFromHeader || secretFromTelegramHeader;

      if (!validateWebhookSecret(secret)) {
        console.warn('[TelegramWebhook] Tentativa de acesso não autorizado', {
          ip: req.ip,
          hasQuery: !!secretFromQuery,
          hasCustomHeader: !!secretFromHeader,
          hasTelegramHeader: !!secretFromTelegramHeader,
          userAgent: req.get('user-agent')
        });
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const update = req.body;

      // Telegram envia diferentes tipos de update
      if (update.message) {
        const message = update.message;
        const chatId = message.chat?.id;
        const text = message.text?.trim();
        const telegramUserId = message.from?.id;
        const username = message.from?.username;
        const firstName = message.from?.first_name;

        // Verificar se é comando /start com parâmetro
        if (text && text.startsWith('/start ')) {
          const startParam = text.replace('/start ', '').trim();
          const result = await processStartCommand(
            chatId.toString(),
            startParam,
            telegramUserId,
            username,
            firstName
          );

          if (result.success) {
            res.status(200).json({ ok: true });
          } else {
            res.status(200).json({ ok: true, error: result.error });
          }
          return;
        }

        // Processar como mensagem normal (link code antigo)
        const result = await processWebhookMessage(message);

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

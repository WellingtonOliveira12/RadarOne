import { Request, Response } from 'express';
import {
  processWebhookMessage,
  validateWebhookSecret,
  generateConnectToken,
  getTelegramStatus,
  disconnectTelegram,
  processStartCommand,
  getWebhookInfo,
  setTelegramWebhook
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
   * Configura webhook do Telegram (ADMIN only)
   * POST /api/telegram/admin/configure-webhook
   */
  static async configureWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const user = await (await import('../server')).prisma.user.findUnique({
        where: { id: userId }
      });

      // Apenas admins podem acessar
      if (!user || user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
        return;
      }

      const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

      if (!TELEGRAM_WEBHOOK_SECRET) {
        res.status(500).json({
          error: 'TELEGRAM_WEBHOOK_SECRET não configurado',
          message: 'Configure a variável de ambiente TELEGRAM_WEBHOOK_SECRET antes de configurar o webhook'
        });
        return;
      }

      // Calcular webhook URL esperado
      const BASE_URL = process.env.BACKEND_BASE_URL || process.env.PUBLIC_URL || process.env.BACKEND_URL || 'https://api.radarone.com.br';
      const webhookUrl = `${BASE_URL}/api/telegram/webhook?secret=${TELEGRAM_WEBHOOK_SECRET}`;

      console.log('[TelegramController.configureWebhook] Configurando webhook', {
        userId,
        webhookUrl: webhookUrl.replace(TELEGRAM_WEBHOOK_SECRET, '<SECRET>'),
        action: 'configure_webhook_start'
      });

      // Configurar webhook
      const setResult = await setTelegramWebhook(webhookUrl);

      if (!setResult.success) {
        console.error('[TelegramController.configureWebhook] Erro ao configurar webhook', {
          error: setResult.error,
          action: 'configure_webhook_failed'
        });

        res.status(500).json({
          error: 'Erro ao configurar webhook',
          message: setResult.error,
          webhookUrl: webhookUrl.replace(TELEGRAM_WEBHOOK_SECRET, '<SECRET>')
        });
        return;
      }

      // Validar configuração
      const webhookInfo = await getWebhookInfo();

      const success = webhookInfo.success && webhookInfo.url === webhookUrl;

      console.log('[TelegramController.configureWebhook] Webhook configurado', {
        userId,
        success,
        currentUrl: webhookInfo.url?.replace(TELEGRAM_WEBHOOK_SECRET, '<SECRET>'),
        expectedUrl: webhookUrl.replace(TELEGRAM_WEBHOOK_SECRET, '<SECRET>'),
        action: 'configure_webhook_complete'
      });

      res.json({
        success,
        message: success
          ? 'Webhook configurado com sucesso'
          : 'Webhook configurado mas validação falhou',
        webhookUrl: webhookUrl.replace(TELEGRAM_WEBHOOK_SECRET, '<SECRET>'),
        validation: {
          currentUrl: webhookInfo.url || null,
          matches: success,
          pendingUpdateCount: webhookInfo.pendingUpdateCount,
          lastErrorMessage: webhookInfo.lastErrorMessage || null
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[TelegramController.configureWebhook] Erro', { error: error.message });
      res.status(500).json({ error: 'Erro ao configurar webhook' });
    }
  }

  /**
   * Endpoint de debug/health do webhook (protegido por autenticação)
   * GET /api/telegram/webhook-health
   */
  static async webhookHealth(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const user = await (await import('../server')).prisma.user.findUnique({
        where: { id: userId }
      });

      // Apenas admins podem acessar
      if (!user || user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
        return;
      }

      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
      const TELEGRAM_BOT_USERNAME = (await import('../constants/telegram')).TELEGRAM_BOT_USERNAME;

      // Calcular webhook esperado (usando BASE_URL com fallbacks)
      const BASE_URL = process.env.BACKEND_BASE_URL || process.env.PUBLIC_URL || process.env.BACKEND_URL || 'https://api.radarone.com.br';
      const expectedWebhookUrl = TELEGRAM_WEBHOOK_SECRET
        ? `${BASE_URL}/api/telegram/webhook?secret=${TELEGRAM_WEBHOOK_SECRET}`
        : `${BASE_URL}/api/telegram/webhook?secret=<NOT_CONFIGURED>`;

      // Obter informações reais do webhook configurado no Telegram
      const webhookInfo = await getWebhookInfo();

      // Comparar webhook esperado vs atual
      const webhookMatches = webhookInfo.success && webhookInfo.url === expectedWebhookUrl;

      res.json({
        // Configuração local
        local: {
          webhookPath: '/api/telegram/webhook',
          expectedWebhookUrl,
          botUsername: TELEGRAM_BOT_USERNAME,
          botTokenConfigured: !!TELEGRAM_BOT_TOKEN,
          botTokenPrefix: TELEGRAM_BOT_TOKEN ? TELEGRAM_BOT_TOKEN.substring(0, 10) + '...' : null,
          webhookSecretConfigured: !!TELEGRAM_WEBHOOK_SECRET,
          webhookSecretLength: TELEGRAM_WEBHOOK_SECRET?.length || 0,
          baseUrl: BASE_URL,
          nodeEnv: process.env.NODE_ENV
        },
        // Webhook real no Telegram
        telegram: {
          success: webhookInfo.success,
          currentWebhookUrl: webhookInfo.url || null,
          hasCustomCertificate: webhookInfo.hasCustomCertificate,
          pendingUpdateCount: webhookInfo.pendingUpdateCount,
          lastErrorDate: webhookInfo.lastErrorDate
            ? new Date(webhookInfo.lastErrorDate * 1000).toISOString()
            : null,
          lastErrorMessage: webhookInfo.lastErrorMessage || null,
          maxConnections: webhookInfo.maxConnections,
          ipAddress: webhookInfo.ipAddress,
          error: webhookInfo.error || null
        },
        // Diagnóstico
        diagnostics: {
          webhookMatches,
          status: webhookMatches
            ? 'OK - Webhook configurado corretamente'
            : webhookInfo.url
              ? 'WARNING - Webhook configurado mas URL diferente da esperada'
              : 'ERROR - Webhook não configurado no Telegram',
          action: webhookMatches
            ? null
            : 'Use POST /api/telegram/admin/configure-webhook para configurar o webhook correto'
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[TelegramController.webhookHealth] Erro', { error: error.message });
      res.status(500).json({ error: 'Erro ao verificar health do webhook' });
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

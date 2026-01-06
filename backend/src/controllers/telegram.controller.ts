import { Request, Response } from 'express';
import {
  processWebhookMessage,
  validateWebhookSecret,
  generateConnectToken,
  getTelegramStatus,
  disconnectTelegram,
  processStartCommand,
  getWebhookInfo,
  setTelegramWebhook,
  getBotInfo,
  diagnoseTelegram,
  getExpectedWebhookUrl
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
   * Diagnóstico completo do sistema Telegram (ADMIN only)
   * GET /api/telegram/admin/diagnose?userId=<optional>
   */
  static async diagnose(req: Request, res: Response): Promise<void> {
    try {
      const currentUserId = req.userId;
      if (!currentUserId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const user = await (await import('../server')).prisma.user.findUnique({
        where: { id: currentUserId }
      });

      if (!user || user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
        return;
      }

      const targetUserId = req.query.userId as string | undefined;

      console.log('[TelegramController.diagnose] Executando diagnóstico', {
        action: 'diagnose_request',
        adminUserId: currentUserId,
        targetUserId: targetUserId || 'none',
        timestamp: new Date().toISOString()
      });

      const result = await diagnoseTelegram(targetUserId);

      res.json(result);
    } catch (error: any) {
      console.error('[TelegramController.diagnose] Erro', { error: error.message });
      res.status(500).json({ error: 'Erro ao executar diagnóstico' });
    }
  }

  /**
   * Reconfigura webhook do Telegram com validação completa (ADMIN only)
   * POST /api/telegram/admin/reconfigure-webhook
   */
  static async reconfigureWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const user = await (await import('../server')).prisma.user.findUnique({
        where: { id: userId }
      });

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

      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      if (!TELEGRAM_BOT_TOKEN) {
        res.status(500).json({
          error: 'TELEGRAM_BOT_TOKEN não configurado',
          message: 'Configure a variável de ambiente TELEGRAM_BOT_TOKEN'
        });
        return;
      }

      console.log('[TelegramController.reconfigureWebhook] Iniciando reconfiguração', {
        action: 'reconfigure_webhook_start',
        userId,
        timestamp: new Date().toISOString()
      });

      // PASSO 1: Validar token do bot (getMe)
      const botInfo = await getBotInfo();
      if (!botInfo.success) {
        console.error('[TelegramController.reconfigureWebhook] Token inválido', {
          action: 'reconfigure_webhook_failed',
          reason: 'invalid_bot_token',
          error: botInfo.error,
          errorCode: botInfo.errorCode
        });

        res.status(500).json({
          error: 'TELEGRAM_BOT_TOKEN inválido',
          detail: botInfo.error,
          message: 'Verifique se o token do bot está correto no ambiente'
        });
        return;
      }

      console.log('[TelegramController.reconfigureWebhook] Bot validado', {
        action: 'bot_validated',
        botUsername: botInfo.username,
        botId: botInfo.id
      });

      // PASSO 2: Obter webhook atual (ANTES)
      const webhookBefore = await getWebhookInfo();

      // PASSO 3: Calcular webhook URL esperado
      const webhookUrl = getExpectedWebhookUrl();

      console.log('[TelegramController.reconfigureWebhook] Configurando webhook', {
        action: 'set_webhook',
        webhookUrlMasked: webhookUrl.replace(TELEGRAM_WEBHOOK_SECRET, '<SECRET>'),
        webhookBefore: webhookBefore.url || 'none'
      });

      // PASSO 4: Configurar webhook
      const setResult = await setTelegramWebhook(webhookUrl);

      if (!setResult.success) {
        console.error('[TelegramController.reconfigureWebhook] Erro ao configurar webhook', {
          action: 'reconfigure_webhook_failed',
          error: setResult.error
        });

        res.status(500).json({
          error: 'Erro ao configurar webhook',
          message: setResult.error,
          webhookUrl: webhookUrl.replace(TELEGRAM_WEBHOOK_SECRET, '<SECRET>')
        });
        return;
      }

      // PASSO 5: Validar configuração (DEPOIS)
      const webhookAfter = await getWebhookInfo();
      const success = webhookAfter.success && webhookAfter.url === webhookUrl;

      console.log('[TelegramController.reconfigureWebhook] Webhook reconfigurado', {
        action: 'reconfigure_webhook_complete',
        success,
        webhookBefore: webhookBefore.url || 'none',
        webhookAfter: webhookAfter.url || 'none',
        matches: success,
        pendingUpdates: webhookAfter.pendingUpdateCount || 0,
        timestamp: new Date().toISOString()
      });

      res.json({
        success,
        message: success
          ? 'Webhook reconfigurado com sucesso'
          : 'Webhook reconfigurado mas validação falhou',
        bot: {
          username: botInfo.username,
          id: botInfo.id,
          isBot: botInfo.isBot
        },
        before: {
          url: webhookBefore.url || null,
          pendingUpdateCount: webhookBefore.pendingUpdateCount || 0,
          lastErrorMessage: webhookBefore.lastErrorMessage || null
        },
        after: {
          url: webhookAfter.url || null,
          matches: success,
          pendingUpdateCount: webhookAfter.pendingUpdateCount || 0,
          lastErrorMessage: webhookAfter.lastErrorMessage || null
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[TelegramController.reconfigureWebhook] Erro', { error: error.message });
      res.status(500).json({ error: 'Erro ao reconfigurar webhook' });
    }
  }

  /**
   * Ping interno do webhook (simula request) (ADMIN only)
   * GET /api/telegram/admin/ping-webhook
   */
  static async pingWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const user = await (await import('../server')).prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user || user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
        return;
      }

      const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

      console.log('[TelegramController.pingWebhook] Testando webhook internamente', {
        action: 'ping_webhook',
        userId,
        timestamp: new Date().toISOString()
      });

      // TESTE 1: Validação de secret
      const secretTests = {
        validQuery: validateWebhookSecret(TELEGRAM_WEBHOOK_SECRET),
        invalidQuery: validateWebhookSecret('wrong-secret'),
        undefinedQuery: validateWebhookSecret(undefined),
        emptyQuery: validateWebhookSecret('')
      };

      // TESTE 2: Parsing de mensagem fake
      const fakeChatId = '123456789';
      const fakeMessage = {
        message_id: 1,
        from: {
          id: 123456789,
          is_bot: false,
          first_name: 'Test',
          username: 'testuser'
        },
        chat: {
          id: parseInt(fakeChatId),
          first_name: 'Test',
          username: 'testuser',
          type: 'private'
        },
        date: Math.floor(Date.now() / 1000),
        text: 'RADAR-TEST12'
      };

      res.json({
        success: true,
        message: 'Ping interno do webhook executado',
        tests: {
          secretValidation: {
            validSecret: secretTests.validQuery,
            invalidSecret: secretTests.invalidQuery,
            undefinedSecret: secretTests.undefinedQuery,
            emptySecret: secretTests.emptyQuery,
            result: secretTests.validQuery ? 'OK' : 'FAIL'
          },
          messageParsing: {
            fakeMessage,
            regexMatch: /RADAR-([A-Z0-9]{6})/i.test(fakeMessage.text),
            extractedCode: fakeMessage.text.match(/RADAR-([A-Z0-9]{6})/i)?.[0] || null
          },
          routing: {
            webhookPath: '/api/telegram/webhook',
            expectedParams: 'secret=<TELEGRAM_WEBHOOK_SECRET>',
            secretConfigured: !!TELEGRAM_WEBHOOK_SECRET,
            secretLength: TELEGRAM_WEBHOOK_SECRET?.length || 0
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[TelegramController.pingWebhook] Erro', { error: error.message });
      res.status(500).json({ error: 'Erro ao executar ping do webhook' });
    }
  }

  /**
   * Processa webhook do Telegram
   * POST /api/telegram/webhook
   */
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      // LOG CRÍTICO: Webhook recebido
      console.log('[TelegramWebhook] Request recebido', {
        action: 'webhook_request_received',
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        hasBody: !!req.body,
        bodyType: req.body?.message ? 'message' : req.body?.callback_query ? 'callback' : 'other',
        timestamp: new Date().toISOString()
      });

      // Validar segredo (suporta múltiplas fontes)
      // 1. Query string: ?secret=... (atual configuração no Telegram)
      // 2. Header customizado: x-telegram-secret
      // 3. Header oficial Telegram: x-telegram-bot-api-secret-token (para futuro)
      const secretFromQuery = req.query.secret as string | undefined;
      const secretFromHeader = req.get('x-telegram-secret');
      const secretFromTelegramHeader = req.get('x-telegram-bot-api-secret-token');
      const secret = secretFromQuery || secretFromHeader || secretFromTelegramHeader;

      console.log('[TelegramWebhook] Validando secret', {
        action: 'webhook_secret_validation',
        hasQuery: !!secretFromQuery,
        hasCustomHeader: !!secretFromHeader,
        hasTelegramHeader: !!secretFromTelegramHeader,
        secretSource: secretFromQuery ? 'query' : secretFromHeader ? 'custom-header' : secretFromTelegramHeader ? 'telegram-header' : 'none',
        secretLength: secret?.length || 0
      });

      if (!validateWebhookSecret(secret)) {
        console.warn('[TelegramWebhook] Tentativa de acesso não autorizado', {
          action: 'webhook_unauthorized',
          reason: 'invalid_secret',
          ip: req.ip,
          hasQuery: !!secretFromQuery,
          hasCustomHeader: !!secretFromHeader,
          hasTelegramHeader: !!secretFromTelegramHeader,
          userAgent: req.get('user-agent'),
          timestamp: new Date().toISOString()
        });
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      console.log('[TelegramWebhook] Secret validado com sucesso', {
        action: 'webhook_secret_ok',
        secretSource: secretFromQuery ? 'query' : secretFromHeader ? 'custom-header' : 'telegram-header'
      });

      const update = req.body;

      // Telegram envia diferentes tipos de update
      if (update.message) {
        const message = update.message;
        const chatId = message.chat?.id;
        const text = message.text?.trim();
        const telegramUserId = message.from?.id;
        const username = message.from?.username;
        const firstName = message.from?.first_name;

        console.log('[TelegramWebhook] Mensagem recebida', {
          action: 'webhook_message_received',
          chatId,
          telegramUserId,
          username,
          textLength: text?.length || 0,
          textPreview: text?.substring(0, 50) || '',
          isStartCommand: text?.startsWith('/start ') || false,
          isRadarCode: text ? /RADAR-[A-Z0-9]{6}/i.test(text) : false,
          timestamp: new Date().toISOString()
        });

        // Verificar se é comando /start com parâmetro
        if (text && text.startsWith('/start ')) {
          const startParam = text.replace('/start ', '').trim();

          console.log('[TelegramWebhook] Detectado comando /start', {
            action: 'webhook_start_command',
            chatId,
            startParam: startParam.substring(0, 20) + '...',
            timestamp: new Date().toISOString()
          });

          const result = await processStartCommand(
            chatId.toString(),
            startParam,
            telegramUserId,
            username,
            firstName
          );

          if (result.success) {
            console.log('[TelegramWebhook] /start processado com sucesso', {
              action: 'webhook_start_success',
              chatId,
              timestamp: new Date().toISOString()
            });
            res.status(200).json({ ok: true });
          } else {
            console.error('[TelegramWebhook] /start falhou', {
              action: 'webhook_start_failed',
              chatId,
              error: result.error,
              timestamp: new Date().toISOString()
            });
            res.status(200).json({ ok: true, error: result.error });
          }
          return;
        }

        // Processar como mensagem normal (link code antigo)
        console.log('[TelegramWebhook] Processando mensagem normal (código RADAR)', {
          action: 'webhook_process_message',
          chatId,
          hasRadarPattern: text ? /RADAR-[A-Z0-9]{6}/i.test(text) : false,
          timestamp: new Date().toISOString()
        });

        const result = await processWebhookMessage(message);

        if (result.success) {
          console.log('[TelegramWebhook] Mensagem processada com sucesso', {
            action: 'webhook_message_success',
            chatId,
            timestamp: new Date().toISOString()
          });
          res.status(200).json({ ok: true });
        } else {
          console.error('[TelegramWebhook] Mensagem falhou', {
            action: 'webhook_message_failed',
            chatId,
            error: result.error,
            timestamp: new Date().toISOString()
          });
          res.status(200).json({ ok: true, error: result.error });
        }
      } else {
        // Outros tipos de update (callback_query, etc) - ignorar por ora
        console.log('[TelegramWebhook] Update ignorado (não é mensagem)', {
          action: 'webhook_update_ignored',
          updateType: update.callback_query ? 'callback_query' : 'other',
          timestamp: new Date().toISOString()
        });
        res.status(200).json({ ok: true });
      }
    } catch (error: any) {
      console.error('[TelegramWebhook] Erro ao processar webhook', {
        action: 'webhook_error',
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      // Sempre retornar 200 para Telegram não reenviar
      res.status(200).json({ ok: false, error: error.message });
    }
  }
}

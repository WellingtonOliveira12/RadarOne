import axios from 'axios';
import { prisma } from '../lib/prisma';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_API_BASE, TELEGRAM_WEBHOOK_SECRET } from './telegram-client';
import { TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_LINK } from '../constants/telegram';
import { logInfo, logError, logWarning } from '../utils/loggerHelpers';
import { processStartCommand, getChatIdForUser, getUserTelegramAccount, generateLinkCode } from './telegram-connection.service';
import { sendTelegramMessage } from './telegram-client';

/**
 * Obtém informações do bot do Telegram
 */
export async function getBotInfo(): Promise<{
  success: boolean;
  id?: number;
  isBot?: boolean;
  firstName?: string;
  username?: string;
  canJoinGroups?: boolean;
  canReadAllGroupMessages?: boolean;
  supportsInlineQueries?: boolean;
  error?: string;
  errorCode?: number;
}> {
  if (!TELEGRAM_BOT_TOKEN) {
    return {
      success: false,
      error: 'TELEGRAM_BOT_TOKEN não configurado'
    };
  }

  try {
    const response = await axios.get(`${TELEGRAM_API_BASE}/getMe`, {
      timeout: 10000
    });

    if (!response.data.ok) {
      return {
        success: false,
        error: response.data.description || 'Erro desconhecido ao buscar bot info',
        errorCode: response.data.error_code
      };
    }

    const result = response.data.result;

    logInfo('[TelegramService.getBotInfo] Bot info obtido', {
      action: 'get_bot_info_success',
      botId: result.id,
      username: result.username,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      id: result.id,
      isBot: result.is_bot,
      firstName: result.first_name,
      username: result.username,
      canJoinGroups: result.can_join_groups,
      canReadAllGroupMessages: result.can_read_all_group_messages,
      supportsInlineQueries: result.supports_inline_queries
    };
  } catch (error: any) {
    const statusCode = error.response?.status;
    const description = error.response?.data?.description;

    logError('[TelegramService.getBotInfo] Erro ao obter bot info', {
      action: 'get_bot_info_failed',
      error: error.message,
      statusCode,
      description,
      timestamp: new Date().toISOString()
    });

    return {
      success: false,
      error: description || error.message,
      errorCode: statusCode
    };
  }
}

/**
 * Obtém informações do webhook configurado no Telegram
 */
export async function getWebhookInfo(): Promise<{
  success: boolean;
  url?: string;
  hasCustomCertificate?: boolean;
  pendingUpdateCount?: number;
  lastErrorDate?: number;
  lastErrorMessage?: string;
  maxConnections?: number;
  ipAddress?: string;
  error?: string;
}> {
  if (!TELEGRAM_BOT_TOKEN) {
    return {
      success: false,
      error: 'TELEGRAM_BOT_TOKEN não configurado'
    };
  }

  try {
    const response = await axios.get(`${TELEGRAM_API_BASE}/getWebhookInfo`);

    if (!response.data.ok) {
      return {
        success: false,
        error: response.data.description || 'Erro desconhecido ao buscar webhook info'
      };
    }

    const result = response.data.result;

    logInfo('[TelegramService] Webhook info obtido', {
      url: result.url,
      pendingUpdates: result.pending_update_count,
      lastError: result.last_error_message
    });

    return {
      success: true,
      url: result.url || '',
      hasCustomCertificate: result.has_custom_certificate || false,
      pendingUpdateCount: result.pending_update_count || 0,
      lastErrorDate: result.last_error_date || undefined,
      lastErrorMessage: result.last_error_message || undefined,
      maxConnections: result.max_connections || undefined,
      ipAddress: result.ip_address || undefined
    };
  } catch (error: any) {
    logError('[TelegramService] Erro ao obter webhook info', { error: error.message });

    return {
      success: false,
      error: error.response?.data?.description || error.message
    };
  }
}

/**
 * Configura webhook do Telegram
 */
export async function setTelegramWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    return {
      success: false,
      error: 'TELEGRAM_BOT_TOKEN não configurado'
    };
  }

  try {
    const response = await axios.post(`${TELEGRAM_API_BASE}/setWebhook`, {
      url: webhookUrl
    });

    logInfo('[TelegramService] Webhook configurado', { webhookUrl, result: response.data });

    return {
      success: response.data.ok,
      error: response.data.description
    };
  } catch (error: any) {
    logError('[TelegramService] Erro ao configurar webhook', { webhookUrl, error: error.message });

    return {
      success: false,
      error: error.response?.data?.description || error.message
    };
  }
}

/**
 * Configura webhook do Telegram automaticamente (boot time)
 * REGRA: Verifica se já está configurado antes de reconfigurar (idempotente)
 */
export async function setupTelegramWebhook(): Promise<{ success: boolean; configured: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    logWarning('TelegramService: TELEGRAM_BOT_TOKEN not configured, skipping webhook setup', {});
    return {
      success: false,
      configured: false,
      error: 'TELEGRAM_BOT_TOKEN não configurado'
    };
  }

  if (!TELEGRAM_WEBHOOK_SECRET) {
    logWarning('TelegramService: TELEGRAM_WEBHOOK_SECRET not configured, skipping webhook setup', {});
    return {
      success: false,
      configured: false,
      error: 'TELEGRAM_WEBHOOK_SECRET não configurado'
    };
  }

  try {
    // Calcular webhook URL esperado
    const BASE_URL = process.env.BACKEND_BASE_URL || process.env.PUBLIC_URL || process.env.BACKEND_URL || 'https://api.radarone.com.br';
    const expectedWebhookUrl = `${BASE_URL}/api/telegram/webhook?secret=${TELEGRAM_WEBHOOK_SECRET}`;

    logInfo('[TelegramService.setupWebhook] Verificando configuração de webhook...', {
      action: 'setup_webhook_start',
      expectedUrl: expectedWebhookUrl.replace(TELEGRAM_WEBHOOK_SECRET, '<SECRET>')
    });

    // Verificar se já está configurado
    const info = await getWebhookInfo();

    if (!info.success) {
      logError('[TelegramService.setupWebhook] Erro ao obter webhook info', {
        action: 'setup_webhook_failed',
        error: info.error
      });
      return {
        success: false,
        configured: false,
        error: info.error
      };
    }

    // Se já está configurado corretamente, não fazer nada
    if (info.url === expectedWebhookUrl) {
      logInfo('[TelegramService.setupWebhook] Webhook já configurado corretamente', {
        action: 'setup_webhook_skip',
        url: info.url.replace(TELEGRAM_WEBHOOK_SECRET, '<SECRET>'),
        pendingUpdates: info.pendingUpdateCount
      });
      return {
        success: true,
        configured: false // Não foi configurado agora, já estava configurado
      };
    }

    // Configurar webhook
    logInfo('[TelegramService.setupWebhook] Configurando webhook...', {
      action: 'setup_webhook_configure',
      currentUrl: info.url || 'none',
      newUrl: expectedWebhookUrl.replace(TELEGRAM_WEBHOOK_SECRET, '<SECRET>')
    });

    const result = await setTelegramWebhook(expectedWebhookUrl);

    if (!result.success) {
      logError('[TelegramService.setupWebhook] Erro ao configurar webhook', {
        action: 'setup_webhook_failed',
        error: result.error
      });
      return {
        success: false,
        configured: false,
        error: result.error
      };
    }

    // Validar configuração
    const verifyInfo = await getWebhookInfo();
    const isValid = verifyInfo.success && verifyInfo.url === expectedWebhookUrl;

    if (isValid) {
      logInfo('[TelegramService.setupWebhook] Webhook configurado com sucesso', {
        action: 'setup_webhook_success',
        url: expectedWebhookUrl.replace(TELEGRAM_WEBHOOK_SECRET, '<SECRET>')
      });
    } else {
      logWarning('[TelegramService.setupWebhook] Webhook configurado mas validação falhou', {
        action: 'setup_webhook_validation_failed',
        expectedUrl: expectedWebhookUrl.replace(TELEGRAM_WEBHOOK_SECRET, '<SECRET>'),
        actualUrl: verifyInfo.url || 'none'
      });
    }

    return {
      success: isValid,
      configured: true
    };
  } catch (error: any) {
    logError('[TelegramService.setupWebhook] Erro inesperado', {
      action: 'setup_webhook_error',
      error: error.message
    });
    return {
      success: false,
      configured: false,
      error: error.message
    };
  }
}

/**
 * Processa mensagem recebida via webhook do Telegram (sistema legado)
 */
export async function processWebhookMessage(message: any): Promise<{ success: boolean; error?: string }> {
  try {
    const chatId = message.chat?.id?.toString();
    const text = message.text?.trim();
    const username = message.from?.username;
    const telegramUserId = message.from?.id;

    // ✅ LOG CRÍTICO: Webhook recebido
    logInfo('[TELEGRAM] Webhook recebido (sistema legado)', {
      chatId,
      telegramUserId,
      username,
      textLength: text?.length || 0,
      textPreview: text?.substring(0, 20) || '',
      textRaw: JSON.stringify(text), // mostra \n, espaços, etc
      hasRadarCode: text ? /RADAR-[A-Z0-9]{6}/i.test(text) : false,
      timestamp: new Date().toISOString(),
      action: 'webhook_received'
    });

    if (!chatId || !text) {
      logWarning('[TELEGRAM] Mensagem inválida recebida no webhook', {
        action: 'link_rejected',
        reason: 'missing_chatid_or_text',
        chatId,
        hasText: !!text
      });
      return { success: false, error: 'Mensagem inválida' };
    }

    // Normalizar texto: remover espaços extras, newlines, tabs
    const normalizedText = text.replace(/\s+/g, ' ').trim();

    // Verificar se a mensagem contém um código RADAR- (case-insensitive, permite espaços)
    // Aceita: "RADAR-ABC123", "radar-abc123", " RADAR-ABC123 ", "RADAR-ABC123\n", etc
    const codeMatch = normalizedText.match(/RADAR-([A-Z0-9]{6})/i);

    logInfo('[TELEGRAM] Parsing do código', {
      action: 'code_parsing',
      chatId,
      originalText: text,
      normalizedText,
      codeMatch: !!codeMatch,
      extractedCode: codeMatch?.[0] || null,
      timestamp: new Date().toISOString()
    });

    if (!codeMatch) {
      logWarning('[TELEGRAM] Código não detectado na mensagem', {
        action: 'link_rejected',
        reason: 'code_not_detected',
        chatId,
        text: normalizedText,
        timestamp: new Date().toISOString()
      });

      // Mensagem não é um código de vínculo, enviar ajuda
      await sendTelegramMessage({
        chatId,
        text: '❌ Código inválido.\n\nPara vincular sua conta, use o código gerado no painel RadarOne.\nFormato: RADAR-XXXXXX'
      });
      return { success: true };
    }

    const fullCode = codeMatch[0].toUpperCase();

    logInfo('[TELEGRAM] Código extraído', {
      action: 'code_extracted',
      chatId,
      code: fullCode,
      timestamp: new Date().toISOString()
    });

    // Buscar settings com esse código (não expirado)
    const now = new Date();
    const settings = await prisma.notificationSettings.findFirst({
      where: {
        telegramLinkCode: fullCode,
        telegramLinkExpiresAt: {
          gte: now
        }
      },
      include: {
        user: true
      }
    });

    if (!settings) {
      logWarning('[TELEGRAM] Código não encontrado ou expirado (sistema legado)', { chatId, code: fullCode, action: 'link_rejected' });
      await sendTelegramMessage({
        chatId,
        text: '❌ Código inválido ou expirado.\n\nGere um novo código no painel RadarOne.'
      });
      return { success: false, error: 'Código não encontrado ou expirado' };
    }

    // VALIDAÇÃO: Verificar se chatId já está vinculado a OUTRO usuário
    const existingChatLink = await prisma.telegramAccount.findUnique({
      where: { chatId }
    });

    if (existingChatLink && existingChatLink.userId !== settings.userId) {
      // CONFLITO: Este Telegram já está vinculado a outra conta
      logError('[TELEGRAM] Conflito: chatId já vinculado a outro usuário (sistema legado)', {
        action: 'link_conflict',
        reason: 'chat_already_linked_to_different_user',
        chatId,
        currentUserId: existingChatLink.userId,
        attemptedUserId: settings.userId,
        timestamp: new Date().toISOString()
      });

      await sendTelegramMessage({
        chatId,
        text: '❌ Este Telegram já está vinculado a outra conta RadarOne.\n\nSe você possui múltiplas contas, desvincule este Telegram da outra conta primeiro.'
      });

      return { success: false, error: 'Telegram já vinculado a outra conta' };
    }

    // VINCULAÇÃO
    // PASSO 1: Remover vínculos antigos do usuário (se existirem)
    await prisma.telegramAccount.deleteMany({
      where: { userId: settings.userId }
    });

    // PASSO 2: Criar TelegramAccount (para consistência com sistema novo)
    await prisma.telegramAccount.create({
      data: {
        userId: settings.userId,
        chatId,
        username: username ? `@${username}` : null,
        active: true
      }
    });

    // PASSO 3: Atualizar NotificationSettings
    await prisma.notificationSettings.update({
      where: { id: settings.id },
      data: {
        telegramChatId: chatId,
        telegramEnabled: true,
        telegramUsername: username ? `@${username}` : settings.telegramUsername,
        telegramLinkCode: null,
        telegramLinkExpiresAt: null
      }
    });

    // PASSO 4: Enviar confirmação
    const sendResult = await sendTelegramMessage({
      chatId,
      text: `✅ Conta vinculada com sucesso!\n\nOlá, ${settings.user.name}!\n\nVocê receberá notificações de novos anúncios aqui no Telegram.`
    });

    // ✅ VALIDAR se mensagem foi enviada
    if (!sendResult.success) {
      logError('[TELEGRAM] CRÍTICO: Vínculo criado no DB mas mensagem de confirmação FALHOU', {
        action: 'link_success_but_confirmation_failed',
        severity: 'CRITICAL',
        userId: settings.userId,
        chatId,
        username: username ? `@${username}` : null,
        sendError: sendResult.error,
        timestamp: new Date().toISOString()
      });
      // ⚠️ Mesmo assim retornar sucesso pois o vínculo foi criado no DB
      // Mas logar CRÍTICO para investigação
    } else {
      logInfo('[TELEGRAM] Mensagem de confirmação enviada com sucesso', {
        userId: settings.userId,
        chatId,
        messageId: sendResult.messageId,
        action: 'confirmation_sent'
      });
    }

    logInfo('[TELEGRAM] Conta vinculada via código legado', {
      action: 'link_success_legacy',
      userId: settings.userId,
      chatId,
      username: username ? `@${username}` : null,
      confirmationSent: sendResult.success,
      timestamp: new Date().toISOString()
    });

    return { success: true };
  } catch (error: any) {
    logError('[TELEGRAM] Erro ao processar webhook (sistema legado)', {
      error: error.message,
      stack: error.stack,
      action: 'link_error'
    });

    // Enviar mensagem genérica ao usuário
    try {
      if (message.chat?.id) {
        await sendTelegramMessage({
          chatId: message.chat.id.toString(),
          text: '❌ Erro ao vincular sua conta.\n\nPor favor, tente novamente. Se o problema persistir, entre em contato com o suporte.'
        });
      }
    } catch (sendError) {
      logError('[TELEGRAM] Erro ao enviar mensagem de erro', { sendError });
    }

    return { success: false, error: error.message };
  }
}

/**
 * Valida segredo do webhook
 */
export function validateWebhookSecret(secret: string | undefined): boolean {
  if (!TELEGRAM_WEBHOOK_SECRET) {
    logWarning('TelegramService: TELEGRAM_WEBHOOK_SECRET not configured', {});
    return false;
  }

  if (!secret) {
    return false;
  }

  return secret === TELEGRAM_WEBHOOK_SECRET;
}

/**
 * Obtém informações do backend para diagnóstico
 */
export function getBackendInfo() {
  const BASE_URL = process.env.BACKEND_BASE_URL || process.env.PUBLIC_URL || process.env.BACKEND_URL || 'https://api.radarone.com.br';
  const NODE_ENV = process.env.NODE_ENV || 'development';

  return {
    backendBaseUrl: BASE_URL,
    nodeEnv: NODE_ENV,
    webhookPath: '/api/telegram/webhook',
    botTokenConfigured: !!TELEGRAM_BOT_TOKEN,
    botTokenPrefix: TELEGRAM_BOT_TOKEN ? TELEGRAM_BOT_TOKEN.substring(0, 10) + '...' : null,
    webhookSecretConfigured: !!TELEGRAM_WEBHOOK_SECRET,
    webhookSecretLength: TELEGRAM_WEBHOOK_SECRET?.length || 0,
    timestamp: new Date().toISOString()
  };
}

/**
 * Calcula a URL esperada do webhook
 */
export function getExpectedWebhookUrl(): string {
  const BASE_URL = process.env.BACKEND_BASE_URL || process.env.PUBLIC_URL || process.env.BACKEND_URL || 'https://api.radarone.com.br';
  const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!TELEGRAM_WEBHOOK_SECRET) {
    return `${BASE_URL}/api/telegram/webhook?secret=<NOT_CONFIGURED>`;
  }

  return `${BASE_URL}/api/telegram/webhook?secret=${TELEGRAM_WEBHOOK_SECRET}`;
}

/**
 * Diagnóstico completo do sistema Telegram
 */
export async function diagnoseTelegram(userId?: string): Promise<{
  success: boolean;
  backend: any;
  bot: any;
  webhook: any;
  database: any;
  diagnostics: any;
}> {
  logInfo('[TelegramService.diagnoseTelegram] Iniciando diagnóstico completo', {
    action: 'diagnose_start',
    userId: userId || 'admin',
    timestamp: new Date().toISOString()
  });

  // 1. Backend info
  const backendInfo = getBackendInfo();
  const expectedWebhookUrl = getExpectedWebhookUrl();

  // 2. Bot info (valida token)
  const botInfo = await getBotInfo();

  // 3. Webhook info (valida configuração)
  const webhookInfo = await getWebhookInfo();

  // 4. Database info (se userId fornecido)
  let dbInfo: any = null;
  if (userId) {
    try {
      const telegramAccount = await prisma.telegramAccount.findFirst({
        where: { userId, active: true }
      });

      const notificationSettings = await prisma.notificationSettings.findUnique({
        where: { userId }
      });

      dbInfo = {
        userId,
        hasAccount: !!telegramAccount,
        accountActive: telegramAccount?.active || false,
        accountChatId: telegramAccount?.chatId || null,
        accountUsername: telegramAccount?.username || null,
        accountLinkedAt: telegramAccount?.linkedAt || null,
        settingsTelegramEnabled: notificationSettings?.telegramEnabled || false,
        settingsChatId: notificationSettings?.telegramChatId || null,
        settingsUsername: notificationSettings?.telegramUsername || null,
        consistency: {
          bothExist: !!telegramAccount && !!notificationSettings,
          chatIdMatch: telegramAccount?.chatId === notificationSettings?.telegramChatId,
          usernameMatch: telegramAccount?.username === notificationSettings?.telegramUsername
        }
      };
    } catch (error: any) {
      dbInfo = { error: error.message };
    }
  }

  // 5. Diagnostics (problemas identificados)
  const diagnostics: any = {
    overall: 'OK',
    issues: [],
    warnings: [],
    recommendations: []
  };

  // Token inválido?
  if (!botInfo.success) {
    diagnostics.overall = 'CRITICAL';
    diagnostics.issues.push({
      severity: 'CRITICAL',
      code: 'BOT_TOKEN_INVALID',
      message: 'TELEGRAM_BOT_TOKEN inválido ou não configurado',
      detail: botInfo.error,
      fix: 'Configure TELEGRAM_BOT_TOKEN com um token válido do @BotFather'
    });
  }

  // Webhook não configurado?
  if (!webhookInfo.url) {
    diagnostics.overall = diagnostics.overall === 'CRITICAL' ? 'CRITICAL' : 'ERROR';
    diagnostics.issues.push({
      severity: 'ERROR',
      code: 'WEBHOOK_NOT_CONFIGURED',
      message: 'Webhook não configurado no Telegram',
      fix: 'Use POST /api/telegram/admin/reconfigure-webhook'
    });
  }

  // Webhook URL diferente?
  const webhookMatches = webhookInfo.url === expectedWebhookUrl;
  if (webhookInfo.url && !webhookMatches) {
    diagnostics.overall = diagnostics.overall === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
    diagnostics.warnings.push({
      severity: 'WARNING',
      code: 'WEBHOOK_URL_MISMATCH',
      message: 'Webhook configurado mas URL diferente da esperada',
      expected: expectedWebhookUrl.replace(TELEGRAM_WEBHOOK_SECRET || '', '<SECRET>'),
      actual: webhookInfo.url,
      fix: 'Use POST /api/telegram/admin/reconfigure-webhook'
    });
  }

  // Pending updates?
  if (webhookInfo.pendingUpdateCount && webhookInfo.pendingUpdateCount > 0) {
    diagnostics.warnings.push({
      severity: 'INFO',
      code: 'PENDING_UPDATES',
      message: `${webhookInfo.pendingUpdateCount} updates pendentes no Telegram`,
      detail: 'Isso pode indicar que o webhook não está sendo processado corretamente',
      fix: 'Verifique se o backend está acessível publicamente e se o secret está correto'
    });
  }

  // Last error?
  if (webhookInfo.lastErrorMessage) {
    diagnostics.overall = diagnostics.overall === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
    diagnostics.warnings.push({
      severity: 'WARNING',
      code: 'WEBHOOK_LAST_ERROR',
      message: 'Último erro reportado pelo Telegram',
      detail: webhookInfo.lastErrorMessage,
      errorDate: webhookInfo.lastErrorDate
        ? new Date(webhookInfo.lastErrorDate * 1000).toISOString()
        : null
    });
  }

  // Secret não configurado?
  if (!TELEGRAM_WEBHOOK_SECRET) {
    diagnostics.warnings.push({
      severity: 'WARNING',
      code: 'WEBHOOK_SECRET_NOT_CONFIGURED',
      message: 'TELEGRAM_WEBHOOK_SECRET não configurado',
      detail: 'Webhook está sem validação de secret (inseguro)',
      fix: 'Configure TELEGRAM_WEBHOOK_SECRET no ambiente'
    });
  }

  // DB inconsistente?
  if (dbInfo && dbInfo.consistency && !dbInfo.consistency.chatIdMatch) {
    diagnostics.warnings.push({
      severity: 'WARNING',
      code: 'DATABASE_INCONSISTENCY',
      message: 'chatId diferente entre TelegramAccount e NotificationSettings',
      detail: `Account: ${dbInfo.accountChatId}, Settings: ${dbInfo.settingsChatId}`,
      fix: 'Usuário deve desvincular e reconectar'
    });
  }

  logInfo('[TelegramService.diagnoseTelegram] Diagnóstico completo', {
    action: 'diagnose_complete',
    overall: diagnostics.overall,
    issuesCount: diagnostics.issues.length,
    warningsCount: diagnostics.warnings.length,
    timestamp: new Date().toISOString()
  });

  return {
    success: true,
    backend: backendInfo,
    bot: botInfo,
    webhook: {
      ...webhookInfo,
      expectedUrl: expectedWebhookUrl.replace(TELEGRAM_WEBHOOK_SECRET || '', '<SECRET>'),
      matches: webhookMatches
    },
    database: dbInfo,
    diagnostics
  };
}

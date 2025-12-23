import axios from 'axios';
import { prisma } from '../server';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

export interface SendTelegramMessageOptions {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  disableWebPagePreview?: boolean;
}

/**
 * Envia mensagem via Telegram Bot
 */
export async function sendTelegramMessage(options: SendTelegramMessageOptions): Promise<{ success: boolean; messageId?: number; error?: string }> {
  const { chatId, text, parseMode = 'HTML', disableWebPagePreview = false } = options;

  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('[TelegramService] TELEGRAM_BOT_TOKEN não configurado. Mensagem não enviada.');
    return {
      success: false,
      error: 'TELEGRAM_BOT_TOKEN não configurado'
    };
  }

  try {
    const response = await axios.post(`${TELEGRAM_API_BASE}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: disableWebPagePreview
    }, {
      timeout: 10000
    });

    console.log('[TelegramService] Mensagem enviada com sucesso', { chatId, messageId: response.data.result.message_id });

    return {
      success: true,
      messageId: response.data.result.message_id
    };
  } catch (error: any) {
    console.error('[TelegramService] Erro ao enviar mensagem', { chatId, error: error.message });

    return {
      success: false,
      error: error.response?.data?.description || error.message
    };
  }
}

/**
 * Envia alerta sobre novo anúncio via Telegram
 */
export async function sendAlertTelegram(chatId: string, adTitle: string, adUrl: string, monitorName: string): Promise<{ success: boolean; error?: string }> {
  const text = `
🚨 <b>Novo anúncio detectado!</b>

Monitor: <i>${monitorName}</i>

<b>${adTitle}</b>

<a href="${adUrl}">Ver anúncio</a>
  `.trim();

  return sendTelegramMessage({
    chatId,
    text,
    parseMode: 'HTML',
    disableWebPagePreview: false
  });
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

    console.log('[TelegramService] Webhook configurado', { webhookUrl, result: response.data });

    return {
      success: response.data.ok,
      error: response.data.description
    };
  } catch (error: any) {
    console.error('[TelegramService] Erro ao configurar webhook', { webhookUrl, error: error.message });

    return {
      success: false,
      error: error.response?.data?.description || error.message
    };
  }
}

/**
 * Gera código de vínculo para o usuário
 */
export async function generateLinkCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  // Gerar código único: RADAR-XXXXXX (6 caracteres alfanuméricos)
  const code = `RADAR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // Expira em 30 minutos
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 30);

  // Salvar no banco
  await prisma.notificationSettings.upsert({
    where: { userId },
    create: {
      userId,
      emailEnabled: true,
      telegramEnabled: false,
      telegramLinkCode: code,
      telegramLinkExpiresAt: expiresAt
    },
    update: {
      telegramLinkCode: code,
      telegramLinkExpiresAt: expiresAt
    }
  });

  console.log('[TelegramService] Código de vínculo gerado', { userId, code, expiresAt });

  return { code, expiresAt };
}

/**
 * Processa mensagem recebida do webhook Telegram
 */
export async function processWebhookMessage(message: any): Promise<{ success: boolean; error?: string }> {
  try {
    const chatId = message.chat?.id?.toString();
    const text = message.text?.trim();
    const username = message.from?.username;

    if (!chatId || !text) {
      return { success: false, error: 'Mensagem inválida' };
    }

    console.log('[TelegramService] Processando mensagem do webhook', { chatId, text });

    // Verificar se a mensagem contém um código RADAR-
    const codeMatch = text.match(/RADAR-([A-Z0-9]{6})/i);
    if (!codeMatch) {
      // Mensagem não é um código de vínculo, ignorar ou enviar help
      await sendTelegramMessage({
        chatId,
        text: '❌ Código inválido.\n\nPara vincular sua conta, use o código gerado no painel RadarOne.\nFormato: RADAR-XXXXXX'
      });
      return { success: true };
    }

    const fullCode = codeMatch[0].toUpperCase();

    // Buscar settings com esse código
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
      await sendTelegramMessage({
        chatId,
        text: '❌ Código inválido ou expirado.\n\nGere um novo código no painel RadarOne.'
      });
      return { success: false, error: 'Código não encontrado ou expirado' };
    }

    // Vincular chatId e ativar Telegram
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

    // Enviar confirmação
    await sendTelegramMessage({
      chatId,
      text: `✅ Conta vinculada com sucesso!\n\nOlá, ${settings.user.name}!\n\nVocê receberá notificações de novos anúncios aqui no Telegram.`
    });

    console.log('[TelegramService] Conta vinculada com sucesso', { userId: settings.userId, chatId });

    return { success: true };
  } catch (error: any) {
    console.error('[TelegramService] Erro ao processar webhook', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Valida segredo do webhook
 */
export function validateWebhookSecret(secret: string | undefined): boolean {
  if (!TELEGRAM_WEBHOOK_SECRET) {
    console.warn('[TelegramService] TELEGRAM_WEBHOOK_SECRET não configurado');
    return false;
  }

  if (!secret) {
    return false;
  }

  return secret === TELEGRAM_WEBHOOK_SECRET;
}

/**
 * Busca conta do Telegram do usuário
 */
export async function getUserTelegramAccount(userId: string): Promise<{ chatId: string; username: string } | null> {
  const settings = await prisma.notificationSettings.findUnique({
    where: { userId }
  });

  if (!settings || !settings.telegramChatId || !settings.telegramEnabled) {
    return null;
  }

  return {
    chatId: settings.telegramChatId,
    username: settings.telegramUsername || ''
  };
}

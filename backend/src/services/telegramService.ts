import axios from 'axios';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

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
 * Stub - busca conta do Telegram do usuário
 */
export async function getUserTelegramAccount(userId: string): Promise<{ chatId: string; username: string } | null> {
  console.log('[TelegramService] getUserTelegramAccount stub chamado', { userId });
  return null;
}

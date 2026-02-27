import axios from 'axios';
import { logInfo, logError, logWarning } from '../utils/loggerHelpers';
import { HTTP_CONFIG } from '../config/appConfig';

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
export const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

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
    logWarning('TelegramService: TELEGRAM_BOT_TOKEN not configured', {});
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
      timeout: HTTP_CONFIG.telegramRequestTimeoutMs
    });

    logInfo('[TelegramService] Mensagem enviada com sucesso', { chatId, messageId: response.data.result.message_id });

    return {
      success: true,
      messageId: response.data.result.message_id
    };
  } catch (error: any) {
    logError('[TelegramService] Erro ao enviar mensagem', { chatId, error: error.message });

    return {
      success: false,
      error: error.response?.data?.description || error.message
    };
  }
}

import TelegramBot from 'node-telegram-bot-api';
import type { FipeEnrichment } from '../engine/enrichment/fipe-types';
import { formatFipeTelegram } from '../engine/enrichment/fipe';
import type { OpportunityResult } from '../engine/enrichment/score-types';
import { formatScoreTelegram } from '../engine/enrichment/score-formatters';

/**
 * Serviço de integração com Telegram
 * Envia alertas de novos anúncios
 */

const token = process.env.TELEGRAM_BOT_TOKEN || '';
let bot: TelegramBot | null = null;

// Inicializa bot apenas se token estiver configurado
if (token) {
  bot = new TelegramBot(token, { polling: false });
}

interface AdAlert {
  monitorName: string;
  ad: {
    title: string;
    description?: string;
    price?: number;
    url: string;
    imageUrl?: string;
    location?: string;
    fipe?: FipeEnrichment;
    opportunity?: OpportunityResult;
  };
}

export class TelegramService {
  /**
   * Escapa caracteres especiais HTML para Telegram.
   * Telegram HTML mode requer que <, >, & sejam escapados fora de tags.
   */
  static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Envia alerta de novo anúncio
   */
  static async sendAdAlert(chatId: string, data: AdAlert): Promise<void> {
    if (!bot) {
      console.warn('⚠️  Telegram bot não configurado (TELEGRAM_BOT_TOKEN missing)');
      return;
    }

    try {
      const safeName = this.escapeHtml(data.monitorName);
      const safeTitle = this.escapeHtml(data.ad.title);

      // Formata mensagem em português
      let message = `🔔 <b>Novo anúncio encontrado!</b>\n\n`;
      message += `📌 <b>Monitor:</b> ${safeName}\n\n`;
      message += `📝 <b>${safeTitle}</b>\n`;

      if (data.ad.price) {
        message += `💰 ${this.formatPrice(data.ad.price)}\n`;
      }

      // FIPE enrichment (if available)
      if (data.ad.fipe) {
        message += formatFipeTelegram(data.ad.fipe);
        message += '\n';
      }

      // Opportunity Score (if available)
      if (data.ad.opportunity) {
        message += formatScoreTelegram(data.ad.opportunity);
        message += '\n';
      }

      if (data.ad.location) {
        message += `📍 ${this.escapeHtml(data.ad.location)}\n`;
      }

      if (data.ad.description) {
        // Limita descrição a 200 caracteres
        const desc =
          data.ad.description.length > 200
            ? data.ad.description.substring(0, 200) + '...'
            : data.ad.description;
        message += `\n${this.escapeHtml(desc)}\n`;
      }

      message += `\n🔗 <a href="${data.ad.url}">Ver anúncio</a>`;

      // Envia mensagem
      if (data.ad.imageUrl) {
        // Envia com imagem
        await bot.sendPhoto(chatId, data.ad.imageUrl, {
          caption: message,
          parse_mode: 'HTML',
        });
      } else {
        // Envia apenas texto
        await bot.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        });
      }

      console.log(`📤 Alerta enviado para chat ${chatId}`);
    } catch (error) {
      console.error('❌ Erro ao enviar alerta Telegram:', error);
      throw error;
    }
  }

  /**
   * Envia mensagem genérica (com HTML).
   * Desabilita preview de links (útil para mensagens de sistema como NEEDS_REAUTH).
   */
  static async sendMessage(chatId: string, text: string): Promise<void> {
    if (!bot) {
      console.warn('⚠️  Telegram bot não configurado');
      return;
    }

    try {
      await bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem Telegram:', error);
      throw error;
    }
  }

  /**
   * Valida se chat ID existe (usuário iniciou conversa com bot)
   */
  static async validateChatId(chatId: string): Promise<boolean> {
    if (!bot) return false;

    try {
      await bot.getChat(chatId);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Formata preço no padrão brasileiro (R$ 2.350,00)
   */
  private static formatPrice(price: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  }
}

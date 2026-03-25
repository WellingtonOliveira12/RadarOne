import TelegramBot from 'node-telegram-bot-api';
import type { FipeEnrichment } from '../engine/enrichment/fipe-types';
import { formatFipeTelegram } from '../engine/enrichment/fipe';
import type { OpportunityResult, AppleReferenceMatch } from '../engine/enrichment/score-types';
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
    publishedAt?: Date;
    fipe?: FipeEnrichment;
    appleRef?: AppleReferenceMatch;
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

      // Apple Reference (if available and no FIPE)
      if (!data.ad.fipe && data.ad.appleRef && data.ad.price) {
        const refFormatted = new Intl.NumberFormat('pt-BR', {
          style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
        }).format(data.ad.appleRef.referencePrice);
        const delta = ((data.ad.price - data.ad.appleRef.referencePrice) / data.ad.appleRef.referencePrice);
        const pct = Math.round(delta * 100);
        const pctStr = `${pct >= 0 ? '+' : ''}${pct}%`;
        const emoji = delta <= -0.05 ? '\uD83D\uDD25' : delta <= 0.10 ? '\u2696\uFE0F' : '\uD83D\uDEA8';
        const classLabel = delta <= -0.05 ? 'abaixo da ref.' : delta <= 0.10 ? 'na m\u00E9dia' : 'acima da ref.';
        message += `\n\uD83C\uDF4F <b>Ref. Apple:</b> ${refFormatted}\n${emoji} ${pctStr} ${classLabel}\n`;
      }

      // Opportunity Score (if available)
      if (data.ad.opportunity) {
        message += formatScoreTelegram(data.ad.opportunity);
        message += '\n';
      }

      if (data.ad.location) {
        let locationLine = `📍 ${this.escapeHtml(data.ad.location)}`;
        if (data.ad.publishedAt) {
          locationLine += ` / ${this.formatRelativeDate(data.ad.publishedAt)}`;
        }
        message += `${locationLine}\n`;
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

  /**
   * Formats a date as relative text in Portuguese.
   *   Today at 19:26      → "Hoje, 19:26"
   *   Yesterday at 08:51  → "Ontem, 08:51"
   *   Other               → "25/03, 22:32"
   */
  private static formatRelativeDate(date: Date): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return `Hoje, ${time}`;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return `Ontem, ${time}`;

    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}, ${time}`;
  }
}

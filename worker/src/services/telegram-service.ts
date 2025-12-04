import TelegramBot from 'node-telegram-bot-api';

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
  };
}

export class TelegramService {
  /**
   * Envia alerta de novo anúncio
   */
  static async sendAdAlert(chatId: string, data: AdAlert): Promise<void> {
    if (!bot) {
      console.warn('⚠️  Telegram bot não configurado (TELEGRAM_BOT_TOKEN missing)');
      return;
    }

    try {
      // Formata mensagem em português
      let message = `🔔 <b>Novo anúncio encontrado!</b>\n\n`;
      message += `📌 <b>Monitor:</b> ${data.monitorName}\n\n`;
      message += `📝 <b>${data.ad.title}</b>\n`;

      if (data.ad.price) {
        message += `💰 ${this.formatPrice(data.ad.price)}\n`;
      }

      if (data.ad.location) {
        message += `📍 ${data.ad.location}\n`;
      }

      if (data.ad.description) {
        // Limita descrição a 200 caracteres
        const desc =
          data.ad.description.length > 200
            ? data.ad.description.substring(0, 200) + '...'
            : data.ad.description;
        message += `\n${desc}\n`;
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
   * Envia mensagem genérica
   */
  static async sendMessage(chatId: string, text: string): Promise<void> {
    if (!bot) {
      console.warn('⚠️  Telegram bot não configurado');
      return;
    }

    try {
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
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

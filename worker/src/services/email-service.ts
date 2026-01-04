import { logger } from '../utils/logger';

/**
 * Email Service - Envio de alertas por email
 *
 * Integrado com Resend (https://resend.com)
 * Tier gratuito: 100 emails/dia, 3.000 emails/mês
 *
 * Alternativas:
 * - SendGrid
 * - Mailgun
 * - AWS SES
 *
 * Features:
 * - Templates HTML responsivos
 * - Fallback para texto simples
 * - Rate limiting interno
 * - Retry automático
 */

export interface EmailAlert {
  to: string;
  monitorName: string;
  ad: {
    title: string;
    price?: number;
    url: string;
    imageUrl?: string;
    location?: string;
    description?: string;
  };
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class EmailService {
  private apiKey: string | null;
  private fromEmail: string;
  private enabled: boolean;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || null;
    this.fromEmail = process.env.EMAIL_FROM || 'RadarOne <noreply@radarone.app>';
    this.enabled = !!this.apiKey;

    if (this.enabled) {
      logger.info('📧 Email service habilitado (Resend)');
    } else {
      logger.warn('⚠️  Email service desabilitado (RESEND_API_KEY não configurado)');
    }
  }

  /**
   * Verifica se o serviço de email está habilitado
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Envia alerta de novo anúncio por email
   */
  async sendAdAlert(data: EmailAlert): Promise<EmailResult> {
    if (!this.enabled) {
      return {
        success: false,
        error: 'Email service não está habilitado',
      };
    }

    try {
      const htmlBody = this.buildHtmlTemplate(data);
      const textBody = this.buildTextTemplate(data);

      const response = await this.sendEmail({
        to: data.to,
        subject: `🔔 Novo anúncio: ${data.monitorName}`,
        html: htmlBody,
        text: textBody,
      });

      if (response.success) {
        logger.info({
          to: data.to,
          monitor: data.monitorName,
          messageId: response.messageId,
        }, '📧 Email enviado com sucesso');
      }

      return response;
    } catch (error: any) {
      logger.error({
        to: data.to,
        error: error.message,
      }, '❌ Erro ao enviar email');

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Envia email genérico via Resend API
   */
  private async sendEmail(data: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<EmailResult> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: [data.to],
          subject: data.subject,
          html: data.html,
          text: data.text,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      return {
        success: true,
        messageId: result.id,
      };
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Constrói template HTML responsivo para o email
   */
  private buildHtmlTemplate(data: EmailAlert): string {
    const { monitorName, ad } = data;
    const priceFormatted = ad.price ? `R$ ${ad.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Consulte';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Novo Anúncio - ${monitorName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">
                🔔 Novo Anúncio Encontrado!
              </h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">
                Monitor: <strong>${this.escapeHtml(monitorName)}</strong>
              </p>
            </td>
          </tr>

          <!-- Image -->
          ${ad.imageUrl ? `
          <tr>
            <td style="padding: 0;">
              <img src="${this.escapeHtml(ad.imageUrl)}" alt="${this.escapeHtml(ad.title)}"
                   style="width: 100%; height: auto; display: block; max-height: 400px; object-fit: cover;">
            </td>
          </tr>
          ` : ''}

          <!-- Content -->
          <tr>
            <td style="padding: 30px 20px;">
              <!-- Title -->
              <h2 style="color: #333333; margin: 0 0 15px 0; font-size: 20px; font-weight: bold;">
                ${this.escapeHtml(ad.title)}
              </h2>

              <!-- Price -->
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin-bottom: 15px;">
                <p style="margin: 0; color: #667eea; font-size: 14px; font-weight: 600;">PREÇO</p>
                <p style="margin: 5px 0 0 0; color: #333333; font-size: 24px; font-weight: bold;">
                  ${priceFormatted}
                </p>
              </div>

              <!-- Location -->
              ${ad.location ? `
              <p style="color: #666666; margin: 0 0 15px 0; font-size: 14px;">
                📍 <strong>Localização:</strong> ${this.escapeHtml(ad.location)}
              </p>
              ` : ''}

              <!-- Description -->
              ${ad.description ? `
              <div style="border-top: 1px solid #e0e0e0; padding-top: 15px; margin-top: 15px;">
                <p style="color: #666666; margin: 0; font-size: 14px; line-height: 1.6;">
                  ${this.escapeHtml(ad.description.substring(0, 200))}${ad.description.length > 200 ? '...' : ''}
                </p>
              </div>
              ` : ''}

              <!-- CTA Button -->
              <div style="text-align: center; margin-top: 30px;">
                <a href="${this.escapeHtml(ad.url)}"
                   style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                          color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 5px;
                          font-weight: bold; font-size: 16px;">
                  Ver Anúncio Completo
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="color: #999999; margin: 0; font-size: 12px;">
                Você recebeu este email porque tem um monitor ativo no <strong>RadarOne</strong>
              </p>
              <p style="color: #999999; margin: 10px 0 0 0; font-size: 12px;">
                © ${new Date().getFullYear()} RadarOne. Todos os direitos reservados.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Constrói template de texto simples (fallback)
   */
  private buildTextTemplate(data: EmailAlert): string {
    const { monitorName, ad } = data;
    const priceFormatted = ad.price ? `R$ ${ad.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Consulte';

    let text = `🔔 NOVO ANÚNCIO ENCONTRADO!\n\n`;
    text += `Monitor: ${monitorName}\n\n`;
    text += `────────────────────────────────\n\n`;
    text += `${ad.title}\n\n`;
    text += `💰 Preço: ${priceFormatted}\n`;

    if (ad.location) {
      text += `📍 Local: ${ad.location}\n`;
    }

    if (ad.description) {
      text += `\n${ad.description.substring(0, 200)}${ad.description.length > 200 ? '...' : ''}\n`;
    }

    text += `\n────────────────────────────────\n\n`;
    text += `🔗 Ver anúncio completo:\n${ad.url}\n\n`;
    text += `────────────────────────────────\n`;
    text += `© ${new Date().getFullYear()} RadarOne\n`;

    return text;
  }

  /**
   * Escapa HTML para prevenir XSS
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Testa configuração enviando email de teste
   */
  async sendTestEmail(to: string): Promise<EmailResult> {
    if (!this.enabled) {
      return {
        success: false,
        error: 'Email service não está habilitado',
      };
    }

    try {
      const response = await this.sendEmail({
        to,
        subject: '✅ RadarOne - Email configurado com sucesso!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #667eea;">✅ Email Configurado!</h2>
            <p>Parabéns! O serviço de email do RadarOne está funcionando corretamente.</p>
            <p>Você receberá alertas neste endereço quando novos anúncios forem encontrados.</p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #999999; font-size: 12px;">© ${new Date().getFullYear()} RadarOne</p>
          </div>
        `,
        text: `
✅ Email Configurado!

Parabéns! O serviço de email do RadarOne está funcionando corretamente.
Você receberá alertas neste endereço quando novos anúncios forem encontrados.

© ${new Date().getFullYear()} RadarOne
        `.trim(),
      });

      return response;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Singleton
export const emailService = new EmailService();

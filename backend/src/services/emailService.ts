import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Envia email via Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, subject, html, from } = options;
  const fromEmail = from || process.env.EMAIL_FROM || 'noreply@radarone.com';

  // Se não houver API key configurada, apenas simular
  if (!resend) {
    console.warn('[EmailService] RESEND_API_KEY não configurado. Email não enviado.');
    return {
      success: false,
      error: 'RESEND_API_KEY não configurado'
    };
  }

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html
    });

    console.log('[EmailService] Email enviado com sucesso', { to, subject, messageId: result.data?.id });

    return {
      success: true,
      messageId: result.data?.id
    };
  } catch (error: any) {
    console.error('[EmailService] Erro ao enviar email', { to, subject, error: error.message });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Envia email de alerta sobre novo anúncio
 */
export async function sendAlertEmail(to: string, adTitle: string, adUrl: string, monitorName: string): Promise<{ success: boolean; error?: string }> {
  const subject = `🚨 Novo anúncio detectado: ${adTitle}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1f2937;">🚨 Novo anúncio detectado!</h2>

      <p>Olá,</p>

      <p>Seu monitor <strong>${monitorName}</strong> detectou um novo anúncio:</p>

      <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <h3 style="margin-top: 0; color: #374151;">${adTitle}</h3>
        <a href="${adUrl}" style="color: #3b82f6; text-decoration: none;">Ver anúncio →</a>
      </div>

      <p style="color: #6b7280; font-size: 14px;">
        Acesse o <a href="${process.env.FRONTEND_URL || 'https://radarone.com'}/monitors" style="color: #3b82f6;">painel de monitores</a> para mais detalhes.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="color: #9ca3af; font-size: 12px;">
        Este email foi enviado automaticamente pelo RadarOne.<br />
        Configure suas preferências de notificação no <a href="${process.env.FRONTEND_URL || 'https://radarone.com'}/settings/notifications">painel de configurações</a>.
      </p>
    </div>
  `;

  return sendEmail({ to, subject, html });
}

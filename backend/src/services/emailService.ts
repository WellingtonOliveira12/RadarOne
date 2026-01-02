import { Resend } from 'resend';
import { renderTestEmailTemplate, renderNewAdEmailTemplate } from '../templates/email/baseTemplate';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const EMAIL_FROM = process.env.EMAIL_FROM || 'contato@radarone.com.br';

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
  const fromEmail = from || EMAIL_FROM;

  // Se não houver API key configurada, retornar erro amigável
  if (!resend) {
    console.warn('[EmailService] RESEND_API_KEY não configurado. Email não enviado.');
    return {
      success: false,
      error: 'Serviço de e-mail não configurado. Configure RESEND_API_KEY nas variáveis de ambiente.'
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
 * Envia email de notificação genérico
 */
export async function sendNotificationEmail(to: string, subject: string, html: string): Promise<void> {
  const result = await sendEmail({ to, subject, html });

  if (!result.success) {
    throw new Error(result.error || 'Erro ao enviar email');
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

/**
 * FASE: Cupons de Upgrade
 * Envia email de notificação quando trial upgrade está expirando
 */
export async function sendTrialUpgradeExpiringEmail(
  to: string,
  planName: string,
  daysRemaining: number,
  expiresAt: Date
): Promise<{ success: boolean; error?: string }> {
  const subject = `⏰ Seu acesso premium ao ${planName} expira em ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}`;

  const formattedDate = expiresAt.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1f2937;">⏰ Seu acesso premium está expirando!</h2>

      <p>Olá,</p>

      <p>Seu acesso premium ao plano <strong>${planName}</strong> (concedido via cupom de upgrade) irá expirar em breve:</p>

      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0; color: #92400e; font-size: 16px; font-weight: 600;">
          ⚠️ Expira em: ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}
        </p>
        <p style="margin: 8px 0 0 0; color: #78350f; font-size: 14px;">
          Data: ${formattedDate}
        </p>
      </div>

      <p>Para continuar aproveitando todos os recursos premium, considere assinar um plano:</p>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${process.env.FRONTEND_URL || 'https://radarone.com'}/plans"
           style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Ver Planos e Preços
        </a>
      </div>

      <p style="color: #6b7280; font-size: 14px;">
        Após a expiração, você será movido para o plano gratuito, mas pode voltar a assinar a qualquer momento!
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="color: #9ca3af; font-size: 12px;">
        Este email foi enviado automaticamente pelo RadarOne.<br />
        Não deseja receber essas notificações? <a href="${process.env.FRONTEND_URL || 'https://radarone.com'}/settings/notifications">Gerencie suas preferências</a>.
      </p>
    </div>
  `;

  return sendEmail({ to, subject, html });
}

/**
 * Envia email de boas-vindas
 */
export async function sendWelcomeEmail(to: string, name: string): Promise<{ success: boolean; error?: string }> {
  console.log('[EmailService] Enviando email de boas-vindas', { to, name });

  const html = renderTestEmailTemplate(name);

  return sendEmail({
    to,
    subject: 'Bem-vindo ao RadarOne!',
    html
  });
}

export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<{ success: boolean; error?: string }> {
  console.log('[EmailService] sendPasswordResetEmail stub chamado', { to });
  return { success: true };
}

export async function sendPasswordChangedEmail(to: string): Promise<{ success: boolean; error?: string }> {
  console.log('[EmailService] sendPasswordChangedEmail stub chamado', { to });
  return { success: true };
}

export async function sendTrialStartedEmail(to: string, planName: string, trialEndsAt: Date): Promise<{ success: boolean; error?: string }> {
  console.log('[EmailService] sendTrialStartedEmail stub chamado', { to, planName });
  return { success: true };
}

export async function sendTrialEndingEmail(to: string, name: string, daysRemaining: number, planName: string): Promise<{ success: boolean; error?: string }> {
  console.log('[EmailService] sendTrialEndingEmail stub chamado', { to, name, daysRemaining, planName });
  return { success: true };
}

export async function sendTrialExpiredEmail(to: string, name: string, planName: string): Promise<{ success: boolean; error?: string }> {
  console.log('[EmailService] sendTrialExpiredEmail stub chamado', { to, name, planName });
  return { success: true };
}

export async function sendAbandonedCouponEmail(
  to: string,
  name: string,
  couponCode: string,
  discountText: string,
  description: string
): Promise<{ success: boolean; error?: string }> {
  console.log('[EmailService] Enviando email de cupom abandonado', { to, couponCode });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Não esqueça seu cupom de desconto!</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">💰 Seu Cupom Está Esperando!</h1>
  </div>

  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Olá <strong>${name}</strong>,</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Notamos que você validou o cupom <strong style="color: #667eea; font-size: 18px;">${couponCode}</strong> mas ainda não finalizou sua assinatura!
    </p>

    <div style="background: #f9fafb; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <p style="margin: 0; font-size: 14px; color: #6b7280;"><strong>${description}</strong></p>
      <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #10b981;">${discountText} de desconto</p>
    </div>

    <p style="font-size: 16px; margin-bottom: 25px;">
      Não perca essa oportunidade! Escolha seu plano e economize com seu cupom exclusivo.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${frontendUrl}/plans?coupon=${couponCode}"
         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        Escolher Meu Plano com Desconto
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
      <strong>Dica:</strong> Cupons promocionais têm validade limitada. Aproveite agora!
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      RadarOne - Monitoramento Inteligente de Sites e Produtos<br>
      <a href="${frontendUrl}" style="color: #667eea; text-decoration: none;">Visitar RadarOne</a>
    </p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    to,
    subject: `💰 Não esqueça seu cupom ${couponCode} - ${discountText} de desconto!`,
    html,
  });
}

export async function sendSubscriptionExpiredEmail(to: string, name: string, planName: string): Promise<{ success: boolean; error?: string }> {
  console.log('[EmailService] sendSubscriptionExpiredEmail stub chamado', { to, name, planName });
  return { success: true };
}

export async function sendNewListingEmail(to: string, listingTitle: string, listingUrl: string): Promise<{ success: boolean; error?: string }> {
  console.log('[EmailService] Enviando email de novo anúncio', { to, listingTitle });

  const html = renderNewAdEmailTemplate({
    userName: 'Usuário',
    monitorName: 'Monitor',
    adTitle: listingTitle,
    adUrl: listingUrl
  });

  return sendEmail({
    to,
    subject: `🚨 Novo anúncio: ${listingTitle}`,
    html
  });
}

export async function sendMonthlyQueriesResetReport(to: string, resetCount: number): Promise<{ success: boolean; error?: string }> {
  console.log('[EmailService] sendMonthlyQueriesResetReport stub chamado', { to, resetCount });
  return { success: true };
}

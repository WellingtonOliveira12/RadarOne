import { Resend } from 'resend';

/**
 * Email Service - Implementação Real com Resend
 * Gerencia envio de e-mails transacionais do RadarOne
 */

export interface EmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Configuração do Resend
// Em desenvolvimento sem API key, usa um placeholder para evitar erro
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_placeholder_dev_mode';
const resend = new Resend(RESEND_API_KEY);

const EMAIL_FROM = process.env.EMAIL_FROM || 'RadarOne <noreply@radarone.com.br>';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'RadarOne';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Função genérica para enviar e-mail
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    // Em desenvolvimento, apenas loga (se não tiver API key)
    if (!process.env.RESEND_API_KEY) {
      console.log('[EMAIL DEV] Para:', params.to);
      console.log('[EMAIL DEV] Assunto:', params.subject);
      console.log('[EMAIL DEV] Texto:', params.text);
      return true;
    }

    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html || `<p>${params.text.replace(/\n/g, '<br>')}</p>`
    });

    if (result.error) {
      console.error('[EMAIL ERROR]', result.error);
      return false;
    }

    console.log('[EMAIL SENT] Para:', params.to, '- ID:', result.data?.id);
    return true;
  } catch (error: any) {
    console.error('[EMAIL ERROR]', error.message);
    return false;
  }
}

/**
 * E-mail de boas-vindas após registro
 */
export async function sendWelcomeEmail(
  userEmail: string,
  userName: string
): Promise<boolean> {
  const subject = `Bem-vindo ao ${EMAIL_FROM_NAME}! 🎉`;

  const text = `
Olá ${userName}!

Bem-vindo ao RadarOne! Estamos muito felizes em ter você conosco.

O RadarOne é a ferramenta perfeita para monitorar anúncios em tempo real e nunca perder uma oportunidade.

✅ Seu trial gratuito já foi ativado!
✅ Você pode começar a criar monitores agora mesmo

Acesse o dashboard: ${FRONTEND_URL}/dashboard

Se tiver qualquer dúvida, estamos aqui para ajudar.

Abraços,
Equipe ${EMAIL_FROM_NAME}
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #2563eb; text-align: center;">Bem-vindo ao ${EMAIL_FROM_NAME}! 🎉</h1>

      <p>Olá <strong>${userName}</strong>!</p>

      <p>Bem-vindo ao <strong>RadarOne</strong>! Estamos muito felizes em ter você conosco.</p>

      <p>O RadarOne é a ferramenta perfeita para monitorar anúncios em tempo real e nunca perder uma oportunidade.</p>

      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;">✅ Seu trial gratuito já foi ativado!</p>
        <p style="margin: 5px 0;">✅ Você pode começar a criar monitores agora mesmo</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${FRONTEND_URL}/dashboard"
           style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Acessar Dashboard
        </a>
      </div>

      <p>Se tiver qualquer dúvida, estamos aqui para ajudar.</p>

      <p style="color: #6b7280;">Abraços,<br>Equipe ${EMAIL_FROM_NAME}</p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        Você está recebendo este e-mail porque se cadastrou no ${EMAIL_FROM_NAME}.
      </p>
    </div>
  `;

  return sendEmail({ to: userEmail, subject, text, html });
}

/**
 * E-mail de confirmação de trial iniciado
 */
export async function sendTrialStartedEmail(
  userEmail: string,
  userName: string,
  planName: string,
  trialDays: number
): Promise<boolean> {
  const subject = `Seu trial do plano ${planName} foi ativado! 🚀`;

  const text = `
Olá ${userName}!

Ótima notícia! Seu trial do plano ${planName} foi ativado com sucesso.

🎁 Você tem ${trialDays} dias para testar todas as funcionalidades do plano ${planName} gratuitamente!

Durante o trial, você terá acesso a:
- Todos os recursos do plano ${planName}
- Monitoramento em tempo real
- Notificações por e-mail e Telegram
- Suporte prioritário

Acesse agora: ${FRONTEND_URL}/dashboard

Aproveite ao máximo seu trial!

Equipe ${EMAIL_FROM_NAME}
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #10b981; text-align: center;">Trial Ativado! 🚀</h1>

      <p>Olá <strong>${userName}</strong>!</p>

      <p>Ótima notícia! Seu trial do plano <strong>${planName}</strong> foi ativado com sucesso.</p>

      <div style="background-color: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <h2 style="margin: 0; color: #065f46;">🎁 ${trialDays} dias grátis</h2>
        <p style="margin: 10px 0 0 0; color: #065f46;">Plano ${planName}</p>
      </div>

      <p><strong>Durante o trial, você terá acesso a:</strong></p>
      <ul>
        <li>Todos os recursos do plano ${planName}</li>
        <li>Monitoramento em tempo real</li>
        <li>Notificações por e-mail e Telegram</li>
        <li>Suporte prioritário</li>
      </ul>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${FRONTEND_URL}/dashboard"
           style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Começar Agora
        </a>
      </div>

      <p style="color: #6b7280;">Aproveite ao máximo seu trial!<br><br>Equipe ${EMAIL_FROM_NAME}</p>
    </div>
  `;

  return sendEmail({ to: userEmail, subject, text, html });
}

/**
 * E-mail de lembrete: trial terminando em breve
 */
export async function sendTrialEndingEmail(
  userEmail: string,
  userName: string,
  planName: string,
  daysRemaining: number
): Promise<boolean> {
  const subject = `⏰ Seu trial termina em ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}!`;

  const text = `
Olá ${userName}!

Seu trial do plano ${planName} está terminando em ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}.

Para continuar aproveitando todos os recursos:
1. Acesse ${FRONTEND_URL}/plans
2. Escolha seu plano
3. Finalize a assinatura

Não perca acesso aos seus monitores!

Ver planos: ${FRONTEND_URL}/plans

Equipe ${EMAIL_FROM_NAME}
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #f59e0b; text-align: center;">⏰ Trial Terminando</h1>

      <p>Olá <strong>${userName}</strong>!</p>

      <p>Seu trial do plano <strong>${planName}</strong> está terminando em <strong style="color: #dc2626;">${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}</strong>.</p>

      <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Para continuar aproveitando todos os recursos:</strong></p>
        <ol style="margin: 10px 0;">
          <li>Acesse a página de planos</li>
          <li>Escolha seu plano ideal</li>
          <li>Finalize a assinatura</li>
        </ol>
        <p style="margin: 10px 0 0 0; color: #92400e;">⚠️ Não perca acesso aos seus monitores!</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${FRONTEND_URL}/plans"
           style="background-color: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Ver Planos
        </a>
      </div>

      <p style="color: #6b7280;">Equipe ${EMAIL_FROM_NAME}</p>
    </div>
  `;

  return sendEmail({ to: userEmail, subject, text, html });
}

/**
 * E-mail: trial expirado
 */
export async function sendTrialExpiredEmail(
  userEmail: string,
  userName: string,
  planName: string
): Promise<boolean> {
  const subject = `Seu trial do plano ${planName} expirou`;

  const text = `
Olá ${userName}!

Seu trial do plano ${planName} expirou.

Para continuar usando o RadarOne:
👉 Escolha um plano e assine agora

Ver planos: ${FRONTEND_URL}/plans

Seus monitores e dados estão salvos e aguardando você voltar!

Equipe ${EMAIL_FROM_NAME}
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #dc2626; text-align: center;">Trial Expirado</h1>

      <p>Olá <strong>${userName}</strong>!</p>

      <p>Seu trial do plano <strong>${planName}</strong> expirou.</p>

      <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <p style="margin: 0; color: #991b1b;"><strong>Para continuar usando o RadarOne:</strong></p>
        <p style="margin: 10px 0; color: #991b1b;">👉 Escolha um plano e assine agora</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${FRONTEND_URL}/plans"
           style="background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Assinar Agora
        </a>
      </div>

      <p style="color: #6b7280;">Seus monitores e dados estão salvos e aguardando você voltar!</p>

      <p style="color: #6b7280;">Equipe ${EMAIL_FROM_NAME}</p>
    </div>
  `;

  return sendEmail({ to: userEmail, subject, text, html });
}

/**
 * E-mail: plano/assinatura expirada
 */
export async function sendSubscriptionExpiredEmail(
  userEmail: string,
  userName: string,
  planName: string
): Promise<boolean> {
  const subject = `Sua assinatura do plano ${planName} expirou`;

  const text = `
Olá ${userName}!

Sua assinatura do plano ${planName} expirou.

Para reativar seu acesso:
👉 Renove sua assinatura agora

Renovar: ${FRONTEND_URL}/plans

Estamos aguardando você voltar!

Equipe ${EMAIL_FROM_NAME}
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #dc2626; text-align: center;">Assinatura Expirada</h1>

      <p>Olá <strong>${userName}</strong>!</p>

      <p>Sua assinatura do plano <strong>${planName}</strong> expirou.</p>

      <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <p style="margin: 0; color: #991b1b;"><strong>Para reativar seu acesso:</strong></p>
        <p style="margin: 10px 0; color: #991b1b;">👉 Renove sua assinatura agora</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${FRONTEND_URL}/plans"
           style="background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Renovar Assinatura
        </a>
      </div>

      <p style="color: #6b7280;">Estamos aguardando você voltar!</p>

      <p style="color: #6b7280;">Equipe ${EMAIL_FROM_NAME}</p>
    </div>
  `;

  return sendEmail({ to: userEmail, subject, text, html });
}

/**
 * E-mail: novo anúncio encontrado
 */
export async function sendNewListingEmail(
  userEmail: string,
  userName: string,
  monitorName: string,
  listingTitle: string,
  listingPrice: number | undefined,
  listingUrl: string
): Promise<boolean> {
  const priceText = listingPrice ? `R$ ${listingPrice.toFixed(2)}` : 'Não informado';
  const subject = `🔔 Novo anúncio: ${listingTitle}`;

  const text = `
Olá ${userName}!

Novo anúncio encontrado no monitor "${monitorName}":

📝 ${listingTitle}
💰 Preço: ${priceText}

Ver anúncio: ${listingUrl}

Equipe ${EMAIL_FROM_NAME}
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #2563eb; text-align: center;">🔔 Novo Anúncio Encontrado!</h1>

      <p>Olá <strong>${userName}</strong>!</p>

      <p>Novo anúncio encontrado no monitor <strong>"${monitorName}"</strong>:</p>

      <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; border-left: 4px solid #2563eb; margin: 20px 0;">
        <h2 style="margin: 0 0 10px 0; color: #1e40af;">📝 ${listingTitle}</h2>
        <p style="margin: 5px 0; color: #1e40af;"><strong>💰 Preço:</strong> ${priceText}</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${listingUrl}"
           style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Ver Anúncio
        </a>
      </div>

      <p style="color: #6b7280;">Equipe ${EMAIL_FROM_NAME}</p>
    </div>
  `;

  return sendEmail({ to: userEmail, subject, text, html });
}

/**
 * E-mail: link de recuperação de senha
 */
export async function sendPasswordResetEmail(
  userEmail: string,
  userName: string,
  resetToken: string
): Promise<boolean> {
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
  const subject = `Recuperação de senha - ${EMAIL_FROM_NAME}`;

  const text = `
Olá ${userName}!

Recebemos uma solicitação para redefinir a senha da sua conta no ${EMAIL_FROM_NAME}.

Para criar uma nova senha, clique no link abaixo (válido por 30 minutos):

${resetUrl}

Se você não solicitou esta alteração, ignore este e-mail. Sua senha permanecerá a mesma.

Por segurança, nunca compartilhe este link com outras pessoas.

Equipe ${EMAIL_FROM_NAME}
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #2563eb; text-align: center;">🔐 Recuperação de Senha</h1>

      <p>Olá <strong>${userName}</strong>!</p>

      <p>Recebemos uma solicitação para redefinir a senha da sua conta no <strong>${EMAIL_FROM_NAME}</strong>.</p>

      <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0 0 15px 0;"><strong>Para criar uma nova senha:</strong></p>
        <div style="text-align: center;">
          <a href="${resetUrl}"
             style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Redefinir Senha
          </a>
        </div>
        <p style="margin: 15px 0 0 0; color: #6b7280; font-size: 14px;">
          ⏰ <em>Este link é válido por 30 minutos</em>
        </p>
      </div>

      <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #92400e;">
          <strong>⚠️ Não solicitou esta alteração?</strong><br>
          Ignore este e-mail. Sua senha permanecerá a mesma.
        </p>
      </div>

      <p style="color: #6b7280; font-size: 14px;">
        Por segurança, nunca compartilhe este link com outras pessoas.
      </p>

      <p style="color: #6b7280;">Equipe ${EMAIL_FROM_NAME}</p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px;">
        Se o botão não funcionar, copie e cole este link no seu navegador:<br>
        <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
      </p>
    </div>
  `;

  return sendEmail({ to: userEmail, subject, text, html });
}

/**
 * E-mail: confirmação de senha alterada
 */
export async function sendPasswordChangedEmail(
  userEmail: string,
  userName: string
): Promise<boolean> {
  const subject = `Senha alterada com sucesso - ${EMAIL_FROM_NAME}`;

  const text = `
Olá ${userName}!

Sua senha foi alterada com sucesso!

Se você realizou esta alteração, pode ignorar este e-mail.

Se você NÃO alterou sua senha:
⚠️ Entre em contato com nosso suporte IMEDIATAMENTE
⚠️ Sua conta pode ter sido comprometida

Acesse: ${FRONTEND_URL}

Equipe ${EMAIL_FROM_NAME}
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #10b981; text-align: center;">✅ Senha Alterada</h1>

      <p>Olá <strong>${userName}</strong>!</p>

      <div style="background-color: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <p style="margin: 0; color: #065f46;">
          <strong>✅ Sua senha foi alterada com sucesso!</strong>
        </p>
      </div>

      <p>Se você realizou esta alteração, pode ignorar este e-mail.</p>

      <div style="background-color: #fee2e2; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #991b1b;">
          <strong>⚠️ Você NÃO alterou sua senha?</strong><br>
          Entre em contato com nosso suporte IMEDIATAMENTE.<br>
          Sua conta pode ter sido comprometida.
        </p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${FRONTEND_URL}"
           style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Acessar ${EMAIL_FROM_NAME}
        </a>
      </div>

      <p style="color: #6b7280;">Equipe ${EMAIL_FROM_NAME}</p>
    </div>
  `;

  return sendEmail({ to: userEmail, subject, text, html });
}

/**
 * E-mail: relatório mensal de reset de queries
 */
export async function sendMonthlyQueriesResetReport(options: {
  totalUpdated: number;
  runAt: Date;
}): Promise<boolean> {
  const adminEmail = process.env.ADMIN_NOTIFICATIONS_EMAIL || process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || '';

  if (!adminEmail) {
    console.log('[EMAIL] ADMIN_NOTIFICATIONS_EMAIL não configurado. Pulando envio de relatório.');
    return false;
  }

  const { totalUpdated, runAt } = options;
  const runAtFormatted = runAt.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short'
  });

  const subject = `[RadarOne] Reset mensal de queries executado`;

  const text = `
Relatório de Execução - Reset Mensal de Queries

Data/Hora: ${runAtFormatted} (America/Sao_Paulo)
Assinaturas atualizadas: ${totalUpdated}

${totalUpdated === 0 ? '⚠️ Atenção: Nenhuma assinatura ativa foi encontrada no momento da execução.' : '✅ Reset executado com sucesso!'}

O contador de queries (queriesUsed) foi zerado para todas as assinaturas com status ACTIVE.

--
Este é um e-mail automático do sistema de jobs do RadarOne.
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #2563eb; text-align: center;">📊 Reset Mensal de Queries</h1>

      <div style="background-color: ${totalUpdated > 0 ? '#d1fae5' : '#fef3c7'}; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h2 style="margin: 0 0 10px 0; color: ${totalUpdated > 0 ? '#065f46' : '#92400e'};">
          ${totalUpdated > 0 ? '✅' : '⚠️'} Execução Concluída
        </h2>
        <p style="margin: 5px 0; color: #374151;"><strong>Data/Hora:</strong> ${runAtFormatted}</p>
        <p style="margin: 5px 0; color: #374151;"><strong>Assinaturas atualizadas:</strong> ${totalUpdated}</p>
      </div>

      ${totalUpdated === 0 ? `
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e;">
            <strong>⚠️ Atenção:</strong> Nenhuma assinatura ativa foi encontrada no momento da execução.
          </p>
        </div>
      ` : `
        <div style="background-color: #d1fae5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #065f46;">
            <strong>✅ Reset executado com sucesso!</strong><br>
            O contador de queries foi zerado para todas as assinaturas ativas.
          </p>
        </div>
      `}

      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">
          <strong>Detalhes técnicos:</strong><br>
          • Tabela: <code>subscriptions</code><br>
          • Campo resetado: <code>queriesUsed → 0</code><br>
          • Filtro: <code>status = 'ACTIVE'</code><br>
          • Job: <code>resetMonthlyQueries</code><br>
          • Frequência: Todo dia 1 às 3h (America/Sao_Paulo)
        </p>
      </div>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        Este é um e-mail automático do sistema de jobs do RadarOne.
      </p>
    </div>
  `;

  return sendEmail({ to: adminEmail, subject, text, html });
}

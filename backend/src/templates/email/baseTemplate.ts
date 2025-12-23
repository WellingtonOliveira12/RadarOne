/**
 * Template base para e-mails do RadarOne
 */

export interface BaseEmailTemplate {
  title: string;
  preheader?: string;
  content: string;
  buttonText?: string;
  buttonUrl?: string;
}

export function renderBaseEmailTemplate(data: BaseEmailTemplate): string {
  const { title, preheader, content, buttonText, buttonUrl } = data;

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${preheader ? `<meta name="description" content="${preheader}">` : ''}
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
      padding: 32px 24px;
      text-align: center;
    }
    .logo {
      font-size: 28px;
      font-weight: bold;
      color: #ffffff;
      margin: 0;
    }
    .content {
      padding: 32px 24px;
      color: #1f2937;
      line-height: 1.6;
    }
    .content h1 {
      color: #1f2937;
      font-size: 24px;
      margin-top: 0;
    }
    .content p {
      margin: 16px 0;
    }
    .button {
      display: inline-block;
      background-color: #3b82f6;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 32px;
      border-radius: 6px;
      font-weight: 600;
      margin: 24px 0;
    }
    .footer {
      background-color: #f9fafb;
      padding: 24px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
      border-top: 1px solid #e5e7eb;
    }
    .footer a {
      color: #3b82f6;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="logo">🔔 RadarOne</h1>
    </div>
    <div class="content">
      <h1>${title}</h1>
      ${content}
      ${buttonText && buttonUrl ? `
        <div style="text-align: center;">
          <a href="${buttonUrl}" class="button">${buttonText}</a>
        </div>
      ` : ''}
    </div>
    <div class="footer">
      <p>
        Este e-mail foi enviado automaticamente pelo RadarOne.<br>
        <a href="${process.env.FRONTEND_URL || 'https://radarone.com.br'}/settings/notifications">Gerenciar preferências de notificação</a>
      </p>
      <p>
        RadarOne - Sistema de Monitoramento de Anúncios<br>
        <a href="${process.env.FRONTEND_URL || 'https://radarone.com.br'}">radarone.com.br</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Template para e-mail de teste
 */
export function renderTestEmailTemplate(userName: string): string {
  return renderBaseEmailTemplate({
    title: 'Teste de Notificação',
    preheader: 'Seu e-mail está configurado corretamente',
    content: `
      <p>Olá, ${userName}!</p>
      <p>Este é um e-mail de teste para confirmar que sua configuração de notificações está funcionando corretamente.</p>
      <p>Você receberá alertas sobre novos anúncios encontrados pelos seus monitores diretamente neste e-mail.</p>
      <p><strong>Próximos passos:</strong></p>
      <ul>
        <li>Configure seus monitores de anúncios</li>
        <li>Defina os filtros de busca</li>
        <li>Aguarde as notificações automáticas</li>
      </ul>
    `,
    buttonText: 'Acessar Painel',
    buttonUrl: `${process.env.FRONTEND_URL || 'https://radarone.com.br'}/dashboard`
  });
}

/**
 * Template para notificação de novo anúncio
 */
export function renderNewAdEmailTemplate(data: {
  userName: string;
  monitorName: string;
  adTitle: string;
  adUrl: string;
  adPrice?: string;
  adLocation?: string;
}): string {
  const { userName, monitorName, adTitle, adUrl, adPrice, adLocation } = data;

  return renderBaseEmailTemplate({
    title: '🚨 Novo anúncio encontrado!',
    preheader: `${adTitle} - ${monitorName}`,
    content: `
      <p>Olá, ${userName}!</p>
      <p>Seu monitor <strong>"${monitorName}"</strong> encontrou um novo anúncio que pode te interessar:</p>
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1f2937;">${adTitle}</h3>
        ${adPrice ? `<p style="font-size: 20px; font-weight: bold; color: #10b981; margin: 8px 0;">R$ ${adPrice}</p>` : ''}
        ${adLocation ? `<p style="color: #6b7280; margin: 8px 0;">📍 ${adLocation}</p>` : ''}
      </div>
      <p>Clique no botão abaixo para ver os detalhes completos do anúncio:</p>
    `,
    buttonText: 'Ver Anúncio',
    buttonUrl: adUrl
  });
}

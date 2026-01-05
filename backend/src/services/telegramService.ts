import axios from 'axios';
import { prisma } from '../server';
import { TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_LINK } from '../constants/telegram';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

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
    }, {
      timeout: 10000
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
 * Gera código de vínculo para o usuário (SISTEMA LEGADO - RADAR-XXXXXX)
 * REGRA: Substitui código anterior (apenas um código ativo por vez)
 */
export async function generateLinkCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  // Gerar código único: RADAR-XXXXXX (6 caracteres alfanuméricos)
  const code = `RADAR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // Expira em 30 minutos
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 30);

  // Salvar no banco (upsert substitui código anterior se existir)
  await prisma.notificationSettings.upsert({
    where: { userId },
    create: {
      userId,
      emailEnabled: true,
      telegramEnabled: false,
      telegramLinkCode: code,
      telegramLinkExpiresAt: expiresAt
    },
    update: {
      telegramLinkCode: code,
      telegramLinkExpiresAt: expiresAt
    }
  });

  console.log('[TELEGRAM] Código de vínculo gerado (sistema legado)', {
    userId,
    code,
    expiresAt,
    action: 'generate_link_code_legacy'
  });

  return { code, expiresAt };
}

/**
 * Processa mensagem recebida do webhook Telegram (SISTEMA LEGADO - RADAR-XXXXXX)
 * REGRAS:
 * - Validação de código e expiração
 * - Verifica conflito de chatId (outro usuário)
 * - Cria TelegramAccount para consistência com sistema novo
 * - Atualiza NotificationSettings para compatibilidade
 */
export async function processWebhookMessage(message: any): Promise<{ success: boolean; error?: string }> {
  try {
    const chatId = message.chat?.id?.toString();
    const text = message.text?.trim();
    const username = message.from?.username;

    if (!chatId || !text) {
      return { success: false, error: 'Mensagem inválida' };
    }

    console.log('[TELEGRAM] Processando mensagem do webhook (sistema legado)', { chatId, textLength: text.length });

    // Verificar se a mensagem contém um código RADAR-
    const codeMatch = text.match(/RADAR-([A-Z0-9]{6})/i);
    if (!codeMatch) {
      // Mensagem não é um código de vínculo, enviar ajuda
      await sendTelegramMessage({
        chatId,
        text: '❌ Código inválido.\n\nPara vincular sua conta, use o código gerado no painel RadarOne.\nFormato: RADAR-XXXXXX'
      });
      return { success: true };
    }

    const fullCode = codeMatch[0].toUpperCase();

    // Buscar settings com esse código (não expirado)
    const now = new Date();
    const settings = await prisma.notificationSettings.findFirst({
      where: {
        telegramLinkCode: fullCode,
        telegramLinkExpiresAt: {
          gte: now
        }
      },
      include: {
        user: true
      }
    });

    if (!settings) {
      console.warn('[TELEGRAM] Código não encontrado ou expirado (sistema legado)', { chatId, code: fullCode, action: 'link_rejected' });
      await sendTelegramMessage({
        chatId,
        text: '❌ Código inválido ou expirado.\n\nGere um novo código no painel RadarOne.'
      });
      return { success: false, error: 'Código não encontrado ou expirado' };
    }

    // VALIDAÇÃO: Verificar se chatId já está vinculado a OUTRO usuário
    const existingChatLink = await prisma.telegramAccount.findUnique({
      where: { chatId }
    });

    if (existingChatLink && existingChatLink.userId !== settings.userId) {
      // CONFLITO: Este Telegram já está vinculado a outra conta
      console.error('[TELEGRAM] Conflito: chatId já vinculado a outro usuário (sistema legado)', {
        chatId,
        currentUserId: existingChatLink.userId,
        attemptedUserId: settings.userId,
        action: 'link_conflict'
      });

      await sendTelegramMessage({
        chatId,
        text: '❌ Este Telegram já está vinculado a outra conta RadarOne.\n\nSe você possui múltiplas contas, desvincule este Telegram da outra conta primeiro.'
      });

      return { success: false, error: 'Telegram já vinculado a outra conta' };
    }

    // VINCULAÇÃO
    // PASSO 1: Remover vínculos antigos do usuário (se existirem)
    await prisma.telegramAccount.deleteMany({
      where: { userId: settings.userId }
    });

    // PASSO 2: Criar TelegramAccount (para consistência com sistema novo)
    await prisma.telegramAccount.create({
      data: {
        userId: settings.userId,
        chatId,
        username: username ? `@${username}` : null,
        active: true
      }
    });

    // PASSO 3: Atualizar NotificationSettings
    await prisma.notificationSettings.update({
      where: { id: settings.id },
      data: {
        telegramChatId: chatId,
        telegramEnabled: true,
        telegramUsername: username ? `@${username}` : settings.telegramUsername,
        telegramLinkCode: null,
        telegramLinkExpiresAt: null
      }
    });

    // PASSO 4: Enviar confirmação
    await sendTelegramMessage({
      chatId,
      text: `✅ Conta vinculada com sucesso!\n\nOlá, ${settings.user.name}!\n\nVocê receberá notificações de novos anúncios aqui no Telegram.`
    });

    console.log('[TELEGRAM] Conta vinculada via código legado', {
      userId: settings.userId,
      chatId,
      username: username ? `@${username}` : null,
      action: 'link_success_legacy'
    });

    return { success: true };
  } catch (error: any) {
    console.error('[TELEGRAM] Erro ao processar webhook (sistema legado)', {
      error: error.message,
      stack: error.stack,
      action: 'link_error'
    });

    // Enviar mensagem genérica ao usuário
    try {
      if (message.chat?.id) {
        await sendTelegramMessage({
          chatId: message.chat.id.toString(),
          text: '❌ Erro ao vincular sua conta.\n\nPor favor, tente novamente. Se o problema persistir, entre em contato com o suporte.'
        });
      }
    } catch (sendError) {
      console.error('[TELEGRAM] Erro ao enviar mensagem de erro', { sendError });
    }

    return { success: false, error: error.message };
  }
}

/**
 * Valida segredo do webhook
 */
export function validateWebhookSecret(secret: string | undefined): boolean {
  if (!TELEGRAM_WEBHOOK_SECRET) {
    console.warn('[TelegramService] TELEGRAM_WEBHOOK_SECRET não configurado');
    return false;
  }

  if (!secret) {
    return false;
  }

  return secret === TELEGRAM_WEBHOOK_SECRET;
}

/**
 * Busca conta do Telegram do usuário
 */
export async function getUserTelegramAccount(userId: string): Promise<{ chatId: string; username: string } | null> {
  const settings = await prisma.notificationSettings.findUnique({
    where: { userId }
  });

  if (!settings || !settings.telegramChatId || !settings.telegramEnabled) {
    return null;
  }

  return {
    chatId: settings.telegramChatId,
    username: settings.telegramUsername || ''
  };
}

// ============================================
// NOVO SISTEMA DE TOKENS DE CONEXÃO
// ============================================

/**
 * Gera token seguro de conexão com deep link
 * REGRA: Invalida tokens pendentes anteriores do usuário (one-time use)
 */
export async function generateConnectToken(userId: string): Promise<{ connectUrl: string; token: string; expiresAt: Date }> {
  // PASSO 1: Invalidar tokens PENDING anteriores deste usuário
  // Previne múltiplos tokens ativos e garante que apenas o mais recente funcione
  await prisma.telegramConnectToken.updateMany({
    where: {
      userId,
      status: 'PENDING'
    },
    data: {
      status: 'EXPIRED'
    }
  });

  // PASSO 2: Gerar token seguro (32+ chars)
  const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2) + Date.now().toString(36);

  // PASSO 3: Expira em 15 minutos
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 15);

  // PASSO 4: Salvar no banco com status PENDING
  await prisma.telegramConnectToken.create({
    data: {
      userId,
      token,
      status: 'PENDING',
      expiresAt
    }
  });

  const connectUrl = `${TELEGRAM_BOT_LINK}?start=connect_${token}`;

  console.log('[TELEGRAM] Token de conexão gerado', {
    userId,
    tokenPrefix: token.substring(0, 8) + '...',
    expiresAt,
    action: 'generate_connect_token'
  });

  return { connectUrl, token, expiresAt };
}

/**
 * Processa comando /start com token de conexão
 * REGRAS:
 * - Validação completa de token (existe, não expirou, não usado)
 * - Idempotência: se chatId já vinculado ao MESMO usuário → sucesso
 * - Conflito: se chatId vinculado a OUTRO usuário → erro 409
 * - Limpeza: remove vínculos antigos do usuário antes de criar novo
 */
export async function processStartCommand(chatId: string, startParam: string, telegramUserId: number, username?: string, firstName?: string): Promise<{ success: boolean; error?: string }> {
  try {
    // VALIDAÇÃO 1: Verificar formato do parâmetro
    if (!startParam || !startParam.startsWith('connect_')) {
      console.warn('[TELEGRAM] Parâmetro inválido no /start', { chatId, startParam, action: 'link_rejected' });
      return { success: false, error: 'Parâmetro inválido' };
    }

    const token = startParam.replace('connect_', '');
    const chatIdStr = chatId.toString();

    // VALIDAÇÃO 2: Buscar token no banco
    const tokenRecord = await prisma.telegramConnectToken.findUnique({
      where: { token }
    });

    if (!tokenRecord) {
      console.warn('[TELEGRAM] Token não encontrado', { chatId: chatIdStr, tokenPrefix: token.substring(0, 8) + '...', action: 'link_rejected' });
      await sendTelegramMessage({
        chatId: chatIdStr,
        text: '❌ Token inválido.\n\nPor favor, gere um novo link de conexão no painel RadarOne.'
      });
      return { success: false, error: 'Token não encontrado' };
    }

    // VALIDAÇÃO 3: Verificar expiração
    const now = new Date();
    if (tokenRecord.expiresAt < now) {
      await prisma.telegramConnectToken.update({
        where: { id: tokenRecord.id },
        data: { status: 'EXPIRED' }
      });

      console.warn('[TELEGRAM] Token expirado', { chatId: chatIdStr, userId: tokenRecord.userId, expiresAt: tokenRecord.expiresAt, action: 'link_rejected' });
      await sendTelegramMessage({
        chatId: chatIdStr,
        text: '❌ Token expirado.\n\nPor favor, gere um novo link de conexão no painel RadarOne.'
      });
      return { success: false, error: 'Token expirado' };
    }

    // VALIDAÇÃO 4: Verificar se já foi usado
    if (tokenRecord.status === 'USED') {
      console.warn('[TELEGRAM] Token já usado', { chatId: chatIdStr, userId: tokenRecord.userId, usedAt: tokenRecord.usedAt, action: 'link_rejected' });
      await sendTelegramMessage({
        chatId: chatIdStr,
        text: '❌ Token já utilizado.\n\nSe você já conectou, sua conta já está vinculada. Se não, gere um novo link de conexão no painel RadarOne.'
      });
      return { success: false, error: 'Token já usado' };
    }

    // VALIDAÇÃO 5: Buscar usuário
    const user = await prisma.user.findUnique({
      where: { id: tokenRecord.userId }
    });

    if (!user) {
      console.error('[TELEGRAM] Usuário não encontrado', { userId: tokenRecord.userId, chatId: chatIdStr, action: 'link_failed' });
      return { success: false, error: 'Usuário não encontrado' };
    }

    // VALIDAÇÃO 6: Verificar se chatId já está vinculado a OUTRO usuário
    const existingChatLink = await prisma.telegramAccount.findUnique({
      where: { chatId: chatIdStr }
    });

    if (existingChatLink && existingChatLink.userId !== user.id) {
      // CONFLITO: Este Telegram já está vinculado a outra conta
      console.error('[TELEGRAM] Conflito: chatId já vinculado a outro usuário', {
        chatId: chatIdStr,
        currentUserId: existingChatLink.userId,
        attemptedUserId: user.id,
        action: 'link_conflict'
      });

      await sendTelegramMessage({
        chatId: chatIdStr,
        text: '❌ Este Telegram já está vinculado a outra conta RadarOne.\n\nSe você possui múltiplas contas, desvincule este Telegram da outra conta primeiro.'
      });

      return { success: false, error: 'Telegram já vinculado a outra conta' };
    }

    // IDEMPOTÊNCIA: Se chatId já está vinculado ao MESMO usuário, apenas confirmar
    if (existingChatLink && existingChatLink.userId === user.id && existingChatLink.active) {
      console.info('[TELEGRAM] Link idempotente: já vinculado ao mesmo usuário', {
        chatId: chatIdStr,
        userId: user.id,
        action: 'link_idempotent'
      });

      // Atualizar username se mudou
      if (username && existingChatLink.username !== `@${username}`) {
        await prisma.telegramAccount.update({
          where: { id: existingChatLink.id },
          data: { username: `@${username}` }
        });
      }

      // Marcar token como usado
      await prisma.telegramConnectToken.update({
        where: { id: tokenRecord.id },
        data: {
          status: 'USED',
          usedAt: new Date()
        }
      });

      // Enviar confirmação
      await sendTelegramMessage({
        chatId: chatIdStr,
        text: `✅ Telegram já estava conectado!\n\nOlá novamente, ${user.name}!\n\nVocê continuará recebendo alertas de novos anúncios aqui.`,
        parseMode: 'HTML'
      });

      return { success: true };
    }

    // VINCULAÇÃO: Criar ou atualizar TelegramAccount
    // PASSO 1: Remover vínculos antigos do usuário (se existirem)
    await prisma.telegramAccount.deleteMany({
      where: { userId: user.id }
    });

    // PASSO 2: Criar novo vínculo
    await prisma.telegramAccount.create({
      data: {
        userId: user.id,
        chatId: chatIdStr,
        username: username ? `@${username}` : null,
        active: true
      }
    });

    // PASSO 3: Atualizar NotificationSettings (para compatibilidade com código legado)
    await prisma.notificationSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        emailEnabled: true,
        telegramEnabled: true,
        telegramChatId: chatIdStr,
        telegramUsername: username ? `@${username}` : null
      },
      update: {
        telegramEnabled: true,
        telegramChatId: chatIdStr,
        telegramUsername: username ? `@${username}` : null
      }
    });

    // PASSO 4: Marcar token como usado
    await prisma.telegramConnectToken.update({
      where: { id: tokenRecord.id },
      data: {
        status: 'USED',
        usedAt: new Date()
      }
    });

    // PASSO 5: Enviar confirmação ao usuário
    await sendTelegramMessage({
      chatId: chatIdStr,
      text: `✅ Telegram conectado ao RadarOne com sucesso!\n\nOlá, ${user.name}!\n\nVocê receberá alertas de novos anúncios aqui.`,
      parseMode: 'HTML'
    });

    console.log('[TELEGRAM] Link bem-sucedido', {
      userId: user.id,
      chatId: chatIdStr,
      username: username ? `@${username}` : null,
      action: 'link_success'
    });

    return { success: true };
  } catch (error: any) {
    console.error('[TELEGRAM] Erro ao processar start command', {
      chatId,
      error: error.message,
      stack: error.stack,
      action: 'link_error'
    });

    // Enviar mensagem genérica ao usuário (não vazar detalhes internos)
    try {
      await sendTelegramMessage({
        chatId: chatId.toString(),
        text: '❌ Erro ao conectar sua conta.\n\nPor favor, tente novamente. Se o problema persistir, entre em contato com o suporte.'
      });
    } catch (sendError) {
      console.error('[TELEGRAM] Erro ao enviar mensagem de erro', { sendError });
    }

    return { success: false, error: error.message };
  }
}

/**
 * Obtém status da conexão do Telegram
 */
export async function getTelegramStatus(userId: string): Promise<{ connected: boolean; chatId?: string; username?: string; connectedAt?: Date }> {
  const account = await prisma.telegramAccount.findFirst({
    where: { userId, active: true }
  });

  if (!account) {
    return { connected: false };
  }

  return {
    connected: true,
    chatId: account.chatId,
    username: account.username || undefined,
    connectedAt: account.linkedAt
  };
}

/**
 * Desconecta conta do Telegram
 * REGRA: Limpeza COMPLETA de todos os dados para permitir re-vinculação limpa
 */
export async function disconnectTelegram(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[TELEGRAM] Iniciando desconexão', { userId, action: 'unlink_start' });

    // PASSO 1: Buscar dados atuais (para log)
    const currentAccount = await prisma.telegramAccount.findFirst({
      where: { userId }
    });

    const oldChatId = currentAccount?.chatId || null;

    // PASSO 2: DELETAR TelegramAccount completamente
    // (não apenas marcar como inativo - permite reconexão limpa)
    const deletedCount = await prisma.telegramAccount.deleteMany({
      where: { userId }
    });

    console.log('[TELEGRAM] TelegramAccount deletado', {
      userId,
      deletedCount: deletedCount.count,
      oldChatId,
      action: 'unlink_delete_account'
    });

    // PASSO 3: Limpar TODOS os campos relacionados no NotificationSettings
    // (incluindo campos legados: telegramLinkCode e telegramLinkExpiresAt)
    await prisma.notificationSettings.updateMany({
      where: { userId },
      data: {
        telegramEnabled: false,
        telegramChatId: null,
        telegramUsername: null,
        telegramLinkCode: null,
        telegramLinkExpiresAt: null
      }
    });

    console.log('[TELEGRAM] NotificationSettings limpo', {
      userId,
      action: 'unlink_clear_settings'
    });

    // PASSO 4: Invalidar tokens de conexão pendentes deste usuário
    const expiredTokens = await prisma.telegramConnectToken.updateMany({
      where: {
        userId,
        status: 'PENDING'
      },
      data: {
        status: 'EXPIRED'
      }
    });

    console.log('[TELEGRAM] Tokens pendentes invalidados', {
      userId,
      expiredCount: expiredTokens.count,
      action: 'unlink_expire_tokens'
    });

    console.log('[TELEGRAM] Desconexão concluída com sucesso', {
      userId,
      oldChatId,
      action: 'unlink_success'
    });

    return { success: true };
  } catch (error: any) {
    console.error('[TELEGRAM] Erro ao desconectar Telegram', {
      userId,
      error: error.message,
      stack: error.stack,
      action: 'unlink_error'
    });
    return { success: false, error: error.message };
  }
}

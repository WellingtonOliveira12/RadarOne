import { prisma } from '../lib/prisma';
import { TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_LINK } from '../constants/telegram';
import { logInfo, logError, logWarning } from '../utils/loggerHelpers';
import { sendTelegramMessage } from './telegram-client';

/**
 * Gera código de vínculo legado (RADAR-XXXXXX)
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

  logInfo('[TELEGRAM] Código de vínculo gerado (sistema legado)', {
    userId,
    code,
    expiresAt,
    action: 'generate_link_code_legacy'
  });

  return { code, expiresAt };
}

/**
 * Obtém chatId para um usuário (TelegramAccount primeiro, fallback NotificationSettings)
 */
export async function getChatIdForUser(userId: string): Promise<string | null> {
  // PASSO 1: Tentar TelegramAccount primeiro (fonte canônica)
  const account = await prisma.telegramAccount.findFirst({
    where: { userId, active: true }
  });

  if (account?.chatId) {
    logInfo('[TelegramService.getChatIdForUser] ChatId encontrado em TelegramAccount', {
      userId,
      chatId: account.chatId,
      source: 'TelegramAccount'
    });
    return account.chatId;
  }

  // PASSO 2: Fallback para NotificationSettings (compatibilidade/migração)
  const settings = await prisma.notificationSettings.findUnique({
    where: { userId }
  });

  if (settings?.telegramChatId && settings.telegramEnabled) {
    logInfo('[TelegramService.getChatIdForUser] ChatId encontrado em NotificationSettings, migrando...', {
      userId,
      chatId: settings.telegramChatId,
      source: 'NotificationSettings',
      action: 'migrate_to_telegram_account'
    });

    // SYNC: Criar TelegramAccount para consistência
    try {
      await prisma.telegramAccount.create({
        data: {
          userId,
          chatId: settings.telegramChatId,
          username: settings.telegramUsername,
          active: true
        }
      });

      logInfo('[TelegramService.getChatIdForUser] Migração completa', {
        userId,
        chatId: settings.telegramChatId,
        action: 'migration_success'
      });
    } catch (error: any) {
      // Se já existir (race condition), ignorar
      if (error.code === 'P2002') {
        logInfo('[TelegramService.getChatIdForUser] TelegramAccount já existe (race condition)', {
          userId,
          chatId: settings.telegramChatId
        });
      } else {
        logError('[TelegramService.getChatIdForUser] Erro ao migrar', {
          userId,
          error: error.message
        });
      }
    }

    return settings.telegramChatId;
  }

  logInfo('[TelegramService.getChatIdForUser] ChatId não encontrado', {
    userId,
    hasAccount: !!account,
    hasSettings: !!settings,
    settingsEnabled: settings?.telegramEnabled || false
  });

  return null;
}

/**
 * Busca conta do Telegram do usuário (LEGADO - usa NotificationSettings)
 * DEPRECATED: Use getChatIdForUser() para obter apenas chatId
 */
export async function getUserTelegramAccount(userId: string): Promise<{ chatId: string; username: string } | null> {
  const chatId = await getChatIdForUser(userId);

  if (!chatId) {
    return null;
  }

  // Buscar username de TelegramAccount ou NotificationSettings
  const account = await prisma.telegramAccount.findFirst({
    where: { userId, active: true }
  });

  if (account) {
    return {
      chatId: account.chatId,
      username: account.username || ''
    };
  }

  const settings = await prisma.notificationSettings.findUnique({
    where: { userId }
  });

  return {
    chatId,
    username: settings?.telegramUsername || ''
  };
}

/**
 * Gera token de conexão seguro para vincular Telegram via deep link
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

  logInfo('[TELEGRAM] Token de conexão gerado', {
    action: 'generate_connect_token',
    userId,
    tokenPrefix: token.substring(0, 8) + '...',
    expiresAt,
    expiresInMinutes: 15,
    timestamp: new Date().toISOString()
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
      logWarning('[TELEGRAM] Parâmetro inválido no /start', {
        action: 'link_rejected',
        reason: 'invalid_start_param',
        chatId,
        startParam,
        timestamp: new Date().toISOString()
      });
      return { success: false, error: 'Parâmetro inválido' };
    }

    const token = startParam.replace('connect_', '');
    const chatIdStr = chatId.toString();

    // VALIDAÇÃO 2: Buscar token no banco
    const tokenRecord = await prisma.telegramConnectToken.findUnique({
      where: { token }
    });

    if (!tokenRecord) {
      logWarning('[TELEGRAM] Token não encontrado', {
        action: 'link_rejected',
        reason: 'token_not_found',
        chatId: chatIdStr,
        tokenPrefix: token.substring(0, 8) + '...',
        timestamp: new Date().toISOString()
      });
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

      logWarning('[TELEGRAM] Token expirado', { chatId: chatIdStr, userId: tokenRecord.userId, expiresAt: tokenRecord.expiresAt, action: 'link_rejected' });
      await sendTelegramMessage({
        chatId: chatIdStr,
        text: '❌ Token expirado.\n\nPor favor, gere um novo link de conexão no painel RadarOne.'
      });
      return { success: false, error: 'Token expirado' };
    }

    // VALIDAÇÃO 4: Verificar se já foi usado
    if (tokenRecord.status === 'USED') {
      logWarning('[TELEGRAM] Token já usado', { chatId: chatIdStr, userId: tokenRecord.userId, usedAt: tokenRecord.usedAt, action: 'link_rejected' });
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
      logError('[TELEGRAM] Usuário não encontrado', { userId: tokenRecord.userId, chatId: chatIdStr, action: 'link_failed' });
      return { success: false, error: 'Usuário não encontrado' };
    }

    // VALIDAÇÃO 6: Verificar se chatId já está vinculado a OUTRO usuário
    const existingChatLink = await prisma.telegramAccount.findUnique({
      where: { chatId: chatIdStr }
    });

    if (existingChatLink && existingChatLink.userId !== user.id) {
      // CONFLITO: Este Telegram já está vinculado a outra conta
      logError('[TELEGRAM] Conflito: chatId já vinculado a outro usuário', {
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
    const sendResult = await sendTelegramMessage({
      chatId: chatIdStr,
      text: `✅ Telegram conectado ao RadarOne com sucesso!\n\nOlá, ${user.name}!\n\nVocê receberá alertas de novos anúncios aqui.`,
      parseMode: 'HTML'
    });

    // ✅ VALIDAR se mensagem foi enviada
    if (!sendResult.success) {
      logError('[TELEGRAM] CRÍTICO: Vínculo criado no DB mas mensagem de confirmação FALHOU', {
        userId: user.id,
        chatId: chatIdStr,
        username: username ? `@${username}` : null,
        sendError: sendResult.error,
        action: 'link_success_but_message_failed'
      });
      // ⚠️ Mesmo assim retornar sucesso pois o vínculo foi criado no DB
    } else {
      logInfo('[TELEGRAM] Mensagem de confirmação enviada com sucesso', {
        userId: user.id,
        chatId: chatIdStr,
        messageId: sendResult.messageId,
        action: 'confirmation_sent'
      });
    }

    logInfo('[TELEGRAM] Link bem-sucedido', {
      action: 'link_success',
      userId: user.id,
      chatId: chatIdStr,
      username: username ? `@${username}` : null,
      confirmationSent: sendResult.success,
      tokenUsed: true,
      timestamp: new Date().toISOString()
    });

    return { success: true };
  } catch (error: any) {
    logError('[TELEGRAM] Erro ao processar start command', {
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
      logError('[TELEGRAM] Erro ao enviar mensagem de erro', { sendError });
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
 * Desconecta Telegram do usuário
 * - Deleta TelegramAccount (permite reconexão limpa)
 * - Limpa NotificationSettings (campos legados inclusos)
 * - Invalida tokens pendentes
 */
export async function disconnectTelegram(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    logInfo('[TELEGRAM] Iniciando desconexão', { userId, action: 'unlink_start' });

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

    logInfo('[TELEGRAM] TelegramAccount deletado', {
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

    logInfo('[TELEGRAM] NotificationSettings limpo', {
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

    logInfo('[TELEGRAM] Tokens pendentes invalidados', {
      userId,
      expiredCount: expiredTokens.count,
      action: 'unlink_expire_tokens'
    });

    logInfo('[TELEGRAM] Desconexão concluída com sucesso', {
      userId,
      oldChatId,
      action: 'unlink_success'
    });

    return { success: true };
  } catch (error: any) {
    logError('[TELEGRAM] Erro ao desconectar Telegram', {
      userId,
      error: error.message,
      stack: error.stack,
      action: 'unlink_error'
    });
    return { success: false, error: error.message };
  }
}

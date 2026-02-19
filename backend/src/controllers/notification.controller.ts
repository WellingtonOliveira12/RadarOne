import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { generateLinkCode, sendTelegramMessage, getChatIdForUser } from '../services/telegramService';
import { sendWelcomeEmail } from '../services/emailService';
import { TELEGRAM_BOT_USERNAME } from '../constants/telegram';
import { logInfo, logError } from '../utils/loggerHelpers';

/**
 * Controller de Configurações de Notificações
 */
export class NotificationController {
  /**
   * Retorna as configurações de notificação do usuário
   * GET /api/notifications/settings
   */
  static async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      logInfo('Buscando configurações de notificação', { userId });

      // Buscar ou criar configurações
      let settings = await prisma.notificationSettings.findUnique({
        where: { userId }
      });

      // Se não existir, criar com padrões
      if (!settings) {
        logInfo('Criando configurações padrão de notificação', { userId });

        settings = await prisma.notificationSettings.create({
          data: {
            userId,
            emailEnabled: true,
            telegramEnabled: false,
            telegramUsername: null,
            telegramChatId: null
          }
        });
      }

      res.json({
        emailEnabled: settings.emailEnabled,
        telegramEnabled: settings.telegramEnabled,
        telegramUsername: settings.telegramUsername,
        telegramChatId: settings.telegramChatId ? 'linked' : null, // Não expor chatId real
        updatedAt: settings.updatedAt
      });
    } catch (error: any) {
      logError('Erro ao buscar configurações de notificação', { err: error });
      res.status(500).json({
        error: 'Erro ao buscar configurações de notificação',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Atualiza as configurações de notificação do usuário
   * PUT /api/notifications/settings
   */
  static async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { telegramUsername, emailEnabled, telegramEnabled: rawTelegramEnabled } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const newEmailEnabled = emailEnabled !== undefined ? Boolean(emailEnabled) : true;
      const newTelegramEnabled = rawTelegramEnabled !== undefined ? Boolean(rawTelegramEnabled) : false;

      logInfo('Atualizando configurações de notificação', {
        userId, telegramUsername, emailEnabled: newEmailEnabled, telegramEnabled: newTelegramEnabled,
      });

      // Validação server-side: ao menos 1 canal deve estar ativo
      if (!newEmailEnabled && !newTelegramEnabled) {
        res.status(400).json({
          error: 'Pelo menos 1 canal de notificação deve estar ativo',
          message: 'Ative e-mail ou Telegram antes de salvar.',
        });
        return;
      }

      // Validar e normalizar telegram username (se fornecido)
      let normalizedUsername: string | null | undefined = undefined; // undefined = não alterar
      if (telegramUsername !== undefined) {
        if (telegramUsername && typeof telegramUsername === 'string' && telegramUsername.trim()) {
          normalizedUsername = telegramUsername.trim();
          if (!normalizedUsername.startsWith('@')) {
            normalizedUsername = `@${normalizedUsername}`;
          }

          const telegramRegex = /^@[a-zA-Z0-9_]{5,32}$/;
          if (!telegramRegex.test(normalizedUsername)) {
            res.status(400).json({
              error: 'Telegram username inválido',
              message: 'O username deve ter entre 5 e 32 caracteres (letras, números e underscore)'
            });
            return;
          }
          logInfo('Telegram username validado', { normalizedUsername });
        } else {
          normalizedUsername = null;
        }
      }

      // Buscar configurações existentes
      let settings = await prisma.notificationSettings.findUnique({
        where: { userId }
      });

      // Dados para update — NÃO limpar chatId/username ao desativar (apenas pausar)
      const updateData: any = {
        emailEnabled: newEmailEnabled,
        telegramEnabled: newTelegramEnabled,
      };
      if (normalizedUsername !== undefined) {
        updateData.telegramUsername = normalizedUsername;
      }

      if (settings) {
        settings = await prisma.notificationSettings.update({
          where: { userId },
          data: updateData,
        });
      } else {
        settings = await prisma.notificationSettings.create({
          data: {
            userId,
            emailEnabled: newEmailEnabled,
            telegramEnabled: newTelegramEnabled,
            telegramUsername: normalizedUsername ?? null,
            telegramChatId: null,
          },
        });
      }

      logInfo('Configurações de notificação atualizadas', { userId, telegramEnabled: newTelegramEnabled });

      res.json({
        message: 'Configurações atualizadas com sucesso',
        emailEnabled: settings.emailEnabled,
        telegramEnabled: settings.telegramEnabled,
        telegramUsername: settings.telegramUsername,
        telegramChatId: settings.telegramChatId ? 'linked' : null,
        updatedAt: settings.updatedAt
      });
    } catch (error: any) {
      logError('Erro ao atualizar configurações de notificação', { err: error });
      res.status(500).json({
        error: 'Erro ao atualizar configurações de notificação',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Endpoint de teste para enviar email
   * POST /api/notifications/test-email
   */
  static async testEmail(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      logInfo('Enviando email de teste', { to: user.email });

      // Enviar email de teste real
      const result = await sendWelcomeEmail(user.email, user.name);

      if (result.success) {
        res.json({
          message: 'Email de teste enviado com sucesso!',
          to: user.email,
          service: 'Resend'
        });
      } else {
        res.status(500).json({
          error: 'Erro ao enviar email de teste',
          message: result.error
        });
      }
    } catch (error: any) {
      logError('Erro ao enviar email de teste', { err: error });
      res.status(500).json({
        error: 'Erro ao enviar email de teste',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Gera código de vínculo para Telegram
   * POST /api/notifications/telegram/link-code
   */
  static async generateTelegramLinkCode(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      logInfo('Gerando código de vínculo Telegram', { userId });

      const { code, expiresAt } = await generateLinkCode(userId);

      const botUsername = TELEGRAM_BOT_USERNAME;

      res.json({
        code,
        expiresAt,
        botUsername: `@${botUsername}`,
        instructions: [
          `1. Abra o Telegram e procure por @${botUsername}`,
          `2. Envie a mensagem: ${code}`,
          `3. Aguarde a confirmação`,
          `4. Pronto! Você receberá notificações aqui`
        ]
      });
    } catch (error: any) {
      logError('Erro ao gerar código de vínculo Telegram', { err: error });
      res.status(500).json({
        error: 'Erro ao gerar código de vínculo',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Testa envio de mensagem Telegram
   * POST /api/notifications/test-telegram
   */
  static async testTelegram(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      // Usar fonte canônica de chatId (TelegramAccount com fallback para NotificationSettings)
      const chatId = await getChatIdForUser(userId);

      if (!chatId) {
        res.status(400).json({
          error: 'Telegram não vinculado',
          message: 'Você precisa vincular sua conta do Telegram primeiro. Use o painel para gerar um link de conexão.'
        });
        return;
      }

      logInfo('Enviando mensagem de teste Telegram', {
        userId,
        chatId,
        action: 'test_telegram_start'
      });

      const result = await sendTelegramMessage({
        chatId,
        text: '🎉 Teste de notificação!\n\nSua conta do Telegram está vinculada corretamente ao RadarOne.'
      });

      if (result.success) {
        logInfo('Mensagem de teste Telegram enviada com sucesso', {
          userId,
          chatId,
          messageId: result.messageId,
          action: 'test_telegram_success'
        });

        res.json({
          message: 'Mensagem de teste enviada com sucesso',
          messageId: result.messageId
        });
      } else {
        logError('Erro ao enviar mensagem de teste Telegram', {
          userId,
          chatId,
          errorMessage: result.error,
          action: 'test_telegram_failed'
        });

        res.status(500).json({
          error: 'Erro ao enviar mensagem de teste',
          message: result.error
        });
      }
    } catch (error: any) {
      logError('Erro ao testar Telegram', { err: error });
      res.status(500).json({
        error: 'Erro ao testar Telegram',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

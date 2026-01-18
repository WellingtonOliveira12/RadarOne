import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { generateLinkCode, sendTelegramMessage, getChatIdForUser } from '../services/telegramService';
import { sendWelcomeEmail } from '../services/emailService';
import { TELEGRAM_BOT_USERNAME } from '../constants/telegram';

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

      console.log('[NotificationController.getSettings] Buscando configurações', { userId });

      // Buscar ou criar configurações
      let settings = await prisma.notificationSettings.findUnique({
        where: { userId }
      });

      // Se não existir, criar com padrões
      if (!settings) {
        console.log('[NotificationController.getSettings] Criando configurações padrão', { userId });

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
      console.error('[NotificationController.getSettings] Erro ao buscar configurações', { error });
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
      const { telegramUsername } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      console.log('[NotificationController.updateSettings] Atualizando configurações', { userId, telegramUsername });

      // Validar e normalizar telegram username
      let normalizedUsername: string | null = null;
      let telegramEnabled = false;

      if (telegramUsername && typeof telegramUsername === 'string' && telegramUsername.trim()) {
        // Remover espaços e adicionar @ se não tiver
        normalizedUsername = telegramUsername.trim();
        if (!normalizedUsername.startsWith('@')) {
          normalizedUsername = `@${normalizedUsername}`;
        }

        // Validar formato básico (letras, números, underscore)
        const telegramRegex = /^@[a-zA-Z0-9_]{5,32}$/;
        if (!telegramRegex.test(normalizedUsername)) {
          res.status(400).json({
            error: 'Telegram username inválido',
            message: 'O username deve ter entre 5 e 32 caracteres (letras, números e underscore)'
          });
          return;
        }

        telegramEnabled = true;
        console.log('[NotificationController.updateSettings] Telegram username validado', { normalizedUsername });
      }

      // Buscar configurações existentes
      let settings = await prisma.notificationSettings.findUnique({
        where: { userId }
      });

      if (settings) {
        // Atualizar existente
        settings = await prisma.notificationSettings.update({
          where: { userId },
          data: {
            emailEnabled: true, // Email sempre true
            telegramEnabled,
            telegramUsername: normalizedUsername,
            // Se telegram desabilitado, limpar chatId também
            telegramChatId: telegramEnabled ? settings.telegramChatId : null
          }
        });
      } else {
        // Criar novo
        settings = await prisma.notificationSettings.create({
          data: {
            userId,
            emailEnabled: true,
            telegramEnabled,
            telegramUsername: normalizedUsername,
            telegramChatId: null
          }
        });
      }

      console.log('[NotificationController.updateSettings] Configurações atualizadas', { userId, telegramEnabled });

      res.json({
        message: 'Configurações atualizadas com sucesso',
        emailEnabled: settings.emailEnabled,
        telegramEnabled: settings.telegramEnabled,
        telegramUsername: settings.telegramUsername,
        telegramChatId: settings.telegramChatId ? 'linked' : null,
        updatedAt: settings.updatedAt
      });
    } catch (error: any) {
      console.error('[NotificationController.updateSettings] Erro ao atualizar configurações', { error });
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

      console.log('[NotificationController.testEmail] Enviando email de teste', { to: user.email });

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
      console.error('[NotificationController.testEmail] Erro ao enviar email de teste', { error });
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

      console.log('[NotificationController.generateTelegramLinkCode] Gerando código', { userId });

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
      console.error('[NotificationController.generateTelegramLinkCode] Erro', { error });
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

      console.log('[NotificationController.testTelegram] Enviando mensagem de teste', {
        userId,
        chatId,
        action: 'test_telegram_start'
      });

      const result = await sendTelegramMessage({
        chatId,
        text: '🎉 Teste de notificação!\n\nSua conta do Telegram está vinculada corretamente ao RadarOne.'
      });

      if (result.success) {
        console.log('[NotificationController.testTelegram] Mensagem enviada com sucesso', {
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
        console.error('[NotificationController.testTelegram] Erro ao enviar mensagem', {
          userId,
          chatId,
          error: result.error,
          action: 'test_telegram_failed'
        });

        res.status(500).json({
          error: 'Erro ao enviar mensagem de teste',
          message: result.error
        });
      }
    } catch (error: any) {
      console.error('[NotificationController.testTelegram] Erro', { error });
      res.status(500).json({
        error: 'Erro ao testar Telegram',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

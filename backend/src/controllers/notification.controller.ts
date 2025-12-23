import { Request, Response } from 'express';
import { prisma } from '../server';

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
   * Endpoint de teste para enviar email (apenas dev/admin)
   * POST /api/notifications/test-email
   */
  static async testEmail(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { to } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      // Apenas em desenvolvimento ou para admin
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (process.env.NODE_ENV !== 'development' && user?.role !== 'ADMIN') {
        res.status(403).json({ error: 'Acesso negado' });
        return;
      }

      if (!to || typeof to !== 'string') {
        res.status(400).json({ error: 'Campo "to" é obrigatório' });
        return;
      }

      console.log('[NotificationController.testEmail] Enviando email de teste', { to });

      // TODO: Implementar envio real via Resend quando estiver configurado
      // Por ora, apenas simular
      const emailService = process.env.RESEND_API_KEY ? 'Resend' : 'Simulado';

      res.json({
        message: 'Email de teste enviado (simulado)',
        service: emailService,
        to,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[NotificationController.testEmail] Erro ao enviar email de teste', { error });
      res.status(500).json({
        error: 'Erro ao enviar email de teste',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

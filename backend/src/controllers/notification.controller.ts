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
      const logger = req.logger || console;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      logger.info({ userId }, '[NotificationController.getSettings] Buscando configurações');

      // Buscar ou criar configurações
      let settings = await prisma.notificationSettings.findUnique({
        where: { userId }
      });

      // Se não existir, criar com padrões
      if (!settings) {
        logger.info({ userId }, '[NotificationController.getSettings] Criando configurações padrão');

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
      const logger = req.logger || console;
      logger.error({ err: error }, '[NotificationController.getSettings] Erro ao buscar configurações');
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
      const logger = req.logger || console;
      const { telegramUsername } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      logger.info({ userId, telegramUsername }, '[NotificationController.updateSettings] Atualizando configurações');

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
        logger.info({ normalizedUsername }, '[NotificationController.updateSettings] Telegram username validado');
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
            telegramUsername: normalizedUsername
          }
        });
      } else {
        // Criar novo
        settings = await prisma.notificationSettings.create({
          data: {
            userId,
            emailEnabled: true,
            telegramEnabled,
            telegramUsername: normalizedUsername
          }
        });
      }

      logger.info({ userId, telegramEnabled }, '[NotificationController.updateSettings] Configurações atualizadas');

      res.json({
        message: 'Configurações atualizadas com sucesso',
        emailEnabled: settings.emailEnabled,
        telegramEnabled: settings.telegramEnabled,
        telegramUsername: settings.telegramUsername,
        telegramChatId: settings.telegramChatId ? 'linked' : null,
        updatedAt: settings.updatedAt
      });
    } catch (error: any) {
      const logger = req.logger || console;
      logger.error({ err: error }, '[NotificationController.updateSettings] Erro ao atualizar configurações');
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
      const logger = req.logger || console;
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

      logger.info({ to }, '[NotificationController.testEmail] Enviando email de teste');

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
      const logger = req.logger || console;
      logger.error({ err: error }, '[NotificationController.testEmail] Erro ao enviar email de teste');
      res.status(500).json({
        error: 'Erro ao enviar email de teste',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

import { Request, Response } from 'express';
import { prisma } from '../server';

/**
 * Controller de Usuário
 */
export class UserController {
  /**
   * Retorna dados completos do usuário autenticado
   * GET /api/me
   */
  static async getMe(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          cpfLast4: true, // NUNCA retornar cpfEncrypted
          role: true,
          isActive: true,
          blocked: true,
          createdAt: true,
          updatedAt: true,
          subscriptions: {
            where: {
              status: { in: ['ACTIVE', 'TRIAL'] }
            },
            include: {
              plan: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  maxMonitors: true,
                  maxSites: true,
                  maxAlertsPerDay: true,
                  checkInterval: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 1
          },
          telegramAccounts: {
            where: {
              active: true
            },
            select: {
              id: true,
              chatId: true,
              username: true,
              active: true,
              linkedAt: true
            }
          }
        }
      });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      res.json({ user });
    } catch (error) {
      console.error('Erro ao buscar dados do usuário:', error);
      res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  }

  /**
   * Atualiza preferências de notificação do usuário
   * PATCH /api/me/notifications
   */
  static async updateNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { telegramChatId, telegramUsername } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      // Se tiver telegramChatId e username, criar/atualizar TelegramAccount
      if (telegramChatId && telegramUsername) {
        // Verificar se já existe
        const existingTelegramAccount = await prisma.telegramAccount.findFirst({
          where: {
            userId,
            active: true
          }
        });

        if (existingTelegramAccount) {
          // Atualizar
          await prisma.telegramAccount.update({
            where: { id: existingTelegramAccount.id },
            data: {
              chatId: telegramChatId,
              username: telegramUsername
            }
          });
        } else {
          // Criar
          await prisma.telegramAccount.create({
            data: {
              userId,
              chatId: telegramChatId,
              username: telegramUsername,
              active: true
            }
          });
        }
      }

      // Buscar usuário atualizado
      const updatedUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          cpfLast4: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          telegramAccounts: {
            where: { active: true },
            select: {
              id: true,
              chatId: true,
              username: true,
              active: true,
              linkedAt: true
            }
          }
        }
      });

      res.json({
        message: 'Preferências de notificação atualizadas com sucesso',
        user: updatedUser
      });
    } catch (error) {
      console.error('Erro ao atualizar notificações:', error);
      res.status(500).json({ error: 'Erro ao atualizar preferências' });
    }
  }

  /**
   * Atualiza perfil do usuário
   * PATCH /api/me/profile
   */
  static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { name, phone } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      // Atualizar apenas campos fornecidos
      const updateData: any = {};
      if (name) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: 'Nenhum campo para atualizar' });
        return;
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          cpfLast4: true,
          role: true,
          createdAt: true,
          updatedAt: true
        }
      });

      res.json({
        message: 'Perfil atualizado com sucesso',
        user: updatedUser
      });
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      res.status(500).json({ error: 'Erro ao atualizar perfil' });
    }
  }
}

import { Request, Response } from 'express';
import { createSupportTicket, getUserTickets } from '../services/supportService';

/**
 * Controller para Suporte
 */
export class SupportController {
  /**
   * Cria um novo ticket de suporte
   * POST /api/support/ticket
   */
  static async createTicket(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId; // Opcional (usuário pode não estar logado)
      const { email, category, subject, message, attachmentUrl } = req.body;

      // Validações
      if (!email || !category || !subject || !message) {
        res.status(400).json({ error: 'Campos obrigatórios: email, category, subject, message' });
        return;
      }

      // Validar categoria
      const validCategories = ['Suporte', 'Sugestão', 'Crítica', 'Financeiro', 'Outro'];
      if (!validCategories.includes(category)) {
        res.status(400).json({ error: 'Categoria inválida' });
        return;
      }

      const result = await createSupportTicket({
        userId,
        email,
        category,
        subject,
        message,
        attachmentUrl
      });

      if (result.success) {
        res.json({
          success: true,
          ticketId: result.ticketId,
          message: 'Ticket criado com sucesso. Retornaremos em breve.'
        });
      } else {
        res.status(500).json({ error: result.error || 'Erro ao criar ticket' });
      }
    } catch (error: any) {
      console.error('[SupportController] Erro ao criar ticket', { error: error.message });
      res.status(500).json({ error: 'Erro ao criar ticket de suporte' });
    }
  }

  /**
   * Lista tickets do usuário
   * GET /api/support/tickets
   */
  static async getTickets(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const tickets = await getUserTickets(userId);

      res.json(tickets);
    } catch (error: any) {
      console.error('[SupportController] Erro ao buscar tickets', { error: error.message });
      res.status(500).json({ error: 'Erro ao buscar tickets' });
    }
  }
}

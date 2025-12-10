import { Request, Response } from 'express';
import {
  sendWelcomeEmail,
  sendTrialStartedEmail,
  sendTrialEndingEmail,
  sendTrialExpiredEmail,
  sendSubscriptionExpiredEmail,
  sendNewListingEmail
} from '../services/emailService';

/**
 * Controller de Development/Testing - APENAS PARA DEV
 * Endpoint temporário para testar envio de e-mails
 */

export class DevController {
  /**
   * POST /api/dev/test-email
   * Testa o envio de e-mails
   *
   * Body:
   * {
   *   "to": "seuemail@example.com",
   *   "type": "welcome" | "trial-started" | "trial-ending" | "trial-expired" | "subscription-expired" | "new-listing"
   * }
   */
  static async testEmail(req: Request, res: Response): Promise<void> {
    try {
      // Apenas em desenvolvimento
      if (process.env.NODE_ENV === 'production') {
        res.status(403).json({ error: 'Endpoint disponível apenas em desenvolvimento' });
        return;
      }

      const { to, type } = req.body;

      if (!to || !type) {
        res.status(400).json({ error: 'Campos "to" e "type" são obrigatórios' });
        return;
      }

      let result = false;

      switch (type) {
        case 'welcome':
          result = await sendWelcomeEmail(to, 'Usuário Teste');
          break;

        case 'trial-started':
          result = await sendTrialStartedEmail(to, 'Usuário Teste', 'PRO', 7);
          break;

        case 'trial-ending':
          result = await sendTrialEndingEmail(to, 'Usuário Teste', 'PRO', 3);
          break;

        case 'trial-expired':
          result = await sendTrialExpiredEmail(to, 'Usuário Teste', 'PRO');
          break;

        case 'subscription-expired':
          result = await sendSubscriptionExpiredEmail(to, 'Usuário Teste', 'PRO');
          break;

        case 'new-listing':
          result = await sendNewListingEmail(
            to,
            'Usuário Teste',
            'Monitor de Teste',
            'iPhone 14 Pro - Semi-novo',
            3500,
            'https://exemplo.com/anuncio/123'
          );
          break;

        default:
          res.status(400).json({
            error: 'Tipo inválido',
            validTypes: [
              'welcome',
              'trial-started',
              'trial-ending',
              'trial-expired',
              'subscription-expired',
              'new-listing'
            ]
          });
          return;
      }

      if (result) {
        res.json({
          success: true,
          message: `E-mail "${type}" enviado para ${to}`,
          note: 'Verifique sua caixa de entrada (ou spam)'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Falha ao enviar e-mail. Verifique os logs do servidor.'
        });
      }
    } catch (error: any) {
      console.error('[DEV] Erro ao testar e-mail:', error);
      res.status(500).json({
        error: 'Erro ao enviar e-mail de teste',
        message: error.message
      });
    }
  }
}

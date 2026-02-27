import { Router, Request, Response } from 'express';
import { logError } from '../utils/loggerHelpers';
import { authenticateToken } from '../middlewares/auth.middleware';
import { saveSubscription, removeSubscription } from '../services/pushService';

const router = Router();

/**
 * POST /api/push/subscribe
 * Salvar subscription de push notification
 */
router.post('/subscribe', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: 'Dados de subscription inválidos' });
      return;
    }

    const result = await saveSubscription(userId, endpoint, keys.p256dh, keys.auth);

    if (!result.success) {
      res.status(500).json({ error: result.error || 'Erro ao salvar subscription' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    logError('Push Routes: Error in /subscribe', { err: String(error) });
    res.status(500).json({ error: error.message || 'Erro interno' });
  }
});

/**
 * POST /api/push/unsubscribe
 * Remover subscription de push notification
 */
router.post('/unsubscribe', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      res.status(400).json({ error: 'Endpoint não fornecido' });
      return;
    }

    const result = await removeSubscription(endpoint);

    if (!result.success) {
      res.status(500).json({ error: 'Erro ao remover subscription' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Push Routes] Erro em /unsubscribe:', error);
    res.status(500).json({ error: error.message || 'Erro interno' });
  }
});

export default router;

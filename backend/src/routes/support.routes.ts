import { Router } from 'express';
import { SupportController } from '../controllers/support.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// Criar ticket (pode ser usado sem autenticação também)
router.post('/ticket', SupportController.createTicket);

// Listar tickets do usuário (autenticado)
router.get('/tickets', authenticateToken, SupportController.getTickets);

export default router;

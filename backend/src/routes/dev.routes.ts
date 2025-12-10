import { Router } from 'express';
import { DevController } from '../controllers/dev.controller';

const router = Router();

// ATENÇÃO: Rota apenas para desenvolvimento!
// Bloquear em produção via middleware ou remover
router.post('/test-email', DevController.testEmail);

export default router;

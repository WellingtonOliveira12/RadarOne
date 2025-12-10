import { Router } from 'express';
import { UserController } from '../controllers/user.controller';

const router = Router();

// Todas as rotas de user requerem autenticação
// O middleware authenticate é aplicado no server.ts

router.get('/', UserController.getMe);
router.patch('/notifications', UserController.updateNotifications);
router.patch('/profile', UserController.updateProfile);

export default router;

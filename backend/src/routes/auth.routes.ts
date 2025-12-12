import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

/**
 * Rotas de Autenticação
 */

// POST /api/auth/register - Criar nova conta
router.post('/register', AuthController.register);

// POST /api/auth/login - Fazer login
router.post('/login', AuthController.login);

// GET /api/auth/me - Obter dados do usuário autenticado
router.get('/me', authenticateToken, AuthController.me);

// POST /api/auth/forgot-password - Solicitar reset de senha
router.post('/forgot-password', AuthController.requestPasswordReset);

// POST /api/auth/reset-password - Resetar senha
router.post('/reset-password', AuthController.resetPassword);

// TODO: Implementar outras rotas
// POST /api/auth/refresh-token - Renovar token
// POST /api/auth/logout - Logout (invalidar token)

export default router;

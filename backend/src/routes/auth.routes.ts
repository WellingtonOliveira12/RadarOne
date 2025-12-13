import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { authRateLimiter, strictRateLimiter } from '../middlewares/rateLimit.middleware';

const router = Router();

/**
 * Rotas de Autenticação (com rate limiting)
 */

// POST /api/auth/register - Criar nova conta (10 req/15min)
router.post('/register', authRateLimiter, AuthController.register);

// POST /api/auth/login - Fazer login (10 req/15min)
router.post('/login', authRateLimiter, AuthController.login);

// GET /api/auth/me - Obter dados do usuário autenticado
router.get('/me', authenticateToken, AuthController.me);

// POST /api/auth/forgot-password - Solicitar reset de senha (5 req/hora)
router.post('/forgot-password', strictRateLimiter, AuthController.requestPasswordReset);

// POST /api/auth/reset-password - Resetar senha (10 req/15min)
router.post('/reset-password', authRateLimiter, AuthController.resetPassword);

// TODO: Implementar outras rotas
// POST /api/auth/refresh-token - Renovar token
// POST /api/auth/logout - Logout (invalidar token)

export default router;

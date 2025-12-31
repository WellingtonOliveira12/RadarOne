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

// ============================================
// FASE 4.4 - Two-Factor Authentication (2FA)
// ============================================

// GET /api/auth/2fa/status - Status de 2FA (requer autenticação)
router.get('/2fa/status', authenticateToken, AuthController.get2FAStatus);

// GET /api/auth/2fa/setup - Iniciar configuração de 2FA (requer autenticação)
router.get('/2fa/setup', authenticateToken, authRateLimiter, AuthController.setup2FA);

// POST /api/auth/2fa/enable - Habilitar 2FA (requer autenticação)
router.post('/2fa/enable', authenticateToken, authRateLimiter, AuthController.enable2FA);

// POST /api/auth/2fa/disable - Desabilitar 2FA (requer autenticação e senha)
router.post('/2fa/disable', authenticateToken, authRateLimiter, AuthController.disable2FA);

// POST /api/auth/2fa/verify - Verificar código 2FA durante login (público)
router.post('/2fa/verify', authRateLimiter, AuthController.verify2FA);

// POST /api/auth/2fa/backup-codes - Regenerar códigos de backup (requer autenticação e senha)
router.post('/2fa/backup-codes', authenticateToken, strictRateLimiter, AuthController.regenerateBackupCodes);

// POST /api/auth/revalidate-password - Revalidar senha para ações críticas (requer autenticação)
router.post('/revalidate-password', authenticateToken, authRateLimiter, AuthController.revalidatePassword);

// TODO: Implementar outras rotas
// POST /api/auth/refresh-token - Renovar token
// POST /api/auth/logout - Logout (invalidar token)

export default router;

/**
 * ============================================================
 * SESSION ROUTES - Rotas de Gerenciamento de Sessões
 * ============================================================
 */

import { Router } from 'express';
import multer from 'multer';
import {
  listSessions,
  getSessionStatus,
  uploadSession,
  deleteSession,
  validateSession,
  getSupportedSites,
} from '../controllers/session.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// Configuração do multer para upload de arquivos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
  },
  fileFilter: (_req, file, cb) => {
    // Aceita apenas .json
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos .json são permitidos'));
    }
  },
});

// ============================================================
// ROTAS PÚBLICAS
// ============================================================

// GET /api/sessions/supported-sites - Lista sites suportados
router.get('/supported-sites', getSupportedSites);

// ============================================================
// ROTAS PROTEGIDAS (requerem autenticação)
// ============================================================

// GET /api/sessions - Lista todas as sessões do usuário
router.get('/', authenticateToken, listSessions);

// GET /api/sessions/:site/status - Status de uma sessão específica
router.get('/:site/status', authenticateToken, getSessionStatus);

// POST /api/sessions/:site/upload - Upload de storageState
// Aceita JSON no body ou arquivo multipart
router.post(
  '/:site/upload',
  authenticateToken,
  upload.single('storageState'),
  uploadSession
);

// DELETE /api/sessions/:site - Remove uma sessão
router.delete('/:site', authenticateToken, deleteSession);

// POST /api/sessions/:site/validate - Valida uma sessão
router.post('/:site/validate', authenticateToken, validateSession);

export default router;

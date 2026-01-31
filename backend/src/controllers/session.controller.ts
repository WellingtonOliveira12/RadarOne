/**
 * ============================================================
 * SESSION CONTROLLER - Endpoints de Gerenciamento de Sessões
 * ============================================================
 *
 * Endpoints para upload, status e gerenciamento de sessões
 * de autenticação de sites (Mercado Livre, etc).
 */

import { Request, Response } from 'express';
import { isValidStorageState } from '../utils/session-crypto';
import {
  sessionService,
  SUPPORTED_SITES,
} from '../services/sessionService';

// ============================================================
// TIPOS
// ============================================================

// Auth middleware sets req.userId (not req.user.id)
// Use standard Express Request which already has userId via global declaration

// ============================================================
// ENDPOINTS
// ============================================================

/**
 * GET /api/sessions
 * Lista todas as sessões do usuário
 */
export async function listSessions(req: Request, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ errorCode: 'INVALID_TOKEN', message: 'Não autenticado' });
    }

    const sessions = await sessionService.getAll(userId);

    // Mapeia para resposta (sem dados sensíveis)
    const response = sessions.map(s => ({
      id: s.id,
      site: s.site,
      siteName: SUPPORTED_SITES[s.site]?.displayName || s.site,
      domain: s.domain,
      status: s.status,
      statusLabel: getStatusLabel(s.status),
      accountLabel: s.accountLabel,
      cookiesCount: (s.metadata as any)?.cookiesCount || 0,
      expiresAt: s.expiresAt,
      lastUsedAt: s.lastUsedAt,
      lastErrorAt: s.lastErrorAt,
      createdAt: s.createdAt,
    }));

    return res.json({
      success: true,
      sessions: response,
      supportedSites: Object.entries(SUPPORTED_SITES).map(([key, value]) => ({
        id: key,
        name: value.displayName,
        domains: value.domains,
      })),
    });
  } catch (error: any) {
    console.error('SESSION_CONTROLLER: Erro ao listar sessões:', error.message);
    return res.status(500).json({ error: 'Erro ao listar sessões' });
  }
}

/**
 * GET /api/sessions/:site/status
 * Obtém status de uma sessão específica
 */
export async function getSessionStatus(req: Request, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ errorCode: 'INVALID_TOKEN', message: 'Não autenticado' });
    }

    const { site } = req.params;

    if (!SUPPORTED_SITES[site]) {
      return res.status(400).json({
        error: `Site não suportado: ${site}`,
        supportedSites: Object.keys(SUPPORTED_SITES),
      });
    }

    const session = await sessionService.getStatus(userId, site);

    if (!session) {
      return res.json({
        success: true,
        hasSession: false,
        status: 'NOT_CONNECTED',
        statusLabel: 'Não conectado',
        site,
        siteName: SUPPORTED_SITES[site].displayName,
      });
    }

    return res.json({
      success: true,
      hasSession: true,
      status: session.status,
      statusLabel: getStatusLabel(session.status),
      site,
      siteName: SUPPORTED_SITES[site].displayName,
      accountLabel: session.accountLabel,
      cookiesCount: (session.metadata as any)?.cookiesCount || 0,
      expiresAt: session.expiresAt,
      lastUsedAt: session.lastUsedAt,
      lastErrorAt: session.lastErrorAt,
      needsAction: session.status !== 'ACTIVE',
    });
  } catch (error: any) {
    console.error('SESSION_CONTROLLER: Erro ao obter status:', error.message);
    return res.status(500).json({ error: 'Erro ao obter status da sessão' });
  }
}

/**
 * POST /api/sessions/:site/upload
 * Upload de storageState.json
 */
export async function uploadSession(req: Request, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ errorCode: 'INVALID_TOKEN', message: 'Não autenticado' });
    }

    const { site } = req.params;

    if (!SUPPORTED_SITES[site]) {
      return res.status(400).json({
        error: `Site não suportado: ${site}`,
        supportedSites: Object.keys(SUPPORTED_SITES),
      });
    }

    // Aceita JSON no body ou arquivo
    let storageStateJson: string;

    if (req.file) {
      // Upload de arquivo
      storageStateJson = req.file.buffer.toString('utf-8');
    } else if (req.body.storageState) {
      // JSON no body
      if (typeof req.body.storageState === 'string') {
        storageStateJson = req.body.storageState;
      } else {
        storageStateJson = JSON.stringify(req.body.storageState);
      }
    } else if (req.body.storageStateBase64) {
      // Base64 no body
      storageStateJson = Buffer.from(req.body.storageStateBase64, 'base64').toString('utf-8');
    } else {
      return res.status(400).json({
        error: 'storageState não fornecido',
        hint: 'Envie como JSON no body (storageState), base64 (storageStateBase64) ou arquivo (multipart)',
      });
    }

    // Valida
    if (!isValidStorageState(storageStateJson)) {
      return res.status(400).json({
        error: 'storageState inválido',
        hint: 'O arquivo deve ser um JSON válido com arrays "cookies" e "origins"',
      });
    }

    // Salva
    const result = await sessionService.save(
      userId,
      site,
      storageStateJson,
      req.body.accountLabel
    );

    if (!result.success) {
      return res.status(400).json({
        error: result.message,
      });
    }

    return res.json({
      success: true,
      message: 'Sessão salva com sucesso',
      sessionId: result.sessionId,
      cookiesCount: result.meta?.cookiesCount,
      originsCount: result.meta?.originsCount,
    });
  } catch (error: any) {
    console.error('SESSION_CONTROLLER: Erro ao fazer upload:', error.message);
    return res.status(500).json({ error: 'Erro ao salvar sessão' });
  }
}

/**
 * DELETE /api/sessions/:site
 * Remove uma sessão
 */
export async function deleteSession(req: Request, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ errorCode: 'INVALID_TOKEN', message: 'Não autenticado' });
    }

    const { site } = req.params;

    if (!SUPPORTED_SITES[site]) {
      return res.status(400).json({
        error: `Site não suportado: ${site}`,
      });
    }

    const deleted = await sessionService.delete(userId, site);

    if (!deleted) {
      return res.status(404).json({
        error: 'Sessão não encontrada',
      });
    }

    return res.json({
      success: true,
      message: 'Sessão removida com sucesso',
    });
  } catch (error: any) {
    console.error('SESSION_CONTROLLER: Erro ao remover sessão:', error.message);
    return res.status(500).json({ error: 'Erro ao remover sessão' });
  }
}

/**
 * POST /api/sessions/:site/validate
 * Valida manualmente uma sessão (marca como ACTIVE se estava NEEDS_REAUTH)
 */
export async function validateSession(req: Request, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ errorCode: 'INVALID_TOKEN', message: 'Não autenticado' });
    }

    const { site } = req.params;

    if (!SUPPORTED_SITES[site]) {
      return res.status(400).json({
        error: `Site não suportado: ${site}`,
      });
    }

    // Por enquanto, apenas verifica se a sessão existe e retorna status
    // No futuro, pode disparar validação real via worker
    const session = await sessionService.getStatus(userId, site);

    if (!session) {
      return res.status(404).json({
        error: 'Sessão não encontrada',
        hint: 'Faça upload de um novo storageState.json',
      });
    }

    return res.json({
      success: true,
      status: session.status,
      statusLabel: getStatusLabel(session.status),
      message: session.status === 'ACTIVE'
        ? 'Sessão está ativa'
        : 'Sessão precisa de reautenticação. Faça upload de um novo storageState.json',
    });
  } catch (error: any) {
    console.error('SESSION_CONTROLLER: Erro ao validar sessão:', error.message);
    return res.status(500).json({ error: 'Erro ao validar sessão' });
  }
}

/**
 * GET /api/sessions/supported-sites
 * Lista sites suportados
 */
export async function getSupportedSites(_req: Request, res: Response) {
  return res.json({
    success: true,
    sites: Object.entries(SUPPORTED_SITES).map(([key, value]) => ({
      id: key,
      name: value.displayName,
      domains: value.domains,
    })),
  });
}

// ============================================================
// HELPERS
// ============================================================

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Conectado',
    NEEDS_REAUTH: 'Reconectar',
    EXPIRED: 'Expirado',
    INVALID: 'Inválido',
    NOT_CONNECTED: 'Não conectado',
  };
  return labels[status] || status;
}

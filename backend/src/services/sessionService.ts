/**
 * ============================================================
 * SESSION SERVICE - Gerenciamento de Sessões de Autenticação
 * ============================================================
 *
 * Gerencia sessões de autenticação de sites para usuários.
 * Permite salvar, carregar, validar e marcar sessões como needs_reauth.
 */

import { UserSessionStatus } from '@prisma/client';
import {
  encryptStorageState,
  decryptStorageState,
  isValidStorageState,
  extractStorageStateMeta,
} from '../utils/session-crypto';
import { prisma } from '../lib/prisma';

// ============================================================
// TIPOS
// ============================================================

export interface SessionInfo {
  id: string;
  userId: string;
  site: string;
  domain: string;
  status: UserSessionStatus;
  accountLabel: string | null;
  metadata: any;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lastErrorAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveSessionResult {
  success: boolean;
  sessionId: string;
  message: string;
  meta?: {
    cookiesCount: number;
    originsCount: number;
    domains: string[];
  };
}

export interface LoadSessionResult {
  success: boolean;
  storageState: string | null;
  session: SessionInfo | null;
  error: string | null;
}

// ============================================================
// CONSTANTES
// ============================================================

/** Sites suportados e seus domínios */
export const SUPPORTED_SITES: Record<string, { domains: string[]; displayName: string }> = {
  MERCADO_LIVRE: {
    domains: ['mercadolivre.com.br', 'mercadolibre.com'],
    displayName: 'Mercado Livre',
  },
  FACEBOOK_MARKETPLACE: {
    domains: ['facebook.com', 'www.facebook.com'],
    displayName: 'Facebook Marketplace',
  },
  SUPERBID: {
    domains: ['superbid.net', 'www.superbid.net'],
    displayName: 'Superbid',
  },
  VIP_LEILOES: {
    domains: ['vipleiloes.com.br', 'www.vipleiloes.com.br'],
    displayName: 'VIP Leilões',
  },
  SODRE_SANTORO: {
    domains: ['sodresantoro.com.br', 'www.sodresantoro.com.br'],
    displayName: 'Sodré Santoro',
  },
};

/** Tempo padrão de expiração (30 dias) */
const DEFAULT_EXPIRATION_DAYS = 30;

// ============================================================
// FUNÇÕES PRINCIPAIS
// ============================================================

/**
 * Salva uma sessão de autenticação para um usuário
 */
export async function saveSession(
  userId: string,
  site: string,
  storageStateJson: string,
  accountLabel?: string
): Promise<SaveSessionResult> {
  // Valida site
  const siteConfig = SUPPORTED_SITES[site];
  if (!siteConfig) {
    return {
      success: false,
      sessionId: '',
      message: `Site não suportado: ${site}. Sites válidos: ${Object.keys(SUPPORTED_SITES).join(', ')}`,
    };
  }

  // Valida storageState
  if (!isValidStorageState(storageStateJson)) {
    return {
      success: false,
      sessionId: '',
      message: 'storageState inválido. Deve ser um JSON com arrays "cookies" e "origins".',
    };
  }

  // Extrai metadados
  const meta = extractStorageStateMeta(storageStateJson);

  // Determina domínio principal (primeiro do config)
  const domain = siteConfig.domains[0];

  // Criptografa
  const encryptedStorageState = encryptStorageState(storageStateJson);

  // Calcula expiração
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DEFAULT_EXPIRATION_DAYS);

  // Upsert (criar ou atualizar)
  const session = await prisma.userSession.upsert({
    where: {
      userId_site_domain: {
        userId,
        site,
        domain,
      },
    },
    update: {
      encryptedStorageState,
      status: 'ACTIVE',
      accountLabel: accountLabel || null,
      metadata: {
        ...meta,
        uploadedAt: new Date().toISOString(),
        lastValidatedAt: null,
        lastErrorReason: null,
      },
      expiresAt,
      lastUsedAt: new Date(),
      lastErrorAt: null,
    },
    create: {
      userId,
      site,
      domain,
      encryptedStorageState,
      status: 'ACTIVE',
      accountLabel: accountLabel || null,
      metadata: {
        ...meta,
        uploadedAt: new Date().toISOString(),
      },
      expiresAt,
      lastUsedAt: new Date(),
    },
  });

  console.log(`SESSION_SERVICE: Sessão salva para user=${userId} site=${site} cookies=${meta.cookiesCount}`);

  return {
    success: true,
    sessionId: session.id,
    message: 'Sessão salva com sucesso',
    meta: {
      cookiesCount: meta.cookiesCount,
      originsCount: meta.originsCount,
      domains: meta.domains,
    },
  };
}

/**
 * Carrega uma sessão de autenticação
 */
export async function loadSession(
  userId: string,
  site: string
): Promise<LoadSessionResult> {
  const siteConfig = SUPPORTED_SITES[site];
  if (!siteConfig) {
    return {
      success: false,
      storageState: null,
      session: null,
      error: `Site não suportado: ${site}`,
    };
  }

  const domain = siteConfig.domains[0];

  const session = await prisma.userSession.findUnique({
    where: {
      userId_site_domain: {
        userId,
        site,
        domain,
      },
    },
  });

  if (!session) {
    return {
      success: false,
      storageState: null,
      session: null,
      error: 'Sessão não encontrada',
    };
  }

  // Verifica status
  if (session.status === 'NEEDS_REAUTH') {
    return {
      success: false,
      storageState: null,
      session: mapSessionToInfo(session),
      error: 'Sessão precisa de reautenticação',
    };
  }

  if (session.status === 'EXPIRED') {
    return {
      success: false,
      storageState: null,
      session: mapSessionToInfo(session),
      error: 'Sessão expirada',
    };
  }

  if (session.status === 'INVALID') {
    return {
      success: false,
      storageState: null,
      session: mapSessionToInfo(session),
      error: 'Sessão inválida',
    };
  }

  // Verifica expiração por tempo
  if (session.expiresAt && session.expiresAt < new Date()) {
    await markSessionExpired(userId, site);
    return {
      success: false,
      storageState: null,
      session: mapSessionToInfo({ ...session, status: 'EXPIRED' }),
      error: 'Sessão expirada por tempo',
    };
  }

  // Descriptografa
  if (!session.encryptedStorageState) {
    return {
      success: false,
      storageState: null,
      session: mapSessionToInfo(session),
      error: 'Sessão sem storageState',
    };
  }

  try {
    const storageState = decryptStorageState(session.encryptedStorageState);

    // Atualiza lastUsedAt
    await prisma.userSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      success: true,
      storageState,
      session: mapSessionToInfo(session),
      error: null,
    };
  } catch (e: any) {
    console.error(`SESSION_SERVICE: Erro ao descriptografar sessão: ${e.message}`);
    return {
      success: false,
      storageState: null,
      session: mapSessionToInfo(session),
      error: 'Erro ao descriptografar sessão',
    };
  }
}

/**
 * Marca sessão como NEEDS_REAUTH
 */
export async function markSessionNeedsReauth(
  userId: string,
  site: string,
  reason?: string
): Promise<boolean> {
  const siteConfig = SUPPORTED_SITES[site];
  if (!siteConfig) return false;

  const domain = siteConfig.domains[0];

  try {
    const session = await prisma.userSession.findUnique({
      where: {
        userId_site_domain: {
          userId,
          site,
          domain,
        },
      },
    });

    if (!session) return false;

    await prisma.userSession.update({
      where: { id: session.id },
      data: {
        status: 'NEEDS_REAUTH',
        lastErrorAt: new Date(),
        metadata: {
          ...(session.metadata as object || {}),
          lastErrorReason: reason || 'Login required by site',
          needsReauthAt: new Date().toISOString(),
        },
      },
    });

    console.log(`SESSION_SERVICE: Sessão marcada como NEEDS_REAUTH user=${userId} site=${site} reason=${reason}`);
    return true;
  } catch (e: any) {
    console.error(`SESSION_SERVICE: Erro ao marcar NEEDS_REAUTH: ${e.message}`);
    return false;
  }
}

/**
 * Marca sessão como EXPIRED
 */
export async function markSessionExpired(
  userId: string,
  site: string
): Promise<boolean> {
  const siteConfig = SUPPORTED_SITES[site];
  if (!siteConfig) return false;

  const domain = siteConfig.domains[0];

  try {
    await prisma.userSession.updateMany({
      where: {
        userId,
        site,
        domain,
      },
      data: {
        status: 'EXPIRED',
      },
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Obtém status de todas as sessões de um usuário
 */
export async function getUserSessions(userId: string): Promise<SessionInfo[]> {
  const sessions = await prisma.userSession.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });

  return sessions.map(mapSessionToInfo);
}

/**
 * Obtém status de uma sessão específica
 */
export async function getSessionStatus(
  userId: string,
  site: string
): Promise<SessionInfo | null> {
  const siteConfig = SUPPORTED_SITES[site];
  if (!siteConfig) return null;

  const domain = siteConfig.domains[0];

  const session = await prisma.userSession.findUnique({
    where: {
      userId_site_domain: {
        userId,
        site,
        domain,
      },
    },
  });

  if (!session) return null;

  return mapSessionToInfo(session);
}

/**
 * Remove uma sessão
 */
export async function deleteSession(
  userId: string,
  site: string
): Promise<boolean> {
  const siteConfig = SUPPORTED_SITES[site];
  if (!siteConfig) return false;

  const domain = siteConfig.domains[0];

  try {
    await prisma.userSession.deleteMany({
      where: {
        userId,
        site,
        domain,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica se usuário tem sessão ativa para um site
 */
export async function hasActiveSession(
  userId: string,
  site: string
): Promise<boolean> {
  const status = await getSessionStatus(userId, site);
  return status?.status === 'ACTIVE';
}

// ============================================================
// HELPERS
// ============================================================

function mapSessionToInfo(session: any): SessionInfo {
  return {
    id: session.id,
    userId: session.userId,
    site: session.site,
    domain: session.domain,
    status: session.status,
    accountLabel: session.accountLabel,
    metadata: session.metadata,
    expiresAt: session.expiresAt,
    lastUsedAt: session.lastUsedAt,
    lastErrorAt: session.lastErrorAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

// ============================================================
// EXPORTS
// ============================================================

export const sessionService = {
  save: saveSession,
  load: loadSession,
  markNeedsReauth: markSessionNeedsReauth,
  markExpired: markSessionExpired,
  getAll: getUserSessions,
  getStatus: getSessionStatus,
  delete: deleteSession,
  hasActive: hasActiveSession,
  SUPPORTED_SITES,
};

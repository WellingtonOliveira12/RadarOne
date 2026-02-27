import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for sessionService — session management for authenticated sites
 *
 * Cases tested:
 * - saveSession: valid site, invalid site, invalid storageState, upsert flow
 * - loadSession: not found, NEEDS_REAUTH, EXPIRED, INVALID, time-expired, decrypt error, success
 * - markSessionNeedsReauth: unsupported site, session not found, success, error
 * - markSessionExpired: unsupported site, success, error
 * - getUserSessions: returns mapped sessions
 * - getSessionStatus: unsupported site, not found, success
 * - deleteSession: unsupported site, success, error
 * - hasActiveSession: ACTIVE status, non-ACTIVE status
 */

// Hoist mocks before any module evaluation
const { mockPrisma, mockEncrypt, mockDecrypt, mockIsValid, mockExtractMeta } = vi.hoisted(() => {
  process.env.SESSION_ENCRYPTION_KEY = 'a'.repeat(64); // 64-char hex key

  return {
    mockPrisma: {
      userSession: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    } as any,
    mockEncrypt: vi.fn(),
    mockDecrypt: vi.fn(),
    mockIsValid: vi.fn(),
    mockExtractMeta: vi.fn(),
  };
});

vi.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

vi.mock('../../src/utils/session-crypto', () => ({
  encryptStorageState: mockEncrypt,
  decryptStorageState: mockDecrypt,
  isValidStorageState: mockIsValid,
  extractStorageStateMeta: mockExtractMeta,
}));

import {
  saveSession,
  loadSession,
  markSessionNeedsReauth,
  markSessionExpired,
  getUserSessions,
  getSessionStatus,
  deleteSession,
  hasActiveSession,
  SUPPORTED_SITES,
} from '../../src/services/sessionService';

// ============================================================
// Helpers
// ============================================================

function makeDbSession(overrides: Record<string, any> = {}) {
  return {
    id: 'session-1',
    userId: 'user-1',
    site: 'MERCADO_LIVRE',
    domain: 'mercadolivre.com.br',
    status: 'ACTIVE',
    accountLabel: null,
    metadata: {},
    encryptedStorageState: 'iv:tag:encrypted',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days future
    lastUsedAt: new Date(),
    lastErrorAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const VALID_STORAGE_STATE = JSON.stringify({ cookies: [{ domain: 'mercadolivre.com.br' }], origins: [] });
const DEFAULT_META = { cookiesCount: 1, originsCount: 0, domains: ['mercadolivre.com.br'], sizeBytes: 100, createdAt: '2026-01-01' };

// ============================================================
// SUPPORTED_SITES constant
// ============================================================

describe('SUPPORTED_SITES', () => {
  it('contains MERCADO_LIVRE, FACEBOOK_MARKETPLACE, SUPERBID, VIP_LEILOES, SODRE_SANTORO', () => {
    expect(SUPPORTED_SITES).toHaveProperty('MERCADO_LIVRE');
    expect(SUPPORTED_SITES).toHaveProperty('FACEBOOK_MARKETPLACE');
    expect(SUPPORTED_SITES).toHaveProperty('SUPERBID');
    expect(SUPPORTED_SITES).toHaveProperty('VIP_LEILOES');
    expect(SUPPORTED_SITES).toHaveProperty('SODRE_SANTORO');
  });

  it('each site has domains and displayName', () => {
    for (const [, config] of Object.entries(SUPPORTED_SITES)) {
      expect(Array.isArray(config.domains)).toBe(true);
      expect(config.domains.length).toBeGreaterThan(0);
      expect(typeof config.displayName).toBe('string');
    }
  });
});

// ============================================================
// saveSession
// ============================================================

describe('saveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsValid.mockReturnValue(true);
    mockExtractMeta.mockReturnValue(DEFAULT_META);
    mockEncrypt.mockReturnValue('encrypted-state');
    mockPrisma.userSession.upsert.mockResolvedValue(makeDbSession({ id: 'session-new' }));
  });

  it('returns error for unsupported site', async () => {
    const result = await saveSession('user-1', 'UNKNOWN_SITE', VALID_STORAGE_STATE);

    expect(result.success).toBe(false);
    expect(result.sessionId).toBe('');
    expect(result.message).toContain('Site não suportado');
    expect(result.message).toContain('UNKNOWN_SITE');
    expect(mockPrisma.userSession.upsert).not.toHaveBeenCalled();
  });

  it('returns error for invalid storageState JSON', async () => {
    mockIsValid.mockReturnValue(false);

    const result = await saveSession('user-1', 'MERCADO_LIVRE', 'not-valid-json');

    expect(result.success).toBe(false);
    expect(result.sessionId).toBe('');
    expect(result.message).toContain('storageState inválido');
    expect(mockPrisma.userSession.upsert).not.toHaveBeenCalled();
  });

  it('upserts session and returns success with meta', async () => {
    const result = await saveSession('user-1', 'MERCADO_LIVRE', VALID_STORAGE_STATE, 'my-account');

    expect(result.success).toBe(true);
    expect(result.sessionId).toBe('session-new');
    expect(result.message).toContain('sucesso');
    expect(result.meta).toEqual({
      cookiesCount: 1,
      originsCount: 0,
      domains: ['mercadolivre.com.br'],
    });
    expect(mockPrisma.userSession.upsert).toHaveBeenCalledOnce();
  });

  it('passes correct domain for FACEBOOK_MARKETPLACE', async () => {
    await saveSession('user-1', 'FACEBOOK_MARKETPLACE', VALID_STORAGE_STATE);

    expect(mockPrisma.userSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_site_domain: {
            userId: 'user-1',
            site: 'FACEBOOK_MARKETPLACE',
            domain: 'facebook.com',
          },
        },
      })
    );
  });

  it('saves without accountLabel when omitted', async () => {
    await saveSession('user-1', 'MERCADO_LIVRE', VALID_STORAGE_STATE);

    const call = mockPrisma.userSession.upsert.mock.calls[0][0];
    expect(call.update.accountLabel).toBeNull();
    expect(call.create.accountLabel).toBeNull();
  });

  it('sets ACTIVE status and expiresAt on save', async () => {
    await saveSession('user-1', 'MERCADO_LIVRE', VALID_STORAGE_STATE);

    const call = mockPrisma.userSession.upsert.mock.calls[0][0];
    expect(call.update.status).toBe('ACTIVE');
    expect(call.create.status).toBe('ACTIVE');
    expect(call.update.expiresAt).toBeInstanceOf(Date);
    expect(call.create.expiresAt).toBeInstanceOf(Date);
  });
});

// ============================================================
// loadSession
// ============================================================

describe('loadSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecrypt.mockReturnValue(VALID_STORAGE_STATE);
    mockPrisma.userSession.update.mockResolvedValue({});
    mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 });
  });

  it('returns error for unsupported site', async () => {
    const result = await loadSession('user-1', 'BAD_SITE');

    expect(result.success).toBe(false);
    expect(result.storageState).toBeNull();
    expect(result.session).toBeNull();
    expect(result.error).toContain('Site não suportado');
  });

  it('returns error when session not found', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(null);

    const result = await loadSession('user-1', 'MERCADO_LIVRE');

    expect(result.success).toBe(false);
    expect(result.storageState).toBeNull();
    expect(result.session).toBeNull();
    expect(result.error).toBe('Sessão não encontrada');
  });

  it('returns error when session status is NEEDS_REAUTH', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(makeDbSession({ status: 'NEEDS_REAUTH' }));

    const result = await loadSession('user-1', 'MERCADO_LIVRE');

    expect(result.success).toBe(false);
    expect(result.storageState).toBeNull();
    expect(result.session).not.toBeNull();
    expect(result.error).toBe('Sessão precisa de reautenticação');
  });

  it('returns error when session status is EXPIRED', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(makeDbSession({ status: 'EXPIRED' }));

    const result = await loadSession('user-1', 'MERCADO_LIVRE');

    expect(result.success).toBe(false);
    expect(result.storageState).toBeNull();
    expect(result.session).not.toBeNull();
    expect(result.error).toBe('Sessão expirada');
  });

  it('returns error when session status is INVALID', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(makeDbSession({ status: 'INVALID' }));

    const result = await loadSession('user-1', 'MERCADO_LIVRE');

    expect(result.success).toBe(false);
    expect(result.storageState).toBeNull();
    expect(result.session).not.toBeNull();
    expect(result.error).toBe('Sessão inválida');
  });

  it('marks session expired and returns error when expiresAt is in the past', async () => {
    const pastDate = new Date(Date.now() - 1000); // 1 second ago
    mockPrisma.userSession.findUnique.mockResolvedValue(
      makeDbSession({ status: 'ACTIVE', expiresAt: pastDate })
    );

    const result = await loadSession('user-1', 'MERCADO_LIVRE');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Sessão expirada por tempo');
    expect(result.session?.status).toBe('EXPIRED');
    // Should call updateMany to mark as expired
    expect(mockPrisma.userSession.updateMany).toHaveBeenCalled();
  });

  it('returns error when encryptedStorageState is null', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(
      makeDbSession({ status: 'ACTIVE', encryptedStorageState: null })
    );

    const result = await loadSession('user-1', 'MERCADO_LIVRE');

    expect(result.success).toBe(false);
    expect(result.storageState).toBeNull();
    expect(result.error).toBe('Sessão sem storageState');
  });

  it('returns decrypted storageState on success', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(makeDbSession());
    mockDecrypt.mockReturnValue(VALID_STORAGE_STATE);

    const result = await loadSession('user-1', 'MERCADO_LIVRE');

    expect(result.success).toBe(true);
    expect(result.storageState).toBe(VALID_STORAGE_STATE);
    expect(result.session).not.toBeNull();
    expect(result.error).toBeNull();
    expect(mockPrisma.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1' },
        data: { lastUsedAt: expect.any(Date) },
      })
    );
  });

  it('returns error when decryption throws', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(makeDbSession());
    mockDecrypt.mockImplementation(() => { throw new Error('decryption failed'); });

    const result = await loadSession('user-1', 'MERCADO_LIVRE');

    expect(result.success).toBe(false);
    expect(result.storageState).toBeNull();
    expect(result.error).toBe('Erro ao descriptografar sessão');
  });

  it('loads session with null expiresAt (never expires)', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(
      makeDbSession({ status: 'ACTIVE', expiresAt: null })
    );

    const result = await loadSession('user-1', 'MERCADO_LIVRE');

    expect(result.success).toBe(true);
    expect(result.storageState).toBe(VALID_STORAGE_STATE);
  });
});

// ============================================================
// markSessionNeedsReauth
// ============================================================

describe('markSessionNeedsReauth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false for unsupported site', async () => {
    const result = await markSessionNeedsReauth('user-1', 'BAD_SITE', 'reason');
    expect(result).toBe(false);
    expect(mockPrisma.userSession.findUnique).not.toHaveBeenCalled();
  });

  it('returns false when session not found', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(null);

    const result = await markSessionNeedsReauth('user-1', 'MERCADO_LIVRE');
    expect(result).toBe(false);
    expect(mockPrisma.userSession.update).not.toHaveBeenCalled();
  });

  it('updates session status to NEEDS_REAUTH with reason', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(makeDbSession());
    mockPrisma.userSession.update.mockResolvedValue({});

    const result = await markSessionNeedsReauth('user-1', 'MERCADO_LIVRE', 'session expired by site');

    expect(result).toBe(true);
    expect(mockPrisma.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1' },
        data: expect.objectContaining({
          status: 'NEEDS_REAUTH',
          lastErrorAt: expect.any(Date),
          metadata: expect.objectContaining({
            lastErrorReason: 'session expired by site',
          }),
        }),
      })
    );
  });

  it('uses default reason when none provided', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(makeDbSession());
    mockPrisma.userSession.update.mockResolvedValue({});

    await markSessionNeedsReauth('user-1', 'MERCADO_LIVRE');

    const call = mockPrisma.userSession.update.mock.calls[0][0];
    expect(call.data.metadata.lastErrorReason).toBe('Login required by site');
  });

  it('returns false and logs error on exception', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(makeDbSession());
    mockPrisma.userSession.update.mockRejectedValue(new Error('DB error'));

    const result = await markSessionNeedsReauth('user-1', 'MERCADO_LIVRE');
    expect(result).toBe(false);
  });
});

// ============================================================
// markSessionExpired
// ============================================================

describe('markSessionExpired', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false for unsupported site', async () => {
    const result = await markSessionExpired('user-1', 'BAD_SITE');
    expect(result).toBe(false);
  });

  it('calls updateMany with EXPIRED status', async () => {
    mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 });

    const result = await markSessionExpired('user-1', 'MERCADO_LIVRE');

    expect(result).toBe(true);
    expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        site: 'MERCADO_LIVRE',
        domain: 'mercadolivre.com.br',
      },
      data: { status: 'EXPIRED' },
    });
  });

  it('returns false on DB error', async () => {
    mockPrisma.userSession.updateMany.mockRejectedValue(new Error('DB error'));

    const result = await markSessionExpired('user-1', 'MERCADO_LIVRE');
    expect(result).toBe(false);
  });
});

// ============================================================
// getUserSessions
// ============================================================

describe('getUserSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when user has no sessions', async () => {
    mockPrisma.userSession.findMany.mockResolvedValue([]);

    const result = await getUserSessions('user-1');

    expect(result).toEqual([]);
    expect(mockPrisma.userSession.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('returns mapped SessionInfo array for multiple sessions', async () => {
    const dbSessions = [
      makeDbSession({ id: 's-1', site: 'MERCADO_LIVRE' }),
      makeDbSession({ id: 's-2', site: 'FACEBOOK_MARKETPLACE', status: 'NEEDS_REAUTH' }),
    ];
    mockPrisma.userSession.findMany.mockResolvedValue(dbSessions);

    const result = await getUserSessions('user-1');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('s-1');
    expect(result[1].id).toBe('s-2');
    expect(result[1].status).toBe('NEEDS_REAUTH');
  });

  it('maps all SessionInfo fields correctly', async () => {
    const session = makeDbSession({
      accountLabel: 'My Account',
      metadata: { foo: 'bar' },
    });
    mockPrisma.userSession.findMany.mockResolvedValue([session]);

    const result = await getUserSessions('user-1');

    expect(result[0]).toMatchObject({
      id: 'session-1',
      userId: 'user-1',
      site: 'MERCADO_LIVRE',
      domain: 'mercadolivre.com.br',
      status: 'ACTIVE',
      accountLabel: 'My Account',
      metadata: { foo: 'bar' },
    });
  });
});

// ============================================================
// getSessionStatus
// ============================================================

describe('getSessionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for unsupported site', async () => {
    const result = await getSessionStatus('user-1', 'BAD_SITE');
    expect(result).toBeNull();
    expect(mockPrisma.userSession.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when session not found', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(null);

    const result = await getSessionStatus('user-1', 'MERCADO_LIVRE');
    expect(result).toBeNull();
  });

  it('returns SessionInfo when session exists', async () => {
    const session = makeDbSession({ status: 'ACTIVE' });
    mockPrisma.userSession.findUnique.mockResolvedValue(session);

    const result = await getSessionStatus('user-1', 'MERCADO_LIVRE');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('session-1');
    expect(result!.status).toBe('ACTIVE');
    expect(mockPrisma.userSession.findUnique).toHaveBeenCalledWith({
      where: {
        userId_site_domain: {
          userId: 'user-1',
          site: 'MERCADO_LIVRE',
          domain: 'mercadolivre.com.br',
        },
      },
    });
  });
});

// ============================================================
// deleteSession
// ============================================================

describe('deleteSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false for unsupported site', async () => {
    const result = await deleteSession('user-1', 'BAD_SITE');
    expect(result).toBe(false);
    expect(mockPrisma.userSession.deleteMany).not.toHaveBeenCalled();
  });

  it('calls deleteMany with correct where clause', async () => {
    mockPrisma.userSession.deleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteSession('user-1', 'MERCADO_LIVRE');

    expect(result).toBe(true);
    expect(mockPrisma.userSession.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        site: 'MERCADO_LIVRE',
        domain: 'mercadolivre.com.br',
      },
    });
  });

  it('returns false on DB error', async () => {
    mockPrisma.userSession.deleteMany.mockRejectedValue(new Error('DB error'));

    const result = await deleteSession('user-1', 'MERCADO_LIVRE');
    expect(result).toBe(false);
  });

  it('returns true even when no sessions deleted (count=0)', async () => {
    mockPrisma.userSession.deleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteSession('user-1', 'SUPERBID');
    expect(result).toBe(true);
  });
});

// ============================================================
// hasActiveSession
// ============================================================

describe('hasActiveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when session status is ACTIVE', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(makeDbSession({ status: 'ACTIVE' }));

    const result = await hasActiveSession('user-1', 'MERCADO_LIVRE');
    expect(result).toBe(true);
  });

  it('returns false when session status is NEEDS_REAUTH', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(makeDbSession({ status: 'NEEDS_REAUTH' }));

    const result = await hasActiveSession('user-1', 'MERCADO_LIVRE');
    expect(result).toBe(false);
  });

  it('returns false when session status is EXPIRED', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(makeDbSession({ status: 'EXPIRED' }));

    const result = await hasActiveSession('user-1', 'MERCADO_LIVRE');
    expect(result).toBe(false);
  });

  it('returns false when no session found (unsupported site)', async () => {
    const result = await hasActiveSession('user-1', 'BAD_SITE');
    expect(result).toBe(false);
  });

  it('returns false when no session in DB', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(null);

    const result = await hasActiveSession('user-1', 'MERCADO_LIVRE');
    expect(result).toBe(false);
  });
});

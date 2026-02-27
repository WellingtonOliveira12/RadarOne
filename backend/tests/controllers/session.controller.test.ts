import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// HOISTED MOCKS
// ============================================================

const { mockSessionService, mockIsValidStorageState, MOCK_SUPPORTED_SITES } = vi.hoisted(() => ({
  mockSessionService: {
    getAll: vi.fn(),
    getStatus: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
  mockIsValidStorageState: vi.fn(),
  MOCK_SUPPORTED_SITES: {
    MERCADO_LIVRE: { displayName: 'Mercado Livre', domains: ['mercadolivre.com.br'] },
    FACEBOOK_MARKETPLACE: { displayName: 'Facebook Marketplace', domains: ['facebook.com'] },
  } as Record<string, { displayName: string; domains: string[] }>,
}));

vi.mock('../../src/services/sessionService', () => ({
  sessionService: mockSessionService,
  SUPPORTED_SITES: MOCK_SUPPORTED_SITES,
}));

vi.mock('../../src/utils/session-crypto', () => ({
  isValidStorageState: mockIsValidStorageState,
}));

// Import AFTER mocks
import {
  listSessions,
  getSessionStatus,
  uploadSession,
  deleteSession,
  validateSession,
  getSupportedSites,
} from '../../src/controllers/session.controller';

// ============================================================
// HELPERS
// ============================================================

function makeReq(overrides: Partial<any> = {}): any {
  return {
    userId: 'user-1',
    params: {},
    query: {},
    body: {},
    file: undefined,
    ...overrides,
  };
}

function makeRes(): any {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

const mockSessionRecord = {
  id: 'session-1',
  userId: 'user-1',
  site: 'MERCADO_LIVRE',
  domain: 'mercadolivre.com.br',
  status: 'ACTIVE',
  accountLabel: 'my-account',
  metadata: { cookiesCount: 5 },
  expiresAt: new Date('2026-12-31'),
  lastUsedAt: new Date('2026-01-01'),
  lastErrorAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// ============================================================
// TESTS
// ============================================================

describe('session.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // listSessions
  // ----------------------------------------------------------
  describe('listSessions', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined });
      const res = makeRes();

      await listSessions(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: 'INVALID_TOKEN' })
      );
    });

    it('returns session list with supported sites', async () => {
      const req = makeReq();
      const res = makeRes();
      mockSessionService.getAll.mockResolvedValue([mockSessionRecord]);

      await listSessions(req, res);

      expect(mockSessionService.getAll).toHaveBeenCalledWith('user-1');
      const call = res.json.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.sessions).toHaveLength(1);
      expect(call.sessions[0]).toMatchObject({
        id: 'session-1',
        site: 'MERCADO_LIVRE',
        siteName: 'Mercado Livre',
        status: 'ACTIVE',
        statusLabel: 'Conectado',
        cookiesCount: 5,
      });
      expect(call.supportedSites).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'MERCADO_LIVRE', name: 'Mercado Livre' }),
        ])
      );
    });

    it('uses raw site name when site not in SUPPORTED_SITES', async () => {
      const req = makeReq();
      const res = makeRes();
      const unknownSession = { ...mockSessionRecord, site: 'UNKNOWN_SITE' };
      mockSessionService.getAll.mockResolvedValue([unknownSession]);

      await listSessions(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.sessions[0].siteName).toBe('UNKNOWN_SITE');
    });

    it('handles session with missing cookiesCount metadata', async () => {
      const req = makeReq();
      const res = makeRes();
      const sessionNoMeta = { ...mockSessionRecord, metadata: null };
      mockSessionService.getAll.mockResolvedValue([sessionNoMeta]);

      await listSessions(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.sessions[0].cookiesCount).toBe(0);
    });

    it('returns 500 on service error', async () => {
      const req = makeReq();
      const res = makeRes();
      mockSessionService.getAll.mockRejectedValue(new Error('DB down'));

      await listSessions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao listar sessões' });
    });
  });

  // ----------------------------------------------------------
  // getSessionStatus
  // ----------------------------------------------------------
  describe('getSessionStatus', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();

      await getSessionStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 for unsupported site', async () => {
      const req = makeReq({ params: { site: 'UNKNOWN_SITE' } });
      const res = makeRes();

      await getSessionStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('UNKNOWN_SITE') })
      );
    });

    it('returns NOT_CONNECTED when session does not exist', async () => {
      const req = makeReq({ params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();
      mockSessionService.getStatus.mockResolvedValue(null);

      await getSessionStatus(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.hasSession).toBe(false);
      expect(call.status).toBe('NOT_CONNECTED');
    });

    it('returns session status when session exists', async () => {
      const req = makeReq({ params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();
      mockSessionService.getStatus.mockResolvedValue(mockSessionRecord);

      await getSessionStatus(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.hasSession).toBe(true);
      expect(call.status).toBe('ACTIVE');
      expect(call.statusLabel).toBe('Conectado');
      expect(call.needsAction).toBe(false);
    });

    it('sets needsAction true when status is not ACTIVE', async () => {
      const req = makeReq({ params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();
      mockSessionService.getStatus.mockResolvedValue({
        ...mockSessionRecord,
        status: 'NEEDS_REAUTH',
      });

      await getSessionStatus(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.needsAction).toBe(true);
      expect(call.statusLabel).toBe('Reconectar');
    });

    it('returns 500 on service error', async () => {
      const req = makeReq({ params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();
      mockSessionService.getStatus.mockRejectedValue(new Error('DB crash'));

      await getSessionStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----------------------------------------------------------
  // uploadSession
  // ----------------------------------------------------------
  describe('uploadSession', () => {
    const validStorageStateJson = JSON.stringify({
      cookies: [{ name: 'session', value: 'abc' }],
      origins: [{ origin: 'https://mercadolivre.com.br', localStorage: [] }],
    });

    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();

      await uploadSession(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 for unsupported site', async () => {
      const req = makeReq({ params: { site: 'INVALID_SITE' }, body: {} });
      const res = makeRes();

      await uploadSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when no storageState provided', async () => {
      const req = makeReq({ params: { site: 'MERCADO_LIVRE' }, body: {} });
      const res = makeRes();

      await uploadSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'storageState não fornecido' })
      );
    });

    it('accepts storageState from request body as string', async () => {
      const req = makeReq({
        params: { site: 'MERCADO_LIVRE' },
        body: { storageState: validStorageStateJson },
      });
      const res = makeRes();
      mockIsValidStorageState.mockReturnValue(true);
      mockSessionService.save.mockResolvedValue({
        success: true,
        sessionId: 'session-1',
        message: 'OK',
        meta: { cookiesCount: 1, originsCount: 1 },
      });

      await uploadSession(req, res);

      expect(mockSessionService.save).toHaveBeenCalledWith(
        'user-1',
        'MERCADO_LIVRE',
        validStorageStateJson,
        undefined
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, sessionId: 'session-1' })
      );
    });

    it('accepts storageState from request body as object', async () => {
      const storageStateObj = { cookies: [], origins: [] };
      const req = makeReq({
        params: { site: 'MERCADO_LIVRE' },
        body: { storageState: storageStateObj },
      });
      const res = makeRes();
      mockIsValidStorageState.mockReturnValue(true);
      mockSessionService.save.mockResolvedValue({
        success: true,
        sessionId: 'session-1',
        message: 'OK',
        meta: { cookiesCount: 0, originsCount: 0 },
      });

      await uploadSession(req, res);

      expect(mockIsValidStorageState).toHaveBeenCalledWith(JSON.stringify(storageStateObj));
    });

    it('accepts storageState as base64', async () => {
      const base64State = Buffer.from(validStorageStateJson).toString('base64');
      const req = makeReq({
        params: { site: 'MERCADO_LIVRE' },
        body: { storageStateBase64: base64State },
      });
      const res = makeRes();
      mockIsValidStorageState.mockReturnValue(true);
      mockSessionService.save.mockResolvedValue({
        success: true,
        sessionId: 'session-1',
        message: 'OK',
        meta: { cookiesCount: 1, originsCount: 1 },
      });

      await uploadSession(req, res);

      expect(mockIsValidStorageState).toHaveBeenCalledWith(validStorageStateJson);
    });

    it('accepts storageState from file upload', async () => {
      const req = makeReq({
        params: { site: 'MERCADO_LIVRE' },
        body: {},
        file: { buffer: Buffer.from(validStorageStateJson, 'utf-8') },
      });
      const res = makeRes();
      mockIsValidStorageState.mockReturnValue(true);
      mockSessionService.save.mockResolvedValue({
        success: true,
        sessionId: 'session-1',
        message: 'OK',
        meta: { cookiesCount: 1, originsCount: 1 },
      });

      await uploadSession(req, res);

      expect(mockIsValidStorageState).toHaveBeenCalledWith(validStorageStateJson);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 400 for invalid storageState format', async () => {
      const req = makeReq({
        params: { site: 'MERCADO_LIVRE' },
        body: { storageState: '{"invalid": true}' },
      });
      const res = makeRes();
      mockIsValidStorageState.mockReturnValue(false);

      await uploadSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'storageState inválido' })
      );
    });

    it('returns 400 when save fails', async () => {
      const req = makeReq({
        params: { site: 'MERCADO_LIVRE' },
        body: { storageState: validStorageStateJson },
      });
      const res = makeRes();
      mockIsValidStorageState.mockReturnValue(true);
      mockSessionService.save.mockResolvedValue({
        success: false,
        sessionId: '',
        message: 'Encryption failed',
      });

      await uploadSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Encryption failed' });
    });

    it('returns 500 on exception', async () => {
      const req = makeReq({
        params: { site: 'MERCADO_LIVRE' },
        body: { storageState: validStorageStateJson },
      });
      const res = makeRes();
      mockIsValidStorageState.mockReturnValue(true);
      mockSessionService.save.mockRejectedValue(new Error('Unexpected'));

      await uploadSession(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----------------------------------------------------------
  // deleteSession
  // ----------------------------------------------------------
  describe('deleteSession', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();

      await deleteSession(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 for unsupported site', async () => {
      const req = makeReq({ params: { site: 'NOT_REAL' } });
      const res = makeRes();

      await deleteSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('deletes session successfully', async () => {
      const req = makeReq({ params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();
      mockSessionService.delete.mockResolvedValue(true);

      await deleteSession(req, res);

      expect(mockSessionService.delete).toHaveBeenCalledWith('user-1', 'MERCADO_LIVRE');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Sessão removida com sucesso',
      });
    });

    it('returns 404 when session not found', async () => {
      const req = makeReq({ params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();
      mockSessionService.delete.mockResolvedValue(false);

      await deleteSession(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Sessão não encontrada' });
    });

    it('returns 500 on exception', async () => {
      const req = makeReq({ params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();
      mockSessionService.delete.mockRejectedValue(new Error('DB error'));

      await deleteSession(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----------------------------------------------------------
  // validateSession
  // ----------------------------------------------------------
  describe('validateSession', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();

      await validateSession(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 for unsupported site', async () => {
      const req = makeReq({ params: { site: 'XPTO' } });
      const res = makeRes();

      await validateSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when session does not exist', async () => {
      const req = makeReq({ params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();
      mockSessionService.getStatus.mockResolvedValue(null);

      await validateSession(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Sessão não encontrada' })
      );
    });

    it('returns active status when session is ACTIVE', async () => {
      const req = makeReq({ params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();
      mockSessionService.getStatus.mockResolvedValue({ ...mockSessionRecord, status: 'ACTIVE' });

      await validateSession(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        status: 'ACTIVE',
        statusLabel: 'Conectado',
        message: 'Sessão está ativa',
      });
    });

    it('returns reauth message when session needs reauthentication', async () => {
      const req = makeReq({ params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();
      mockSessionService.getStatus.mockResolvedValue({
        ...mockSessionRecord,
        status: 'NEEDS_REAUTH',
      });

      await validateSession(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.status).toBe('NEEDS_REAUTH');
      expect(call.message).toContain('reautenticação');
    });

    it('returns 500 on exception', async () => {
      const req = makeReq({ params: { site: 'MERCADO_LIVRE' } });
      const res = makeRes();
      mockSessionService.getStatus.mockRejectedValue(new Error('Service down'));

      await validateSession(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----------------------------------------------------------
  // getSupportedSites
  // ----------------------------------------------------------
  describe('getSupportedSites', () => {
    it('returns all supported sites', async () => {
      const req = makeReq();
      const res = makeRes();

      await getSupportedSites(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.sites).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'MERCADO_LIVRE', name: 'Mercado Livre' }),
          expect.objectContaining({ id: 'FACEBOOK_MARKETPLACE', name: 'Facebook Marketplace' }),
        ])
      );
    });
  });
});

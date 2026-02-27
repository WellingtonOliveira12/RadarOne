import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// HOISTED MOCKS
// ============================================================

const { mockMonitorService } = vi.hoisted(() => ({
  mockMonitorService: {
    listMonitors: vi.fn(),
    getMonitorById: vi.fn(),
    createMonitor: vi.fn(),
    updateMonitor: vi.fn(),
    deleteMonitor: vi.fn(),
    toggleMonitorActive: vi.fn(),
  },
}));

vi.mock('../../src/services/monitorService', () => mockMonitorService);

// Mock MonitorSite enum from @prisma/client
vi.mock('@prisma/client', () => ({
  MonitorSite: {
    MERCADO_LIVRE: 'MERCADO_LIVRE',
    OLX: 'OLX',
    LEILAO: 'LEILAO',
    FACEBOOK: 'FACEBOOK',
    IMOVELWEB: 'IMOVELWEB',
    VIVAREAL: 'VIVAREAL',
    ZAPIMOVEIS: 'ZAPIMOVEIS',
    WEBMOTORS: 'WEBMOTORS',
    ICARROS: 'ICARROS',
  },
}));

// Import AFTER mocks
import {
  getMonitors,
  getMonitor,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  toggleMonitorActive,
} from '../../src/controllers/monitorController';

// ============================================================
// HELPERS
// ============================================================

function makeReq(overrides: Partial<any> = {}): any {
  return {
    userId: 'user-1',
    params: {},
    query: {},
    body: {},
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

const mockMonitor = {
  id: 'monitor-1',
  userId: 'user-1',
  name: 'Test Monitor',
  site: 'MERCADO_LIVRE',
  searchUrl: 'https://lista.mercadolivre.com.br/test',
  active: true,
  createdAt: new Date(),
};

// ============================================================
// TESTS
// ============================================================

describe('monitorController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // getMonitors
  // ----------------------------------------------------------
  describe('getMonitors', () => {
    it('returns monitors list with success', async () => {
      const req = makeReq();
      const res = makeRes();
      mockMonitorService.listMonitors.mockResolvedValue([mockMonitor]);

      await getMonitors(req, res);

      expect(mockMonitorService.listMonitors).toHaveBeenCalledWith('user-1');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [mockMonitor],
        count: 1,
      });
    });

    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined });
      const res = makeRes();

      await getMonitors(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Não autorizado' });
    });

    it('returns 500 on service error', async () => {
      const req = makeReq();
      const res = makeRes();
      mockMonitorService.listMonitors.mockRejectedValue(new Error('DB error'));

      await getMonitors(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Falha ao buscar monitores',
        message: 'DB error',
      });
    });
  });

  // ----------------------------------------------------------
  // getMonitor
  // ----------------------------------------------------------
  describe('getMonitor', () => {
    it('returns a single monitor', async () => {
      const req = makeReq({ params: { id: 'monitor-1' } });
      const res = makeRes();
      mockMonitorService.getMonitorById.mockResolvedValue(mockMonitor);

      await getMonitor(req, res);

      expect(mockMonitorService.getMonitorById).toHaveBeenCalledWith('user-1', 'monitor-1');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockMonitor });
    });

    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, params: { id: 'monitor-1' } });
      const res = makeRes();

      await getMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 when id is missing', async () => {
      const req = makeReq({ params: {} });
      const res = makeRes();

      await getMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'ID do monitor é obrigatório' });
    });

    it('returns 404 when monitor not found', async () => {
      const req = makeReq({ params: { id: 'nonexistent' } });
      const res = makeRes();
      mockMonitorService.getMonitorById.mockResolvedValue(null);

      await getMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Monitor não encontrado ou acesso negado' });
    });

    it('returns 500 on service error', async () => {
      const req = makeReq({ params: { id: 'monitor-1' } });
      const res = makeRes();
      mockMonitorService.getMonitorById.mockRejectedValue(new Error('Connection failed'));

      await getMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----------------------------------------------------------
  // createMonitor
  // ----------------------------------------------------------
  describe('createMonitor', () => {
    const validBody = {
      name: 'Test Monitor',
      site: 'MERCADO_LIVRE',
      searchUrl: 'https://lista.mercadolivre.com.br/test',
    };

    it('creates monitor with success', async () => {
      const req = makeReq({ body: validBody });
      const res = makeRes();
      mockMonitorService.createMonitor.mockResolvedValue(mockMonitor);

      await createMonitor(req, res);

      expect(mockMonitorService.createMonitor).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ name: 'Test Monitor', site: 'MERCADO_LIVRE' })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Monitor criado com sucesso',
        data: mockMonitor,
      });
    });

    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, body: validBody });
      const res = makeRes();

      await createMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 when required fields are missing', async () => {
      const req = makeReq({ body: { name: 'Test' } });
      const res = makeRes();

      await createMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Erro de validação' })
      );
    });

    it('allows missing searchUrl in STRUCTURED_FILTERS mode', async () => {
      const req = makeReq({
        body: { name: 'Test', site: 'MERCADO_LIVRE', mode: 'STRUCTURED_FILTERS' },
      });
      const res = makeRes();
      mockMonitorService.createMonitor.mockResolvedValue(mockMonitor);

      await createMonitor(req, res);

      expect(mockMonitorService.createMonitor).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 400 for invalid site enum', async () => {
      const req = makeReq({ body: { ...validBody, site: 'INVALID_SITE' } });
      const res = makeRes();

      await createMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Site inválido') })
      );
    });

    it('returns 400 for negative priceMin', async () => {
      const req = makeReq({ body: { ...validBody, priceMin: -10 } });
      const res = makeRes();

      await createMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Preço mínimo deve ser maior ou igual a 0' })
      );
    });

    it('returns 400 for negative priceMax', async () => {
      const req = makeReq({ body: { ...validBody, priceMax: -5 } });
      const res = makeRes();

      await createMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Preço máximo deve ser maior ou igual a 0' })
      );
    });

    it('returns 400 for invalid country code', async () => {
      const req = makeReq({ body: { ...validBody, country: 'INVALID' } });
      const res = makeRes();

      await createMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('ISO-3166') })
      );
    });

    it('accepts valid 2-letter country code and normalizes', async () => {
      const req = makeReq({ body: { ...validBody, country: 'br', stateRegion: 'SP', city: 'São Paulo' } });
      const res = makeRes();
      mockMonitorService.createMonitor.mockResolvedValue(mockMonitor);

      await createMonitor(req, res);

      expect(mockMonitorService.createMonitor).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ country: 'BR', stateRegion: 'SP', city: 'São Paulo' })
      );
    });

    it('returns 403 on plan limit error', async () => {
      const req = makeReq({ body: validBody });
      const res = makeRes();
      mockMonitorService.createMonitor.mockRejectedValue(
        new Error('Monitor limit reached. Upgrade your plan')
      );

      await createMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 400 on generic service error', async () => {
      const req = makeReq({ body: validBody });
      const res = makeRes();
      mockMonitorService.createMonitor.mockRejectedValue(new Error('Generic error'));

      await createMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ----------------------------------------------------------
  // updateMonitor
  // ----------------------------------------------------------
  describe('updateMonitor', () => {
    it('updates monitor with success', async () => {
      const req = makeReq({
        params: { id: 'monitor-1' },
        body: { name: 'Updated Name', active: false },
      });
      const res = makeRes();
      const updated = { ...mockMonitor, name: 'Updated Name', active: false };
      mockMonitorService.updateMonitor.mockResolvedValue(updated);

      await updateMonitor(req, res);

      expect(mockMonitorService.updateMonitor).toHaveBeenCalledWith(
        'user-1',
        'monitor-1',
        expect.objectContaining({ name: 'Updated Name', active: false })
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Monitor atualizado com sucesso',
        data: updated,
      });
    });

    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, params: { id: 'monitor-1' }, body: {} });
      const res = makeRes();

      await updateMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 when id is missing', async () => {
      const req = makeReq({ params: {}, body: { name: 'New Name' } });
      const res = makeRes();

      await updateMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for invalid site in update', async () => {
      const req = makeReq({ params: { id: 'monitor-1' }, body: { site: 'UNKNOWN' } });
      const res = makeRes();

      await updateMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for negative priceMin in update', async () => {
      const req = makeReq({ params: { id: 'monitor-1' }, body: { priceMin: -1 } });
      const res = makeRes();

      await updateMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for negative priceMax in update', async () => {
      const req = makeReq({ params: { id: 'monitor-1' }, body: { priceMax: -1 } });
      const res = makeRes();

      await updateMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for invalid country code in update', async () => {
      const req = makeReq({ params: { id: 'monitor-1' }, body: { country: 'BRAZIL' } });
      const res = makeRes();

      await updateMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('sets country to null when empty string provided', async () => {
      const req = makeReq({ params: { id: 'monitor-1' }, body: { country: '' } });
      const res = makeRes();
      mockMonitorService.updateMonitor.mockResolvedValue(mockMonitor);

      await updateMonitor(req, res);

      expect(mockMonitorService.updateMonitor).toHaveBeenCalledWith(
        'user-1',
        'monitor-1',
        expect.objectContaining({ country: null })
      );
    });

    it('returns 403 on plan limit error', async () => {
      const req = makeReq({ params: { id: 'monitor-1' }, body: { active: true } });
      const res = makeRes();
      mockMonitorService.updateMonitor.mockRejectedValue(
        new Error('plan limit exceeded. Upgrade required')
      );

      await updateMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 404 on not found error', async () => {
      const req = makeReq({ params: { id: 'ghost-id' }, body: {} });
      const res = makeRes();
      mockMonitorService.updateMonitor.mockRejectedValue(
        new Error('Monitor not found in database')
      );

      await updateMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 on generic service error', async () => {
      const req = makeReq({ params: { id: 'monitor-1' }, body: {} });
      const res = makeRes();
      mockMonitorService.updateMonitor.mockRejectedValue(new Error('Unexpected failure'));

      await updateMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ----------------------------------------------------------
  // deleteMonitor
  // ----------------------------------------------------------
  describe('deleteMonitor', () => {
    it('deletes monitor with success', async () => {
      const req = makeReq({ params: { id: 'monitor-1' } });
      const res = makeRes();
      mockMonitorService.deleteMonitor.mockResolvedValue(undefined);

      await deleteMonitor(req, res);

      expect(mockMonitorService.deleteMonitor).toHaveBeenCalledWith('user-1', 'monitor-1');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Monitor excluído com sucesso',
      });
    });

    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, params: { id: 'monitor-1' } });
      const res = makeRes();

      await deleteMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 when id is missing', async () => {
      const req = makeReq({ params: {} });
      const res = makeRes();

      await deleteMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 on not found error', async () => {
      const req = makeReq({ params: { id: 'ghost' } });
      const res = makeRes();
      mockMonitorService.deleteMonitor.mockRejectedValue(
        new Error('Monitor not found')
      );

      await deleteMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 on generic error', async () => {
      const req = makeReq({ params: { id: 'monitor-1' } });
      const res = makeRes();
      mockMonitorService.deleteMonitor.mockRejectedValue(new Error('DB crashed'));

      await deleteMonitor(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----------------------------------------------------------
  // toggleMonitorActive
  // ----------------------------------------------------------
  describe('toggleMonitorActive', () => {
    it('activates monitor and returns correct message', async () => {
      const req = makeReq({ params: { id: 'monitor-1' } });
      const res = makeRes();
      mockMonitorService.toggleMonitorActive.mockResolvedValue({ ...mockMonitor, active: true });

      await toggleMonitorActive(req, res);

      expect(mockMonitorService.toggleMonitorActive).toHaveBeenCalledWith('user-1', 'monitor-1');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Monitor ativado com sucesso' })
      );
    });

    it('deactivates monitor and returns correct message', async () => {
      const req = makeReq({ params: { id: 'monitor-1' } });
      const res = makeRes();
      mockMonitorService.toggleMonitorActive.mockResolvedValue({ ...mockMonitor, active: false });

      await toggleMonitorActive(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Monitor desativado com sucesso' })
      );
    });

    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined, params: { id: 'monitor-1' } });
      const res = makeRes();

      await toggleMonitorActive(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 when id is missing', async () => {
      const req = makeReq({ params: {} });
      const res = makeRes();

      await toggleMonitorActive(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 403 on plan limit error', async () => {
      const req = makeReq({ params: { id: 'monitor-1' } });
      const res = makeRes();
      mockMonitorService.toggleMonitorActive.mockRejectedValue(
        new Error('Active monitor limit reached. Upgrade your plan')
      );

      await toggleMonitorActive(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 404 on not found error', async () => {
      const req = makeReq({ params: { id: 'ghost' } });
      const res = makeRes();
      mockMonitorService.toggleMonitorActive.mockRejectedValue(
        new Error('Monitor not found')
      );

      await toggleMonitorActive(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 on generic service error', async () => {
      const req = makeReq({ params: { id: 'monitor-1' } });
      const res = makeRes();
      mockMonitorService.toggleMonitorActive.mockRejectedValue(new Error('Unknown error'));

      await toggleMonitorActive(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});

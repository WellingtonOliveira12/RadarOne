import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for monitorService — CRUD operations with plan validation
 *
 * Cases tested:
 * - listMonitors: returns user monitors ordered by createdAt desc
 * - getMonitorById: returns monitor if it belongs to user, null otherwise
 * - createMonitor: validates plan limits, site access, required fields, price range
 * - updateMonitor: validates ownership, site change, reactivation limits, price range
 * - deleteMonitor: validates ownership before deleting
 * - toggleMonitorActive: validates plan limits when activating
 */

const { mockPrisma, mockCanUserCreateMonitor, mockCanUserUseSite } = vi.hoisted(() => ({
  mockPrisma: {
    monitor: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
  mockCanUserCreateMonitor: vi.fn(),
  mockCanUserUseSite: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../src/services/planService', () => ({
  canUserCreateMonitor: mockCanUserCreateMonitor,
  canUserUseSite: mockCanUserUseSite,
}));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

import {
  listMonitors,
  getMonitorById,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  toggleMonitorActive,
  countActiveMonitors,
  getUserSites,
} from '../../src/services/monitorService';

// ============================================
// FIXTURES
// ============================================

const USER_ID = 'user-123';
const MONITOR_ID = 'monitor-456';

const MOCK_MONITOR = {
  id: MONITOR_ID,
  userId: USER_ID,
  name: 'Test Monitor',
  site: 'MERCADO_LIVRE' as const,
  searchUrl: 'https://example.com/search',
  priceMin: 100,
  priceMax: 500,
  mode: 'URL_ONLY' as const,
  filtersJson: null,
  country: null,
  stateRegion: null,
  city: null,
  active: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function allowCreateAndUseSite() {
  mockCanUserCreateMonitor.mockResolvedValue({ canCreate: true, reason: '' });
  mockCanUserUseSite.mockResolvedValue({ canUse: true, reason: '' });
}

// ============================================
// listMonitors
// ============================================

describe('listMonitors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns monitors for user ordered by createdAt desc', async () => {
    const monitors = [MOCK_MONITOR, { ...MOCK_MONITOR, id: 'monitor-789' }];
    mockPrisma.monitor.findMany.mockResolvedValue(monitors);

    const result = await listMonitors(USER_ID);

    expect(result).toEqual(monitors);
    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns empty array when user has no monitors', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);

    const result = await listMonitors(USER_ID);

    expect(result).toEqual([]);
  });

  it('throws when prisma fails', async () => {
    mockPrisma.monitor.findMany.mockRejectedValue(new Error('DB error'));

    await expect(listMonitors(USER_ID)).rejects.toThrow('Falha ao listar monitores');
  });
});

// ============================================
// getMonitorById
// ============================================

describe('getMonitorById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns monitor when it belongs to user', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(MOCK_MONITOR);

    const result = await getMonitorById(USER_ID, MONITOR_ID);

    expect(result).toEqual(MOCK_MONITOR);
    expect(mockPrisma.monitor.findFirst).toHaveBeenCalledWith({
      where: { id: MONITOR_ID, userId: USER_ID },
    });
  });

  it('returns null when monitor does not belong to user', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);

    const result = await getMonitorById('other-user', MONITOR_ID);

    expect(result).toBeNull();
  });

  it('throws when prisma fails', async () => {
    mockPrisma.monitor.findFirst.mockRejectedValue(new Error('DB error'));

    await expect(getMonitorById(USER_ID, MONITOR_ID)).rejects.toThrow('Falha ao buscar monitor');
  });
});

// ============================================
// createMonitor
// ============================================

describe('createMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates monitor with valid data', async () => {
    allowCreateAndUseSite();
    mockPrisma.monitor.create.mockResolvedValue({ ...MOCK_MONITOR, id: 'new-monitor' });

    const input = {
      name: 'Test Monitor',
      site: 'MERCADO_LIVRE' as const,
      searchUrl: 'https://example.com/search',
      priceMin: 100,
      priceMax: 500,
    };

    const result = await createMonitor(USER_ID, input);

    expect(result.id).toBe('new-monitor');
    expect(mockPrisma.monitor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        name: 'Test Monitor',
        site: 'MERCADO_LIVRE',
        searchUrl: 'https://example.com/search',
        active: true,
        mode: 'URL_ONLY',
      }),
    });
  });

  it('allows creation without searchUrl when mode is STRUCTURED_FILTERS', async () => {
    allowCreateAndUseSite();
    mockPrisma.monitor.create.mockResolvedValue({ ...MOCK_MONITOR, mode: 'STRUCTURED_FILTERS', searchUrl: null });

    const input = {
      name: 'Structured Monitor',
      site: 'FACEBOOK' as const,
      mode: 'STRUCTURED_FILTERS' as const,
    };

    const result = await createMonitor(USER_ID, input);

    expect(result).toBeDefined();
    expect(mockPrisma.monitor.create).toHaveBeenCalled();
  });

  it('rejects when user cannot create more monitors (plan limit)', async () => {
    mockCanUserCreateMonitor.mockResolvedValue({ canCreate: false, reason: 'Limite de monitores atingido' });

    const input = {
      name: 'Test',
      site: 'MERCADO_LIVRE' as const,
      searchUrl: 'https://example.com',
    };

    await expect(createMonitor(USER_ID, input)).rejects.toThrow('Limite de monitores atingido');
    expect(mockPrisma.monitor.create).not.toHaveBeenCalled();
  });

  it('rejects when user cannot use the requested site', async () => {
    mockCanUserCreateMonitor.mockResolvedValue({ canCreate: true, reason: '' });
    mockCanUserUseSite.mockResolvedValue({ canUse: false, reason: 'Site not allowed on free plan' });

    const input = {
      name: 'Test',
      site: 'FACEBOOK' as const,
      searchUrl: 'https://facebook.com',
    };

    await expect(createMonitor(USER_ID, input)).rejects.toThrow('Site not allowed on free plan');
    expect(mockPrisma.monitor.create).not.toHaveBeenCalled();
  });

  it('rejects when required fields are missing (no name)', async () => {
    allowCreateAndUseSite();

    const input = {
      name: '',
      site: 'MERCADO_LIVRE' as const,
      searchUrl: 'https://example.com',
    };

    await expect(createMonitor(USER_ID, input)).rejects.toThrow('Nome, site e URL de busca são obrigatórios');
  });

  it('rejects when searchUrl is missing and mode is URL_ONLY', async () => {
    allowCreateAndUseSite();

    const input = {
      name: 'Test',
      site: 'MERCADO_LIVRE' as const,
    };

    await expect(createMonitor(USER_ID, input)).rejects.toThrow('Nome, site e URL de busca são obrigatórios');
  });

  it('rejects when priceMin > priceMax', async () => {
    allowCreateAndUseSite();

    const input = {
      name: 'Test',
      site: 'MERCADO_LIVRE' as const,
      searchUrl: 'https://example.com',
      priceMin: 500,
      priceMax: 100,
    };

    await expect(createMonitor(USER_ID, input)).rejects.toThrow('Preço mínimo não pode ser maior que preço máximo');
  });

  it('accepts when priceMin equals priceMax', async () => {
    allowCreateAndUseSite();
    mockPrisma.monitor.create.mockResolvedValue({ ...MOCK_MONITOR, priceMin: 300, priceMax: 300 });

    const input = {
      name: 'Test',
      site: 'MERCADO_LIVRE' as const,
      searchUrl: 'https://example.com',
      priceMin: 300,
      priceMax: 300,
    };

    const result = await createMonitor(USER_ID, input);
    expect(result).toBeDefined();
  });
});

// ============================================
// updateMonitor
// ============================================

describe('updateMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates monitor successfully', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(MOCK_MONITOR);
    mockPrisma.monitor.update.mockResolvedValue({ ...MOCK_MONITOR, name: 'Updated Name' });

    const result = await updateMonitor(USER_ID, MONITOR_ID, { name: 'Updated Name' });

    expect(result.name).toBe('Updated Name');
    expect(mockPrisma.monitor.update).toHaveBeenCalledWith({
      where: { id: MONITOR_ID },
      data: expect.objectContaining({ name: 'Updated Name' }),
    });
  });

  it('rejects when monitor not found', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);

    await expect(updateMonitor(USER_ID, 'nonexistent', { name: 'Test' }))
      .rejects.toThrow('Monitor não encontrado ou acesso negado');
  });

  it('validates site change against plan', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(MOCK_MONITOR);
    mockCanUserUseSite.mockResolvedValue({ canUse: false, reason: 'Site not allowed' });

    await expect(updateMonitor(USER_ID, MONITOR_ID, { site: 'FACEBOOK' as any }))
      .rejects.toThrow('Site not allowed');
  });

  it('skips site validation when site is unchanged', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(MOCK_MONITOR);
    mockPrisma.monitor.update.mockResolvedValue({ ...MOCK_MONITOR, name: 'New Name' });

    await updateMonitor(USER_ID, MONITOR_ID, { site: 'MERCADO_LIVRE' as any, name: 'New Name' });

    expect(mockCanUserUseSite).not.toHaveBeenCalled();
  });

  it('validates plan limits when reactivating a monitor', async () => {
    const inactiveMonitor = { ...MOCK_MONITOR, active: false };
    mockPrisma.monitor.findFirst.mockResolvedValue(inactiveMonitor);
    mockCanUserCreateMonitor.mockResolvedValue({ canCreate: false, reason: 'Limit reached' });

    await expect(updateMonitor(USER_ID, MONITOR_ID, { active: true }))
      .rejects.toThrow('Limit reached');
  });

  it('rejects when new price range is invalid', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(MOCK_MONITOR);

    await expect(updateMonitor(USER_ID, MONITOR_ID, { priceMin: 1000 }))
      .rejects.toThrow('Preço mínimo não pode ser maior que preço máximo');
  });
});

// ============================================
// deleteMonitor
// ============================================

describe('deleteMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes monitor when it belongs to user', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(MOCK_MONITOR);
    mockPrisma.monitor.delete.mockResolvedValue(MOCK_MONITOR);

    await deleteMonitor(USER_ID, MONITOR_ID);

    expect(mockPrisma.monitor.delete).toHaveBeenCalledWith({
      where: { id: MONITOR_ID },
    });
  });

  it('rejects when monitor not found', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);

    await expect(deleteMonitor(USER_ID, 'nonexistent'))
      .rejects.toThrow('Monitor não encontrado ou acesso negado');

    expect(mockPrisma.monitor.delete).not.toHaveBeenCalled();
  });
});

// ============================================
// toggleMonitorActive
// ============================================

describe('toggleMonitorActive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deactivates an active monitor without plan validation', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(MOCK_MONITOR);
    mockPrisma.monitor.update.mockResolvedValue({ ...MOCK_MONITOR, active: false });

    const result = await toggleMonitorActive(USER_ID, MONITOR_ID);

    expect(result.active).toBe(false);
    expect(mockCanUserCreateMonitor).not.toHaveBeenCalled();
    expect(mockCanUserUseSite).not.toHaveBeenCalled();
  });

  it('activates an inactive monitor with plan validation', async () => {
    const inactiveMonitor = { ...MOCK_MONITOR, active: false };
    mockPrisma.monitor.findFirst.mockResolvedValue(inactiveMonitor);
    mockCanUserCreateMonitor.mockResolvedValue({ canCreate: true, reason: '' });
    mockCanUserUseSite.mockResolvedValue({ canUse: true, reason: '' });
    mockPrisma.monitor.update.mockResolvedValue({ ...MOCK_MONITOR, active: true });

    const result = await toggleMonitorActive(USER_ID, MONITOR_ID);

    expect(result.active).toBe(true);
    expect(mockCanUserCreateMonitor).toHaveBeenCalledWith(USER_ID);
    expect(mockCanUserUseSite).toHaveBeenCalledWith(USER_ID, 'MERCADO_LIVRE');
  });

  it('rejects activation when plan limit reached', async () => {
    const inactiveMonitor = { ...MOCK_MONITOR, active: false };
    mockPrisma.monitor.findFirst.mockResolvedValue(inactiveMonitor);
    mockCanUserCreateMonitor.mockResolvedValue({ canCreate: false, reason: 'Limit reached' });

    await expect(toggleMonitorActive(USER_ID, MONITOR_ID))
      .rejects.toThrow('Limit reached');
  });

  it('rejects activation when site not allowed', async () => {
    const inactiveMonitor = { ...MOCK_MONITOR, active: false };
    mockPrisma.monitor.findFirst.mockResolvedValue(inactiveMonitor);
    mockCanUserCreateMonitor.mockResolvedValue({ canCreate: true, reason: '' });
    mockCanUserUseSite.mockResolvedValue({ canUse: false, reason: 'Site not available' });

    await expect(toggleMonitorActive(USER_ID, MONITOR_ID))
      .rejects.toThrow('Site not available');
  });

  it('rejects when monitor not found', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);

    await expect(toggleMonitorActive(USER_ID, 'nonexistent'))
      .rejects.toThrow('Monitor não encontrado ou acesso negado');
  });
});

// ============================================
// countActiveMonitors
// ============================================

describe('countActiveMonitors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns count of active monitors', async () => {
    mockPrisma.monitor.count.mockResolvedValue(3);

    const count = await countActiveMonitors(USER_ID);

    expect(count).toBe(3);
    expect(mockPrisma.monitor.count).toHaveBeenCalledWith({
      where: { userId: USER_ID, active: true },
    });
  });

  it('returns 0 on error', async () => {
    mockPrisma.monitor.count.mockRejectedValue(new Error('DB error'));

    const count = await countActiveMonitors(USER_ID);

    expect(count).toBe(0);
  });
});

// ============================================
// getUserSites
// ============================================

describe('getUserSites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns distinct sites used by user', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      { site: 'MERCADO_LIVRE' },
      { site: 'OLX' },
    ]);

    const sites = await getUserSites(USER_ID);

    expect(sites).toEqual(['MERCADO_LIVRE', 'OLX']);
  });

  it('returns empty array on error', async () => {
    mockPrisma.monitor.findMany.mockRejectedValue(new Error('DB error'));

    const sites = await getUserSites(USER_ID);

    expect(sites).toEqual([]);
  });
});

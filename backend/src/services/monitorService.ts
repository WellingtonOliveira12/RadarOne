import { prisma } from '../lib/prisma';
import { MonitorSite, MonitorMode } from '@prisma/client';
import { canUserCreateMonitor, canUserUseSite } from './planService';
import { logInfo, logError } from '../utils/loggerHelpers';

/**
 * Serviço de Monitores - RadarOne
 *
 * Gerencia CRUD de monitores com validações de plano
 */

// ============================================
// TYPES
// ============================================

export interface CreateMonitorInput {
  name: string;
  site: MonitorSite;
  searchUrl?: string;
  priceMin?: number;
  priceMax?: number;
  mode?: MonitorMode;
  filtersJson?: any;
  country?: string | null;
  stateRegion?: string | null;
  city?: string | null;
}

export interface UpdateMonitorInput {
  name?: string;
  site?: MonitorSite;
  searchUrl?: string;
  priceMin?: number;
  priceMax?: number;
  active?: boolean;
  mode?: MonitorMode;
  filtersJson?: any;
  country?: string | null;
  stateRegion?: string | null;
  city?: string | null;
}

// ============================================
// CRUD FUNCTIONS
// ============================================

/**
 * Lista todos os monitores de um usuário
 */
export async function listMonitors(userId: string) {
  try {
    const monitors = await prisma.monitor.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return monitors;
  } catch (error) {
    logError('Error listing monitors', { err: String(error) });
    throw new Error('Falha ao listar monitores');
  }
}

/**
 * Busca um monitor específico por ID
 * Verifica se o monitor pertence ao usuário
 */
export async function getMonitorById(userId: string, monitorId: string) {
  try {
    const monitor = await prisma.monitor.findFirst({
      where: {
        id: monitorId,
        userId, // Garante que o monitor pertence ao usuário
      },
    });

    return monitor;
  } catch (error) {
    logError('Error getting monitor', { err: String(error) });
    throw new Error('Falha ao buscar monitor');
  }
}

/**
 * Cria um novo monitor com validações de plano
 *
 * Validações aplicadas:
 * - Verifica limite de monitores do plano
 * - Verifica se plano permite múltiplos sites
 */
export async function createMonitor(
  userId: string,
  data: CreateMonitorInput
) {
  try {
    // Validação 1: Verifica se pode criar mais monitores
    const { canCreate, reason } = await canUserCreateMonitor(userId);

    if (!canCreate) {
      throw new Error(reason);
    }

    // Validação 2: Verifica se pode usar o site solicitado
    const { canUse, reason: siteReason } = await canUserUseSite(
      userId,
      data.site
    );

    if (!canUse) {
      throw new Error(siteReason);
    }

    // Validação 3: Valida campos obrigatórios
    // searchUrl é opcional em STRUCTURED_FILTERS (worker usa default URL)
    if (!data.name || !data.site || (!data.searchUrl && data.mode !== 'STRUCTURED_FILTERS')) {
      throw new Error('Nome, site e URL de busca são obrigatórios');
    }

    // Validação 4: Valida preços se fornecidos
    if (data.priceMin !== undefined && data.priceMax !== undefined) {
      if (data.priceMin > data.priceMax) {
        throw new Error('Preço mínimo não pode ser maior que preço máximo');
      }
    }

    // Cria o monitor
    const monitor = await prisma.monitor.create({
      data: {
        userId,
        name: data.name,
        site: data.site,
        searchUrl: data.searchUrl,
        priceMin: data.priceMin,
        priceMax: data.priceMax,
        mode: data.mode || 'URL_ONLY',
        filtersJson: data.filtersJson,
        country: data.country ?? null,
        stateRegion: data.stateRegion,
        city: data.city,
        active: true, // Novo monitor inicia ativo
      },
    });

    logInfo('Monitor created', { monitorId: monitor.id, userId });
    return monitor;
  } catch (error) {
    logError('Error creating monitor', { err: String(error) });
    throw error;
  }
}

/**
 * Atualiza um monitor existente
 *
 * Se estiver alterando o site, valida se o plano permite
 */
export async function updateMonitor(
  userId: string,
  monitorId: string,
  data: UpdateMonitorInput
) {
  try {
    // Verifica se monitor existe e pertence ao usuário
    const existingMonitor = await getMonitorById(userId, monitorId);

    if (!existingMonitor) {
      throw new Error('Monitor não encontrado ou acesso negado');
    }

    // Se está alterando o site, valida
    if (data.site && data.site !== existingMonitor.site) {
      const { canUse, reason } = await canUserUseSite(userId, data.site);

      if (!canUse) {
        throw new Error(reason);
      }
    }

    // Se está ativando um monitor inativo, valida limites
    if (data.active === true && existingMonitor.active === false) {
      const { canCreate, reason } = await canUserCreateMonitor(userId);

      if (!canCreate) {
        throw new Error(reason);
      }
    }

    // Validação de preços
    const newPriceMin = data.priceMin ?? existingMonitor.priceMin;
    const newPriceMax = data.priceMax ?? existingMonitor.priceMax;

    if (
      newPriceMin !== null &&
      newPriceMax !== null &&
      newPriceMin > newPriceMax
    ) {
      throw new Error('Preço mínimo não pode ser maior que preço máximo');
    }

    // Atualiza o monitor
    const monitor = await prisma.monitor.update({
      where: { id: monitorId },
      data: {
        name: data.name,
        site: data.site,
        searchUrl: data.searchUrl,
        priceMin: data.priceMin,
        priceMax: data.priceMax,
        active: data.active,
        mode: data.mode,
        filtersJson: data.filtersJson,
        country: data.country,
        stateRegion: data.stateRegion,
        city: data.city,
      },
    });

    logInfo('Monitor updated', { monitorId: monitor.id });
    return monitor;
  } catch (error) {
    logError('Error updating monitor', { err: String(error) });
    throw error;
  }
}

/**
 * Deleta um monitor
 */
export async function deleteMonitor(userId: string, monitorId: string) {
  try {
    // Verifica se monitor existe e pertence ao usuário
    const existingMonitor = await getMonitorById(userId, monitorId);

    if (!existingMonitor) {
      throw new Error('Monitor não encontrado ou acesso negado');
    }

    // Deleta o monitor (cascade vai deletar logs e ads relacionados)
    await prisma.monitor.delete({
      where: { id: monitorId },
    });

    logInfo('Monitor deleted', { monitorId });
  } catch (error) {
    logError('Error deleting monitor', { err: String(error) });
    throw error;
  }
}

/**
 * Alterna o estado ativo/inativo de um monitor
 *
 * Se estiver ativando, valida limites do plano
 */
export async function toggleMonitorActive(userId: string, monitorId: string) {
  try {
    // Busca monitor atual
    const existingMonitor = await getMonitorById(userId, monitorId);

    if (!existingMonitor) {
      throw new Error('Monitor não encontrado ou acesso negado');
    }

    const newActiveState = !existingMonitor.active;

    // Se está ativando, valida limites
    if (newActiveState === true) {
      const { canCreate, reason } = await canUserCreateMonitor(userId);

      if (!canCreate) {
        throw new Error(reason);
      }

      // Também valida se pode usar o site
      const { canUse, reason: siteReason } = await canUserUseSite(
        userId,
        existingMonitor.site
      );

      if (!canUse) {
        throw new Error(siteReason);
      }
    }

    // Atualiza o estado
    const monitor = await prisma.monitor.update({
      where: { id: monitorId },
      data: { active: newActiveState },
    });

    logInfo('Monitor toggled', { monitorId, active: newActiveState });
    return monitor;
  } catch (error) {
    logError('Error toggling monitor active state', { err: String(error) });
    throw error;
  }
}

/**
 * Conta monitores ativos de um usuário
 */
export async function countActiveMonitors(userId: string): Promise<number> {
  try {
    const count = await prisma.monitor.count({
      where: {
        userId,
        active: true,
      },
    });

    return count;
  } catch (error) {
    logError('Error counting active monitors', { err: String(error) });
    return 0;
  }
}

/**
 * Lista sites únicos usados pelo usuário
 */
export async function getUserSites(userId: string): Promise<MonitorSite[]> {
  try {
    const monitors = await prisma.monitor.findMany({
      where: { userId },
      select: { site: true },
      distinct: ['site'],
    });

    return monitors.map((m) => m.site);
  } catch (error) {
    logError('Error getting user sites', { err: String(error) });
    return [];
  }
}

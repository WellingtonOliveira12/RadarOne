import { prisma } from '../lib/prisma';
import { MonitorSite } from '@prisma/client';
import { canUserCreateMonitor, canUserUseSite } from './planService';

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
  searchUrl: string;
  priceMin?: number;
  priceMax?: number;
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
    console.error('Error listing monitors:', error);
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
    console.error('Error getting monitor:', error);
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
    if (!data.name || !data.site || !data.searchUrl) {
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
        country: data.country || 'BR',
        stateRegion: data.stateRegion,
        city: data.city,
        active: true, // Novo monitor inicia ativo
      },
    });

    console.log(`Monitor created: ${monitor.id} for user ${userId}`);
    return monitor;
  } catch (error) {
    console.error('Error creating monitor:', error);
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
        country: data.country,
        stateRegion: data.stateRegion,
        city: data.city,
      },
    });

    console.log(`Monitor updated: ${monitor.id}`);
    return monitor;
  } catch (error) {
    console.error('Error updating monitor:', error);
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

    console.log(`Monitor deleted: ${monitorId}`);
  } catch (error) {
    console.error('Error deleting monitor:', error);
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

    console.log(
      `Monitor ${monitorId} ${newActiveState ? 'activated' : 'deactivated'}`
    );
    return monitor;
  } catch (error) {
    console.error('Error toggling monitor active state:', error);
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
    console.error('Error counting active monitors:', error);
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
    console.error('Error getting user sites:', error);
    return [];
  }
}

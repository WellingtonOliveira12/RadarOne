import { prisma } from '../lib/prisma';
import { log } from '../utils/logger';

/**
 * Mapeamento centralizado: diagnosis.pageType -> enum PageType do Prisma
 */
const PAGE_TYPE_MAP: Record<string, string> = {
  CONTENT: 'CONTENT',
  BLOCKED: 'BLOCKED',
  CAPTCHA: 'CAPTCHA',
  LOGIN_REQUIRED: 'LOGIN_REQUIRED',
  CHECKPOINT: 'CHECKPOINT',
  NO_RESULTS: 'NO_RESULTS',
  EMPTY: 'EMPTY',
  UNKNOWN: 'UNKNOWN',
};

export function mapPageType(diagnosisPageType?: string): string {
  if (!diagnosisPageType) return 'UNKNOWN';
  return PAGE_TYPE_MAP[diagnosisPageType] || 'ERROR';
}

export class StatsRecorder {
  /**
   * Registra metricas de execucao.
   * - Usa await (nao fire-and-forget) para evitar promises penduradas em alta carga
   * - try/catch isolado: NUNCA propaga erro para o fluxo principal
   */
  static async record(data: {
    site: string;
    monitorId: string;
    userId: string;
    startedAt: Date;
    finishedAt: Date;
    durationMs: number;
    pageType: string;
    adsFound: number;
    success: boolean;
    errorCode?: string;
  }): Promise<void> {
    try {
      await prisma.siteExecutionStats.create({ data: data as any });
    } catch (error: any) {
      log.warn('STATS_RECORDER: Falha ao persistir metrica', {
        site: data.site,
        monitorId: data.monitorId,
        error: error.message,
      });
    }
  }
}

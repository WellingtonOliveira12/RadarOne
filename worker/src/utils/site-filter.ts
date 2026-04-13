/**
 * Site filter for worker instance sharding.
 *
 * Supports running the same worker code on multiple infrastructures,
 * each processing a disjoint subset of marketplaces. Driven by env vars:
 *
 *   WORKER_SITES_INCLUDE=MERCADO_LIVRE           → only ML
 *   WORKER_SITES_EXCLUDE=MERCADO_LIVRE           → everything except ML
 *   WORKER_SITES_INCLUDE=MERCADO_LIVRE,OLX       → only ML and OLX
 *   (neither set)                                → all sites (legacy behavior)
 *
 * INCLUDE takes precedence over EXCLUDE — if both are set, INCLUDE wins
 * and EXCLUDE is ignored, with a warning. The two are semantically
 * redundant when set together.
 *
 * Why this lives in its own module: pure, dependency-free, trivial to
 * unit-test without a Prisma connection.
 */

export interface SiteFilterConfig {
  include: string[];
  exclude: string[];
}

export interface SiteFilterClause {
  /** When present, the Prisma where clause fragment that restricts site. */
  clause: Record<string, unknown> | null;
  /** Human-readable summary for boot logs. */
  summary: string;
}

/**
 * Parse a comma-separated env var into a trimmed, deduplicated list of
 * uppercased site identifiers. Empty values yield an empty array.
 */
export function parseSiteList(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim().toUpperCase();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

/**
 * Build the site filter config from the current process env.
 */
export function readSiteFilterFromEnv(env: NodeJS.ProcessEnv = process.env): SiteFilterConfig {
  return {
    include: parseSiteList(env.WORKER_SITES_INCLUDE),
    exclude: parseSiteList(env.WORKER_SITES_EXCLUDE),
  };
}

/**
 * Build the Prisma where-clause fragment for monitor discovery based on
 * the INCLUDE/EXCLUDE config. Returns `clause: null` when no filter is
 * configured (legacy behavior — all sites processed).
 */
export function buildSiteFilterClause(config: SiteFilterConfig): SiteFilterClause {
  if (config.include.length > 0) {
    if (config.exclude.length > 0) {
      return {
        clause: { site: { in: config.include } },
        summary:
          `INCLUDE=[${config.include.join(',')}] (EXCLUDE ignored — ` +
          `INCLUDE takes precedence)`,
      };
    }
    return {
      clause: { site: { in: config.include } },
      summary: `INCLUDE=[${config.include.join(',')}]`,
    };
  }

  if (config.exclude.length > 0) {
    return {
      clause: { site: { notIn: config.exclude } },
      summary: `EXCLUDE=[${config.exclude.join(',')}]`,
    };
  }

  return { clause: null, summary: 'no filter (all sites)' };
}

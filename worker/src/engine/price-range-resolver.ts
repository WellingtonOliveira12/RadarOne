/**
 * Resolves the effective price range for a monitor from multiple sources.
 *
 * Why this is its own module: the price filter in ad-extractor was only
 * reading `monitor.priceMin/priceMax`. Monitors that store their range
 * inside `filtersJson` (STRUCTURED_FILTERS) OR purely in the search URL
 * (URL_ONLY legacy) were getting no post-extraction price guard, so the
 * platform's own result was the only safety net — and ML+OLX regularly
 * return ads outside the range the user typed.
 *
 * Resolution order (first non-null wins for each bound):
 *   1. filtersJson.minPrice / filtersJson.maxPrice
 *   2. monitor.priceMin / monitor.priceMax (top-level columns)
 *   3. URL embedded ranges:
 *        - Mercado Livre: `_PriceRange_<min>-<max>`
 *        - OLX query string: `?ps=<min>&pe=<max>`
 *
 * Pure function, no I/O, no DB. Easy to unit test.
 */

export interface PriceRange {
  min: number | null;
  max: number | null;
  /** Human-readable source breakdown, for log observability. */
  source: string;
}

interface MonitorLike {
  site?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  filtersJson?: unknown;
  searchUrl?: string | null;
}

function readFilterJsonPrice(filtersJson: unknown): { min: number | null; max: number | null } {
  if (!filtersJson || typeof filtersJson !== 'object') {
    return { min: null, max: null };
  }
  const f = filtersJson as Record<string, unknown>;
  const min = typeof f.minPrice === 'number' && f.minPrice > 0 ? f.minPrice : null;
  const max = typeof f.maxPrice === 'number' && f.maxPrice > 0 ? f.maxPrice : null;
  return { min, max };
}

function extractFromMercadoLivreUrl(url: string): { min: number | null; max: number | null } {
  // URLs use segments like `_PriceRange_1000-2000`. The min may be 0.
  const match = url.match(/_PriceRange_(\d+)-(\d+)/i);
  if (!match) return { min: null, max: null };
  const min = parseInt(match[1], 10);
  const max = parseInt(match[2], 10);
  return {
    min: Number.isFinite(min) && min > 0 ? min : null,
    max: Number.isFinite(max) && max > 0 ? max : null,
  };
}

function extractFromOlxUrl(url: string): { min: number | null; max: number | null } {
  // OLX uses query params `ps` (price start) and `pe` (price end).
  try {
    const u = new URL(url);
    const ps = parseInt(u.searchParams.get('ps') || '', 10);
    const pe = parseInt(u.searchParams.get('pe') || '', 10);
    return {
      min: Number.isFinite(ps) && ps > 0 ? ps : null,
      max: Number.isFinite(pe) && pe > 0 ? pe : null,
    };
  } catch {
    return { min: null, max: null };
  }
}

export function resolvePriceRange(monitor: MonitorLike): PriceRange {
  const sources: string[] = [];
  let min: number | null = null;
  let max: number | null = null;

  // 1. filtersJson
  const fj = readFilterJsonPrice(monitor.filtersJson);
  if (fj.min !== null) {
    min = fj.min;
    sources.push('filtersJson.min');
  }
  if (fj.max !== null) {
    max = fj.max;
    sources.push('filtersJson.max');
  }

  // 2. top-level monitor columns
  if (min === null && typeof monitor.priceMin === 'number' && monitor.priceMin > 0) {
    min = monitor.priceMin;
    sources.push('monitor.priceMin');
  }
  if (max === null && typeof monitor.priceMax === 'number' && monitor.priceMax > 0) {
    max = monitor.priceMax;
    sources.push('monitor.priceMax');
  }

  // 3. URL fallback (platform-specific)
  if ((min === null || max === null) && monitor.searchUrl) {
    let urlRange: { min: number | null; max: number | null } = { min: null, max: null };
    if (monitor.site === 'MERCADO_LIVRE') {
      urlRange = extractFromMercadoLivreUrl(monitor.searchUrl);
    } else if (monitor.site === 'OLX') {
      urlRange = extractFromOlxUrl(monitor.searchUrl);
    }
    if (min === null && urlRange.min !== null) {
      min = urlRange.min;
      sources.push('url.min');
    }
    if (max === null && urlRange.max !== null) {
      max = urlRange.max;
      sources.push('url.max');
    }
  }

  return {
    min,
    max,
    source: sources.length ? sources.join('+') : 'none',
  };
}

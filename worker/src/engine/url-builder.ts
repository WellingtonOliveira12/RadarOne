/**
 * URL Builder for STRUCTURED_FILTERS monitors.
 *
 * Builds marketplace-specific search URLs from location + keyword data.
 * Only activates when mode === 'STRUCTURED_FILTERS'.
 * URL_ONLY monitors are NEVER modified.
 *
 * Advanced filters (sortBy, condition, publishedWithin, price) are appended
 * as query params when the site supports them (currently Facebook Marketplace).
 */

import { MonitorWithFilters } from './types';
import {
  FB_SORT_BY_PARAMS,
  FB_CONDITION_PARAMS,
  FB_DAYS_SINCE_LISTED,
  type AdvancedFilters,
  type FilterApplicationLog,
} from './filter-params';

export interface UrlBuildResult {
  url: string;
  location: string; // Human-readable location tag for logging
  filtersApplied: FilterApplicationLog;
}

export type { FilterApplicationLog };

/**
 * Safely extracts AdvancedFilters from monitor.filtersJson.
 * Returns empty object if filtersJson is null/undefined/invalid.
 */
function parseAdvancedFilters(monitor: MonitorWithFilters): Partial<AdvancedFilters> {
  if (!monitor.filtersJson || typeof monitor.filtersJson !== 'object') return {};
  return monitor.filtersJson as Partial<AdvancedFilters>;
}

/**
 * Builds a Facebook Marketplace search URL from structured filters.
 *
 * URL patterns:
 *   - City + keyword: https://www.facebook.com/marketplace/{city-slug}/search/?query={keyword}&params...
 *   - City only:      https://www.facebook.com/marketplace/{city-slug}/?params...
 *   - Keyword only:   https://www.facebook.com/marketplace/search/?query={keyword}&params...
 *
 * Advanced filter params:
 *   - sortBy       → sortBy=creation_time_descend
 *   - minPrice     → minPrice=1000
 *   - maxPrice     → maxPrice=5000
 *   - condition    → itemCondition=new,used_like_new
 *   - publishedWithin → daysSinceListed=1
 *
 * @throws Error if no city AND no keyword are provided (nothing to search for).
 */
export function buildFacebookMarketplaceUrl(monitor: MonitorWithFilters): UrlBuildResult {
  const country = monitor.country?.trim() || '';
  const state = monitor.stateRegion?.trim() || '';
  const city = monitor.city?.trim() || '';
  const keywords = extractKeywords(monitor);
  const filters = parseAdvancedFilters(monitor);

  // Validate: at least city or keyword must be provided
  if (!city && !keywords) {
    const locationTag = [country, state].filter(Boolean).join('-') || 'NONE';
    throw new Error(
      `FB_URL_BUILD_FAILED: Cannot build Facebook Marketplace URL without city or keyword. ` +
      `Location: ${locationTag}. Provide at least a city or keyword in STRUCTURED_FILTERS.`
    );
  }

  const base = 'https://www.facebook.com/marketplace';

  // Build base path
  let basePath: string;
  if (city) {
    const citySlug = slugify(city);
    basePath = keywords
      ? `${base}/${citySlug}/search/`
      : `${base}/${citySlug}/`;
  } else {
    basePath = `${base}/search/`;
  }

  // Build query params
  const params = new URLSearchParams();

  if (keywords) {
    params.set('query', keywords);
  }

  // Track filter applications
  const filtersApplied: FilterApplicationLog = {
    appliedUrl: [],
    appliedPostProcess: [],
    ignored: [],
  };

  // sortBy
  if (filters.sortBy && filters.sortBy !== 'relevance') {
    const fbSort = FB_SORT_BY_PARAMS[filters.sortBy];
    if (fbSort) {
      params.set('sortBy', fbSort);
      filtersApplied.appliedUrl.push(`sortBy=${filters.sortBy}`);
    }
  }

  // Price (from filtersJson or top-level monitor fields)
  const minPrice = filters.minPrice ?? monitor.priceMin;
  const maxPrice = filters.maxPrice ?? monitor.priceMax;

  if (minPrice != null && minPrice > 0) {
    params.set('minPrice', String(Math.round(minPrice)));
    filtersApplied.appliedUrl.push(`minPrice=${minPrice}`);
  }
  if (maxPrice != null && maxPrice > 0) {
    params.set('maxPrice', String(Math.round(maxPrice)));
    filtersApplied.appliedUrl.push(`maxPrice=${maxPrice}`);
  }

  // Condition
  if (filters.condition && filters.condition.length > 0) {
    const fbConditions = filters.condition
      .map(c => FB_CONDITION_PARAMS[c])
      .filter(Boolean);
    if (fbConditions.length > 0) {
      params.set('itemCondition', fbConditions.join(','));
      filtersApplied.appliedUrl.push(`condition=${filters.condition.join(',')}`);
    }
  }

  // Published within (daysSinceListed)
  if (filters.publishedWithin && filters.publishedWithin !== 'any') {
    const days = FB_DAYS_SINCE_LISTED[filters.publishedWithin];
    if (days != null) {
      params.set('daysSinceListed', String(days));
      filtersApplied.appliedUrl.push(`publishedWithin=${filters.publishedWithin}`);
    }
  }

  // Availability — not reliably supported by Facebook
  if (filters.availability) {
    filtersApplied.ignored.push(`availability=${filters.availability}`);
  }

  // Build final URL
  const queryString = params.toString();
  const url = queryString ? `${basePath}?${queryString}` : basePath;

  // Build location tag for logging
  const locationParts = [country, state, city].filter(Boolean);
  const location = locationParts.join('-') || 'GLOBAL';

  return { url, location, filtersApplied };
}

/**
 * OLX state-to-subdomain mapping.
 * OLX uses regional subdomains: go.olx.com.br, sp.olx.com.br, etc.
 */
const OLX_STATE_SUBDOMAINS: Record<string, string> = {
  AC: 'ac', AL: 'al', AP: 'ap', AM: 'am', BA: 'ba', CE: 'ce', DF: 'df',
  ES: 'es', GO: 'go', MA: 'ma', MT: 'mt', MS: 'ms', MG: 'mg', PA: 'pa',
  PB: 'pb', PR: 'pr', PE: 'pe', PI: 'pi', RJ: 'rj', RN: 'rn', RS: 'rs',
  RO: 'ro', RR: 'rr', SC: 'sc', SP: 'sp', SE: 'se', TO: 'to',
};

/**
 * Builds an OLX search URL from structured filters.
 *
 * URL pattern: https://{state}.olx.com.br/?q={keyword}
 * Without state: https://www.olx.com.br/?q={keyword}
 *
 * OLX does NOT support advanced filters via URL (condition, sort, etc.).
 *
 * Returns null if no keywords can be extracted — caller falls back to searchUrl.
 */
function buildOlxUrl(monitor: MonitorWithFilters): UrlBuildResult | null {
  const state = monitor.stateRegion?.trim().toUpperCase() || '';
  const keywords = extractKeywords(monitor);

  if (!keywords) {
    console.log(
      `OLX_URL_BUILD_NO_KEYWORDS: monitorId=${monitor.id} name=${monitor.name} ` +
      `filtersJson=${JSON.stringify(monitor.filtersJson)} ` +
      `keywords=${JSON.stringify(monitor.keywords)} ` +
      `searchUrl=${monitor.searchUrl?.substring(0, 80)} — falling back to searchUrl`
    );
    return null;
  }

  // Use state subdomain if available (go.olx.com.br for Goiás)
  const subdomain = OLX_STATE_SUBDOMAINS[state] || 'www';
  const url = `https://${subdomain}.olx.com.br/?q=${encodeURIComponent(keywords)}`;

  const locationParts = [monitor.country, state, monitor.city].filter(Boolean);
  const location = locationParts.join('-') || 'BR';

  return {
    url,
    location,
    filtersApplied: {
      appliedUrl: [`q=${keywords}`, ...(subdomain !== 'www' ? [`state=${state}`] : [])],
      appliedPostProcess: [],
      ignored: [],
    },
  };
}

/**
 * Entry point: builds search URL for any site that supports STRUCTURED_FILTERS.
 *
 * Returns null if:
 *   - mode is not STRUCTURED_FILTERS
 *   - site does not have a URL builder
 *
 * @throws Error if URL building fails (e.g., missing required fields).
 */
export function buildSearchUrl(monitor: MonitorWithFilters): UrlBuildResult | null {
  if (monitor.mode !== 'STRUCTURED_FILTERS') {
    return null;
  }

  switch (monitor.site) {
    case 'FACEBOOK_MARKETPLACE':
      return buildFacebookMarketplaceUrl(monitor);
    case 'OLX':
      return buildOlxUrl(monitor);
    default: {
      // Log ignored filters for non-Facebook sites
      const filters = parseAdvancedFilters(monitor);
      const ignoredFilters: string[] = [];

      if (filters.sortBy) ignoredFilters.push(`sortBy=${filters.sortBy}`);
      if (filters.condition?.length) ignoredFilters.push(`condition=${filters.condition.join(',')}`);
      if (filters.publishedWithin && filters.publishedWithin !== 'any') {
        ignoredFilters.push(`publishedWithin=${filters.publishedWithin}`);
      }
      if (filters.availability) ignoredFilters.push(`availability=${filters.availability}`);

      if (ignoredFilters.length > 0) {
        console.log(
          `FILTERS_IGNORED_UNSUPPORTED: site=${monitor.site} monitorId=${monitor.id} ` +
          `filters=[${ignoredFilters.join(', ')}] reason=no_url_builder`
        );
      }

      return null;
    }
  }
}

/**
 * Extracts keywords from monitor using a multi-source fallback chain:
 *   1. filtersJson.keywords (primary — frontend sends this)
 *   2. filtersJson.keyword  (legacy singular form)
 *   3. monitor.keywords[]   (top-level Prisma array field)
 *   4. searchUrl ?q= param  (URL_ONLY → STRUCTURED_FILTERS migration)
 */
function extractKeywords(monitor: MonitorWithFilters): string {
  // 1. filtersJson.keywords (primary)
  if (monitor.filtersJson && typeof monitor.filtersJson === 'object') {
    const filters = monitor.filtersJson as Record<string, unknown>;

    if (typeof filters.keywords === 'string' && filters.keywords.trim()) {
      return filters.keywords.trim();
    }

    // 2. filtersJson.keyword (singular)
    if (typeof filters.keyword === 'string' && filters.keyword.trim()) {
      return filters.keyword.trim();
    }
  }

  // 3. monitor.keywords[] (top-level array from Prisma schema)
  if (Array.isArray(monitor.keywords) && monitor.keywords.length > 0) {
    const joined = monitor.keywords.filter(Boolean).join(' ').trim();
    if (joined) return joined;
  }

  // 4. Extract ?q= from searchUrl (handles URL_ONLY monitors migrated to STRUCTURED_FILTERS)
  if (monitor.searchUrl) {
    try {
      const url = new URL(monitor.searchUrl);
      const q = url.searchParams.get('q') || url.searchParams.get('query');
      if (q && q.trim()) return q.trim();
    } catch {
      // Invalid URL — ignore
    }
  }

  return '';
}

/**
 * Converts a city name to a URL-friendly slug.
 *
 * - Removes diacritics (accents): Itaberaí → itaberai
 * - Converts to lowercase
 * - Replaces spaces and special chars with hyphens
 * - Collapses multiple hyphens
 * - Trims leading/trailing hyphens
 */
function slugify(text: string): string {
  return text
    .normalize('NFD')                    // Decompose accented chars
    .replace(/[\u0300-\u036f]/g, '')     // Remove diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')        // Remove non-alphanumeric (except spaces and hyphens)
    .replace(/[\s]+/g, '-')              // Replace spaces with hyphens
    .replace(/-+/g, '-')                 // Collapse multiple hyphens
    .replace(/^-+|-+$/g, '');            // Trim leading/trailing hyphens
}

// Export for testing
export { slugify, extractKeywords };

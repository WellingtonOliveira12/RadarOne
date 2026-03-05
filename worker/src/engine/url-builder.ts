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
 * Extracts keywords from monitor.filtersJson.
 * Handles multiple possible shapes of filtersJson.
 */
function extractKeywords(monitor: MonitorWithFilters): string {
  if (!monitor.filtersJson) return '';

  const filters = monitor.filtersJson as Record<string, unknown>;

  // Primary: filtersJson.keywords (frontend sends this)
  if (typeof filters.keywords === 'string' && filters.keywords.trim()) {
    return filters.keywords.trim();
  }

  // Fallback: filtersJson.keyword (singular form)
  if (typeof filters.keyword === 'string' && filters.keyword.trim()) {
    return filters.keyword.trim();
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

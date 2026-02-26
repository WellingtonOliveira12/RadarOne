/**
 * URL Builder for STRUCTURED_FILTERS monitors.
 *
 * Builds marketplace-specific search URLs from location + keyword data.
 * Only activates when mode === 'STRUCTURED_FILTERS'.
 * URL_ONLY monitors are NEVER modified.
 */

import { MonitorWithFilters } from './types';

export interface UrlBuildResult {
  url: string;
  location: string; // Human-readable location tag for logging
}

/**
 * Builds a Facebook Marketplace search URL from structured filters.
 *
 * URL patterns:
 *   - City + keyword: https://www.facebook.com/marketplace/{city-slug}/search/?query={keyword}
 *   - City only:      https://www.facebook.com/marketplace/{city-slug}/
 *   - Keyword only:   https://www.facebook.com/marketplace/search/?query={keyword}
 *
 * @throws Error if no city AND no keyword are provided (nothing to search for).
 */
export function buildFacebookMarketplaceUrl(monitor: MonitorWithFilters): UrlBuildResult {
  const country = monitor.country?.trim() || '';
  const state = monitor.stateRegion?.trim() || '';
  const city = monitor.city?.trim() || '';
  const keywords = extractKeywords(monitor);

  // Validate: at least city or keyword must be provided
  if (!city && !keywords) {
    const locationTag = [country, state].filter(Boolean).join('-') || 'NONE';
    throw new Error(
      `FB_URL_BUILD_FAILED: Cannot build Facebook Marketplace URL without city or keyword. ` +
      `Location: ${locationTag}. Provide at least a city or keyword in STRUCTURED_FILTERS.`
    );
  }

  const base = 'https://www.facebook.com/marketplace';
  let url: string;

  if (city) {
    const citySlug = slugify(city);
    if (keywords) {
      url = `${base}/${citySlug}/search/?query=${encodeURIComponent(keywords)}`;
    } else {
      url = `${base}/${citySlug}/`;
    }
  } else {
    // No city, but has keyword
    url = `${base}/search/?query=${encodeURIComponent(keywords)}`;
  }

  // Build location tag for logging
  const locationParts = [country, state, city].filter(Boolean);
  const location = locationParts.join('-') || 'GLOBAL';

  return { url, location };
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
    default:
      // Other sites don't have URL builders yet
      return null;
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

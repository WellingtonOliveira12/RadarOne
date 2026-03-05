/**
 * Advanced Monitor Filters — Shared Schema
 *
 * Defines the structure for filtersJson stored in the Monitor model.
 * Used across frontend (form building), backend (validation), and worker (URL building + post-processing).
 *
 * All fields are optional for backward compatibility — existing monitors
 * with empty filtersJson or legacy { keywords } continue to work.
 */

import { z } from 'zod';

// ============================================
// FILTER VALUE ENUMS
// ============================================

export const SortByEnum = z.enum(['relevance', 'newest', 'price_asc', 'price_desc']);
export type SortBy = z.infer<typeof SortByEnum>;

export const ConditionEnum = z.enum(['new', 'like_new', 'good', 'fair']);
export type Condition = z.infer<typeof ConditionEnum>;

export const PublishedWithinEnum = z.enum(['any', '24h', '7d', '30d']);
export type PublishedWithin = z.infer<typeof PublishedWithinEnum>;

export const AvailabilityEnum = z.enum(['available', 'sold']);
export type Availability = z.infer<typeof AvailabilityEnum>;

// ============================================
// ADVANCED FILTERS SCHEMA
// ============================================

export const AdvancedFiltersSchema = z.object({
  // Existing fields (backward compatible)
  keywords: z.string().optional(),
  keyword: z.string().optional(), // Legacy singular form
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  minYear: z.number().min(1900).max(2030).optional(),
  maxYear: z.number().min(1900).max(2030).optional(),
  category: z.string().optional(),

  // New advanced filters
  sortBy: SortByEnum.optional(),
  condition: z.array(ConditionEnum).optional(),
  publishedWithin: PublishedWithinEnum.optional(),
  availability: AvailabilityEnum.optional(),
}).passthrough(); // Allow unknown fields for forward compatibility

export type AdvancedFilters = z.infer<typeof AdvancedFiltersSchema>;

// ============================================
// FACEBOOK MARKETPLACE FILTER MAPPING
// ============================================

/**
 * Maps internal sortBy values to Facebook Marketplace URL params.
 */
export const FB_SORT_BY_PARAMS: Record<SortBy, string> = {
  relevance: 'best_match',
  newest: 'creation_time_descend',
  price_asc: 'price_ascend',
  price_desc: 'price_descend',
};

/**
 * Maps internal condition values to Facebook Marketplace URL params.
 */
export const FB_CONDITION_PARAMS: Record<Condition, string> = {
  new: 'new',
  like_new: 'used_like_new',
  good: 'used_good',
  fair: 'used_fair',
};

/**
 * Maps publishedWithin values to Facebook daysSinceListed param.
 */
export const FB_DAYS_SINCE_LISTED: Record<PublishedWithin, number | null> = {
  any: null,
  '24h': 1,
  '7d': 7,
  '30d': 30,
};

// ============================================
// FILTER SUPPORT MATRIX
// ============================================

export type FilterApplication = 'url' | 'post_process' | 'ignored';

export interface FilterSupport {
  sortBy: FilterApplication;
  condition: FilterApplication;
  publishedWithin: FilterApplication;
  availability: FilterApplication;
  minPrice: FilterApplication;
  maxPrice: FilterApplication;
}

/**
 * Declares how each marketplace supports the advanced filters.
 * This is used for logging and transparency.
 */
export const SITE_FILTER_SUPPORT: Record<string, FilterSupport> = {
  FACEBOOK_MARKETPLACE: {
    sortBy: 'url',
    condition: 'url',
    publishedWithin: 'url',
    availability: 'ignored', // FB does not reliably support sold filter
    minPrice: 'url',
    maxPrice: 'url',
  },
  MERCADO_LIVRE: {
    sortBy: 'ignored',
    condition: 'ignored',
    publishedWithin: 'ignored',
    availability: 'ignored',
    minPrice: 'post_process',
    maxPrice: 'post_process',
  },
  OLX: {
    sortBy: 'ignored',
    condition: 'ignored',
    publishedWithin: 'ignored',
    availability: 'ignored',
    minPrice: 'post_process',
    maxPrice: 'post_process',
  },
};

/**
 * Returns the filter support for a given site, defaulting to all post_process/ignored.
 */
export function getFilterSupport(site: string): FilterSupport {
  return SITE_FILTER_SUPPORT[site] ?? {
    sortBy: 'ignored',
    condition: 'ignored',
    publishedWithin: 'ignored',
    availability: 'ignored',
    minPrice: 'post_process',
    maxPrice: 'post_process',
  };
}

/**
 * Advanced Filter Parameters — Worker-side mappings
 *
 * Defines how advanced filters from filtersJson are mapped to
 * marketplace-specific URL parameters and post-processing rules.
 *
 * This file is the worker-side equivalent of shared/schemas/monitor-filters.ts.
 * The shared schema defines types and validation; this file defines URL mappings.
 */

// ============================================
// FILTER VALUE TYPES (mirror shared schema)
// ============================================

export type SortBy = 'relevance' | 'newest' | 'price_asc' | 'price_desc';
export type Condition = 'new' | 'like_new' | 'good' | 'fair';
export type PublishedWithin = 'any' | '24h' | '7d' | '30d';
export type Availability = 'available' | 'sold';

export interface AdvancedFilters {
  keywords?: string;
  keyword?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  category?: string;
  sortBy?: SortBy;
  condition?: Condition[];
  publishedWithin?: PublishedWithin;
  availability?: Availability;
}

// ============================================
// FACEBOOK MARKETPLACE URL PARAM MAPPINGS
// ============================================

export const FB_SORT_BY_PARAMS: Record<SortBy, string> = {
  relevance: 'best_match',
  newest: 'creation_time_descend',
  price_asc: 'price_ascend',
  price_desc: 'price_descend',
};

export const FB_CONDITION_PARAMS: Record<Condition, string> = {
  new: 'new',
  like_new: 'used_like_new',
  good: 'used_good',
  fair: 'used_fair',
};

export const FB_DAYS_SINCE_LISTED: Record<PublishedWithin, number | null> = {
  any: null,
  '24h': 1,
  '7d': 7,
  '30d': 30,
};

// ============================================
// FILTER APPLICATION LOG
// ============================================

export interface FilterApplicationLog {
  appliedUrl: string[];
  appliedPostProcess: string[];
  ignored: string[];
}

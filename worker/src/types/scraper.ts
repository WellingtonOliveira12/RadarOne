/**
 * Tipos compartilhados para scrapers
 */

export interface ScrapedAd {
  externalId: string; // ID do anúncio no site externo (ex: MLB123456789)
  title: string;
  price: number;
  url: string;
  description?: string;
  imageUrl?: string;
  location?: string;
  publishedAt?: Date;
  /**
   * Optional seller profile signals extracted from the site's ad detail page.
   * Only populated by site-specific post-extraction enrichers (e.g. OLX
   * profile enricher). Typed as `unknown` here to avoid coupling shared
   * types to enrichment modules — consumers import their own structured
   * type and cast.
   */
  profileSignals?: unknown;
  /** Optional tiered confidence label produced by enrichers. */
  confidence?: { tier: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: string[] };
}

export interface MonitorWithFilters {
  id: string;
  userId: string; // ID do usuário dono do monitor
  name: string;
  site: string;
  searchUrl: string;
  priceMin?: number | null;
  priceMax?: number | null;
  active: boolean;
  mode?: string;        // 'URL_ONLY' | 'STRUCTURED_FILTERS' — optional for backward compat
  filtersJson?: unknown; // For future use with STRUCTURED_FILTERS URL builder
  keywords?: string[];   // Top-level keywords array from Prisma schema
  country?: string | null;  // ISO-3166-1 alpha-2 (ex: BR, US) ou null = sem filtro
  stateRegion?: string | null;
  city?: string | null;
}

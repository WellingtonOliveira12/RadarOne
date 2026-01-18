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
}

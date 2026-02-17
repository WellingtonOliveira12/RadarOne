import { SiteConfig } from './types';
import { mercadoLivreConfig } from './configs/mercadolivre.config';
import { olxConfig } from './configs/olx.config';
import { facebookConfig } from './configs/facebook.config';
import { imovelWebConfig } from './configs/imovelweb.config';
import { vivaRealConfig } from './configs/vivareal.config';
import { zapImoveisConfig } from './configs/zapimoveis.config';
import { webmotorsConfig } from './configs/webmotors.config';
import { icarrosConfig } from './configs/icarros.config';
import { leilaoConfig } from './configs/leilao.config';

const registry = new Map<string, SiteConfig>();

export function registerSite(config: SiteConfig): void {
  registry.set(config.site, config);
}

export function getSiteConfig(site: string): SiteConfig | null {
  return registry.get(site) || null;
}

export function getAllSites(): string[] {
  return Array.from(registry.keys());
}

// Boot: register phase 1 sites
registerSite(mercadoLivreConfig);
registerSite(olxConfig);
registerSite(facebookConfig);

// Boot: register phase 2 sites (real estate)
registerSite(imovelWebConfig);
registerSite(vivaRealConfig);
registerSite(zapImoveisConfig);

// Boot: register phase 3 sites (vehicles + auction)
registerSite(webmotorsConfig);
registerSite(icarrosConfig);
registerSite(leilaoConfig);

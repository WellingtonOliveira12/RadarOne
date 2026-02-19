/**
 * URLs padrão por site para auto-preenchimento no modo "Filtros personalizados"
 *
 * Espelhado de worker/src/engine/default-urls.ts para consistência.
 */
export const SITE_URL_DEFAULTS: Record<string, string> = {
  MERCADO_LIVRE: 'https://lista.mercadolivre.com.br/',
  OLX: 'https://www.olx.com.br/',
  FACEBOOK_MARKETPLACE: 'https://www.facebook.com/marketplace/',
  WEBMOTORS: 'https://www.webmotors.com.br/carros/estoque',
  ICARROS: 'https://www.icarros.com.br/comprar',
  ZAP_IMOVEIS: 'https://www.zapimoveis.com.br/',
  VIVA_REAL: 'https://www.vivareal.com.br/',
  IMOVELWEB: 'https://www.imovelweb.com.br/',
  LEILAO: '',
};

/**
 * Retorna a URL padrão para um site, ou string vazia se não tiver.
 */
export function getSiteDefaultUrl(site: string): string {
  return SITE_URL_DEFAULTS[site] || '';
}

/**
 * Verifica se uma URL é uma das URLs padrão conhecidas.
 * Usado para decidir se devemos sobrescrever ao trocar de site.
 */
export function isDefaultUrl(url: string): boolean {
  if (!url) return true; // vazio = pode sobrescrever
  return Object.values(SITE_URL_DEFAULTS).some(
    (defaultUrl) => defaultUrl && url === defaultUrl
  );
}

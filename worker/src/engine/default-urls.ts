/**
 * URLs padrão por plataforma.
 * Usado como fallback defensivo no worker quando searchUrl está vazio no DB (edge case / dados legados).
 */
export const DEFAULT_SEARCH_URLS: Record<string, string> = {
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

export function getDefaultUrl(site: string): string | null {
  return DEFAULT_SEARCH_URLS[site] || null;
}

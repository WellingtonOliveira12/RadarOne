import countries from 'i18n-iso-countries';
import pt from 'i18n-iso-countries/langs/pt.json';
import en from 'i18n-iso-countries/langs/en.json';
import es from 'i18n-iso-countries/langs/es.json';

// Registrar locales
countries.registerLocale(pt);
countries.registerLocale(en);
countries.registerLocale(es);

/** Mapear idioma do i18next para o formato da lib i18n-iso-countries */
function toIsoLang(lang: string): string {
  if (lang.startsWith('pt')) return 'pt';
  if (lang.startsWith('es')) return 'es';
  return 'en';
}

export interface CountryOption {
  code: string; // ISO-2 ou '' para "sem filtro"
  label: string;
}

/**
 * Retorna lista completa de países com Brasil sempre primeiro,
 * seguido dos demais em ordem alfabética no idioma solicitado.
 * Não inclui opção "sem filtro" — deve ser adicionada pelo consumidor.
 */
export function getCountryList(lang: string): CountryOption[] {
  const isoLang = toIsoLang(lang);
  const nameObj = countries.getNames(isoLang, { select: 'official' });

  // Separar BR do resto
  const brLabel = nameObj['BR'] ?? 'Brasil';
  const rest: CountryOption[] = Object.entries(nameObj)
    .filter(([code]) => code !== 'BR')
    .map(([code, name]) => ({ code, label: name }));

  rest.sort((a, b) => a.label.localeCompare(b.label, isoLang));

  // BR primeiro, resto alfabético
  return [{ code: 'BR', label: brLabel }, ...rest];
}

/**
 * Retorna o nome de um país pelo código ISO-2 no idioma solicitado.
 */
export function getCountryName(code: string, lang: string): string {
  if (!code) return '';
  const isoLang = toIsoLang(lang);
  return countries.getName(code, isoLang) ?? code;
}

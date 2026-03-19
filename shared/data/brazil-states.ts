/**
 * Brazilian states dataset — 26 states + Distrito Federal
 *
 * Sorted alphabetically by code.
 * Each entry has a 2-letter code (UF) and the official name with accents.
 */

export interface BrazilState {
  code: string;
  name: string;
}

export const BRAZIL_STATES: readonly BrazilState[] = [
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'PR', name: 'Paraná' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'TO', name: 'Tocantins' },
] as const;

/** Quick lookup: code → name */
export const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  BRAZIL_STATES.map((s) => [s.code, s.name]),
);

/** Quick lookup: normalized name → code (for backward compat) */
export const STATE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  BRAZIL_STATES.flatMap((s) => {
    const normalized = s.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    return [
      [s.name.toUpperCase(), s.code],
      [normalized, s.code],
    ];
  }),
);

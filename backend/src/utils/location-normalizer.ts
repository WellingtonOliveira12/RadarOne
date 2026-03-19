/**
 * Location normalizer for backend — handles backward compatibility
 * for legacy free-text state/city values.
 *
 * Mirror of shared/data/location-normalizer.ts (backend can't import
 * from shared/ due to rootDir constraint).
 */

interface BrazilState {
  code: string;
  name: string;
}

const BRAZIL_STATES: BrazilState[] = [
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
];

const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  BRAZIL_STATES.map((s) => [s.code, s.name]),
);

const STATE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
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

function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalize a state input to a 2-letter UF code.
 * Handles: "SP", "sp", "São Paulo", "SAO PAULO", "sao paulo", etc.
 */
export function normalizeStateToCode(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && STATE_CODE_TO_NAME[upper]) return upper;

  const normalizedUpper = removeDiacritics(upper);
  const found = STATE_NAME_TO_CODE[upper] || STATE_NAME_TO_CODE[normalizedUpper];
  if (found) return found;

  const match = BRAZIL_STATES.find((s) => {
    const nameNorm = removeDiacritics(s.name.toUpperCase());
    return nameNorm.startsWith(normalizedUpper);
  });
  return match?.code ?? null;
}

/**
 * Normalize a city name: preserve accents, trim whitespace.
 */
export function normalizeCityName(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length < 2) return null;
  return trimmed;
}

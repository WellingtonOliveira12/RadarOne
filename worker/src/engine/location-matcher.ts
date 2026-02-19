/**
 * Location matcher for global location filtering (best-effort).
 * Matches ad location strings against monitor location filters.
 */

export interface LocationFilter {
  country?: string | null;  // ISO-3166-1 alpha-2 (ex: BR, US) ou null = sem filtro
  stateRegion?: string | null;
  city?: string | null;
}

export type LocationMatchResult =
  | { match: true }
  | { match: false; reason: 'location_country_mismatch' | 'location_state_mismatch' | 'location_city_mismatch' };

// Patterns EXCLUSIVE to each country (ambiguous abbreviations like AL/PA/MA/SC/MT/MS excluded from both)
const COUNTRY_PATTERNS: Record<string, RegExp[]> = {
  'BR': [
    /\b(AC|AP|AM|BA|CE|DF|ES|GO|MG|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SP|SE|TO)\b/,
    /\b(Acre|Alagoas|Amapá|Amazonas|Bahia|Ceará|Espírito Santo|Goiás|Maranhão|Mato Grosso|Minas Gerais|Pará|Paraíba|Paraná|Pernambuco|Piauí|Rio de Janeiro|Rio Grande|Rondônia|Roraima|Santa Catarina|São Paulo|Sergipe|Tocantins|Distrito Federal)\b/i,
    /\b(Brasil|Brazil)\b/i,
  ],
  'US': [
    /\b(AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MI|MN|MO|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|RI|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/,
    /\b(United States|USA)\b/i,
  ],
};

/**
 * Matches an ad location string against a monitor's location filter.
 *
 * Logic:
 * 1. No country (null/''/undefined/'WORLDWIDE') -> match everything (skip total)
 * 2. Empty ad location -> match (avoid false negatives)
 * 3. BR/US: check exclusive patterns -> if matches OTHER but NOT own -> SKIP
 * 4. Other countries (not BR/US): skip country matching, only apply state/city
 * 5. If stateRegion set -> word-boundary match
 * 6. If city set -> substring match
 */
export function matchLocation(adLocation: string | undefined | null, filter: LocationFilter): LocationMatchResult {
  // 1. No country = sem filtro -> match everything immediately
  if (!filter.country || filter.country === 'WORLDWIDE') {
    return { match: true };
  }

  // 2. Empty ad location -> match (avoid false negatives)
  if (!adLocation || !adLocation.trim()) {
    return { match: true };
  }

  const loc = adLocation.trim();

  // 3. Country matching via exclusive patterns (only BR and US have patterns)
  const ownPatterns = COUNTRY_PATTERNS[filter.country];

  if (ownPatterns) {
    // BR or US: check patterns
    const otherCountries = Object.keys(COUNTRY_PATTERNS).filter(c => c !== filter.country);

    let matchesOwn = ownPatterns.some(re => re.test(loc));
    let matchesOther = false;

    for (const otherCountry of otherCountries) {
      const otherPatterns = COUNTRY_PATTERNS[otherCountry];
      if (otherPatterns && otherPatterns.some(re => re.test(loc))) {
        matchesOther = true;
        break;
      }
    }

    // If matches OTHER country but NOT own -> mismatch
    if (matchesOther && !matchesOwn) {
      return { match: false, reason: 'location_country_mismatch' };
    }
  }
  // 4. Other countries (no patterns): skip country matching, only state/city below

  // 5. State/region filter
  if (filter.stateRegion) {
    const normalizedState = filter.stateRegion.toUpperCase().trim();
    const stateRegex = new RegExp(`\\b${escapeRegex(normalizedState)}\\b`, 'i');
    if (!stateRegex.test(loc)) {
      return { match: false, reason: 'location_state_mismatch' };
    }
  }

  // 6. City filter
  if (filter.city) {
    const normalizedCity = filter.city.trim();
    if (!loc.toLowerCase().includes(normalizedCity.toLowerCase())) {
      return { match: false, reason: 'location_city_mismatch' };
    }
  }

  return { match: true };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

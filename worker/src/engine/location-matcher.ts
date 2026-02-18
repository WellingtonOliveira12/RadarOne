/**
 * Location matcher for global location filtering (best-effort).
 * Matches ad location strings against monitor location filters.
 */

export interface LocationFilter {
  country: string;       // 'WORLDWIDE' | 'BR' | 'US'
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
 * 1. WORLDWIDE -> always match
 * 2. Empty location -> match (avoid false negatives)
 * 3. Check patterns of monitor's country -> if match -> KEEP
 * 4. Check patterns of OTHER country -> if match -> SKIP
 * 5. No pattern matches (ambiguous) -> KEEP (conservative)
 * 6. If stateRegion set -> word-boundary match
 * 7. If city set -> substring match
 */
export function matchLocation(adLocation: string | undefined | null, filter: LocationFilter): LocationMatchResult {
  // 1. WORLDWIDE -> always match
  if (filter.country === 'WORLDWIDE') {
    return { match: true };
  }

  // 2. Empty location -> match (avoid false negatives)
  if (!adLocation || !adLocation.trim()) {
    return { match: true };
  }

  const loc = adLocation.trim();

  // 3-5. Country matching via exclusive patterns
  const ownPatterns = COUNTRY_PATTERNS[filter.country];
  const otherCountries = Object.keys(COUNTRY_PATTERNS).filter(c => c !== filter.country);

  let matchesOwn = false;
  let matchesOther = false;

  if (ownPatterns) {
    matchesOwn = ownPatterns.some(re => re.test(loc));
  }

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

  // If neither matches (ambiguous) -> KEEP (conservative)
  // If matches own (with or without other) -> KEEP and check state/city

  // 6. State/region filter
  if (filter.stateRegion) {
    const normalizedState = filter.stateRegion.toUpperCase().trim();
    const stateRegex = new RegExp(`\\b${escapeRegex(normalizedState)}\\b`, 'i');
    if (!stateRegex.test(loc)) {
      return { match: false, reason: 'location_state_mismatch' };
    }
  }

  // 7. City filter
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

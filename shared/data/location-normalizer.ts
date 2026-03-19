/**
 * Location normalizer — handles backward compatibility for legacy free-text
 * state/city values and provides consistent normalization.
 *
 * IMPORTANT: Does NOT modify the location-matcher in worker/.
 * This is purely for input normalization at the frontend/backend boundary.
 */

import { BRAZIL_STATES, STATE_NAME_TO_CODE, STATE_CODE_TO_NAME } from './brazil-states';

/**
 * Remove diacritics (accents) from a string for comparison purposes.
 * Preserves the original string — only used internally for matching.
 */
export function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalize a state input to a 2-letter UF code.
 *
 * Handles:
 * - "SP" → "SP" (already code)
 * - "sp" → "SP" (lowercase code)
 * - "São Paulo" → "SP" (full name)
 * - "SAO PAULO" → "SP" (uppercase without accents)
 * - "sao paulo" → "SP" (lowercase without accents)
 * - "Invalid" → null (not recognized)
 *
 * @returns The 2-letter UF code, or null if not recognized
 */
export function normalizeStateToCode(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  // Direct code match (case-insensitive)
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && STATE_CODE_TO_NAME[upper]) {
    return upper;
  }

  // Full name match (case-insensitive, accent-insensitive)
  const normalizedUpper = removeDiacritics(upper);
  const found = STATE_NAME_TO_CODE[upper] || STATE_NAME_TO_CODE[normalizedUpper];
  if (found) return found;

  // Partial match fallback — check if any state name starts with the input
  // This handles cases like "Rio de Jan" or "Minas Ger"
  const match = BRAZIL_STATES.find((s) => {
    const nameUpper = s.name.toUpperCase();
    const nameNorm = removeDiacritics(nameUpper);
    return nameUpper.startsWith(normalizedUpper) || nameNorm.startsWith(normalizedUpper);
  });

  return match?.code ?? null;
}

/**
 * Given a state code, returns the display name with accents.
 */
export function getStateDisplayName(code: string | null | undefined): string {
  if (!code) return '';
  return STATE_CODE_TO_NAME[code.toUpperCase()] ?? code;
}

/**
 * Normalize a city name for storage.
 * Preserves accents (for display), trims whitespace, normalizes casing.
 *
 * @returns Normalized city name or null if empty
 */
export function normalizeCityName(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length < 2) return null;
  return trimmed;
}

/**
 * Compare two city names in an accent-insensitive, case-insensitive way.
 * Used for matching legacy values against the dropdown options.
 */
export function citiesMatch(a: string, b: string): boolean {
  const normA = removeDiacritics(a.trim().toLowerCase());
  const normB = removeDiacritics(b.trim().toLowerCase());
  return normA === normB;
}

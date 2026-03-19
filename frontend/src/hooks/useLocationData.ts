/**
 * useLocationData — Abstraction layer for location cascading data.
 *
 * Currently loads data from shared/data/ via dynamic import.
 * Designed to be trivially swappable to an API endpoint:
 *   just change the internal fetch logic, keep the same interface.
 *
 * States are loaded eagerly (small dataset ~27 items).
 * Cities are loaded lazily per state selection (dynamic import).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { BRAZIL_STATES, STATE_CODE_TO_NAME, type BrazilState } from '../../../shared/data/brazil-states';
import { normalizeStateToCode, citiesMatch, removeDiacritics } from '../../../shared/data/location-normalizer';

export interface LocationDataState {
  /** Available states for the selected country */
  states: BrazilState[];
  /** Available cities for the selected state */
  cities: string[];
  /** Whether cities are currently loading */
  loadingCities: boolean;
}

/**
 * Resolve the state code from a legacy value.
 * Handles backward compatibility for free-text state values.
 */
export function resolveStateCode(rawValue: string | null | undefined): string {
  if (!rawValue) return '';
  const normalized = normalizeStateToCode(rawValue);
  return normalized ?? rawValue; // return original if can't normalize
}

/**
 * Resolve a city value against the available options.
 * If the city matches an option (accent-insensitive), returns the canonical form.
 * Otherwise returns the original value for backward compat.
 */
export function resolveCityValue(rawValue: string | null | undefined, availableCities: string[]): string {
  if (!rawValue) return '';
  const trimmed = rawValue.trim();
  if (!trimmed) return '';

  // Try exact match first
  const exact = availableCities.find((c) => c === trimmed);
  if (exact) return exact;

  // Try accent-insensitive match
  const match = availableCities.find((c) => citiesMatch(c, trimmed));
  if (match) return match;

  // No match — return original (backward compat: user can still see/edit it)
  return trimmed;
}

/**
 * Hook that provides location cascading data.
 *
 * @param countryCode - ISO-2 country code (e.g., 'BR')
 * @param stateCode - 2-letter state code (e.g., 'GO')
 */
export function useLocationData(countryCode: string, stateCode: string): LocationDataState {
  const [cities, setCities] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const lastStateRef = useRef<string>('');

  const loadCities = useCallback(async (state: string) => {
    if (!state || countryCode !== 'BR') {
      setCities([]);
      return;
    }

    // Skip if same state and we already have data
    if (lastStateRef.current === state) return;
    lastStateRef.current = state;

    setLoadingCities(true);
    try {
      // Dynamic import — Vite will code-split this
      // Future: replace with `await fetch(`/api/locations/cities/${state}`)`
      const module = await import('../../../shared/data/brazil-cities');
      const stateCities = module.BRAZIL_CITIES[state.toUpperCase()] ?? [];
      setCities(stateCities);
    } catch (err) {
      console.error('Failed to load cities for state:', state, err);
      setCities([]);
    } finally {
      setLoadingCities(false);
    }
  }, [countryCode]);

  useEffect(() => {
    if (countryCode === 'BR' && stateCode) {
      loadCities(stateCode);
    } else {
      setCities([]);
      lastStateRef.current = '';
    }
  }, [countryCode, stateCode, loadCities]);

  // Only return Brazilian states when country is BR
  const states = countryCode === 'BR' ? [...BRAZIL_STATES] : [];

  return { states, cities, loadingCities };
}

export { STATE_CODE_TO_NAME, normalizeStateToCode, citiesMatch, removeDiacritics };

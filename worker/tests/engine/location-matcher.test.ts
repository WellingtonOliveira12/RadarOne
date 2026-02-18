import { describe, it, expect } from 'vitest';
import { matchLocation, LocationFilter } from '../../src/engine/location-matcher';

describe('matchLocation', () => {
  // WORLDWIDE always matches
  it('should always match when country is WORLDWIDE', () => {
    const filter: LocationFilter = { country: 'WORLDWIDE' };
    expect(matchLocation('New York, NY', filter)).toEqual({ match: true });
    expect(matchLocation('São Paulo, SP', filter)).toEqual({ match: true });
    expect(matchLocation('', filter)).toEqual({ match: true });
    expect(matchLocation(undefined, filter)).toEqual({ match: true });
  });

  // Empty location always matches (avoid false negatives)
  it('should match when location is empty or undefined', () => {
    const filter: LocationFilter = { country: 'BR' };
    expect(matchLocation('', filter)).toEqual({ match: true });
    expect(matchLocation(undefined, filter)).toEqual({ match: true });
    expect(matchLocation(null, filter)).toEqual({ match: true });
    expect(matchLocation('   ', filter)).toEqual({ match: true });
  });

  // BR country matching
  it('should match BR location when country is BR', () => {
    const filter: LocationFilter = { country: 'BR' };
    expect(matchLocation('São Paulo, SP', filter).match).toBe(true);
    expect(matchLocation('Rio de Janeiro, RJ', filter).match).toBe(true);
    expect(matchLocation('Campinas, SP - Brasil', filter).match).toBe(true);
    expect(matchLocation('Minas Gerais', filter).match).toBe(true);
  });

  it('should reject US location when country is BR', () => {
    const filter: LocationFilter = { country: 'BR' };
    const result = matchLocation('New York, NY', filter);
    expect(result.match).toBe(false);
    if (!result.match) {
      expect(result.reason).toBe('location_country_mismatch');
    }
  });

  // US country matching
  it('should match US location when country is US', () => {
    const filter: LocationFilter = { country: 'US' };
    expect(matchLocation('New York, NY', filter).match).toBe(true);
    expect(matchLocation('Los Angeles, CA', filter).match).toBe(true);
    expect(matchLocation('Houston, TX - United States', filter).match).toBe(true);
  });

  it('should reject BR location when country is US', () => {
    const filter: LocationFilter = { country: 'US' };
    const result = matchLocation('Rio de Janeiro, RJ', filter);
    expect(result.match).toBe(false);
    if (!result.match) {
      expect(result.reason).toBe('location_country_mismatch');
    }
  });

  // Ambiguous locations (conservative: keep)
  it('should match ambiguous abbreviations (AL is both BR and US excluded)', () => {
    const filter: LocationFilter = { country: 'BR' };
    // AL is excluded from both BR and US patterns as it is ambiguous (Alabama / Alagoas)
    const result = matchLocation('Maceió, AL', filter);
    expect(result.match).toBe(true); // Conservative: no exclusive match either way
  });

  // State/region filter
  it('should match when stateRegion matches', () => {
    const filter: LocationFilter = { country: 'BR', stateRegion: 'SP' };
    expect(matchLocation('Campinas, SP', filter).match).toBe(true);
  });

  it('should reject when stateRegion does not match', () => {
    const filter: LocationFilter = { country: 'BR', stateRegion: 'SP' };
    const result = matchLocation('Rio de Janeiro, RJ', filter);
    expect(result.match).toBe(false);
    if (!result.match) {
      expect(result.reason).toBe('location_state_mismatch');
    }
  });

  it('should normalize stateRegion case', () => {
    const filter: LocationFilter = { country: 'BR', stateRegion: 'sp' };
    expect(matchLocation('Campinas, SP', filter).match).toBe(true);
  });

  // City filter
  it('should match when city matches (substring)', () => {
    const filter: LocationFilter = { country: 'BR', city: 'Campinas' };
    expect(matchLocation('Campinas, SP', filter).match).toBe(true);
  });

  it('should reject when city does not match', () => {
    const filter: LocationFilter = { country: 'BR', city: 'Campinas' };
    const result = matchLocation('São Paulo, SP', filter);
    expect(result.match).toBe(false);
    if (!result.match) {
      expect(result.reason).toBe('location_city_mismatch');
    }
  });

  it('should be case-insensitive for city matching', () => {
    const filter: LocationFilter = { country: 'BR', city: 'campinas' };
    expect(matchLocation('Campinas, SP', filter).match).toBe(true);
  });

  // Combined state + city
  it('should match when both state and city match', () => {
    const filter: LocationFilter = { country: 'BR', stateRegion: 'SP', city: 'Campinas' };
    expect(matchLocation('Campinas, SP', filter).match).toBe(true);
  });

  it('should reject when state matches but city does not', () => {
    const filter: LocationFilter = { country: 'BR', stateRegion: 'SP', city: 'Campinas' };
    const result = matchLocation('São Paulo, SP', filter);
    expect(result.match).toBe(false);
    if (!result.match) {
      expect(result.reason).toBe('location_city_mismatch');
    }
  });
});

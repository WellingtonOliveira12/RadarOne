import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectVehicleType,
  extractVehicleSpecs,
  enrichAdWithFipe,
  formatFipeTelegram,
  formatFipeEmail,
  formatFipeText,
} from '../../../src/engine/enrichment/fipe';
import type { FipeEnrichment } from '../../../src/engine/enrichment/fipe-types';

// ─── detectVehicleType ──────────────────────────────────────────────────────

describe('detectVehicleType', () => {
  it('detects CAR from common model names', () => {
    expect(detectVehicleType('Toyota Corolla XEI 2.0 2022')).toBe('CAR');
    expect(detectVehicleType('Fiat Argo 1.0 2023')).toBe('CAR');
    expect(detectVehicleType('Hyundai HB20 Comfort 2021')).toBe('CAR');
    expect(detectVehicleType('Volkswagen Gol 1.6 MSI 2020')).toBe('CAR');
    expect(detectVehicleType('Jeep Compass Limited 2024')).toBe('CAR');
  });

  it('detects CAR from brand names', () => {
    expect(detectVehicleType('Honda City EXL 2022')).toBe('CAR');
    expect(detectVehicleType('Chevrolet Onix Plus 2023')).toBe('CAR');
  });

  it('detects MOTORCYCLE from common models', () => {
    expect(detectVehicleType('Honda CG 160 Fan 2021')).toBe('MOTORCYCLE');
    expect(detectVehicleType('Yamaha MT-03 2022')).toBe('MOTORCYCLE');
    expect(detectVehicleType('Honda Bros 160 2020')).toBe('MOTORCYCLE');
    expect(detectVehicleType('Hornet 600 2014')).toBe('MOTORCYCLE');
  });

  it('detects TRUCK from common patterns', () => {
    expect(detectVehicleType('Scania R450 2021')).toBe('TRUCK');
    expect(detectVehicleType('Volvo FH 540 2020')).toBe('TRUCK');
    expect(detectVehicleType('Caminhão Mercedes Atego 2019')).toBe('TRUCK');
  });

  it('detects TRACTOR from common patterns', () => {
    expect(detectVehicleType('Trator Massey Ferguson 275 2015')).toBe('TRACTOR');
    expect(detectVehicleType('John Deere 6110J 2020')).toBe('TRACTOR');
    expect(detectVehicleType('New Holland TL75E 2018')).toBe('TRACTOR');
  });

  it('returns null for non-vehicle items', () => {
    expect(detectVehicleType('iPhone 15 Pro Max 256GB')).toBeNull();
    expect(detectVehicleType('Sofá 3 lugares retrátil')).toBeNull();
    expect(detectVehicleType('Apartamento 2 quartos Copacabana')).toBeNull();
    expect(detectVehicleType('Notebook Dell Inspiron 15')).toBeNull();
  });
});

// ─── extractVehicleSpecs ────────────────────────────────────────────────────

describe('extractVehicleSpecs', () => {
  it('extracts full specs from a well-formed title', () => {
    const specs = extractVehicleSpecs('Toyota Corolla Cross XRE 2.0 2022', 'CAR');
    expect(specs).toEqual({
      brand: 'Toyota',
      model: 'Corolla Cross',
      version: '2.0',
      year: 2022,
      type: 'CAR',
    });
  });

  it('extracts specs without version', () => {
    const specs = extractVehicleSpecs('Hyundai HB20 2023', 'CAR');
    expect(specs).toEqual({
      brand: 'Hyundai',
      model: 'HB20',
      version: undefined,
      year: 2023,
      type: 'CAR',
    });
  });

  it('extracts motorcycle specs', () => {
    const specs = extractVehicleSpecs('Honda CG 160 Fan 2021', 'MOTORCYCLE');
    expect(specs).not.toBeNull();
    expect(specs!.brand).toBe('Honda');
    expect(specs!.model).toBe('CG 160');
    expect(specs!.year).toBe(2021);
  });

  it('returns null when year is missing', () => {
    const specs = extractVehicleSpecs('Toyota Corolla XEI sem ano', 'CAR');
    expect(specs).toBeNull();
  });

  it('returns null when brand is not recognized', () => {
    const specs = extractVehicleSpecs('Bugatti Chiron 2022', 'CAR');
    expect(specs).toBeNull();
  });

  it('handles year format YYYY/YYYY', () => {
    const specs = extractVehicleSpecs('Fiat Argo 1.0 2022/2023', 'CAR');
    expect(specs).not.toBeNull();
    expect(specs!.year).toBe(2022);
  });

  it('prefers more specific model (Corolla Cross over Corolla)', () => {
    const specs = extractVehicleSpecs('Toyota Corolla Cross XRE 2022', 'CAR');
    expect(specs!.model).toBe('Corolla Cross');
  });

  it('rejects years before 1990', () => {
    const specs = extractVehicleSpecs('VW Gol 1985', 'CAR');
    expect(specs).toBeNull();
  });

  it('extracts trim level as version', () => {
    const specs = extractVehicleSpecs('Honda Civic EXL 2022', 'CAR');
    expect(specs).not.toBeNull();
    expect(specs!.version).toBe('exl');
  });

  it('handles VW abbreviation', () => {
    const specs = extractVehicleSpecs('VW T-Cross 1.0 TSI 2023', 'CAR');
    expect(specs).not.toBeNull();
    expect(specs!.brand).toBe('Volkswagen');
    expect(specs!.model).toBe('T-Cross');
  });
});

// ─── enrichAdWithFipe (failsafe) ───────────────────────────────────────────

describe('enrichAdWithFipe', () => {
  it('returns null for non-vehicle ads', async () => {
    const result = await enrichAdWithFipe({ title: 'iPhone 15 Pro Max', price: 5000 });
    expect(result).toBeNull();
  });

  it('returns null for ads without price', async () => {
    const result = await enrichAdWithFipe({ title: 'Toyota Corolla 2022', price: 0 });
    expect(result).toBeNull();
  });

  it('returns null for ads without year', async () => {
    const result = await enrichAdWithFipe({ title: 'Toyota Corolla XEI', price: 100000 });
    expect(result).toBeNull();
  });

  it('never throws even with unexpected input', async () => {
    // Should not throw for any input
    await expect(enrichAdWithFipe({ title: '', price: undefined })).resolves.toBeNull();
    await expect(enrichAdWithFipe({ title: 'abc', price: -1 })).resolves.toBeNull();
  });
});

// ─── Formatting ─────────────────────────────────────────────────────────────

describe('formatFipeTelegram', () => {
  const baseFipe: FipeEnrichment = {
    price: 135000,
    confidence: 'HIGH',
    label: 'Toyota Corolla Cross XRE 2.0 2022',
    delta: -8200,
    ratio: 0.94,
    classification: 'BELOW_FIPE',
  };

  it('formats below FIPE with fire emoji', () => {
    const result = formatFipeTelegram(baseFipe);
    expect(result).toContain('FIPE');
    expect(result).toContain('R$');
    expect(result).toContain('-6%');
    expect(result).toContain('abaixo da FIPE');
  });

  it('formats fair price', () => {
    const result = formatFipeTelegram({ ...baseFipe, ratio: 1.0, classification: 'FAIR_PRICE' });
    expect(result).toContain('na média FIPE');
  });

  it('formats above FIPE', () => {
    const result = formatFipeTelegram({ ...baseFipe, ratio: 1.2, classification: 'ABOVE_FIPE' });
    expect(result).toContain('+20%');
    expect(result).toContain('acima da FIPE');
  });

  it('adds estimated note for MEDIUM confidence', () => {
    const result = formatFipeTelegram({ ...baseFipe, confidence: 'MEDIUM' });
    expect(result).toContain('(estimado)');
  });

  it('does not add estimated note for HIGH confidence', () => {
    const result = formatFipeTelegram(baseFipe);
    expect(result).not.toContain('(estimado)');
  });
});

describe('formatFipeEmail', () => {
  const baseFipe: FipeEnrichment = {
    price: 135000,
    confidence: 'HIGH',
    label: 'Toyota Corolla Cross XRE 2.0 2022',
    delta: -8200,
    ratio: 0.94,
    classification: 'BELOW_FIPE',
  };

  it('returns HTML with FIPE data', () => {
    const html = formatFipeEmail(baseFipe);
    expect(html).toContain('TABELA FIPE');
    expect(html).toContain('R$');
    expect(html).toContain('Abaixo da FIPE');
    expect(html).toContain('#27ae60'); // green for below FIPE
  });

  it('uses red for above FIPE', () => {
    const html = formatFipeEmail({ ...baseFipe, ratio: 1.2, classification: 'ABOVE_FIPE' });
    expect(html).toContain('#e74c3c'); // red
    expect(html).toContain('Acima da FIPE');
  });
});

describe('formatFipeText', () => {
  it('formats plain text with FIPE data', () => {
    const text = formatFipeText({
      price: 135000,
      confidence: 'HIGH',
      label: 'Toyota Corolla Cross XRE 2.0 2022',
      delta: -8200,
      ratio: 0.94,
      classification: 'BELOW_FIPE',
    });
    expect(text).toContain('FIPE');
    expect(text).toContain('R$');
    expect(text).toContain('ABAIXO DA FIPE');
  });
});

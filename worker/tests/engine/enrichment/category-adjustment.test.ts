import { describe, it, expect } from 'vitest';
import {
  detectCategory,
  getCategoryWeights,
  getCategoryAdjustment,
} from '../../../src/engine/enrichment/category-adjustment';

describe('detectCategory', () => {
  it('detects vehicles from car models', () => {
    expect(detectCategory('Toyota Corolla XEI 2.0 2022')).toBe('vehicle');
    expect(detectCategory('Hyundai HB20 Comfort Plus 2023')).toBe('vehicle');
    expect(detectCategory('Fiat Strada Endurance 2021')).toBe('vehicle');
  });

  it('detects vehicles from body types', () => {
    expect(detectCategory('SUV blindado 2020')).toBe('vehicle');
    expect(detectCategory('Sedan executivo usado')).toBe('vehicle');
    expect(detectCategory('Picape cabine dupla')).toBe('vehicle');
  });

  it('detects vehicles from motorcycles', () => {
    expect(detectCategory('Honda CG 160 Fan 2021')).toBe('vehicle');
    expect(detectCategory('Yamaha MT-07 2023')).toBe('vehicle');
    expect(detectCategory('Hornet 600 2014')).toBe('vehicle');
  });

  it('detects vehicles from trucks/tractors', () => {
    expect(detectCategory('Scania R450 Streamline 2021')).toBe('vehicle');
    expect(detectCategory('Caminhão baú refrigerado')).toBe('vehicle');
    expect(detectCategory('Massey Ferguson 275 2015')).toBe('vehicle');
  });

  it('detects electronics', () => {
    expect(detectCategory('iPhone 15 Pro Max 256GB')).toBe('electronics');
    expect(detectCategory('Samsung Galaxy S24 Ultra')).toBe('electronics');
    expect(detectCategory('MacBook Pro M3 14 polegadas')).toBe('electronics');
    expect(detectCategory('PlayStation 5 com 2 controles')).toBe('electronics');
    expect(detectCategory('Notebook Dell Inspiron 15')).toBe('electronics');
    expect(detectCategory('TV 55 Samsung 4K')).toBe('electronics');
  });

  it('detects real estate', () => {
    expect(detectCategory('Apartamento 3 quartos Copacabana')).toBe('real_estate');
    expect(detectCategory('Casa 4 quartos com suíte')).toBe('real_estate');
    expect(detectCategory('Terreno 300m² loteamento')).toBe('real_estate');
    expect(detectCategory('Sala comercial centro')).toBe('real_estate');
    expect(detectCategory('Kitnet mobiliada Pinheiros')).toBe('real_estate');
  });

  it('falls back to general for unknown items', () => {
    expect(detectCategory('Sofá 3 lugares retrátil')).toBe('general');
    expect(detectCategory('Mesa de jantar 6 cadeiras')).toBe('general');
    expect(detectCategory('Bicicleta aro 29 shimano')).toBe('general');
  });

  it('vehicle takes priority over generic terms', () => {
    expect(detectCategory('Carro novo barato')).toBe('vehicle');
  });
});

describe('getCategoryWeights', () => {
  it('returns higher FIPE weight for vehicles', () => {
    const w = getCategoryWeights('vehicle');
    expect(w.fipe).toBe(0.60);
    expect(w.fipe + w.market + w.quality + w.confidence).toBeCloseTo(1.0);
  });

  it('returns zero FIPE weight for electronics', () => {
    const w = getCategoryWeights('electronics');
    expect(w.fipe).toBe(0);
    expect(w.market).toBeGreaterThan(0.4);
  });

  it('returns zero FIPE weight for real estate', () => {
    const w = getCategoryWeights('real_estate');
    expect(w.fipe).toBe(0);
  });

  it('returns V1 defaults for general', () => {
    const w = getCategoryWeights('general');
    expect(w.fipe).toBe(0.50);
    expect(w.market).toBe(0.25);
  });

  it('all categories weights sum to 1.0', () => {
    for (const cat of ['vehicle', 'electronics', 'real_estate', 'general'] as const) {
      const w = getCategoryWeights(cat);
      expect(w.fipe + w.market + w.quality + w.confidence).toBeCloseTo(1.0);
    }
  });
});

describe('getCategoryAdjustment (V2.1)', () => {
  it('vehicle with FIPE → +3', () => {
    expect(getCategoryAdjustment('vehicle', true, false)).toBe(3);
  });

  it('vehicle without FIPE → 0', () => {
    expect(getCategoryAdjustment('vehicle', false, false)).toBe(0);
  });

  it('electronics with market → +3', () => {
    expect(getCategoryAdjustment('electronics', false, true)).toBe(3);
  });

  it('electronics without market → 0', () => {
    expect(getCategoryAdjustment('electronics', false, false)).toBe(0);
  });

  it('real_estate → -3 always', () => {
    expect(getCategoryAdjustment('real_estate', false, false)).toBe(-3);
    expect(getCategoryAdjustment('real_estate', true, true)).toBe(-3);
  });

  it('general → 0 always', () => {
    expect(getCategoryAdjustment('general', false, false)).toBe(0);
    expect(getCategoryAdjustment('general', true, true)).toBe(0);
  });

  it('all adjustments within -3 to +3', () => {
    for (const cat of ['vehicle', 'electronics', 'real_estate', 'general'] as const) {
      for (const f of [true, false]) {
        for (const m of [true, false]) {
          const adj = getCategoryAdjustment(cat, f, m);
          expect(adj).toBeGreaterThanOrEqual(-3);
          expect(adj).toBeLessThanOrEqual(3);
        }
      }
    }
  });
});

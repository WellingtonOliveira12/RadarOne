import { describe, it, expect } from 'vitest';
import { olxConfig } from '../../src/engine/configs/olx.config';

const parse = olxConfig.priceParser;

describe('OLX price parser', () => {
  // Valid prices — ACCEPT
  it('parses "R$ 800"', () => {
    expect(parse('R$ 800')).toBe(800);
  });

  it('parses "R$ 10.500"', () => {
    expect(parse('R$ 10.500')).toBe(10500);
  });

  it('parses "R$ 126.800"', () => {
    expect(parse('R$ 126.800')).toBe(126800);
  });

  it('parses "R$ 1.200,50"', () => {
    expect(parse('R$ 1.200,50')).toBe(1200.5);
  });

  it('parses plain number "800"', () => {
    expect(parse('800')).toBe(800);
  });

  it('parses "R$ 87.448"', () => {
    expect(parse('R$ 87.448')).toBe(87448);
  });

  // Installment text — REJECT (return 0)
  it('rejects "em até 3x de R$ 266,67 sem juros"', () => {
    expect(parse('em até 3x de R$ 266,67 sem juros')).toBe(0);
  });

  it('rejects "em até 3x de R$ 316,67 sem juros"', () => {
    expect(parse('em até 3x de R$ 316,67 sem juros')).toBe(0);
  });

  it('rejects "em até 3x de R$ 300,00 sem juros"', () => {
    expect(parse('em até 3x de R$ 300,00 sem juros')).toBe(0);
  });

  it('rejects "Parcelamento sem juros"', () => {
    expect(parse('Parcelamento sem juros')).toBe(0);
  });

  // Invalid/empty — REJECT (return 0)
  it('returns 0 for empty string', () => {
    expect(parse('')).toBe(0);
  });

  it('returns 0 for "Patrocinado"', () => {
    expect(parse('Patrocinado')).toBe(0);
  });

  it('returns 0 for "Novo"', () => {
    expect(parse('Novo')).toBe(0);
  });

  it('returns 0 for "Frete grátis"', () => {
    expect(parse('Frete grátis')).toBe(0);
  });
});

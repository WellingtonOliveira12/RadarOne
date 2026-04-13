import { describe, it, expect } from 'vitest';
import {
  parseOlxProfileText,
  countVerifications,
  yearsOnPlatform,
  emptyProfileSignals,
} from '../../src/engine/enrichment/olx-profile-parser';

// Real text observed in production on a logged-in OLX ad detail page
// (2026-04-13). Used as the authoritative parser fixture.
const REAL_BODY_TEXT = `
R$ 1.500
3x sem juros de R$ 500,00
Fazer oferta
Albertorlk
Último acesso há 39 min
Na OLX desde abril de 2026
Centro, Matriz de Camaragibe - AL
Informações verificadas
E-mail
Telefone
Facebook
Este anúncio oferece
Garantia da OLX
iPhone 13
Este anunciante ainda não possui avaliações
`;

describe('parseOlxProfileText', () => {
  it('returns empty signals on null/undefined/empty input', () => {
    expect(parseOlxProfileText(null)).toEqual(emptyProfileSignals());
    expect(parseOlxProfileText(undefined)).toEqual(emptyProfileSignals());
    expect(parseOlxProfileText('')).toEqual(emptyProfileSignals());
  });

  it('extracts all signals from the real OLX detail page text', () => {
    const s = parseOlxProfileText(REAL_BODY_TEXT);
    expect(s.yearJoined).toBe(2026);
    expect(s.monthJoined).toBe('abril');
    expect(s.lastSeenRaw).toBe('39 min');
    expect(s.hasVerificationsSection).toBe(true);
    expect(s.verifications.email).toBe(true);
    expect(s.verifications.phone).toBe(true);
    expect(s.verifications.facebook).toBe(true);
    expect(s.verifications.identity).toBe(false);
    // "ainda não possui avaliações" → hasRatings must be FALSE
    expect(s.hasRatings).toBe(false);
  });

  it('detects identity verification when present', () => {
    const text = `Na OLX desde 2023
Informações verificadas
E-mail
Telefone
Identidade
Facebook`;
    const s = parseOlxProfileText(text);
    expect(s.verifications.identity).toBe(true);
  });

  it('extracts year-only when month is missing', () => {
    const text = 'Na OLX desde 2022';
    const s = parseOlxProfileText(text);
    expect(s.yearJoined).toBe(2022);
    expect(s.monthJoined).toBeNull();
  });

  it('extracts year+month when present', () => {
    const text = 'Na OLX desde janeiro de 2021';
    const s = parseOlxProfileText(text);
    expect(s.yearJoined).toBe(2021);
    expect(s.monthJoined).toBe('janeiro');
  });

  it('reads "Último acesso há 2 dias"', () => {
    const text = 'Último acesso há 2 dias\nNa OLX desde 2020';
    const s = parseOlxProfileText(text);
    expect(s.lastSeenRaw).toBe('2 dias');
  });

  it('detects hasRatings=true for positive review count', () => {
    const text = 'Na OLX desde 2019\n4 avaliações';
    const s = parseOlxProfileText(text);
    expect(s.hasRatings).toBe(true);
  });

  it('hasRatings=false for "ainda não possui avaliações"', () => {
    const text = 'Este anunciante ainda não possui avaliações';
    const s = parseOlxProfileText(text);
    expect(s.hasRatings).toBe(false);
  });

  it('hasVerificationsSection=false when section is absent', () => {
    const text = 'Na OLX desde 2024\nOutro texto qualquer';
    const s = parseOlxProfileText(text);
    expect(s.hasVerificationsSection).toBe(false);
    expect(s.verifications.email).toBe(false);
  });

  it('does NOT leak "E-mail" label from unrelated sections', () => {
    // Ensure the regex is scoped to the verifications block (400 chars).
    const unrelated = 'Contato: seuemail@exemplo.com\n'.repeat(50);
    const text = unrelated + '\nInformações verificadas\nTelefone';
    const s = parseOlxProfileText(text);
    expect(s.hasVerificationsSection).toBe(true);
    expect(s.verifications.phone).toBe(true);
    // The standalone "seuemail@exemplo.com" should NOT count as verified email
    // because it is outside the 400-char verifications block.
    expect(s.verifications.email).toBe(false);
  });
});

describe('countVerifications', () => {
  it('counts only true flags', () => {
    expect(
      countVerifications({ email: true, phone: false, facebook: true, identity: false }),
    ).toBe(2);
    expect(
      countVerifications({ email: false, phone: false, facebook: false, identity: false }),
    ).toBe(0);
    expect(
      countVerifications({ email: true, phone: true, facebook: true, identity: true }),
    ).toBe(4);
  });
});

describe('yearsOnPlatform', () => {
  const now = new Date('2026-04-13T00:00:00Z');

  it('returns null when yearJoined is unknown', () => {
    expect(yearsOnPlatform(emptyProfileSignals(), now)).toBeNull();
  });

  it('computes 0 for joined this year', () => {
    const s = { ...emptyProfileSignals(), yearJoined: 2026 };
    expect(yearsOnPlatform(s, now)).toBe(0);
  });

  it('computes positive for past year', () => {
    const s = { ...emptyProfileSignals(), yearJoined: 2021 };
    expect(yearsOnPlatform(s, now)).toBe(5);
  });

  it('clamps negative years (future) to 0', () => {
    const s = { ...emptyProfileSignals(), yearJoined: 2100 };
    expect(yearsOnPlatform(s, now)).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  getAuthPolicy,
  getAuthMode,
  isSessionRequired,
  isSessionSupported,
  getAllPolicies,
} from '../../src/engine/marketplace-auth-policy';

describe('Marketplace Auth Policy', () => {
  // ============================================================
  // 1. Facebook — COOKIES_REQUIRED
  // ============================================================

  describe('Facebook Marketplace', () => {
    it('requires cookies', () => {
      const policy = getAuthPolicy('FACEBOOK_MARKETPLACE');
      expect(policy.policy).toBe('COOKIES_REQUIRED');
      expect(policy.authMode).toBe('cookies_required');
      expect(policy.connectionRequired).toBe(true);
      expect(policy.connectionSupported).toBe(true);
      expect(policy.domain).toBe('facebook.com');
    });

    it('getAuthMode returns cookies_required', () => {
      expect(getAuthMode('FACEBOOK_MARKETPLACE')).toBe('cookies_required');
    });

    it('isSessionRequired returns true', () => {
      expect(isSessionRequired('FACEBOOK_MARKETPLACE')).toBe(true);
    });
  });

  // ============================================================
  // 2. OLX — OPTIONAL_AUTH
  // ============================================================

  describe('OLX', () => {
    it('uses optional auth', () => {
      const policy = getAuthPolicy('OLX');
      expect(policy.policy).toBe('OPTIONAL_AUTH');
      expect(policy.authMode).toBe('cookies_optional');
      expect(policy.connectionRequired).toBe(false);
      expect(policy.connectionSupported).toBe(true);
      expect(policy.domain).toBe('olx.com.br');
    });

    it('getAuthMode returns cookies_optional', () => {
      expect(getAuthMode('OLX')).toBe('cookies_optional');
    });

    it('isSessionRequired returns false', () => {
      expect(isSessionRequired('OLX')).toBe(false);
    });

    it('isSessionSupported returns true', () => {
      expect(isSessionSupported('OLX')).toBe(true);
    });
  });

  // ============================================================
  // 3. Mercado Livre — OPTIONAL_AUTH
  // ============================================================

  describe('Mercado Livre', () => {
    it('uses optional auth', () => {
      const policy = getAuthPolicy('MERCADO_LIVRE');
      expect(policy.policy).toBe('OPTIONAL_AUTH');
      expect(policy.authMode).toBe('cookies_optional');
      expect(policy.connectionRequired).toBe(false);
      expect(policy.connectionSupported).toBe(true);
    });
  });

  // ============================================================
  // 4. NO_AUTH sites
  // ============================================================

  describe('NO_AUTH sites', () => {
    const noAuthSites = ['WEBMOTORS', 'ICARROS', 'ZAP_IMOVEIS', 'VIVA_REAL', 'IMOVELWEB', 'LEILAO'];

    for (const site of noAuthSites) {
      it(`${site} uses NO_AUTH`, () => {
        const policy = getAuthPolicy(site);
        expect(policy.policy).toBe('NO_AUTH');
        expect(policy.authMode).toBe('anonymous');
        expect(policy.connectionRequired).toBe(false);
        expect(policy.connectionSupported).toBe(false);
      });
    }
  });

  // ============================================================
  // 5. Unknown site — safe default
  // ============================================================

  describe('Unknown site', () => {
    it('defaults to NO_AUTH for unknown marketplace', () => {
      const policy = getAuthPolicy('UNKNOWN_SITE');
      expect(policy.policy).toBe('NO_AUTH');
      expect(policy.authMode).toBe('anonymous');
      expect(policy.connectionRequired).toBe(false);
      expect(policy.connectionSupported).toBe(false);
    });
  });

  // ============================================================
  // 6. getAllPolicies
  // ============================================================

  describe('getAllPolicies', () => {
    it('returns all 9 marketplace policies', () => {
      const policies = getAllPolicies();
      expect(Object.keys(policies)).toHaveLength(9);
      expect(policies).toHaveProperty('FACEBOOK_MARKETPLACE');
      expect(policies).toHaveProperty('OLX');
      expect(policies).toHaveProperty('MERCADO_LIVRE');
    });

    it('returns a copy (not mutable reference)', () => {
      const p1 = getAllPolicies();
      const p2 = getAllPolicies();
      expect(p1).not.toBe(p2);
      expect(p1).toEqual(p2);
    });
  });
});

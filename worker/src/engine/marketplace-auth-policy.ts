/**
 * Marketplace Auth Policy — centralized authentication policy per marketplace.
 *
 * Defines the authentication strategy for each supported marketplace site.
 * This is the single source of truth for how each marketplace handles auth.
 *
 * Auth Modes:
 *   - NO_AUTH:          Site operates without login. Always anonymous.
 *   - OPTIONAL_AUTH:    If valid session exists, use it. Otherwise anonymous fallback.
 *   - COOKIES_REQUIRED: Must have valid session. Fails without one.
 *
 * Maps to engine AuthMode:
 *   NO_AUTH          → 'anonymous'
 *   OPTIONAL_AUTH    → 'cookies_optional'
 *   COOKIES_REQUIRED → 'cookies_required'
 */

import { AuthMode } from './types';

export type MarketplaceAuthPolicy = 'NO_AUTH' | 'OPTIONAL_AUTH' | 'COOKIES_REQUIRED';

export interface MarketplaceAuthConfig {
  /** Human-friendly policy name */
  policy: MarketplaceAuthPolicy;
  /** Engine-level authMode (maps from policy) */
  authMode: AuthMode;
  /** Whether the user MUST connect their account */
  connectionRequired: boolean;
  /** Whether the user CAN connect their account (shown in UI) */
  connectionSupported: boolean;
  /** Domain used for session lookup in UserSession table */
  domain: string;
  /** Justification for the policy choice */
  reason: string;
}

/**
 * Auth policy registry — one entry per marketplace.
 *
 * Add new marketplaces here when expanding auth support.
 */
const MARKETPLACE_AUTH_POLICIES: Record<string, MarketplaceAuthConfig> = {
  FACEBOOK_MARKETPLACE: {
    policy: 'COOKIES_REQUIRED',
    authMode: 'cookies_required',
    connectionRequired: true,
    connectionSupported: true,
    domain: 'facebook.com',
    reason: 'Facebook blocks all anonymous access to Marketplace. Valid session mandatory.',
  },
  OLX: {
    policy: 'OPTIONAL_AUTH',
    authMode: 'cookies_optional',
    connectionRequired: false,
    connectionSupported: true,
    domain: 'olx.com.br',
    reason: 'OLX may serve limited content to anonymous visitors. Auth session reduces captcha/blocking.',
  },
  MERCADO_LIVRE: {
    policy: 'OPTIONAL_AUTH',
    authMode: 'cookies_optional',
    connectionRequired: false,
    connectionSupported: true,
    domain: 'mercadolivre.com.br',
    reason: 'ML works anonymous but authenticated sessions get better results and fewer captchas.',
  },
  WEBMOTORS: {
    policy: 'NO_AUTH',
    authMode: 'anonymous',
    connectionRequired: false,
    connectionSupported: false,
    domain: 'webmotors.com.br',
    reason: 'Public listings, no auth benefit observed.',
  },
  ICARROS: {
    policy: 'NO_AUTH',
    authMode: 'anonymous',
    connectionRequired: false,
    connectionSupported: false,
    domain: 'icarros.com.br',
    reason: 'Public listings, no auth benefit observed.',
  },
  ZAP_IMOVEIS: {
    policy: 'NO_AUTH',
    authMode: 'anonymous',
    connectionRequired: false,
    connectionSupported: false,
    domain: 'zapimoveis.com.br',
    reason: 'Public listings, no auth benefit observed.',
  },
  VIVA_REAL: {
    policy: 'NO_AUTH',
    authMode: 'anonymous',
    connectionRequired: false,
    connectionSupported: false,
    domain: 'vivareal.com.br',
    reason: 'Public listings, no auth benefit observed.',
  },
  IMOVELWEB: {
    policy: 'NO_AUTH',
    authMode: 'anonymous',
    connectionRequired: false,
    connectionSupported: false,
    domain: 'imovelweb.com.br',
    reason: 'Public listings, no auth benefit observed.',
  },
  LEILAO: {
    policy: 'NO_AUTH',
    authMode: 'anonymous',
    connectionRequired: false,
    connectionSupported: false,
    domain: 'leilao.com.br',
    reason: 'Public listings, no auth benefit observed.',
  },
};

/**
 * Gets the auth policy for a marketplace site.
 * Returns NO_AUTH config for unknown sites (safe default).
 */
export function getAuthPolicy(site: string): MarketplaceAuthConfig {
  const config = MARKETPLACE_AUTH_POLICIES[site];
  if (config) return config;

  // Unknown site → safe anonymous default
  return {
    policy: 'NO_AUTH',
    authMode: 'anonymous',
    connectionRequired: false,
    connectionSupported: false,
    domain: 'unknown',
    reason: 'Unknown marketplace — defaulting to anonymous.',
  };
}

/**
 * Gets the authMode for a marketplace site (used by SiteConfig).
 */
export function getAuthMode(site: string): AuthMode {
  return getAuthPolicy(site).authMode;
}

/**
 * Checks if a session is required for a marketplace site.
 */
export function isSessionRequired(site: string): boolean {
  return getAuthPolicy(site).connectionRequired;
}

/**
 * Checks if a marketplace supports authenticated sessions.
 */
export function isSessionSupported(site: string): boolean {
  return getAuthPolicy(site).connectionSupported;
}

/**
 * Returns all marketplace auth policies (for admin/debugging).
 */
export function getAllPolicies(): Record<string, MarketplaceAuthConfig> {
  return { ...MARKETPLACE_AUTH_POLICIES };
}

/**
 * ============================================================
 * CONFIGURAÇÕES DE AUTENTICAÇÃO POR SITE
 * ============================================================
 *
 * Define URLs de login, validação e configurações específicas
 * para cada site que requer autenticação.
 */

export interface SiteAuthConfig {
  /** Identificador único do site */
  siteId: string;

  /** Nome amigável para logs */
  displayName: string;

  /** URL da página de login */
  loginUrl: string;

  /** URL para testar se sessão está válida */
  validationUrl: string;

  /** Domínio principal (para cookies) */
  domain: string;

  /** Seletores para detectar se está logado */
  loggedInSelectors: string[];

  /** Seletores que indicam página de login */
  loginPageSelectors: string[];

  /** Textos que indicam que precisa de login */
  loginRequiredTexts: string[];

  /** Tempo de expiração padrão da sessão (dias) */
  sessionExpiryDays: number;

  /** Se o site pode exigir MFA/OTP */
  mayRequireMFA: boolean;

  /** Seletores que indicam MFA/OTP */
  mfaSelectors?: string[];

  /** Textos que indicam MFA/OTP */
  mfaTexts?: string[];
}

/**
 * Configurações de autenticação por site
 */
export const AUTH_SITES: Record<string, SiteAuthConfig> = {
  MERCADO_LIVRE: {
    siteId: 'MERCADO_LIVRE',
    displayName: 'Mercado Livre',
    loginUrl: 'https://www.mercadolivre.com.br/login',
    validationUrl: 'https://www.mercadolivre.com.br/minha-conta',
    domain: 'mercadolivre.com.br',
    loggedInSelectors: [
      '[data-js="user-info"]',
      '.nav-header-user-info',
      '.nav-menu-user-info',
      '#nav-header-menu-switch',
      '[class*="user-nickname"]',
    ],
    loginPageSelectors: [
      'input[name="user_id"]',
      '#login_user_id',
      'form[action*="login"]',
      '.login-form',
    ],
    loginRequiredTexts: [
      'para continuar, acesse sua conta',
      'acesse sua conta',
      'faça login',
      'faca login',
      'entre na sua conta',
      'identifique-se',
    ],
    sessionExpiryDays: 14,
    mayRequireMFA: true,
    mfaSelectors: [
      'input[name="otp"]',
      'input[name="code"]',
      '[class*="verification-code"]',
      '[class*="otp"]',
    ],
    mfaTexts: [
      'código de verificação',
      'codigo de verificacao',
      'enviamos um código',
      'confirme sua identidade',
      'autenticação de dois fatores',
    ],
  },

  SUPERBID: {
    siteId: 'SUPERBID',
    displayName: 'Superbid',
    loginUrl: 'https://www.superbid.net/login',
    validationUrl: 'https://www.superbid.net/minha-conta',
    domain: 'superbid.net',
    loggedInSelectors: [
      '.user-menu',
      '[class*="user-logged"]',
      '.minha-conta-link',
    ],
    loginPageSelectors: [
      'input[name="email"]',
      'input[name="password"]',
      'form[action*="login"]',
    ],
    loginRequiredTexts: [
      'faça login',
      'acesse sua conta',
      'área restrita',
    ],
    sessionExpiryDays: 7,
    mayRequireMFA: false,
  },

  SODRE_SANTORO: {
    siteId: 'SODRE_SANTORO',
    displayName: 'Sodré Santoro',
    loginUrl: 'https://www.sodresantoro.com.br/login',
    validationUrl: 'https://www.sodresantoro.com.br/minha-conta',
    domain: 'sodresantoro.com.br',
    loggedInSelectors: [
      '.user-area',
      '[class*="logged"]',
    ],
    loginPageSelectors: [
      'input[type="email"]',
      'input[type="password"]',
    ],
    loginRequiredTexts: [
      'faça login',
      'acesse sua conta',
    ],
    sessionExpiryDays: 7,
    mayRequireMFA: false,
  },

  ZUKERMAN: {
    siteId: 'ZUKERMAN',
    displayName: 'Zukerman Leilões',
    loginUrl: 'https://www.zfranca.com.br/login',
    validationUrl: 'https://www.zfranca.com.br/minha-conta',
    domain: 'zfranca.com.br',
    loggedInSelectors: [
      '.user-logged',
      '[class*="minha-conta"]',
    ],
    loginPageSelectors: [
      'input[name="email"]',
      'input[name="senha"]',
    ],
    loginRequiredTexts: [
      'faça login',
      'área do cliente',
    ],
    sessionExpiryDays: 7,
    mayRequireMFA: false,
  },
};

/**
 * Obtém configuração de um site por ID
 */
export function getSiteAuthConfig(siteId: string): SiteAuthConfig | null {
  return AUTH_SITES[siteId] || null;
}

/**
 * Lista todos os sites suportados
 */
export function listSupportedSites(): string[] {
  return Object.keys(AUTH_SITES);
}

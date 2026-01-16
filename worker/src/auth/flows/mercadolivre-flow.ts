/**
 * ============================================================
 * MERCADO LIVRE AUTH FLOW
 * ============================================================
 *
 * Implementação específica do fluxo de autenticação para
 * o Mercado Livre.
 *
 * Suporta:
 * - Login com email/senha
 * - MFA via TOTP
 * - MFA via código por email
 * - Detecção de bloqueio/challenge
 */

import { Page } from 'playwright';
import {
  IAuthFlow,
  AccountConfig,
  AccountCredentials,
  AuthResult,
  PageDetectionResult,
  MFAType,
} from '../types';
import { totpManager } from '../totp-manager';

// ============================================================
// SELETORES
// ============================================================

const SELECTORS = {
  // Campos de login
  emailInput: 'input[name="user_id"], #user_id, input[type="email"]',
  passwordInput: 'input[name="password"], #password, input[type="password"]',
  submitButton: 'button[type="submit"], .andes-button--loud',
  continueButton: 'button:has-text("Continuar"), button:has-text("Continue")',

  // MFA
  otpInput: 'input[name="code"], input[name="otp"], input[inputmode="numeric"]',
  otpSubmitButton: 'button[type="submit"]:has-text("Verificar"), button:has-text("Confirmar")',

  // Estados
  loggedInIndicators: [
    '[data-js="user-info"]',
    '.nav-header-user-info',
    '.nav-menu-user-info',
    '#nav-header-menu-switch',
    '[class*="user-nickname"]',
    '.nav-icon-user-default-icon',
  ],
  loginPageIndicators: [
    'input[name="user_id"]',
    '#login_user_id',
    'form[action*="login"]',
    '.login-form',
  ],
  mfaIndicators: [
    'input[name="code"]',
    'input[name="otp"]',
    '[class*="verification"]',
    '[class*="otp"]',
    'input[inputmode="numeric"][maxlength="6"]',
  ],
  challengeIndicators: [
    '.g-recaptcha',
    '#g-recaptcha',
    'iframe[src*="recaptcha"]',
    '.h-captcha',
    '[class*="challenge"]',
  ],
  blockedIndicators: [
    '[class*="blocked"]',
    '[class*="suspended"]',
  ],
};

// Textos para detecção
const TEXTS = {
  loginRequired: [
    'para continuar, acesse sua conta',
    'acesse sua conta',
    'faça login',
    'faca login',
    'entre na sua conta',
    'identifique-se',
  ],
  mfaRequired: [
    'código de verificação',
    'codigo de verificacao',
    'enviamos um código',
    'digite o código',
    'confirme sua identidade',
    'autenticação de dois fatores',
  ],
  blocked: [
    'conta bloqueada',
    'conta suspensa',
    'não é possível acessar',
    'acesso negado',
  ],
  challenge: [
    'verificação de segurança',
    'prove que você é humano',
    'captcha',
  ],
};

// ============================================================
// IMPLEMENTAÇÃO
// ============================================================

class MercadoLivreAuthFlow implements IAuthFlow {
  readonly siteId = 'MERCADO_LIVRE';

  /**
   * Detecta estado atual da página
   */
  async detectPageState(page: Page): Promise<PageDetectionResult> {
    try {
      // Aguarda um pouco para página estabilizar
      await page.waitForTimeout(1000);

      const bodyText = await page.evaluate(() =>
        document.body?.innerText?.toLowerCase() || ''
      );

      // Verifica bloqueio
      for (const text of TEXTS.blocked) {
        if (bodyText.includes(text.toLowerCase())) {
          return PageDetectionResult.ACCOUNT_BLOCKED;
        }
      }

      for (const selector of SELECTORS.blockedIndicators) {
        if (await page.$(selector)) {
          return PageDetectionResult.ACCOUNT_BLOCKED;
        }
      }

      // Verifica challenge/captcha
      for (const text of TEXTS.challenge) {
        if (bodyText.includes(text.toLowerCase())) {
          return PageDetectionResult.CHALLENGE;
        }
      }

      for (const selector of SELECTORS.challengeIndicators) {
        if (await page.$(selector)) {
          return PageDetectionResult.CHALLENGE;
        }
      }

      // Verifica MFA
      for (const text of TEXTS.mfaRequired) {
        if (bodyText.includes(text.toLowerCase())) {
          return PageDetectionResult.MFA_REQUIRED;
        }
      }

      for (const selector of SELECTORS.mfaIndicators) {
        if (await page.$(selector)) {
          return PageDetectionResult.MFA_REQUIRED;
        }
      }

      // Verifica se está logado
      for (const selector of SELECTORS.loggedInIndicators) {
        if (await page.$(selector)) {
          return PageDetectionResult.LOGGED_IN;
        }
      }

      // Verifica página de login
      for (const selector of SELECTORS.loginPageIndicators) {
        if (await page.$(selector)) {
          return PageDetectionResult.LOGIN_PAGE;
        }
      }

      for (const text of TEXTS.loginRequired) {
        if (bodyText.includes(text.toLowerCase())) {
          return PageDetectionResult.LOGIN_PAGE;
        }
      }

      // Verifica se é página de conteúdo (busca, produto, etc)
      const hasContent = await page.evaluate(() => {
        return !!(
          document.querySelector('.ui-search-layout') ||
          document.querySelector('[class*="search-result"]') ||
          document.querySelector('.ui-pdp-container')
        );
      });

      if (hasContent) {
        return PageDetectionResult.CONTENT_PAGE;
      }

      return PageDetectionResult.UNKNOWN;
    } catch (error: any) {
      console.error(`ML_FLOW_DETECT_ERROR: ${error.message}`);
      return PageDetectionResult.UNKNOWN;
    }
  }

  /**
   * Executa login com credenciais
   */
  async performLogin(page: Page, credentials: AccountCredentials): Promise<AuthResult> {
    console.log('ML_FLOW: Iniciando login...');

    try {
      // Passo 1: Preenche email
      const emailInput = await page.$(SELECTORS.emailInput);
      if (!emailInput) {
        return {
          success: false,
          pageResult: PageDetectionResult.UNKNOWN,
          error: 'Campo de email não encontrado',
        };
      }

      await emailInput.fill(credentials.username);
      console.log('ML_FLOW: Email preenchido');

      // Clica em continuar (ML usa fluxo em duas etapas)
      const continueBtn = await page.$(SELECTORS.continueButton);
      if (continueBtn) {
        await continueBtn.click();
        await page.waitForTimeout(2000);
      }

      // Passo 2: Preenche senha
      const passwordInput = await page.$(SELECTORS.passwordInput);
      if (!passwordInput) {
        // Verifica se foi para MFA ou erro
        const state = await this.detectPageState(page);
        if (state === PageDetectionResult.MFA_REQUIRED) {
          return { success: false, pageResult: state };
        }

        return {
          success: false,
          pageResult: PageDetectionResult.UNKNOWN,
          error: 'Campo de senha não encontrado',
        };
      }

      await passwordInput.fill(credentials.password);
      console.log('ML_FLOW: Senha preenchida');

      // Clica em entrar
      const submitBtn = await page.$(SELECTORS.submitButton);
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }

      // Aguarda resultado
      await page.waitForTimeout(3000);

      // Detecta estado após login
      const postLoginState = await this.detectPageState(page);
      console.log(`ML_FLOW: Estado pós-login: ${postLoginState}`);

      if (postLoginState === PageDetectionResult.LOGGED_IN ||
          postLoginState === PageDetectionResult.CONTENT_PAGE) {
        return { success: true, pageResult: postLoginState };
      }

      return { success: false, pageResult: postLoginState };
    } catch (error: any) {
      console.error(`ML_FLOW_LOGIN_ERROR: ${error.message}`);
      return {
        success: false,
        pageResult: PageDetectionResult.UNKNOWN,
        error: error.message,
      };
    }
  }

  /**
   * Resolve MFA
   */
  async handleMFA(page: Page, account: AccountConfig): Promise<AuthResult> {
    console.log(`ML_FLOW: Resolvendo MFA (tipo: ${account.mfaType})...`);

    try {
      let otpCode: string;

      // Obtém código baseado no tipo de MFA
      if (account.mfaType === MFAType.TOTP && account.credentials.totpSecret) {
        // Gera código TOTP
        otpCode = await totpManager.generateFreshCode(account.credentials.totpSecret, 10);
        console.log(`ML_FLOW: Código TOTP gerado`);
      } else {
        // Para outros tipos, código deve vir de outro lugar (webhook, etc)
        return {
          success: false,
          pageResult: PageDetectionResult.MFA_REQUIRED,
          error: `MFA tipo ${account.mfaType} não suportado automaticamente`,
          needsManualIntervention: true,
        };
      }

      // Localiza campo de OTP
      const otpInput = await page.$(SELECTORS.otpInput);
      if (!otpInput) {
        return {
          success: false,
          pageResult: PageDetectionResult.MFA_REQUIRED,
          error: 'Campo de código OTP não encontrado',
        };
      }

      // Preenche código
      await otpInput.fill(otpCode);
      console.log('ML_FLOW: Código OTP preenchido');

      // Submete
      const submitBtn = await page.$(SELECTORS.otpSubmitButton);
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }

      // Aguarda resultado
      await page.waitForTimeout(3000);

      // Verifica estado
      const state = await this.detectPageState(page);
      console.log(`ML_FLOW: Estado pós-MFA: ${state}`);

      if (state === PageDetectionResult.LOGGED_IN ||
          state === PageDetectionResult.CONTENT_PAGE) {
        return { success: true, pageResult: state };
      }

      // Se ainda pede MFA, código estava errado
      if (state === PageDetectionResult.MFA_REQUIRED) {
        return {
          success: false,
          pageResult: state,
          error: 'Código MFA rejeitado',
        };
      }

      return { success: false, pageResult: state };
    } catch (error: any) {
      console.error(`ML_FLOW_MFA_ERROR: ${error.message}`);
      return {
        success: false,
        pageResult: PageDetectionResult.MFA_REQUIRED,
        error: error.message,
      };
    }
  }

  /**
   * Valida se sessão está ativa
   */
  async validateSession(page: Page): Promise<boolean> {
    try {
      const state = await this.detectPageState(page);
      return state === PageDetectionResult.LOGGED_IN ||
             state === PageDetectionResult.CONTENT_PAGE;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verifica se é página de conteúdo válido
   */
  async isContentPage(page: Page): Promise<boolean> {
    try {
      const state = await this.detectPageState(page);
      return state === PageDetectionResult.CONTENT_PAGE;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton
export const mercadoLivreAuthFlow = new MercadoLivreAuthFlow();

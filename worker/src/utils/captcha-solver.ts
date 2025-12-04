/**
 * Captcha Solver - Integração com 2Captcha e Anti-Captcha
 *
 * Resolve captchas automaticamente usando serviços de terceiros
 * Suporta ReCAPTCHA v2, ReCAPTCHA v3, hCaptcha, e outros
 *
 * Para usar:
 * 1. Criar conta em 2captcha.com ou anti-captcha.com
 * 2. Adicionar chave da API no .env:
 *    - CAPTCHA_SERVICE=2captcha (ou anticaptcha)
 *    - CAPTCHA_API_KEY=sua_chave_aqui
 */

import { Page } from 'playwright';

interface CaptchaResult {
  success: boolean;
  solution?: string;
  error?: string;
}

/**
 * Serviço de resolução de captchas
 */
export class CaptchaSolver {
  private apiKey: string;
  private service: '2captcha' | 'anticaptcha' | null;

  constructor() {
    this.apiKey = process.env.CAPTCHA_API_KEY || '';
    this.service = (process.env.CAPTCHA_SERVICE as '2captcha' | 'anticaptcha') || null;

    if (!this.apiKey || !this.service) {
      console.log(
        '⚠️  Captcha solver não configurado. Defina CAPTCHA_SERVICE e CAPTCHA_API_KEY no .env'
      );
    }
  }

  /**
   * Verifica se captcha solver está configurado
   */
  isEnabled(): boolean {
    return !!(this.apiKey && this.service);
  }

  /**
   * Resolve ReCAPTCHA v2
   *
   * @param page - Página do Playwright
   * @param sitekey - Data-sitekey do ReCAPTCHA
   * @returns Token de solução
   */
  async solveRecaptchaV2(page: Page, sitekey?: string): Promise<CaptchaResult> {
    if (!this.isEnabled()) {
      return {
        success: false,
        error: 'Captcha solver não configurado',
      };
    }

    try {
      const url = page.url();

      // Tenta extrair sitekey automaticamente se não fornecido
      if (!sitekey) {
        sitekey = await this.extractSiteKey(page);
      }

      if (!sitekey) {
        return {
          success: false,
          error: 'Não foi possível encontrar sitekey do ReCAPTCHA',
        };
      }

      console.log('🔐 Resolvendo ReCAPTCHA v2...');

      let solution: string;

      if (this.service === '2captcha') {
        solution = await this.solve2Captcha({
          method: 'userrecaptcha',
          googlekey: sitekey,
          pageurl: url,
        });
      } else {
        solution = await this.solveAntiCaptcha('RecaptchaV2TaskProxyless', {
          websiteURL: url,
          websiteKey: sitekey,
        });
      }

      // Injeta solução na página
      await page.evaluate((token) => {
        // @ts-ignore
        document.getElementById('g-recaptcha-response').innerHTML = token;
        // @ts-ignore
        if (typeof grecaptcha !== 'undefined') {
          // @ts-ignore
          grecaptcha.getResponse = () => token;
        }
      }, solution);

      console.log('✅ ReCAPTCHA resolvido com sucesso');

      return {
        success: true,
        solution,
      };
    } catch (error: any) {
      console.error('❌ Erro ao resolver ReCAPTCHA:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Resolve hCaptcha
   */
  async solveHCaptcha(page: Page, sitekey?: string): Promise<CaptchaResult> {
    if (!this.isEnabled()) {
      return {
        success: false,
        error: 'Captcha solver não configurado',
      };
    }

    try {
      const url = page.url();

      if (!sitekey) {
        sitekey = await page.evaluate(() => {
          const el = document.querySelector('[data-sitekey]');
          return el?.getAttribute('data-sitekey') || '';
        });
      }

      if (!sitekey) {
        return {
          success: false,
          error: 'Não foi possível encontrar sitekey do hCaptcha',
        };
      }

      console.log('🔐 Resolvendo hCaptcha...');

      let solution: string;

      if (this.service === '2captcha') {
        solution = await this.solve2Captcha({
          method: 'hcaptcha',
          sitekey: sitekey,
          pageurl: url,
        });
      } else {
        solution = await this.solveAntiCaptcha('HCaptchaTaskProxyless', {
          websiteURL: url,
          websiteKey: sitekey,
        });
      }

      console.log('✅ hCaptcha resolvido com sucesso');

      return {
        success: true,
        solution,
      };
    } catch (error: any) {
      console.error('❌ Erro ao resolver hCaptcha:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Detecta e resolve automaticamente captchas na página
   */
  async autoSolve(page: Page): Promise<CaptchaResult> {
    // Detecta tipo de captcha
    const hasRecaptcha = await page.evaluate(() => {
      return !!document.querySelector('.g-recaptcha, #g-recaptcha');
    });

    const hasHCaptcha = await page.evaluate(() => {
      return !!document.querySelector('.h-captcha, #h-captcha');
    });

    if (hasRecaptcha) {
      console.log('🔍 Detectado ReCAPTCHA na página');
      return this.solveRecaptchaV2(page);
    }

    if (hasHCaptcha) {
      console.log('🔍 Detectado hCaptcha na página');
      return this.solveHCaptcha(page);
    }

    return {
      success: false,
      error: 'Nenhum captcha detectado na página',
    };
  }

  /**
   * Extrai sitekey do ReCAPTCHA da página
   */
  private async extractSiteKey(page: Page): Promise<string | null> {
    return page.evaluate(() => {
      const el = document.querySelector('.g-recaptcha, [data-sitekey]');
      return el?.getAttribute('data-sitekey') || null;
    });
  }

  /**
   * Resolve captcha usando 2Captcha
   */
  private async solve2Captcha(params: any): Promise<string> {
    const baseUrl = 'https://2captcha.com';

    // Envia captcha
    const createResponse = await fetch(`${baseUrl}/in.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: this.apiKey,
        json: 1,
        ...params,
      }),
    });

    const createData = await createResponse.json();

    if (createData.status !== 1) {
      throw new Error(`2Captcha error: ${createData.request}`);
    }

    const captchaId = createData.request;

    // Aguarda solução (polling)
    for (let i = 0; i < 60; i++) {
      await this.delay(5000); // 5 segundos

      const resultResponse = await fetch(
        `${baseUrl}/res.php?key=${this.apiKey}&action=get&id=${captchaId}&json=1`
      );

      const resultData = await resultResponse.json();

      if (resultData.status === 1) {
        return resultData.request;
      }

      if (resultData.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2Captcha error: ${resultData.request}`);
      }
    }

    throw new Error('2Captcha timeout: Captcha não foi resolvido em 5 minutos');
  }

  /**
   * Resolve captcha usando Anti-Captcha
   */
  private async solveAntiCaptcha(taskType: string, taskParams: any): Promise<string> {
    const baseUrl = 'https://api.anti-captcha.com';

    // Cria tarefa
    const createResponse = await fetch(`${baseUrl}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: this.apiKey,
        task: {
          type: taskType,
          ...taskParams,
        },
      }),
    });

    const createData = await createResponse.json();

    if (createData.errorId !== 0) {
      throw new Error(`Anti-Captcha error: ${createData.errorDescription}`);
    }

    const taskId = createData.taskId;

    // Aguarda solução (polling)
    for (let i = 0; i < 60; i++) {
      await this.delay(5000); // 5 segundos

      const resultResponse = await fetch(`${baseUrl}/getTaskResult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: this.apiKey,
          taskId: taskId,
        }),
      });

      const resultData = await resultResponse.json();

      if (resultData.errorId !== 0) {
        throw new Error(`Anti-Captcha error: ${resultData.errorDescription}`);
      }

      if (resultData.status === 'ready') {
        return resultData.solution.gRecaptchaResponse;
      }
    }

    throw new Error('Anti-Captcha timeout: Captcha não foi resolvido em 5 minutos');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Instância singleton global
 */
export const captchaSolver = new CaptchaSolver();

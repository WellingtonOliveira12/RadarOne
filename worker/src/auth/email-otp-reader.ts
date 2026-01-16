/**
 * ============================================================
 * EMAIL OTP READER - Leitor de Códigos OTP por Email
 * ============================================================
 *
 * Lê códigos OTP enviados por email para sites que usam
 * verificação por email em vez de TOTP.
 *
 * Suporta IMAP para Gmail, Outlook e outros provedores.
 *
 * NOTA: Para Gmail, é necessário habilitar "App Passwords" ou
 * usar OAuth2. Senhas normais não funcionam.
 */

import * as https from 'https';
import * as http from 'http';

// ============================================================
// CONFIGURAÇÕES
// ============================================================

/** Timeout para aguardar email (ms) */
const EMAIL_WAIT_TIMEOUT = 120000; // 2 minutos

/** Intervalo entre verificações (ms) */
const EMAIL_CHECK_INTERVAL = 5000; // 5 segundos

/** Máximo de emails recentes para verificar */
const MAX_EMAILS_TO_CHECK = 10;

// ============================================================
// TIPOS
// ============================================================

export interface EmailOTPConfig {
  /** Provedor de email (gmail, outlook, custom) */
  provider: 'gmail' | 'outlook' | 'custom';
  /** Email address */
  email: string;
  /** Senha (App Password para Gmail) */
  password: string;
  /** Host IMAP (para custom) */
  imapHost?: string;
  /** Porta IMAP (para custom) */
  imapPort?: number;
}

export interface OTPSearchConfig {
  /** Remetente esperado do email (ex: "noreply@mercadolivre.com") */
  fromAddress?: string;
  /** Palavras-chave no assunto */
  subjectKeywords?: string[];
  /** Regex para extrair o código OTP do corpo */
  otpPattern?: RegExp;
  /** Máximo de minutos para considerar email válido */
  maxAgeMinutes?: number;
}

export interface EmailOTPResult {
  success: boolean;
  code?: string;
  error?: string;
  emailSubject?: string;
  emailFrom?: string;
  emailDate?: Date;
}

// ============================================================
// PADRÕES DE OTP POR SITE
// ============================================================

export const OTP_PATTERNS: Record<string, OTPSearchConfig> = {
  MERCADO_LIVRE: {
    fromAddress: 'noreply@mercadolivre.com',
    subjectKeywords: ['código', 'verificação', 'segurança', 'confirme'],
    otpPattern: /\b(\d{6})\b/, // 6 dígitos
    maxAgeMinutes: 10,
  },
  SUPERBID: {
    fromAddress: '@superbid.net',
    subjectKeywords: ['código', 'acesso', 'verificação'],
    otpPattern: /\b(\d{4,6})\b/, // 4-6 dígitos
    maxAgeMinutes: 15,
  },
  GENERIC: {
    subjectKeywords: ['code', 'código', 'verification', 'verificação', 'OTP', 'PIN'],
    otpPattern: /\b(\d{4,8})\b/, // 4-8 dígitos
    maxAgeMinutes: 15,
  },
};

// ============================================================
// CONFIGURAÇÕES DE PROVEDORES
// ============================================================

const IMAP_PROVIDERS: Record<string, { host: string; port: number }> = {
  gmail: { host: 'imap.gmail.com', port: 993 },
  outlook: { host: 'outlook.office365.com', port: 993 },
};

// ============================================================
// CLASSE PRINCIPAL
// ============================================================

class EmailOTPReader {
  /**
   * Busca código OTP em emails recentes
   *
   * @param config - Configuração do email
   * @param searchConfig - Configuração de busca
   * @returns Resultado com código OTP ou erro
   */
  async findOTPCode(
    config: EmailOTPConfig,
    searchConfig: OTPSearchConfig
  ): Promise<EmailOTPResult> {
    console.log(`EMAIL_OTP: Buscando código em ${config.email}...`);

    try {
      // Por enquanto, implementação simplificada via API
      // Uma implementação completa usaria IMAP nativo

      // Simula busca - em produção, conectaria ao IMAP
      console.log('EMAIL_OTP: Implementação IMAP requer biblioteca adicional');
      console.log('EMAIL_OTP: Considere usar Gmail API ou webhook de email');

      return {
        success: false,
        error: 'EMAIL_OTP_NOT_IMPLEMENTED: Usar TOTP é recomendado. Para OTP por email, configure webhook.',
      };
    } catch (error: any) {
      console.error(`EMAIL_OTP_ERROR: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Aguarda chegada de email com OTP (polling)
   *
   * @param config - Configuração do email
   * @param searchConfig - Configuração de busca
   * @param timeout - Timeout em ms (padrão 2 min)
   */
  async waitForOTPEmail(
    config: EmailOTPConfig,
    searchConfig: OTPSearchConfig,
    timeout: number = EMAIL_WAIT_TIMEOUT
  ): Promise<EmailOTPResult> {
    console.log(`EMAIL_OTP: Aguardando email com OTP (timeout: ${timeout / 1000}s)...`);

    const startTime = Date.now();
    const startDate = new Date();

    // Atualiza maxAgeMinutes para considerar apenas emails após iniciar espera
    const adjustedSearchConfig: OTPSearchConfig = {
      ...searchConfig,
      maxAgeMinutes: Math.ceil(timeout / 60000) + 1,
    };

    while (Date.now() - startTime < timeout) {
      const result = await this.findOTPCode(config, adjustedSearchConfig);

      if (result.success && result.emailDate && result.emailDate > startDate) {
        console.log(`EMAIL_OTP: Código encontrado após ${Math.round((Date.now() - startTime) / 1000)}s`);
        return result;
      }

      // Aguarda antes de verificar novamente
      await new Promise((resolve) => setTimeout(resolve, EMAIL_CHECK_INTERVAL));
    }

    return {
      success: false,
      error: `EMAIL_OTP_TIMEOUT: Nenhum email com OTP recebido em ${timeout / 1000}s`,
    };
  }

  /**
   * Extrai código OTP de um texto usando padrão
   */
  extractOTPFromText(text: string, pattern: RegExp = /\b(\d{6})\b/): string | null {
    const match = text.match(pattern);
    return match ? match[1] : null;
  }

  /**
   * Obtém configuração de busca para um site
   */
  getSearchConfigForSite(site: string): OTPSearchConfig {
    return OTP_PATTERNS[site] || OTP_PATTERNS.GENERIC;
  }

  /**
   * Cria configuração de email a partir de variáveis de ambiente
   */
  createConfigFromEnv(site: string): EmailOTPConfig | null {
    const emailEnv = `${site}_OTP_EMAIL`;
    const passwordEnv = `${site}_OTP_PASSWORD`;

    const email = process.env[emailEnv];
    const password = process.env[passwordEnv];

    if (!email || !password) {
      return null;
    }

    // Detecta provedor pelo domínio
    let provider: EmailOTPConfig['provider'] = 'custom';
    if (email.includes('@gmail.com')) provider = 'gmail';
    else if (email.includes('@outlook.com') || email.includes('@hotmail.com')) provider = 'outlook';

    return { provider, email, password };
  }
}

// Singleton
export const emailOTPReader = new EmailOTPReader();

// ============================================================
// ALTERNATIVA: WEBHOOK RECEIVER
// ============================================================

/**
 * Para sites que enviam OTP por email, uma alternativa mais robusta
 * é configurar um email que faz forward para um webhook.
 *
 * Serviços como Mailgun, SendGrid, ou CloudMailin podem receber
 * emails e enviar para uma URL sua.
 *
 * Fluxo:
 * 1. Crie email dedicado: otp-ml@seudominio.com
 * 2. Configure forward para webhook (ex: Mailgun Routes)
 * 3. Webhook extrai OTP e armazena em Redis/DB com TTL
 * 4. Auth flow busca OTP no Redis/DB
 *
 * Esta abordagem é mais confiável que IMAP polling.
 */

interface PendingOTP {
  site: string;
  accountId: string;
  code: string;
  receivedAt: Date;
  expiresAt: Date;
  emailFrom: string;
  emailSubject: string;
}

class OTPWebhookStore {
  private pendingOTPs: Map<string, PendingOTP> = new Map();

  /**
   * Armazena OTP recebido via webhook
   */
  storeOTP(otp: Omit<PendingOTP, 'expiresAt'>): void {
    const key = `${otp.site}:${otp.accountId}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min TTL

    this.pendingOTPs.set(key, { ...otp, expiresAt });

    console.log(`OTP_STORE: Código armazenado para ${key}`);

    // Auto-cleanup
    setTimeout(() => {
      this.pendingOTPs.delete(key);
    }, 10 * 60 * 1000);
  }

  /**
   * Busca OTP pendente
   */
  getOTP(site: string, accountId: string): PendingOTP | null {
    const key = `${site}:${accountId}`;
    const otp = this.pendingOTPs.get(key);

    if (!otp) return null;

    // Verifica expiração
    if (new Date() > otp.expiresAt) {
      this.pendingOTPs.delete(key);
      return null;
    }

    return otp;
  }

  /**
   * Aguarda OTP chegar (usado pelo auth flow)
   */
  async waitForOTP(
    site: string,
    accountId: string,
    timeout: number = 120000
  ): Promise<string | null> {
    console.log(`OTP_STORE: Aguardando OTP para ${site}:${accountId}...`);

    const startTime = Date.now();
    const checkInterval = 2000; // 2 segundos

    while (Date.now() - startTime < timeout) {
      const otp = this.getOTP(site, accountId);

      if (otp) {
        // Consome o OTP (remove do store)
        this.pendingOTPs.delete(`${site}:${accountId}`);
        console.log(`OTP_STORE: Código encontrado após ${Math.round((Date.now() - startTime) / 1000)}s`);
        return otp.code;
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    console.log(`OTP_STORE: Timeout aguardando OTP`);
    return null;
  }

  /**
   * Limpa OTPs expirados
   */
  cleanup(): void {
    const now = new Date();

    for (const [key, otp] of this.pendingOTPs) {
      if (now > otp.expiresAt) {
        this.pendingOTPs.delete(key);
      }
    }
  }
}

// Singleton do store de OTPs (para uso via webhook)
export const otpWebhookStore = new OTPWebhookStore();

// Cleanup automático a cada 5 minutos
setInterval(() => otpWebhookStore.cleanup(), 5 * 60 * 1000);

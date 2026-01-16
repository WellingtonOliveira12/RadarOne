/**
 * ============================================================
 * TOTP MANAGER - Gerador de Códigos TOTP
 * ============================================================
 *
 * Gera códigos TOTP (Time-based One-Time Password) para
 * autenticação de dois fatores em sites que suportam.
 *
 * Usa o padrão RFC 6238 (mesmo do Google Authenticator).
 */

import * as crypto from 'crypto';

// ============================================================
// CONFIGURAÇÕES TOTP
// ============================================================

/** Período de validade do código em segundos (padrão 30s) */
const TOTP_PERIOD = 30;

/** Quantidade de dígitos do código (padrão 6) */
const TOTP_DIGITS = 6;

/** Algoritmo de hash (padrão SHA1) */
const TOTP_ALGORITHM = 'sha1';

// ============================================================
// CLASSE PRINCIPAL
// ============================================================

class TOTPManager {
  /**
   * Gera código TOTP a partir de um segredo base32
   *
   * @param secret - Segredo em formato base32 (ex: "JBSWY3DPEHPK3PXP")
   * @returns Código TOTP de 6 dígitos
   */
  generateCode(secret: string): string {
    // Remove espaços e converte para maiúsculas
    const cleanSecret = secret.replace(/\s/g, '').toUpperCase();

    // Decodifica base32
    const key = this.base32Decode(cleanSecret);

    // Calcula o contador baseado no tempo atual
    const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);

    // Gera o código HOTP
    const code = this.generateHOTP(key, counter);

    // Padding com zeros à esquerda
    return code.toString().padStart(TOTP_DIGITS, '0');
  }

  /**
   * Valida se um código TOTP está correto
   * Verifica também códigos do período anterior e próximo (window de tolerância)
   *
   * @param secret - Segredo em formato base32
   * @param code - Código a ser validado
   * @param window - Janela de tolerância (padrão 1 = verifica -1, 0, +1)
   */
  validateCode(secret: string, code: string, window: number = 1): boolean {
    const cleanSecret = secret.replace(/\s/g, '').toUpperCase();
    const key = this.base32Decode(cleanSecret);
    const currentCounter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
    const normalizedCode = code.replace(/\s/g, '');

    // Verifica dentro da janela de tolerância
    for (let i = -window; i <= window; i++) {
      const counter = currentCounter + i;
      const expectedCode = this.generateHOTP(key, counter)
        .toString()
        .padStart(TOTP_DIGITS, '0');

      if (normalizedCode === expectedCode) {
        return true;
      }
    }

    return false;
  }

  /**
   * Retorna quantos segundos faltam para o código atual expirar
   */
  getSecondsRemaining(): number {
    const secondsElapsed = Math.floor(Date.now() / 1000) % TOTP_PERIOD;
    return TOTP_PERIOD - secondsElapsed;
  }

  /**
   * Gera código e retorna junto com tempo restante
   */
  generateCodeWithTTL(secret: string): { code: string; secondsRemaining: number } {
    return {
      code: this.generateCode(secret),
      secondsRemaining: this.getSecondsRemaining(),
    };
  }

  /**
   * Aguarda até que um novo código seja gerado (útil quando faltam poucos segundos)
   * @param minSeconds - Mínimo de segundos de validade que o código deve ter
   */
  async waitForFreshCode(minSeconds: number = 5): Promise<void> {
    const remaining = this.getSecondsRemaining();

    if (remaining < minSeconds) {
      const waitTime = (TOTP_PERIOD - remaining + 1) * 1000;
      console.log(`TOTP: Aguardando ${Math.ceil(waitTime / 1000)}s para novo código...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Gera um código TOTP garantindo que tenha pelo menos N segundos de validade
   * @param secret - Segredo base32
   * @param minSeconds - Mínimo de segundos de validade
   */
  async generateFreshCode(secret: string, minSeconds: number = 5): Promise<string> {
    await this.waitForFreshCode(minSeconds);
    return this.generateCode(secret);
  }

  // ============================================================
  // MÉTODOS PRIVADOS
  // ============================================================

  /**
   * Gera código HOTP (HMAC-based OTP)
   */
  private generateHOTP(key: Buffer, counter: number): number {
    // Converte contador para buffer de 8 bytes (big endian)
    const counterBuffer = Buffer.alloc(8);
    for (let i = 7; i >= 0; i--) {
      counterBuffer[i] = counter & 0xff;
      counter = Math.floor(counter / 256);
    }

    // Calcula HMAC-SHA1
    const hmac = crypto.createHmac(TOTP_ALGORITHM, key);
    hmac.update(counterBuffer);
    const hash = hmac.digest();

    // Dynamic truncation (RFC 4226)
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    // Retorna os últimos N dígitos
    return binary % Math.pow(10, TOTP_DIGITS);
  }

  /**
   * Decodifica string base32 para buffer
   */
  private base32Decode(encoded: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleanEncoded = encoded.replace(/=+$/, '');

    let bits = 0;
    let value = 0;
    const output: number[] = [];

    for (const char of cleanEncoded) {
      const index = alphabet.indexOf(char);
      if (index === -1) {
        throw new Error(`Caractere inválido no segredo TOTP: ${char}`);
      }

      value = (value << 5) | index;
      bits += 5;

      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }

    return Buffer.from(output);
  }

  /**
   * Gera um segredo TOTP aleatório (para testes)
   */
  generateSecret(length: number = 20): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, alphabet.length);
      secret += alphabet[randomIndex];
    }

    return secret;
  }

  /**
   * Gera URI para QR code (otpauth://)
   * Útil para adicionar ao Google Authenticator
   */
  generateOTPAuthURI(
    secret: string,
    accountName: string,
    issuer: string = 'RadarOne'
  ): string {
    const cleanSecret = secret.replace(/\s/g, '').toUpperCase();
    const encodedAccount = encodeURIComponent(accountName);
    const encodedIssuer = encodeURIComponent(issuer);

    return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${cleanSecret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  }
}

// Singleton
export const totpManager = new TOTPManager();

// ============================================================
// TESTES (executar com: npx ts-node src/auth/totp-manager.ts)
// ============================================================

if (require.main === module) {
  console.log('=== TESTE TOTP MANAGER ===\n');

  // Gera um segredo de teste
  const testSecret = totpManager.generateSecret();
  console.log(`Segredo gerado: ${testSecret}`);

  // Gera código
  const result = totpManager.generateCodeWithTTL(testSecret);
  console.log(`Código TOTP: ${result.code}`);
  console.log(`Expira em: ${result.secondsRemaining}s`);

  // Valida o código
  const isValid = totpManager.validateCode(testSecret, result.code);
  console.log(`Código válido: ${isValid}`);

  // Gera URI para QR
  const uri = totpManager.generateOTPAuthURI(testSecret, 'test@example.com');
  console.log(`\nOTPAuth URI:\n${uri}`);
}

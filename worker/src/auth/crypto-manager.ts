/**
 * ============================================================
 * CRYPTO MANAGER - Criptografia de Credenciais
 * ============================================================
 *
 * Gerencia criptografia/descriptografia de credenciais
 * sensíveis armazenadas no banco de dados.
 *
 * Usa AES-256-GCM para criptografia autenticada.
 */

import * as crypto from 'crypto';

// ============================================================
// CONFIGURAÇÕES
// ============================================================

/** Algoritmo de criptografia */
const ALGORITHM = 'aes-256-gcm';

/** Tamanho da chave em bytes */
const KEY_LENGTH = 32;

/** Tamanho do IV em bytes */
const IV_LENGTH = 16;

/** Tamanho do auth tag em bytes */
const AUTH_TAG_LENGTH = 16;

/** Chave de criptografia (deve estar no .env em produção) */
const ENCRYPTION_KEY = process.env.SCRAPER_ENCRYPTION_KEY ||
  process.env.SESSION_ENCRYPTION_KEY ||
  'CHANGE_ME_IN_PRODUCTION_32CHARS!';

// ============================================================
// CLASSE PRINCIPAL
// ============================================================

class CryptoManager {
  private key: Buffer;

  constructor() {
    // Deriva a chave usando scrypt para tamanho consistente
    this.key = crypto.scryptSync(ENCRYPTION_KEY, 'radarone-salt', KEY_LENGTH);
  }

  /**
   * Criptografa um texto
   * Retorna: iv:authTag:encryptedData (tudo em hex)
   */
  encrypt(plaintext: string): string {
    if (!plaintext) return '';

    // Gera IV aleatório
    const iv = crypto.randomBytes(IV_LENGTH);

    // Cria cipher
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    // Criptografa
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Obtém auth tag
    const authTag = cipher.getAuthTag();

    // Retorna iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Descriptografa um texto
   * Espera formato: iv:authTag:encryptedData (tudo em hex)
   */
  decrypt(ciphertext: string): string {
    if (!ciphertext) return '';

    try {
      // Separa componentes
      const parts = ciphertext.split(':');
      if (parts.length !== 3) {
        throw new Error('Formato de ciphertext inválido');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      // Cria decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      decipher.setAuthTag(authTag);

      // Descriptografa
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      console.error(`CRYPTO_DECRYPT_ERROR: ${error.message}`);
      throw new Error('Falha ao descriptografar: chave incorreta ou dados corrompidos');
    }
  }

  /**
   * Verifica se um texto está criptografado no formato esperado
   */
  isEncrypted(text: string): boolean {
    if (!text) return false;

    const parts = text.split(':');
    if (parts.length !== 3) return false;

    // Verifica se parecem ser hex
    const hexRegex = /^[0-9a-f]+$/i;
    return (
      hexRegex.test(parts[0]) &&
      hexRegex.test(parts[1]) &&
      hexRegex.test(parts[2]) &&
      parts[0].length === IV_LENGTH * 2 &&
      parts[1].length === AUTH_TAG_LENGTH * 2
    );
  }

  /**
   * Criptografa se ainda não estiver criptografado
   */
  ensureEncrypted(text: string): string {
    if (this.isEncrypted(text)) {
      return text;
    }
    return this.encrypt(text);
  }

  /**
   * Descriptografa se estiver criptografado
   */
  ensureDecrypted(text: string): string {
    if (!this.isEncrypted(text)) {
      return text;
    }
    return this.decrypt(text);
  }

  /**
   * Gera uma senha aleatória segura
   */
  generateSecurePassword(length: number = 32): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';

    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }

    return password;
  }

  /**
   * Gera hash seguro de uma string (para comparação)
   */
  hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Mascara uma string sensível para logging
   * Ex: "email@example.com" -> "em***@example.com"
   */
  mask(text: string, showStart: number = 2, showEnd: number = 4): string {
    if (!text || text.length <= showStart + showEnd) {
      return '***';
    }

    const start = text.substring(0, showStart);
    const end = text.substring(text.length - showEnd);
    return `${start}***${end}`;
  }

  /**
   * Mascara um email para logging
   * Ex: "teste@gmail.com" -> "te***@gmail.com"
   */
  maskEmail(email: string): string {
    if (!email || !email.includes('@')) {
      return this.mask(email);
    }

    const [local, domain] = email.split('@');
    const maskedLocal = local.length > 2
      ? local.substring(0, 2) + '***'
      : '***';

    return `${maskedLocal}@${domain}`;
  }
}

// Singleton
export const cryptoManager = new CryptoManager();

// ============================================================
// TESTES
// ============================================================

if (require.main === module) {
  console.log('=== TESTE CRYPTO MANAGER ===\n');

  const testPassword = 'MySuperSecretPassword123!';
  console.log(`Original: ${testPassword}`);

  const encrypted = cryptoManager.encrypt(testPassword);
  console.log(`Encrypted: ${encrypted}`);

  const decrypted = cryptoManager.decrypt(encrypted);
  console.log(`Decrypted: ${decrypted}`);

  console.log(`Match: ${testPassword === decrypted}`);
  console.log(`Is encrypted: ${cryptoManager.isEncrypted(encrypted)}`);

  console.log(`\nMasked password: ${cryptoManager.mask(testPassword)}`);
  console.log(`Masked email: ${cryptoManager.maskEmail('teste@gmail.com')}`);

  console.log(`\nGenerated password: ${cryptoManager.generateSecurePassword(16)}`);
}

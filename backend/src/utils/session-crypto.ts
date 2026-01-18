/**
 * ============================================================
 * SESSION CRYPTO - Criptografia de Sessões de Autenticação
 * ============================================================
 *
 * Gerencia criptografia/descriptografia de storageState do Playwright
 * para sessões de autenticação de sites (Mercado Livre, etc).
 *
 * Usa AES-256-GCM para criptografia autenticada.
 * Compatível com o worker/src/auth/crypto-manager.ts
 */

import crypto from 'crypto';

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Obtém a chave de criptografia de sessões do ambiente
 * Prioridade: SESSION_ENCRYPTION_KEY > SCRAPER_ENCRYPTION_KEY
 */
function getSessionEncryptionKey(): Buffer {
  const keyString = process.env.SESSION_ENCRYPTION_KEY ||
    process.env.SCRAPER_ENCRYPTION_KEY;

  if (!keyString) {
    const errorMessage = [
      '❌ SESSION_ENCRYPTION_KEY não configurada no ambiente.',
      '',
      '📝 Para configurar:',
      '   1. Gere uma chave: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      '   2. Adicione SESSION_ENCRYPTION_KEY no backend E no worker (mesmo valor)',
      '',
      '⚠️  A chave deve ser a MESMA no backend e worker para funcionar.',
    ].join('\n');

    throw new Error(errorMessage);
  }

  // Deriva a chave usando scrypt para compatibilidade com o worker
  return crypto.scryptSync(keyString, 'radarone-salt', KEY_LENGTH);
}

// ============================================================
// FUNÇÕES DE CRIPTOGRAFIA
// ============================================================

/**
 * Criptografa um storageState (JSON string)
 * @param storageStateJson String JSON do storageState do Playwright
 * @returns String criptografada no formato iv:authTag:encrypted (hex)
 */
export function encryptStorageState(storageStateJson: string): string {
  if (!storageStateJson) {
    throw new Error('storageState não pode ser vazio');
  }

  // Valida que é JSON válido
  try {
    const parsed = JSON.parse(storageStateJson);
    if (!Array.isArray(parsed.cookies)) {
      throw new Error('storageState deve ter array de cookies');
    }
  } catch (e: any) {
    throw new Error(`storageState inválido: ${e.message}`);
  }

  // Gera IV aleatório
  const iv = crypto.randomBytes(IV_LENGTH);

  // Cria cipher
  const cipher = crypto.createCipheriv(ALGORITHM, getSessionEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  // Criptografa
  let encrypted = cipher.update(storageStateJson, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Obtém auth tag
  const authTag = cipher.getAuthTag();

  // Retorna iv:authTag:encrypted (formato compatível com worker)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Descriptografa um storageState
 * @param encryptedStorageState String criptografada no formato iv:authTag:encrypted
 * @returns String JSON do storageState
 */
export function decryptStorageState(encryptedStorageState: string): string {
  if (!encryptedStorageState) {
    throw new Error('encryptedStorageState não pode ser vazio');
  }

  const parts = encryptedStorageState.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de storageState criptografado inválido (esperado iv:authTag:encrypted)');
  }

  const [ivHex, authTagHex, encryptedData] = parts;

  // Converte de hex para Buffer
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  // Cria decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, getSessionEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  // Descriptografa
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Verifica se uma string está criptografada no formato esperado
 */
export function isEncryptedStorageState(text: string): boolean {
  if (!text) return false;

  const parts = text.split(':');
  if (parts.length !== 3) return false;

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
 * Valida se um JSON é um storageState válido do Playwright
 */
export function isValidStorageState(jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString);
    return (
      typeof parsed === 'object' &&
      Array.isArray(parsed.cookies) &&
      Array.isArray(parsed.origins)
    );
  } catch {
    return false;
  }
}

/**
 * Extrai metadados de um storageState para armazenar junto
 */
export function extractStorageStateMeta(storageStateJson: string): {
  cookiesCount: number;
  originsCount: number;
  domains: string[];
  sizeBytes: number;
  createdAt: string;
} {
  const parsed = JSON.parse(storageStateJson);

  // Extrai domínios únicos dos cookies
  const domains: string[] = [...new Set(
    (parsed.cookies as Array<{ domain: string }>).map((c) => c.domain)
  )];

  return {
    cookiesCount: parsed.cookies?.length || 0,
    originsCount: parsed.origins?.length || 0,
    domains,
    sizeBytes: Buffer.byteLength(storageStateJson, 'utf8'),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Mascara domínios para logging seguro
 */
export function maskDomain(domain: string): string {
  if (!domain) return '***';
  const parts = domain.split('.');
  if (parts.length <= 2) {
    return `***.${parts[parts.length - 1]}`;
  }
  return `***.${parts.slice(-2).join('.')}`;
}

// ============================================================
// EXPORTS ADICIONAIS
// ============================================================

export const sessionCrypto = {
  encrypt: encryptStorageState,
  decrypt: decryptStorageState,
  isEncrypted: isEncryptedStorageState,
  isValid: isValidStorageState,
  extractMeta: extractStorageStateMeta,
  maskDomain,
};

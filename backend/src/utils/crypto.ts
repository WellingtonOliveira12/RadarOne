import crypto from 'crypto';

/**
 * Utilitário de Criptografia para LGPD
 * Criptografa CPF usando AES-256-GCM
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

/**
 * Obtém a chave de criptografia do ambiente
 */
function getEncryptionKey(): Buffer {
  const key = process.env.CPF_ENCRYPTION_KEY;

  if (!key) {
    throw new Error('CPF_ENCRYPTION_KEY não configurada no ambiente');
  }

  if (key.length !== 64) { // 32 bytes em hex = 64 caracteres
    throw new Error('CPF_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes)');
  }

  return Buffer.from(key, 'hex');
}

/**
 * Criptografa um CPF
 * @param plainCpf CPF em texto puro (apenas números, 11 dígitos)
 * @returns { encrypted: string, last4: string }
 */
export function encryptCpf(plainCpf: string): { encrypted: string; last4: string } {
  // Remove caracteres não numéricos
  const cleanCpf = plainCpf.replace(/\D/g, '');

  if (cleanCpf.length !== 11) {
    throw new Error('CPF deve ter 11 dígitos');
  }

  // Extrai últimos 4 dígitos
  const last4 = cleanCpf.slice(-4);

  // Gera IV aleatório
  const iv = crypto.randomBytes(IV_LENGTH);

  // Cria cipher
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  // Criptografa
  let encrypted = cipher.update(cleanCpf, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Obtém auth tag
  const authTag = cipher.getAuthTag();

  // Formato: iv:authTag:encrypted (todos em hex)
  const result = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;

  return {
    encrypted: result,
    last4
  };
}

/**
 * Descriptografa um CPF
 * @param encrypted String criptografada no formato iv:authTag:encrypted
 * @returns CPF em texto puro
 */
export function decryptCpf(encrypted: string): string {
  const parts = encrypted.split(':');

  if (parts.length !== 3) {
    throw new Error('Formato de CPF criptografado inválido');
  }

  const [ivHex, authTagHex, encryptedData] = parts;

  // Converte de hex para Buffer
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  // Cria decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  // Descriptografa
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Formata CPF para exibição (###.###.###-##)
 */
export function formatCpf(cpf: string): string {
  const clean = cpf.replace(/\D/g, '');
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Valida CPF (algoritmo oficial)
 */
export function validateCpf(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '');

  if (clean.length !== 11) return false;

  // CPFs inválidos conhecidos
  const invalidCpfs = [
    '00000000000',
    '11111111111',
    '22222222222',
    '33333333333',
    '44444444444',
    '55555555555',
    '66666666666',
    '77777777777',
    '88888888888',
    '99999999999'
  ];

  if (invalidCpfs.includes(clean)) return false;

  // Validação dos dígitos verificadores
  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(clean.substring(i - 1, i)) * (11 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(clean.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(clean.substring(i - 1, i)) * (12 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(clean.substring(10, 11))) return false;

  return true;
}

/**
 * Gera uma chave de criptografia aleatória (para usar no .env)
 * Execute: ts-node -e "import('./crypto').then(m => console.log(m.generateEncryptionKey()))"
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

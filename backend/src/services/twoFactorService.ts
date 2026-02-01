/**
 * FASE 4.4 - Serviço de Autenticação de Dois Fatores (2FA/MFA)
 * Gerencia TOTP (Time-based One-Time Password) para admins
 */

import crypto from 'crypto';
import * as OTPAuth from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';

// Configuração TOTP
OTPAuth.authenticator.options = {
  window: 1, // Aceita códigos de 30s antes e depois (total: 90s)
  step: 30, // Códigos válidos por 30 segundos
};

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Obtém chave de criptografia do ambiente
 */
function getEncryptionKey(): Buffer {
  const key = process.env.CPF_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('CPF_ENCRYPTION_KEY não configurada corretamente');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Criptografa o secret TOTP antes de salvar no banco
 */
function encryptSecret(plainSecret: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Descriptografa o secret TOTP ao buscar do banco
 */
function decryptSecret(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de secret criptografado inválido');
  }

  const [ivHex, authTagHex, encryptedData] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Gera códigos de backup (10 códigos de 8 caracteres alfanuméricos)
 */
function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * Hash de código de backup (bcrypt)
 */
async function hashBackupCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

/**
 * Verifica código de backup
 */
async function verifyBackupCode(code: string, hashedCode: string): Promise<boolean> {
  return bcrypt.compare(code, hashedCode);
}

// ============================================
// EXPORTS - Funções Públicas
// ============================================

export interface TwoFactorSetupResponse {
  secret: string; // Secret em texto plano (para exibir ao usuário UMA VEZ)
  qrCodeDataUrl: string; // Data URL da imagem QR Code
  backupCodes: string[]; // Códigos de backup em texto plano (para exibir ao usuário UMA VEZ)
}

/**
 * Inicia setup de 2FA para um usuário
 * Gera secret, QR code e códigos de backup, mas NÃO salva no banco ainda
 */
export async function setupTwoFactor(
  userId: string,
  userEmail: string
): Promise<TwoFactorSetupResponse> {
  // Gerar secret
  const secret = OTPAuth.authenticator.generateSecret();

  // Gerar URL otpauth para QR Code
  const otpauthUrl = OTPAuth.authenticator.keyuri(
    userEmail,
    'RadarOne Admin',
    secret
  );

  // Gerar QR Code como Data URL
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  // Gerar códigos de backup
  const backupCodes = generateBackupCodes();

  return {
    secret,
    qrCodeDataUrl,
    backupCodes,
  };
}

/**
 * Verifica código TOTP fornecido pelo usuário
 */
export function verifyTOTP(secret: string, token: string): boolean {
  try {
    return OTPAuth.authenticator.verify({
      token,
      secret,
    });
  } catch (error) {
    return false;
  }
}

/**
 * Ativa 2FA após usuário verificar código inicial
 * Salva secret criptografado e códigos de backup hasheados no banco
 */
export async function enableTwoFactor(
  userId: string,
  secret: string,
  backupCodes: string[]
): Promise<void> {
  // Criptografar secret
  const encryptedSecret = encryptSecret(secret);

  // Hashear códigos de backup
  const hashedBackupCodes = await Promise.all(
    backupCodes.map((code) => hashBackupCode(code))
  );

  // Salvar no banco
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: encryptedSecret,
      twoFactorEnabled: true,
      twoFactorBackupCodes: hashedBackupCodes,
    },
  });
}

/**
 * Desativa 2FA para um usuário
 */
export async function disableTwoFactor(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: null,
      twoFactorEnabled: false,
      twoFactorBackupCodes: [],
    },
  });
}

/**
 * Verifica código 2FA durante login ou ação crítica
 * Suporta tanto código TOTP quanto código de backup
 */
export async function verifyTwoFactorCode(
  userId: string,
  code: string
): Promise<{ valid: boolean; isBackupCode: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorSecret: true,
      twoFactorEnabled: true,
      twoFactorBackupCodes: true,
    },
  });

  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return { valid: false, isBackupCode: false };
  }

  // Descriptografar secret
  const secret = decryptSecret(user.twoFactorSecret);

  // ── Diagnóstico TOTP ──
  // Gerar código esperado pelo servidor para comparar com o recebido
  try {
    const serverCode = OTPAuth.authenticator.generate(secret);
    const secretPrefix = secret.substring(0, 4);
    const secretSuffix = secret.substring(secret.length - 4);
    console.log(`[2FA-DIAG] userId=${userId} serverCode=${serverCode} receivedCode=${code} match=${serverCode === code} secretLen=${secret.length} secretHint=${secretPrefix}...${secretSuffix} serverTime=${new Date().toISOString()}`);
  } catch (diagErr) {
    console.error('[2FA-DIAG] failed to generate server TOTP:', diagErr);
  }

  // Tentar verificar como código TOTP
  const isTOTPValid = verifyTOTP(secret, code);
  if (isTOTPValid) {
    return { valid: true, isBackupCode: false };
  }

  // Tentar verificar como código de backup
  for (const hashedCode of user.twoFactorBackupCodes) {
    const isBackupValid = await verifyBackupCode(code, hashedCode);
    if (isBackupValid) {
      // Remover código de backup usado
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorBackupCodes: user.twoFactorBackupCodes.filter(
            (c) => c !== hashedCode
          ),
        },
      });

      return { valid: true, isBackupCode: true };
    }
  }

  return { valid: false, isBackupCode: false };
}

/**
 * Gera novos códigos de backup (sobrescreve os antigos)
 */
export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const newBackupCodes = generateBackupCodes();
  const hashedBackupCodes = await Promise.all(
    newBackupCodes.map((code) => hashBackupCode(code))
  );

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorBackupCodes: hashedBackupCodes,
    },
  });

  return newBackupCodes;
}

/**
 * Verifica se usuário tem 2FA habilitado
 */
export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });

  return user?.twoFactorEnabled ?? false;
}

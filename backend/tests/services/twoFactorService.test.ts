import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for twoFactorService — TOTP-based 2FA management
 *
 * Cases tested:
 * - setupTwoFactor: generates secret, QR code, backup codes
 * - verifyTOTP: valid token, invalid token, exception handling
 * - enableTwoFactor: encrypts secret, hashes backup codes, saves to DB
 * - disableTwoFactor: clears 2FA fields in DB
 * - verifyTwoFactorCode: user not found, 2FA not enabled, valid TOTP, valid backup code, removes used backup code, all fail
 * - regenerateBackupCodes: generates new codes, hashes and saves, returns plaintext
 * - isTwoFactorEnabled: returns true/false based on user record
 */

// Hoist all mocks so they run before module-level side effects
const {
  mockPrisma,
  mockAuthenticatorGenerateSecret,
  mockAuthenticatorKeyuri,
  mockAuthenticatorVerify,
  mockQRCodeToDataURL,
  mockBcryptHash,
  mockBcryptCompare,
  mockCryptoRandomBytes,
} = vi.hoisted(() => {
  // Set required env vars before module evaluation
  process.env.CPF_ENCRYPTION_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes key

  const mockGenerateSecret = vi.fn(() => 'JBSWY3DPEHPK3PXP');
  const mockKeyuri = vi.fn(() => 'otpauth://totp/RadarOne%20Admin:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=RadarOne%20Admin');
  const mockVerify = vi.fn(() => true);

  return {
    mockPrisma: {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    } as any,
    mockAuthenticatorGenerateSecret: mockGenerateSecret,
    mockAuthenticatorKeyuri: mockKeyuri,
    mockAuthenticatorVerify: mockVerify,
    mockQRCodeToDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,abc123')),
    mockBcryptHash: vi.fn(async (val: string) => `hashed:${val}`),
    mockBcryptCompare: vi.fn(async () => false),
    mockCryptoRandomBytes: vi.fn((size: number) => Buffer.alloc(size, 0xab)),
  };
});

vi.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('otplib', () => ({
  authenticator: {
    options: {},
    generateSecret: mockAuthenticatorGenerateSecret,
    keyuri: mockAuthenticatorKeyuri,
    verify: mockAuthenticatorVerify,
  },
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: mockQRCodeToDataURL,
  },
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: mockBcryptHash,
    compare: mockBcryptCompare,
  },
}));

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    default: {
      ...actual,
      randomBytes: mockCryptoRandomBytes,
      createCipheriv: actual.createCipheriv,
      createDecipheriv: actual.createDecipheriv,
    },
  };
});

import {
  setupTwoFactor,
  verifyTOTP,
  enableTwoFactor,
  disableTwoFactor,
  verifyTwoFactorCode,
  regenerateBackupCodes,
  isTwoFactorEnabled,
} from '../../src/services/twoFactorService';

// ============================================================
// setupTwoFactor
// ============================================================

describe('setupTwoFactor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQRCodeToDataURL.mockResolvedValue('data:image/png;base64,abc123');
    mockAuthenticatorGenerateSecret.mockReturnValue('JBSWY3DPEHPK3PXP');
    mockAuthenticatorKeyuri.mockReturnValue('otpauth://totp/test');
  });

  it('returns secret, qrCodeDataUrl, and backupCodes', async () => {
    const result = await setupTwoFactor('user-1', 'user@example.com');

    expect(result).toHaveProperty('secret');
    expect(result).toHaveProperty('qrCodeDataUrl');
    expect(result).toHaveProperty('backupCodes');
    expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(result.qrCodeDataUrl).toBe('data:image/png;base64,abc123');
    expect(Array.isArray(result.backupCodes)).toBe(true);
    expect(result.backupCodes).toHaveLength(10);
  });

  it('calls authenticator.generateSecret once', async () => {
    await setupTwoFactor('user-1', 'user@example.com');
    expect(mockAuthenticatorGenerateSecret).toHaveBeenCalledOnce();
  });

  it('calls authenticator.keyuri with correct app name', async () => {
    await setupTwoFactor('user-1', 'user@example.com');
    expect(mockAuthenticatorKeyuri).toHaveBeenCalledWith(
      'user@example.com',
      'RadarOne Admin',
      'JBSWY3DPEHPK3PXP'
    );
  });

  it('calls QRCode.toDataURL with the otpauth URL', async () => {
    await setupTwoFactor('user-1', 'user@example.com');
    expect(mockQRCodeToDataURL).toHaveBeenCalledWith('otpauth://totp/test');
  });

  it('backup codes are uppercase hex strings of 8 characters', async () => {
    const result = await setupTwoFactor('user-1', 'user@example.com');
    for (const code of result.backupCodes) {
      expect(code).toMatch(/^[0-9A-F]{8}$/);
    }
  });

  it('does NOT save anything to DB (setup is preview only)', async () => {
    await setupTwoFactor('user-1', 'user@example.com');
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});

// ============================================================
// verifyTOTP
// ============================================================

describe('verifyTOTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when authenticator.verify succeeds', () => {
    mockAuthenticatorVerify.mockReturnValue(true);

    const result = verifyTOTP('JBSWY3DPEHPK3PXP', '123456');
    expect(result).toBe(true);
    expect(mockAuthenticatorVerify).toHaveBeenCalledWith({
      token: '123456',
      secret: 'JBSWY3DPEHPK3PXP',
    });
  });

  it('returns false when authenticator.verify fails', () => {
    mockAuthenticatorVerify.mockReturnValue(false);

    const result = verifyTOTP('JBSWY3DPEHPK3PXP', 'wrong-code');
    expect(result).toBe(false);
  });

  it('returns false when authenticator.verify throws', () => {
    mockAuthenticatorVerify.mockImplementation(() => { throw new Error('invalid token'); });

    const result = verifyTOTP('JBSWY3DPEHPK3PXP', 'bad');
    expect(result).toBe(false);
  });
});

// ============================================================
// enableTwoFactor
// ============================================================

describe('enableTwoFactor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
    mockBcryptHash.mockImplementation(async (val: string) => `hashed:${val}`);
  });

  it('hashes all backup codes and saves encrypted secret to DB', async () => {
    const backupCodes = ['CODE0001', 'CODE0002', 'CODE0003'];

    await enableTwoFactor('user-1', 'JBSWY3DPEHPK3PXP', backupCodes);

    expect(mockBcryptHash).toHaveBeenCalledTimes(3);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          twoFactorEnabled: true,
          twoFactorSecret: expect.any(String),
          twoFactorBackupCodes: expect.arrayContaining([
            'hashed:CODE0001',
            'hashed:CODE0002',
            'hashed:CODE0003',
          ]),
        }),
      })
    );
  });

  it('stores encrypted secret (not plaintext) in DB', async () => {
    await enableTwoFactor('user-1', 'JBSWY3DPEHPK3PXP', ['BACKUP01']);

    const call = mockPrisma.user.update.mock.calls[0][0];
    // The secret should NOT be stored as-is
    expect(call.data.twoFactorSecret).not.toBe('JBSWY3DPEHPK3PXP');
    // Should be in iv:authTag:encrypted format
    expect(call.data.twoFactorSecret).toContain(':');
  });

  it('sets twoFactorEnabled to true', async () => {
    await enableTwoFactor('user-1', 'JBSWY3DPEHPK3PXP', []);

    const call = mockPrisma.user.update.mock.calls[0][0];
    expect(call.data.twoFactorEnabled).toBe(true);
  });
});

// ============================================================
// disableTwoFactor
// ============================================================

describe('disableTwoFactor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
  });

  it('clears twoFactorSecret, sets twoFactorEnabled=false, empties backup codes', async () => {
    await disableTwoFactor('user-1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodes: [],
      },
    });
  });

  it('propagates DB errors', async () => {
    mockPrisma.user.update.mockRejectedValue(new Error('DB error'));

    await expect(disableTwoFactor('user-1')).rejects.toThrow('DB error');
  });
});

// ============================================================
// verifyTwoFactorCode
// ============================================================

describe('verifyTwoFactorCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatorVerify.mockReturnValue(false);
    mockBcryptCompare.mockResolvedValue(false);
    mockPrisma.user.update.mockResolvedValue({});
  });

  it('returns {valid:false, isBackupCode:false} when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await verifyTwoFactorCode('user-1', '123456');

    expect(result).toEqual({ valid: false, isBackupCode: false });
  });

  it('returns {valid:false, isBackupCode:false} when twoFactorEnabled is false', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: false,
      twoFactorSecret: 'encrypted-secret',
      twoFactorBackupCodes: [],
    });

    const result = await verifyTwoFactorCode('user-1', '123456');

    expect(result).toEqual({ valid: false, isBackupCode: false });
  });

  it('returns {valid:false, isBackupCode:false} when twoFactorSecret is null', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
    });

    const result = await verifyTwoFactorCode('user-1', '123456');

    expect(result).toEqual({ valid: false, isBackupCode: false });
  });

  it('returns {valid:true, isBackupCode:false} for valid TOTP code', async () => {
    // We need a real encrypted secret to test decryption.
    // Since crypto mock is partial, we'll use the actual crypto for this test.
    // We test indirectly: if verifyTOTP returns true, the result should be valid.
    // The twoFactorSecret must be a valid iv:authTag:encrypted string.
    // We skip testing the actual encryption and just mock verifyTOTP path.
    // To do this cleanly: set up a user with a validly-encrypted secret.

    // Use a minimal approach: user has encrypted secret, TOTP verify returns true
    // The decryptSecret call will happen with actual crypto — so we need a real encrypted value.
    // Since CPF_ENCRYPTION_KEY is set to 'a'*64 hex chars, encrypt a dummy secret.
    const crypto = await import('crypto');
    const key = Buffer.from('a'.repeat(64), 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update('JBSWY3DPEHPK3PXP', 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    const encryptedSecret = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;

    mockPrisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: encryptedSecret,
      twoFactorBackupCodes: [],
    });
    mockAuthenticatorVerify.mockReturnValue(true);

    const result = await verifyTwoFactorCode('user-1', '123456');

    expect(result).toEqual({ valid: true, isBackupCode: false });
  });

  it('returns {valid:true, isBackupCode:true} for valid backup code and removes it', async () => {
    const crypto = await import('crypto');
    const key = Buffer.from('a'.repeat(64), 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update('SECRET', 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    const encryptedSecret = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;

    const hashedCodes = ['hashed-backup-1', 'hashed-backup-2'];
    mockPrisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: encryptedSecret,
      twoFactorBackupCodes: hashedCodes,
    });
    mockAuthenticatorVerify.mockReturnValue(false); // TOTP fails
    // First backup code matches
    mockBcryptCompare.mockImplementation(async (code: string, hash: string) => hash === 'hashed-backup-1');

    const result = await verifyTwoFactorCode('user-1', 'BACKUP1');

    expect(result).toEqual({ valid: true, isBackupCode: true });
    // Should remove used backup code
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: {
          twoFactorBackupCodes: ['hashed-backup-2'],
        },
      })
    );
  });

  it('returns {valid:false, isBackupCode:false} when both TOTP and backup codes fail', async () => {
    const crypto = await import('crypto');
    const key = Buffer.from('a'.repeat(64), 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update('SECRET', 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    const encryptedSecret = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;

    mockPrisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: encryptedSecret,
      twoFactorBackupCodes: ['hashed-backup-1', 'hashed-backup-2'],
    });
    mockAuthenticatorVerify.mockReturnValue(false);
    mockBcryptCompare.mockResolvedValue(false);

    const result = await verifyTwoFactorCode('user-1', 'WRONGCODE');

    expect(result).toEqual({ valid: false, isBackupCode: false });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

// ============================================================
// regenerateBackupCodes
// ============================================================

describe('regenerateBackupCodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
    mockBcryptHash.mockImplementation(async (val: string) => `hashed:${val}`);
  });

  it('returns 10 plaintext backup codes', async () => {
    const result = await regenerateBackupCodes('user-1');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(10);
  });

  it('backup codes are uppercase hex strings of 8 chars', async () => {
    const result = await regenerateBackupCodes('user-1');

    for (const code of result) {
      expect(code).toMatch(/^[0-9A-F]{8}$/);
    }
  });

  it('saves hashed codes to DB', async () => {
    const result = await regenerateBackupCodes('user-1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          twoFactorBackupCodes: expect.arrayContaining([`hashed:${result[0]}`]),
        }),
      })
    );
  });

  it('hashes exactly 10 codes', async () => {
    await regenerateBackupCodes('user-1');
    expect(mockBcryptHash).toHaveBeenCalledTimes(10);
  });

  it('propagates DB errors', async () => {
    mockPrisma.user.update.mockRejectedValue(new Error('DB write error'));
    await expect(regenerateBackupCodes('user-1')).rejects.toThrow('DB write error');
  });
});

// ============================================================
// isTwoFactorEnabled
// ============================================================

describe('isTwoFactorEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when twoFactorEnabled is true in DB', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: true });

    const result = await isTwoFactorEnabled('user-1');

    expect(result).toBe(true);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { twoFactorEnabled: true },
    });
  });

  it('returns false when twoFactorEnabled is false in DB', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: false });

    const result = await isTwoFactorEnabled('user-1');

    expect(result).toBe(false);
  });

  it('returns false when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await isTwoFactorEnabled('user-1');

    expect(result).toBe(false);
  });
});

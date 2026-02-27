import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for crypto utility
 *
 * Cases tested:
 * - hashCpf: produces consistent SHA256 hash for same input
 * - hashCpf: strips non-numeric characters before hashing
 * - hashCpf: throws when CPF length != 11 digits after cleaning
 * - encryptCpf: returns { encrypted, last4, hash } shape
 * - encryptCpf: last4 is the last 4 digits of the CPF
 * - encryptCpf: encrypted string follows iv:authTag:data format
 * - encryptCpf: strips non-numeric characters from CPF
 * - encryptCpf: throws when CPF length != 11 digits
 * - encryptCpf: throws when CPF_ENCRYPTION_KEY is missing
 * - encryptCpf: throws when CPF_ENCRYPTION_KEY has wrong length
 * - decryptCpf: recovers original CPF from encrypted string
 * - decryptCpf: throws for invalid format (wrong number of parts)
 * - decryptCpf: throws when CPF_ENCRYPTION_KEY is missing during decryption
 * - formatCpf: formats 11-digit string to ###.###.###-## pattern
 * - formatCpf: strips non-numeric characters before formatting
 * - validateCpf: returns true for valid CPF
 * - validateCpf: returns false for all-same-digit CPFs
 * - validateCpf: returns false for wrong length CPF
 * - validateCpf: returns false for CPF with wrong check digits
 * - validateCpf: handles CPF with punctuation
 * - generateEncryptionKey: returns 64-character hex string
 */

// ============================================
// Tests
// ============================================

// The crypto module reads process.env.CPF_ENCRYPTION_KEY at call time (not module load time)
// so we can control it per-test.

const VALID_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes
const VALID_CPF = '11144477735'; // A well-known valid CPF (digits only)

describe('crypto utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, CPF_ENCRYPTION_KEY: VALID_KEY };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ============================================
  // Dynamic imports so env vars are read fresh
  // ============================================

  async function getCrypto() {
    // We need a fresh import each time since getEncryptionKey reads env at call time.
    // Using the same static import is fine since env is checked at function call, not module load.
    const mod = await import('../../src/utils/crypto');
    return mod;
  }

  // ============================================
  // hashCpf
  // ============================================

  describe('hashCpf', () => {
    it('should produce consistent SHA256 hash for same CPF', async () => {
      const { hashCpf } = await getCrypto();

      const hash1 = hashCpf(VALID_CPF);
      const hash2 = hashCpf(VALID_CPF);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex = 64 chars
    });

    it('should produce different hashes for different CPFs', async () => {
      const { hashCpf } = await getCrypto();

      const hash1 = hashCpf('11144477735');
      const hash2 = hashCpf('52998224725'); // another valid CPF

      expect(hash1).not.toBe(hash2);
    });

    it('should strip non-numeric characters before hashing', async () => {
      const { hashCpf } = await getCrypto();

      const hashRaw = hashCpf('11144477735');
      const hashFormatted = hashCpf('111.444.777-35');

      expect(hashRaw).toBe(hashFormatted);
    });

    it('should throw when CPF has fewer than 11 digits', async () => {
      const { hashCpf } = await getCrypto();

      expect(() => hashCpf('1234567890')).toThrowError('CPF deve ter 11 dígitos');
    });

    it('should throw when CPF has more than 11 digits', async () => {
      const { hashCpf } = await getCrypto();

      expect(() => hashCpf('123456789012')).toThrowError('CPF deve ter 11 dígitos');
    });
  });

  // ============================================
  // encryptCpf
  // ============================================

  describe('encryptCpf', () => {
    it('should return object with encrypted, last4, and hash fields', async () => {
      const { encryptCpf } = await getCrypto();

      const result = encryptCpf(VALID_CPF);

      expect(result).toHaveProperty('encrypted');
      expect(result).toHaveProperty('last4');
      expect(result).toHaveProperty('hash');
    });

    it('should set last4 to the last 4 digits of the CPF', async () => {
      const { encryptCpf } = await getCrypto();

      const result = encryptCpf('11144477735'); // last 4 = 7735

      expect(result.last4).toBe('7735');
    });

    it('should format encrypted as iv:authTag:data hex string', async () => {
      const { encryptCpf } = await getCrypto();

      const result = encryptCpf(VALID_CPF);
      const parts = result.encrypted.split(':');

      expect(parts).toHaveLength(3);
      // Each part should be valid hex
      parts.forEach((part) => {
        expect(part).toMatch(/^[0-9a-f]+$/i);
      });
    });

    it('should produce different encrypted values each call (random IV)', async () => {
      const { encryptCpf } = await getCrypto();

      const result1 = encryptCpf(VALID_CPF);
      const result2 = encryptCpf(VALID_CPF);

      expect(result1.encrypted).not.toBe(result2.encrypted);
    });

    it('should produce the same hash for the same CPF', async () => {
      const { encryptCpf } = await getCrypto();

      const result1 = encryptCpf(VALID_CPF);
      const result2 = encryptCpf(VALID_CPF);

      expect(result1.hash).toBe(result2.hash);
    });

    it('should strip non-numeric characters before encrypting', async () => {
      const { encryptCpf, decryptCpf } = await getCrypto();

      const result = encryptCpf('111.444.777-35');
      const decrypted = decryptCpf(result.encrypted);

      expect(decrypted).toBe('11144477735');
    });

    it('should throw when CPF has wrong number of digits', async () => {
      const { encryptCpf } = await getCrypto();

      expect(() => encryptCpf('1234567890')).toThrowError('CPF deve ter 11 dígitos');
    });

    it('should throw when CPF_ENCRYPTION_KEY is not set', async () => {
      delete process.env.CPF_ENCRYPTION_KEY;
      const { encryptCpf } = await getCrypto();

      expect(() => encryptCpf(VALID_CPF)).toThrowError('CPF_ENCRYPTION_KEY');
    });

    it('should throw when CPF_ENCRYPTION_KEY has wrong length', async () => {
      process.env.CPF_ENCRYPTION_KEY = 'tooshort';
      const { encryptCpf } = await getCrypto();

      expect(() => encryptCpf(VALID_CPF)).toThrowError('CPF_ENCRYPTION_KEY inválida');
    });
  });

  // ============================================
  // decryptCpf
  // ============================================

  describe('decryptCpf', () => {
    it('should recover original CPF from encrypted string', async () => {
      const { encryptCpf, decryptCpf } = await getCrypto();

      const { encrypted } = encryptCpf(VALID_CPF);
      const decrypted = decryptCpf(encrypted);

      expect(decrypted).toBe(VALID_CPF);
    });

    it('should throw for invalid format (not enough colon-separated parts)', async () => {
      const { decryptCpf } = await getCrypto();

      expect(() => decryptCpf('invalidstring')).toThrowError(
        'Formato de CPF criptografado inválido'
      );
    });

    it('should throw for invalid format (too many parts)', async () => {
      const { decryptCpf } = await getCrypto();

      expect(() => decryptCpf('part1:part2:part3:part4')).toThrowError(
        'Formato de CPF criptografado inválido'
      );
    });

    it('should throw when CPF_ENCRYPTION_KEY is missing during decryption', async () => {
      const { encryptCpf } = await getCrypto();
      const { encrypted } = encryptCpf(VALID_CPF);

      delete process.env.CPF_ENCRYPTION_KEY;
      const { decryptCpf } = await getCrypto();

      expect(() => decryptCpf(encrypted)).toThrowError('CPF_ENCRYPTION_KEY');
    });

    it('should decrypt multiple different CPFs correctly', async () => {
      const { encryptCpf, decryptCpf } = await getCrypto();

      const cpfs = ['11144477735', '52998224725', '74282328035'];
      for (const cpf of cpfs) {
        const { encrypted } = encryptCpf(cpf);
        expect(decryptCpf(encrypted)).toBe(cpf);
      }
    });
  });

  // ============================================
  // formatCpf
  // ============================================

  describe('formatCpf', () => {
    it('should format 11-digit string to ###.###.###-## pattern', async () => {
      const { formatCpf } = await getCrypto();

      expect(formatCpf('11144477735')).toBe('111.444.777-35');
    });

    it('should strip non-numeric characters before formatting', async () => {
      const { formatCpf } = await getCrypto();

      expect(formatCpf('111.444.777-35')).toBe('111.444.777-35');
    });

    it('should handle CPF with spaces', async () => {
      const { formatCpf } = await getCrypto();

      expect(formatCpf('111 444 777 35')).toBe('111.444.777-35');
    });
  });

  // ============================================
  // validateCpf
  // ============================================

  describe('validateCpf', () => {
    it('should return true for a valid CPF', async () => {
      const { validateCpf } = await getCrypto();

      // Known valid CPFs
      expect(validateCpf('111.444.777-35')).toBe(true);
      expect(validateCpf('529.982.247-25')).toBe(true);
    });

    it('should return false for all-same-digit CPFs', async () => {
      const { validateCpf } = await getCrypto();

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
        '99999999999',
      ];

      invalidCpfs.forEach((cpf) => {
        expect(validateCpf(cpf)).toBe(false);
      });
    });

    it('should return false for CPF with wrong length', async () => {
      const { validateCpf } = await getCrypto();

      expect(validateCpf('1234567890')).toBe(false);   // 10 digits
      expect(validateCpf('123456789012')).toBe(false);  // 12 digits
      expect(validateCpf('')).toBe(false);
    });

    it('should return false when first check digit is wrong', async () => {
      const { validateCpf } = await getCrypto();

      // Modify known-valid CPF check digit
      expect(validateCpf('11144477736')).toBe(false); // last digit changed
    });

    it('should return false when second check digit is wrong', async () => {
      const { validateCpf } = await getCrypto();

      expect(validateCpf('11144477745')).toBe(false); // second-to-last changed
    });

    it('should handle CPF with punctuation (strip before validating)', async () => {
      const { validateCpf } = await getCrypto();

      expect(validateCpf('111.444.777-35')).toBe(true);
    });

    it('should return false for obviously random 11-digit number', async () => {
      const { validateCpf } = await getCrypto();

      expect(validateCpf('12345678901')).toBe(false);
    });
  });

  // ============================================
  // generateEncryptionKey
  // ============================================

  describe('generateEncryptionKey', () => {
    it('should return a 64-character hex string', async () => {
      const { generateEncryptionKey } = await getCrypto();

      const key = generateEncryptionKey();

      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]+$/i);
    });

    it('should return different keys on each call', async () => {
      const { generateEncryptionKey } = await getCrypto();

      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      expect(key1).not.toBe(key2);
    });
  });
});

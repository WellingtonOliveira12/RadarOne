import { describe, it, expect } from 'vitest';
import { cryptoManager, ENCRYPTION_KEY_MISSING, ENCRYPTION_KEY_SOURCE } from '../../src/auth/crypto-manager';

describe('CryptoManager', () => {
  // NOTE: These tests rely on SESSION_ENCRYPTION_KEY being set in the env
  // (or the module-level singleton already having a key from prior tests).
  // In CI, the key is set. Locally, tests may skip if key is missing.

  const hasKey = !ENCRYPTION_KEY_MISSING;

  describe('module-level exports', () => {
    it('ENCRYPTION_KEY_MISSING should be a boolean', () => {
      expect(typeof ENCRYPTION_KEY_MISSING).toBe('boolean');
    });

    it('ENCRYPTION_KEY_SOURCE should be a string', () => {
      expect(typeof ENCRYPTION_KEY_SOURCE).toBe('string');
      expect(['SESSION_ENCRYPTION_KEY', 'SCRAPER_ENCRYPTION_KEY', 'NONE']).toContain(
        ENCRYPTION_KEY_SOURCE,
      );
    });
  });

  describe('encrypt/decrypt', () => {
    it.skipIf(!hasKey)('roundtrip should return original text', () => {
      const plaintext = 'Hello, World! Special chars: @#$%^&*()';
      const encrypted = cryptoManager.encrypt(plaintext);
      const decrypted = cryptoManager.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it.skipIf(!hasKey)('should produce different ciphertext each time (random IV)', () => {
      const plaintext = 'same-text';
      const enc1 = cryptoManager.encrypt(plaintext);
      const enc2 = cryptoManager.encrypt(plaintext);
      expect(enc1).not.toBe(enc2);
      // But both should decrypt to same value
      expect(cryptoManager.decrypt(enc1)).toBe(plaintext);
      expect(cryptoManager.decrypt(enc2)).toBe(plaintext);
    });

    it('encrypt empty string should return empty string', () => {
      expect(cryptoManager.encrypt('')).toBe('');
    });

    it('decrypt empty string should return empty string', () => {
      expect(cryptoManager.decrypt('')).toBe('');
    });

    it.skipIf(!hasKey)('should handle unicode text', () => {
      const plaintext = 'Olá mundo! Preço: R$ 1.500,00';
      const encrypted = cryptoManager.encrypt(plaintext);
      expect(cryptoManager.decrypt(encrypted)).toBe(plaintext);
    });
  });

  describe('isEncrypted', () => {
    it.skipIf(!hasKey)('should detect valid encrypted format', () => {
      const encrypted = cryptoManager.encrypt('test');
      expect(cryptoManager.isEncrypted(encrypted)).toBe(true);
    });

    it('should reject plain text', () => {
      expect(cryptoManager.isEncrypted('not encrypted')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(cryptoManager.isEncrypted('')).toBe(false);
    });

    it('should reject wrong number of parts', () => {
      expect(cryptoManager.isEncrypted('aa:bb')).toBe(false);
      expect(cryptoManager.isEncrypted('aa:bb:cc:dd')).toBe(false);
    });
  });

  describe('ensureEncrypted (idempotent)', () => {
    it.skipIf(!hasKey)('should not re-encrypt already encrypted data', () => {
      const encrypted = cryptoManager.encrypt('data');
      const doubleEncrypted = cryptoManager.ensureEncrypted(encrypted);
      expect(doubleEncrypted).toBe(encrypted);
    });

    it.skipIf(!hasKey)('should encrypt plain text', () => {
      const result = cryptoManager.ensureEncrypted('plain');
      expect(cryptoManager.isEncrypted(result)).toBe(true);
      expect(cryptoManager.decrypt(result)).toBe('plain');
    });
  });

  describe('ensureDecrypted (idempotent)', () => {
    it.skipIf(!hasKey)('should return plain text as-is', () => {
      expect(cryptoManager.ensureDecrypted('mydata')).toBe('mydata');
    });

    it.skipIf(!hasKey)('should decrypt encrypted text', () => {
      const encrypted = cryptoManager.encrypt('mydata');
      expect(cryptoManager.ensureDecrypted(encrypted)).toBe('mydata');
    });
  });

  describe('requireKey (no key scenario)', () => {
    it.skipIf(hasKey)('encrypt should throw when no key is configured', () => {
      expect(() => cryptoManager.encrypt('test')).toThrow('CRYPTO_KEY_MISSING');
    });

    it.skipIf(hasKey)('decrypt should throw when no key is configured', () => {
      expect(() => cryptoManager.decrypt('aabb:ccdd:eeff')).toThrow();
    });
  });
});

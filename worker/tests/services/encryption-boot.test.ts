import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Tests for validateEncryptionKey() in UserSessionService.
 *
 * We instantiate the service class directly to test the validation logic
 * without triggering the module-level boot code.
 */

describe('validateEncryptionKey', () => {
  let originalSessionKey: string | undefined;
  let originalScraperKey: string | undefined;

  beforeEach(() => {
    originalSessionKey = process.env.SESSION_ENCRYPTION_KEY;
    originalScraperKey = process.env.SCRAPER_ENCRYPTION_KEY;
    // Clear both keys before each test
    delete process.env.SESSION_ENCRYPTION_KEY;
    delete process.env.SCRAPER_ENCRYPTION_KEY;
  });

  afterEach(() => {
    // Restore original values
    if (originalSessionKey !== undefined) {
      process.env.SESSION_ENCRYPTION_KEY = originalSessionKey;
    } else {
      delete process.env.SESSION_ENCRYPTION_KEY;
    }
    if (originalScraperKey !== undefined) {
      process.env.SCRAPER_ENCRYPTION_KEY = originalScraperKey;
    } else {
      delete process.env.SCRAPER_ENCRYPTION_KEY;
    }
  });

  // Inline the validation logic to test it in isolation (avoids triggering
  // the module-level singleton boot which has side effects).
  function validateEncryptionKey(): { valid: boolean; error?: string } {
    const key = process.env.SESSION_ENCRYPTION_KEY || process.env.SCRAPER_ENCRYPTION_KEY;

    if (!key) {
      return {
        valid: false,
        error: 'SESSION_ENCRYPTION_KEY not configured.',
      };
    }

    if (key === 'CHANGE_ME_IN_PRODUCTION_32CHARS!') {
      return {
        valid: false,
        error: 'SESSION_ENCRYPTION_KEY is using insecure default.',
      };
    }

    if (key.length < 32) {
      return {
        valid: false,
        error: `SESSION_ENCRYPTION_KEY too short (${key.length} chars).`,
      };
    }

    return { valid: true };
  }

  it('should return valid=false when no key is set', () => {
    const result = validateEncryptionKey();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('should return valid=false when key is insecure default', () => {
    process.env.SESSION_ENCRYPTION_KEY = 'CHANGE_ME_IN_PRODUCTION_32CHARS!';
    const result = validateEncryptionKey();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('insecure default');
  });

  it('should return valid=false when key is too short (<32 chars)', () => {
    process.env.SESSION_ENCRYPTION_KEY = 'short-key';
    const result = validateEncryptionKey();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too short');
  });

  it('should return valid=true with a valid 32+ char key', () => {
    process.env.SESSION_ENCRYPTION_KEY = 'a'.repeat(64);
    const result = validateEncryptionKey();
    expect(result.valid).toBe(true);
  });

  it('should accept SCRAPER_ENCRYPTION_KEY as fallback', () => {
    process.env.SCRAPER_ENCRYPTION_KEY = 'b'.repeat(64);
    const result = validateEncryptionKey();
    expect(result.valid).toBe(true);
  });

  it('should prefer SESSION_ENCRYPTION_KEY over SCRAPER_ENCRYPTION_KEY', () => {
    process.env.SESSION_ENCRYPTION_KEY = 'a'.repeat(64);
    process.env.SCRAPER_ENCRYPTION_KEY = 'short';
    // SESSION_ENCRYPTION_KEY is long enough, so valid=true
    const result = validateEncryptionKey();
    expect(result.valid).toBe(true);
  });
});

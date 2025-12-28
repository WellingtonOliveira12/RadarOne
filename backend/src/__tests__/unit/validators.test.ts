import { describe, it, expect } from 'vitest';
import { validateEmail, validatePassword, validateUrl, validateString } from '../../utils/validators';

describe('Validators', () => {
  describe('validateEmail', () => {
    it('should validate correct emails', () => {
      const validEmails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'user123@test-domain.com',
      ];

      validEmails.forEach((email) => {
        const result = validateEmail(email);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(email.toLowerCase());
      });
    });

    it('should normalize email (lowercase and trim)', () => {
      const result = validateEmail('  USER@EXAMPLE.COM  ');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('user@example.com');
    });

    it('should reject invalid emails', () => {
      const invalidEmails = [
        '',
        'invalid',
        'invalid@',
        '@example.com',
        'user @example.com',
        'user@example',
        'user@@example.com',
      ];

      invalidEmails.forEach((email) => {
        const result = validateEmail(email);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('should reject empty email', () => {
      const result = validateEmail('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Email é obrigatório');
    });

    it('should reject too long email', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const result = validateEmail(longEmail);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('muito longo');
    });
  });

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      const validPasswords = [
        'Password1',
        'MyPass123',
        'StrongP@ss1',
        '12345abc',
      ];

      validPasswords.forEach((password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(password);
      });
    });

    it('should reject password without letters', () => {
      const result = validatePassword('12345678');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('letra');
    });

    it('should reject password without numbers', () => {
      const result = validatePassword('abcdefgh');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('número');
    });

    it('should reject password shorter than 8 characters', () => {
      const result = validatePassword('Pass1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('mínimo 8 caracteres');
    });

    it('should reject empty password', () => {
      const result = validatePassword('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Senha é obrigatória');
    });

    it('should reject too long password', () => {
      const longPassword = 'a'.repeat(120) + '1234567';
      const result = validatePassword(longPassword);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('muito longa');
    });

    it('should reject weak password "123"', () => {
      const result = validatePassword('123');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateUrl', () => {
    it('should validate correct URLs', () => {
      const validUrls = [
        'http://example.com',
        'https://example.com',
        'https://www.example.com/path',
        'https://example.com/path?query=1',
        'http://localhost:3000',
      ];

      validUrls.forEach((url) => {
        const result = validateUrl(url);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(url);
      });
    });

    it('should trim URLs', () => {
      const result = validateUrl('  https://example.com  ');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('https://example.com');
    });

    it('should reject URLs without protocol', () => {
      const result = validateUrl('example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('http://');
    });

    it('should reject URLs with spaces', () => {
      const result = validateUrl('https://example .com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('espaços');
    });

    it('should reject empty URL', () => {
      const result = validateUrl('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('URL é obrigatória');
    });

    it('should reject invalid URL format', () => {
      const invalidUrls = [
        'https://',
        'http://',
        'ftp://example.com',
        'javascript:alert(1)',
      ];

      invalidUrls.forEach((url) => {
        const result = validateUrl(url);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('should reject too long URL', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2050);
      const result = validateUrl(longUrl);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('muito longa');
    });
  });

  describe('validateString', () => {
    it('should validate non-empty strings', () => {
      const result = validateString('Hello', 'Name');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('Hello');
    });

    it('should trim strings', () => {
      const result = validateString('  Hello  ', 'Name');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('Hello');
    });

    it('should reject empty strings', () => {
      const result = validateString('', 'Name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Name é obrigatório');
    });

    it('should validate minimum length', () => {
      const result = validateString('Hi', 'Name', 3);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('mínimo 3 caracteres');
    });

    it('should validate maximum length', () => {
      const result = validateString('Hello World', 'Name', undefined, 5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('máximo 5 caracteres');
    });
  });
});

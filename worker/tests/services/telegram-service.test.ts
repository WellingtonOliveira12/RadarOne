import { describe, it, expect } from 'vitest';
import { TelegramService } from '../../src/services/telegram-service';

describe('TelegramService', () => {
  describe('escapeHtml', () => {
    it('should escape < > & characters', () => {
      expect(TelegramService.escapeHtml('foo <bar> & baz')).toBe(
        'foo &lt;bar&gt; &amp; baz'
      );
    });

    it('should handle strings without special chars', () => {
      expect(TelegramService.escapeHtml('iPhone 15 Pro Max')).toBe(
        'iPhone 15 Pro Max'
      );
    });

    it('should handle empty string', () => {
      expect(TelegramService.escapeHtml('')).toBe('');
    });

    it('should escape multiple ampersands', () => {
      expect(TelegramService.escapeHtml('A & B & C')).toBe(
        'A &amp; B &amp; C'
      );
    });

    it('should escape HTML-like monitor names', () => {
      expect(TelegramService.escapeHtml('Monitor <teste>')).toBe(
        'Monitor &lt;teste&gt;'
      );
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveProxyForSite,
  parseProxyUrl,
  maskProxyUrl,
} from '../../src/utils/proxy-resolver';

describe('proxy-resolver', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all proxy env vars
    delete process.env.PROXY_URL;
    delete process.env.ML_PROXY_URL;
    delete process.env.FB_PROXY_URL;
    delete process.env.OLX_PROXY_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('resolveProxyForSite', () => {
    it('returns none when no proxy env vars are set', () => {
      const result = resolveProxyForSite('MERCADO_LIVRE');
      expect(result.source).toBe('none');
      expect(result.proxy).toBeUndefined();
      expect(result.masked).toBe('direct');
    });

    it('uses site-specific env over global', () => {
      process.env.ML_PROXY_URL = 'http://user:pass@ml-proxy.com:8080';
      process.env.PROXY_URL = 'http://user:pass@global-proxy.com:8080';

      const result = resolveProxyForSite('MERCADO_LIVRE');
      expect(result.source).toBe('site_specific');
      expect(result.proxy?.server).toContain('ml-proxy.com');
    });

    it('falls back to global when no site-specific exists', () => {
      process.env.PROXY_URL = 'http://user:pass@global-proxy.com:8080';

      const result = resolveProxyForSite('MERCADO_LIVRE');
      expect(result.source).toBe('global');
      expect(result.proxy?.server).toContain('global-proxy.com');
    });

    it('resolves FB proxy correctly', () => {
      process.env.FB_PROXY_URL = 'http://fb-proxy.com:3128';

      const result = resolveProxyForSite('FACEBOOK_MARKETPLACE');
      expect(result.source).toBe('site_specific');
      expect(result.proxy?.server).toContain('fb-proxy.com');
    });

    it('resolves OLX proxy correctly', () => {
      process.env.OLX_PROXY_URL = 'socks5://olx-proxy.com:1080';

      const result = resolveProxyForSite('OLX');
      expect(result.source).toBe('site_specific');
      expect(result.proxy?.server).toContain('olx-proxy.com');
    });

    it('returns none for unknown site without global', () => {
      const result = resolveProxyForSite('UNKNOWN_SITE');
      expect(result.source).toBe('none');
    });
  });

  describe('parseProxyUrl', () => {
    it('parses simple proxy URL', () => {
      const proxy = parseProxyUrl('http://proxy.com:8080');
      expect(proxy.server).toBe('http://proxy.com:8080');
      expect(proxy.username).toBeUndefined();
      expect(proxy.password).toBeUndefined();
    });

    it('parses authenticated proxy URL', () => {
      const proxy = parseProxyUrl('http://user:pass123@proxy.com:8080');
      expect(proxy.server).toBe('http://proxy.com:8080');
      expect(proxy.username).toBe('user');
      expect(proxy.password).toBe('pass123');
    });

    it('decodes URL-encoded credentials', () => {
      const proxy = parseProxyUrl('http://us%40er:p%23ss@proxy.com:8080');
      expect(proxy.username).toBe('us@er');
      expect(proxy.password).toBe('p#ss');
    });
  });

  describe('maskProxyUrl', () => {
    it('masks credentials in URL', () => {
      const masked = maskProxyUrl('http://longusername:secretpassword@proxy.com:8080');
      expect(masked).toBe('http://lo**:****@proxy.com:8080');
      expect(masked).not.toContain('secretpassword');
      expect(masked).not.toContain('longusername');
    });

    it('handles URL without credentials', () => {
      const masked = maskProxyUrl('http://proxy.com:8080');
      expect(masked).toBe('http://proxy.com:8080');
    });

    it('returns placeholder for invalid URL', () => {
      const masked = maskProxyUrl('not-a-url');
      expect(masked).toBe('<invalid-url>');
    });
  });
});

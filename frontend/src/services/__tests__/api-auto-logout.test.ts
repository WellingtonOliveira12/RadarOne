import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logout BEFORE importing api
const mockLogout = vi.fn();
vi.mock('../../lib/logout', () => ({
  logout: (...args: any[]) => mockLogout(...args),
}));

vi.mock('../../lib/auth', () => ({
  getToken: () => 'fake-token',
}));

vi.mock('../../lib/analytics', () => ({
  trackRedirectToPlans: vi.fn(),
}));

import { api } from '../api';

describe('api auto-logout behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchResponse(status: number, body: any) {
    (globalThis.fetch as any).mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  }

  function mockFetchNetworkError() {
    (globalThis.fetch as any).mockRejectedValue(new TypeError('Failed to fetch'));
  }

  function mockFetchTimeout() {
    const error = new DOMException('The operation was aborted', 'AbortError');
    (globalThis.fetch as any).mockRejectedValue(error);
  }

  // =====================================================
  // CORE BUG TEST: 401 with skipAutoLogout should NOT logout
  // =====================================================
  it('should NOT call logout on 401 when skipAutoLogout=true', async () => {
    mockFetchResponse(401, { errorCode: 'INVALID_TOKEN', message: 'Token inválido' });

    await expect(
      api.request('/api/sessions', { method: 'GET', skipAutoLogout: true })
    ).rejects.toThrow();

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('should call logout on 401 when skipAutoLogout is NOT set', async () => {
    mockFetchResponse(401, { errorCode: 'INVALID_TOKEN', message: 'Token inválido' });

    await expect(
      api.request('/api/sessions', { method: 'GET' })
    ).rejects.toThrow();

    expect(mockLogout).toHaveBeenCalledWith('session_expired');
  });

  it('should call logout on 401 without errorCode', async () => {
    mockFetchResponse(401, { message: 'Unauthorized' });

    await expect(api.get('/api/test')).rejects.toThrow();

    expect(mockLogout).toHaveBeenCalledWith('session_expired');
  });

  // =====================================================
  // Network errors should NEVER cause logout
  // =====================================================
  it('should NOT call logout on network error', async () => {
    mockFetchNetworkError();

    await expect(api.get('/api/test')).rejects.toThrow();

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('should NOT call logout on timeout', async () => {
    mockFetchTimeout();

    await expect(
      api.request('/api/test', { method: 'GET', timeout: 100 })
    ).rejects.toThrow();

    expect(mockLogout).not.toHaveBeenCalled();
  });

  // =====================================================
  // 5xx errors should NEVER cause logout
  // =====================================================
  it('should NOT call logout on 500 error', async () => {
    mockFetchResponse(500, { errorCode: 'INTERNAL_ERROR', message: 'Server error' });

    await expect(api.get('/api/test')).rejects.toThrow();

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('should NOT call logout on 502 error', async () => {
    mockFetchResponse(502, { message: 'Bad Gateway' });

    await expect(api.get('/api/test')).rejects.toThrow();

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('should NOT call logout on 503 error', async () => {
    mockFetchResponse(503, { message: 'Service Unavailable' });

    await expect(api.get('/api/test')).rejects.toThrow();

    expect(mockLogout).not.toHaveBeenCalled();
  });

  // =====================================================
  // 403 subscription errors should NOT cause logout
  // =====================================================
  // =====================================================
  // requestWithRetry should retry on network errors
  // =====================================================
  it('requestWithRetry should retry on network error and succeed', async () => {
    // First call fails, second succeeds
    (globalThis.fetch as any)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

    const result = await api.requestWithRetry('/api/sessions', {
      method: 'GET',
      skipAutoLogout: true,
      retries: 1,
      retryDelay: 10, // fast for tests
    });

    expect(result).toEqual({ success: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('requestWithRetry should throw after exhausting retries', async () => {
    mockFetchNetworkError();

    await expect(
      api.requestWithRetry('/api/sessions', {
        method: 'GET',
        skipAutoLogout: true,
        retries: 1,
        retryDelay: 10,
      })
    ).rejects.toThrow('Não foi possível conectar ao servidor');

    expect(globalThis.fetch).toHaveBeenCalledTimes(2); // 1 + 1 retry
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('network error message should NOT mention "verifique sua internet"', async () => {
    mockFetchNetworkError();

    try {
      await api.request('/api/test', { method: 'GET' });
    } catch (error: any) {
      expect(error.message).not.toContain('Verifique sua internet');
      expect(error.message).toContain('Não foi possível conectar ao servidor');
      expect(error.isColdStart).toBe(true);
    }
  });

  it('should NOT call logout on 403 TRIAL_EXPIRED', async () => {
    // Mock window.location for redirect check
    Object.defineProperty(window, 'location', {
      value: { pathname: '/monitors', href: '' },
      writable: true,
    });

    mockFetchResponse(403, { errorCode: 'TRIAL_EXPIRED', message: 'Trial expirado' });

    await expect(api.get('/api/test')).rejects.toThrow();

    expect(mockLogout).not.toHaveBeenCalled();
  });
});

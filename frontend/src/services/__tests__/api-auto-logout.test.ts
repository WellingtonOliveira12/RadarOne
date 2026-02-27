import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logout BEFORE importing api
const mockLogout = vi.fn();
vi.mock('../../lib/logout', () => ({
  logout: (...args: unknown[]) => mockLogout(...args),
}));

vi.mock('../../lib/auth', () => ({
  getToken: () => 'fake-token',
}));

vi.mock('../../lib/analytics', () => ({
  trackRedirectToPlans: vi.fn(),
}));

import { api } from '../api';

interface CaughtApiError extends Error {
  status?: number;
  errorCode?: string;
  isNetworkError?: boolean;
  isColdStart?: boolean;
}

describe('api auto-logout behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchResponse(status: number, body: Record<string, unknown>) {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify(body)),
      })
    );
  }

  function mockFetchNetworkError() {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('Failed to fetch'));
  }

  function mockFetchTimeout() {
    const error = new DOMException('The operation was aborted', 'AbortError');
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(error);
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
    (globalThis.fetch as ReturnType<typeof vi.fn>)
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
    } catch (error: unknown) {
      const err = error as CaughtApiError;
      expect(err.message).not.toContain('Verifique sua internet');
      expect(err.message).toContain('Não foi possível conectar ao servidor');
      expect(err.isColdStart).toBe(true);
    }
  });

  // =====================================================
  // 2FA: INVALID_2FA_CODE should NOT cause logout
  // =====================================================
  it('should NOT call logout on 401 with INVALID_2FA_CODE', async () => {
    mockFetchResponse(401, { errorCode: 'INVALID_2FA_CODE', message: 'Código inválido' });

    let caught: CaughtApiError | undefined;
    try {
      await api.request('/api/auth/2fa/verify', { method: 'POST', body: { userId: 'x', code: '000000' }, skipAutoLogout: true });
    } catch (err: unknown) {
      caught = err as CaughtApiError;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toBe('Código inválido');
    expect(caught!.errorCode).toBe('INVALID_2FA_CODE');
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('should NOT call logout on 401 with INVALID_2FA_CODE even without skipAutoLogout', async () => {
    mockFetchResponse(401, { errorCode: 'INVALID_2FA_CODE', message: 'Código inválido' });

    await expect(
      api.request('/api/auth/2fa/verify', { method: 'POST', body: { userId: 'x', code: '000000' } })
    ).rejects.toThrow('Código inválido');

    // INVALID_2FA_CODE has errorCode set, and it's not INVALID_TOKEN, so no logout
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('2FA verify error should contain errorCode and message from backend', async () => {
    mockFetchResponse(401, { errorCode: 'INVALID_2FA_CODE', message: 'Código inválido' });

    let caught: CaughtApiError | undefined;
    try {
      await api.request('/api/auth/2fa/verify', { method: 'POST', body: { userId: 'x', code: '000000' }, skipAutoLogout: true });
    } catch (error: unknown) {
      caught = error as CaughtApiError;
    }
    expect(caught).toBeDefined();
    expect(caught!.errorCode).toBe('INVALID_2FA_CODE');
    expect(caught!.message).toBe('Código inválido');
    expect(caught!.status).toBe(401);
  });

  // =====================================================
  // Token passado via options deve ir no Authorization header
  // =====================================================
  it('should send custom token in Authorization header when provided', async () => {
    mockFetchResponse(200, { ok: true });

    await api.request('/api/auth/2fa/verify', {
      method: 'POST',
      body: { userId: 'test', code: '123456' },
      token: 'my-temp-token-123',
      skipAutoLogout: true,
    });

    // Verificar que fetch foi chamado com o header correto
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const fetchOptions = fetchCall[1];
    expect(fetchOptions.headers['Authorization']).toBe('Bearer my-temp-token-123');
  });

  // =====================================================
  // HTTP errors (401, 400, 500) must NOT be masked as NETWORK_ERROR
  // This was the root cause of the 2FA "Não foi possível conectar" bug
  // =====================================================
  it('401 error should propagate with original status, not become NETWORK_ERROR', async () => {
    mockFetchResponse(401, { errorCode: 'INVALID_2FA_CODE', message: 'Código inválido' });

    let caught: CaughtApiError | undefined;
    try {
      await api.request('/api/test', { method: 'POST', skipAutoLogout: true });
    } catch (err: unknown) {
      caught = err as CaughtApiError;
    }
    expect(caught).toBeDefined();
    expect(caught!.status).toBe(401);
    expect(caught!.errorCode).not.toBe('NETWORK_ERROR');
    expect(caught!.isNetworkError).toBeUndefined();
  });

  it('400 validation error should propagate with original message, not NETWORK_ERROR', async () => {
    mockFetchResponse(400, { errorCode: 'VALIDATION_ERROR', message: 'Dados inválidos' });

    let caught: CaughtApiError | undefined;
    try {
      await api.request('/api/test', { method: 'POST', skipAutoLogout: true });
    } catch (err: unknown) {
      caught = err as CaughtApiError;
    }
    expect(caught).toBeDefined();
    expect(caught!.status).toBe(400);
    expect(caught!.errorCode).toBe('VALIDATION_ERROR');
    expect(caught!.message).toBe('Dados inválidos');
  });

  it('500 error should propagate with original status, not become NETWORK_ERROR', async () => {
    mockFetchResponse(500, { errorCode: 'INTERNAL_ERROR', message: 'Server error' });

    let caught: CaughtApiError | undefined;
    try {
      await api.request('/api/test', { method: 'POST', skipAutoLogout: true });
    } catch (err: unknown) {
      caught = err as CaughtApiError;
    }
    expect(caught).toBeDefined();
    expect(caught!.status).toBe(500);
    expect(caught!.errorCode).toBe('INTERNAL_ERROR');
    expect(caught!.isNetworkError).toBeUndefined();
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

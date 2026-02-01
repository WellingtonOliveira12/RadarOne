import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth module
vi.mock('../auth', () => ({
  clearAuth: vi.fn(),
}));

import { clearAuth } from '../auth';

describe('logout', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    // Mock window.location.href setter
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '' },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  it('sets logout flag in sessionStorage before clearing auth', async () => {
    const { logout } = await import('../logout');
    logout();

    expect(sessionStorage.getItem('radarone_logging_out')).toBe('1');
    expect(clearAuth).toHaveBeenCalled();
  });

  it('calls backend /api/auth/logout with credentials', async () => {
    const { logout } = await import('../logout');
    logout();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/logout'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
  });

  it('redirects to /login after backend responds', async () => {
    const fetchPromise = Promise.resolve({ ok: true });
    globalThis.fetch = vi.fn().mockReturnValue(fetchPromise);

    const { logout } = await import('../logout');
    logout();

    // Wait for the fetch .finally() to execute
    await fetchPromise;
    await new Promise((r) => setTimeout(r, 0));

    expect(window.location.href).toBe('/login');
  });

  it('redirects to /login?reason=... when reason is provided', async () => {
    const fetchPromise = Promise.resolve({ ok: true });
    globalThis.fetch = vi.fn().mockReturnValue(fetchPromise);

    const { logout } = await import('../logout');
    logout('session_expired');

    await fetchPromise;
    await new Promise((r) => setTimeout(r, 0));

    expect(window.location.href).toBe('/login?reason=session_expired');
  });

  it('redirects even if backend call fails', async () => {
    const fetchPromise = Promise.reject(new Error('network error'));
    globalThis.fetch = vi.fn().mockReturnValue(fetchPromise);

    const { logout } = await import('../logout');
    logout();

    // Let the catch + finally chain resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(window.location.href).toBe('/login');
  });

  it('isLoggingOut returns true when flag is set', async () => {
    const { isLoggingOut } = await import('../logout');

    expect(isLoggingOut()).toBe(false);
    sessionStorage.setItem('radarone_logging_out', '1');
    expect(isLoggingOut()).toBe(true);
  });

  it('clearLogoutFlag removes the flag', async () => {
    const { clearLogoutFlag } = await import('../logout');

    sessionStorage.setItem('radarone_logging_out', '1');
    clearLogoutFlag();
    expect(sessionStorage.getItem('radarone_logging_out')).toBeNull();
  });
});

/**
 * Centralized authentication library
 *
 * SECURITY STRATEGY:
 * - Access token: stored in-memory only — short-lived (15min)
 * - Refresh token: httpOnly cookie (managed by backend) — 7 days
 *
 * On page reload, the access token is lost (memory) and renewed
 * automatically via /auth/refresh (which uses the httpOnly cookie).
 */

// Access token in memory only (never persisted to storage)
let inMemoryToken: string | null = null;

/**
 * Gets the JWT access token from memory.
 * Returns null if not available (e.g. after page reload).
 */
export function getToken(): string | null {
  return inMemoryToken;
}

/**
 * Saves the JWT access token in memory.
 */
export function setToken(token: string): void {
  inMemoryToken = token;
}

/**
 * Clears ALL authentication information.
 * Removes legacy localStorage token if present (migration cleanup).
 */
export function clearAuth(): void {
  inMemoryToken = null;
  // Clean up legacy localStorage token from previous versions
  try { localStorage.removeItem('radarone_token'); } catch { /* noop */ }
  try { sessionStorage.removeItem('returnUrl'); } catch { /* noop */ }
}

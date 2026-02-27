import { Request, Response } from 'express';
import { AUTH_CONFIG } from '../config/appConfig';

const REFRESH_TOKEN_COOKIE = AUTH_CONFIG.refreshTokenCookieName;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Define o refresh token como httpOnly cookie seguro
 */
export function setRefreshTokenCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: true, // Sempre HTTPS (Render usa HTTPS)
    sameSite: IS_PRODUCTION ? 'none' : 'lax', // 'none' para cross-origin em prod
    path: '/api/auth', // Restrito a rotas de auth (minimiza exposição)
    expires: expiresAt,
  });
}

/**
 * Limpa o cookie de refresh token
 */
export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: IS_PRODUCTION ? 'none' : 'lax',
    path: '/api/auth',
  });
}

/**
 * Obtém o refresh token do cookie
 */
export function getRefreshTokenFromCookie(req: Request): string | undefined {
  return req.cookies?.[REFRESH_TOKEN_COOKIE];
}

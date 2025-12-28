import { test, expect } from '@playwright/test';

/**
 * Teste E2E: Validar que token inválido retorna 401
 *
 * Garante que:
 * - Status HTTP 401 é retornado para token inválido
 * - Formato do erro segue padrão { error: { code, message } }
 * - Código de erro é TOKEN_INVALID
 *
 * Evita regressão de status 403 para 401
 */

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:3000';

test.describe('API - Invalid Token Returns 401', () => {
  test('GET /api/monitors with invalid token should return 401', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/monitors`, {
      headers: {
        'Authorization': 'Bearer invalid_token_xyz123',
      },
    });

    // Deve retornar 401 (não 403)
    expect(response.status()).toBe(401);

    // Deve ter formato padronizado de erro
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');

    // Código de erro deve ser TOKEN_INVALID
    expect(body.error.code).toBe('TOKEN_INVALID');
  });

  test('GET /api/monitors without token should return 401', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/monitors`);

    // Deve retornar 401
    expect(response.status()).toBe(401);

    // Deve ter formato padronizado de erro
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code', 'TOKEN_NOT_PROVIDED');
    expect(body.error).toHaveProperty('message');
    expect(body.error.message).toContain('Token não fornecido');
  });

  test('GET /api/auth/me with malformed token should return 401', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/auth/me`, {
      headers: {
        'Authorization': 'NotBearer invalid',
      },
    });

    // Deve retornar 401
    expect(response.status()).toBe(401);

    // Deve ter formato padronizado de erro
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code', 'TOKEN_NOT_PROVIDED');
  });

  test('Error response should NOT have old format', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/monitors`, {
      headers: {
        'Authorization': 'Bearer invalid',
      },
    });

    const body = await response.json();

    // Não deve ter formato antigo { error: string, errorCode: string }
    expect(typeof body.error).toBe('object');
    expect(body.error).not.toBeInstanceOf(String);

    // Deve ter novo formato { error: { code, message } }
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
  });
});

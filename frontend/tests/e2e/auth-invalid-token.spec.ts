import { test, expect } from '@playwright/test';
import { clearStorage } from './helpers';

/**
 * Testes E2E: Token Inválido → Logout
 *
 * Valida que o interceptor (api.ts) trata corretamente erros 401:
 * - Backend retorna: status 401 + errorCode 'INVALID_TOKEN' (ou ausente)
 * - Frontend deve: limpar token + redirecionar para /login?reason=session_expired
 *
 * REGRAS CRÍTICAS:
 * ✅ Baseado em status HTTP + errorCode (NÃO texto)
 * ✅ Token deve ser limpo do localStorage
 * ✅ Deve redirecionar para /login
 */

test.describe('Auth: Invalid Token → Logout', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('deve deslogar e redirecionar quando token é inválido (401)', async ({ page }) => {
    // 1. Setar token INVÁLIDO manualmente no localStorage
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('token', 'invalid-fake-token-12345');
    });

    // 2. Tentar acessar rota protegida
    // Backend real vai retornar 401 quando validar o token inválido
    await page.goto('/monitors');

    // 3. Aguardar redirecionamento para /login
    await page.waitForURL(/\/login/, { timeout: 10000 });

    // 4. Validar que foi redirecionado com reason=session_expired
    const url = new URL(page.url());
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('reason')).toBe('session_expired');

    // 5. Validar que token foi LIMPO do localStorage
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  });

  test('deve deslogar quando faz request API com token inválido', async ({ page }) => {
    // Navegar para página inicial
    await page.goto('/');

    // Setar token inválido
    await page.evaluate(() => {
      localStorage.setItem('token', 'expired-jwt-token');
    });

    // Fazer request direto via fetch (simula chamada da API)
    const response = await page.evaluate(async () => {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';
      const token = localStorage.getItem('token');

      const res = await fetch(`${baseUrl}/api/monitors`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      return {
        status: res.status,
        body: await res.text().then(text => {
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        }),
      };
    });

    // Backend deve retornar 401
    expect(response.status).toBe(401);

    // Verificar que errorCode está presente (ou ausente, ambos são válidos para 401)
    if (response.body && typeof response.body === 'object') {
      // Se errorCode estiver presente, deve ser INVALID_TOKEN ou UNAUTHORIZED
      const errorCode = response.body.errorCode;
      if (errorCode) {
        expect(['INVALID_TOKEN', 'UNAUTHORIZED']).toContain(errorCode);
      }
    }

    // Tentar navegar para rota protegida
    await page.goto('/monitors');

    // Deve redirecionar para login
    await page.waitForURL(/\/login/, { timeout: 10000 });

    // Token deve estar limpo
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  });

  test('deve persistir logout mesmo após múltiplas tentativas', async ({ page }) => {
    // Setar token inválido
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('token', 'bad-token');
    });

    // Tentar acessar /monitors
    await page.goto('/monitors');
    await page.waitForURL(/\/login/, { timeout: 10000 });

    // Verificar que token foi limpo
    let token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();

    // Setar token inválido NOVAMENTE
    await page.evaluate(() => {
      localStorage.setItem('token', 'another-bad-token');
    });

    // Tentar acessar /dashboard
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/, { timeout: 10000 });

    // Token deve estar limpo novamente
    token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  });

  test('deve redirecionar para /login apenas uma vez (evitar loop)', async ({ page }) => {
    // Setar token inválido
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('token', 'invalid-token');
    });

    // Já ir direto para /login
    await page.goto('/login');

    // Aguardar página carregar
    await page.waitForLoadState('networkidle');

    // URL deve permanecer em /login (não deve redirecionar novamente)
    const url = page.url();
    expect(url).toContain('/login');

    // Token deve estar limpo
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  });
});

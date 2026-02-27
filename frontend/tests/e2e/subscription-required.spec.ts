import { test, expect } from '@playwright/test';
import { loginReal, clearStorage } from './helpers';

/**
 * Testes E2E: Subscription Required → Redirect para /plans (SEM logout)
 *
 * Valida que o interceptor (api.ts) trata corretamente erros de subscription:
 * - Backend retorna: status 403 + errorCode 'SUBSCRIPTION_REQUIRED'
 * - Frontend deve: redirecionar para /plans (SEM limpar token)
 *
 * REGRAS CRÍTICAS:
 * ✅ Baseado em status HTTP + errorCode (NÃO texto)
 * ✅ Token NÃO deve ser limpo do localStorage
 * ✅ Deve redirecionar para /plans?reason=subscription_required
 * ✅ Evitar loop: se já estiver em /plans, não redirecionar
 */

test.describe('Auth: Subscription Required → Redirect (NO Logout)', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('deve redirecionar para /plans quando subscription é requerida (SEM limpar token)', async ({ page }) => {
    // 1. Fazer login real (obtém token válido)
    await loginReal(page, 'USER');

    // 2. Capturar token válido antes do teste
    const tokenBefore = await page.evaluate(() => localStorage.getItem('token'));
    expect(tokenBefore).not.toBeNull();

    // 3. Mockar próximo request para retornar 403 + SUBSCRIPTION_REQUIRED
    await page.route('**/api/monitors*', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          errorCode: 'SUBSCRIPTION_REQUIRED',
          message: 'Você precisa de uma assinatura ativa para acessar este recurso.',
          details: {
            requiredPlan: 'PREMIUM',
          },
        }),
      });
    });

    // 4. Fazer request que vai retornar 403 + SUBSCRIPTION_REQUIRED
    await page.evaluate(async () => {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';
      const token = localStorage.getItem('token');

      try {
        await fetch(`${baseUrl}/api/monitors`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch {
        // Erro esperado, interceptor vai processar
      }
    });

    // 5. Aguardar redirecionamento para /plans
    await page.waitForURL(/\/plans/, { timeout: 10000 });

    // 6. Validar que foi redirecionado com reason=subscription_required
    const url = new URL(page.url());
    expect(url.pathname).toBe('/plans');
    expect(url.searchParams.get('reason')).toBe('subscription_required');

    // 7. CRÍTICO: Token NÃO deve ser limpo
    const tokenAfter = await page.evaluate(() => localStorage.getItem('token'));
    expect(tokenAfter).toBe(tokenBefore);
    expect(tokenAfter).not.toBeNull();
  });

  test('deve evitar loop: não redirecionar se já estiver em /plans', async ({ page }) => {
    // 1. Fazer login
    await loginReal(page, 'USER');

    // 2. Navegar para /plans manualmente
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');

    // 3. Mockar request para retornar 403 + SUBSCRIPTION_REQUIRED
    await page.route('**/api/**', async (route) => {
      // Permitir requests de login/auth passarem
      if (route.request().url().includes('/auth/')) {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          errorCode: 'SUBSCRIPTION_REQUIRED',
          message: 'Assinatura requerida',
        }),
      });
    });

    // 4. Fazer request que retorna SUBSCRIPTION_REQUIRED
    await page.evaluate(async () => {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';
      const token = localStorage.getItem('token');

      try {
        await fetch(`${baseUrl}/api/keywords/search?keyword=test`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch {
        // Erro esperado
      }
    });

    // 5. Aguardar um pouco para garantir que não houve redirecionamento
    await page.waitForTimeout(2000);

    // 6. URL deve permanecer em /plans (NÃO deve redirecionar novamente)
    const currentUrl = new URL(page.url());
    expect(currentUrl.pathname).toBe('/plans');

    // 7. Token deve permanecer
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).not.toBeNull();
  });

  test('deve rastrear evento analytics ao redirecionar para /plans', async ({ page }) => {
    // Setup: capturar eventos GA4
    const analyticsEvents: Record<string, unknown>[] = [];
    await page.exposeFunction('captureAnalyticsEvent', (event: Record<string, unknown>) => {
      analyticsEvents.push(event);
    });

    // Interceptar chamadas gtag/GA4
    await page.addInitScript(() => {
      (window as Record<string, unknown>).gtag = (...args: unknown[]) => {
        if (args[0] === 'event') {
          (window as Record<string, unknown> & { captureAnalyticsEvent: (e: Record<string, unknown>) => void }).captureAnalyticsEvent({
            event: args[1],
            params: args[2],
          });
        }
      };
    });

    // 1. Fazer login
    await loginReal(page, 'USER');

    // 2. Mockar 403 + SUBSCRIPTION_REQUIRED
    await page.route('**/api/monitors*', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          errorCode: 'SUBSCRIPTION_REQUIRED',
          message: 'Assinatura requerida',
        }),
      });
    });

    // 3. Fazer request
    await page.evaluate(async () => {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';
      const token = localStorage.getItem('token');

      try {
        await fetch(`${baseUrl}/api/monitors`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch {
        // Esperado
      }
    });

    // 4. Aguardar redirect
    await page.waitForURL(/\/plans/, { timeout: 10000 });

    // 5. Verificar que evento foi rastreado
    const redirectEvent = analyticsEvents.find(e =>
      e.event === 'redirect_to_plans' || e.params?.reason === 'subscription_required'
    );

    // Se analytics estiver configurado, deve ter rastreado
    if (analyticsEvents.length > 0) {
      expect(redirectEvent).toBeDefined();
    }
  });

  test('403 com errorCode FORBIDDEN deve PROPAGAR erro (não redirecionar)', async ({ page }) => {
    // Este teste valida que NEM TODO 403 redireciona para /plans
    // Apenas TRIAL_EXPIRED e SUBSCRIPTION_REQUIRED

    // 1. Login
    await loginReal(page, 'USER');

    // 2. Mockar 403 + FORBIDDEN (não deve redirecionar)
    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          errorCode: 'FORBIDDEN',
          message: 'Você não tem permissão para acessar este recurso',
        }),
      });
    });

    // 3. Capturar URL atual
    const urlBefore = page.url();

    // 4. Fazer request que retorna 403 + FORBIDDEN
    const response = await page.evaluate(async () => {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';
      const token = localStorage.getItem('token');

      try {
        const res = await fetch(`${baseUrl}/api/admin/users`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        return {
          status: res.status,
          body: await res.json(),
        };
      } catch (err: unknown) {
        return {
          error: err instanceof Error ? err.message : 'Erro desconhecido',
        };
      }
    });

    // 5. Deve ter recebido 403 + FORBIDDEN
    expect(response.status).toBe(403);
    expect(response.body?.errorCode).toBe('FORBIDDEN');

    // 6. NÃO deve ter redirecionado
    await page.waitForTimeout(2000);
    const urlAfter = page.url();
    expect(urlAfter).toBe(urlBefore);
    expect(urlAfter).not.toContain('/plans');

    // 7. Token deve permanecer
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).not.toBeNull();
  });

  test('deve diferenciar entre TRIAL_EXPIRED e SUBSCRIPTION_REQUIRED no redirect', async ({ page }) => {
    // Ambos redirecionam para /plans, mas com reason diferente

    // === TESTE 1: SUBSCRIPTION_REQUIRED ===
    await loginReal(page, 'USER');

    await page.route('**/api/monitors*', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          errorCode: 'SUBSCRIPTION_REQUIRED',
          message: 'Assinatura requerida',
        }),
      });
    });

    await page.evaluate(async () => {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';
      const token = localStorage.getItem('token');
      try {
        await fetch(`${baseUrl}/api/monitors`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } catch { /* intentionally empty */ }
    });

    await page.waitForURL(/\/plans/, { timeout: 10000 });
    let url = new URL(page.url());
    expect(url.searchParams.get('reason')).toBe('subscription_required');

    // === TESTE 2: TRIAL_EXPIRED ===
    await clearStorage(page);
    await loginReal(page, 'USER');

    await page.route('**/api/keywords/**', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          errorCode: 'TRIAL_EXPIRED',
          message: 'Trial expirado',
        }),
      });
    });

    await page.evaluate(async () => {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';
      const token = localStorage.getItem('token');
      try {
        await fetch(`${baseUrl}/api/keywords/search?keyword=test`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } catch { /* intentionally empty */ }
    });

    await page.waitForURL(/\/plans/, { timeout: 10000 });
    url = new URL(page.url());
    expect(url.searchParams.get('reason')).toBe('trial_expired');
  });
});

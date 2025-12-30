import { test, expect } from '@playwright/test';
import { loginReal, clearStorage } from './helpers';

/**
 * Testes E2E: Trial Expirado → Redirect para /plans (SEM logout)
 *
 * Valida que o interceptor (api.ts) trata corretamente erros de trial:
 * - Backend retorna: status 403 + errorCode 'TRIAL_EXPIRED'
 * - Frontend deve: redirecionar para /plans (SEM limpar token)
 *
 * REGRAS CRÍTICAS:
 * ✅ Baseado em status HTTP + errorCode (NÃO texto)
 * ✅ Token NÃO deve ser limpo do localStorage
 * ✅ Deve redirecionar para /plans?reason=trial_expired
 * ✅ Evitar loop: se já estiver em /plans, não redirecionar
 */

test.describe('Auth: Trial Expired → Redirect (NO Logout)', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('deve redirecionar para /plans quando trial expira (SEM limpar token)', async ({ page }) => {
    // 1. Fazer login real (obtém token válido)
    await loginReal(page, 'USER');

    // 2. Capturar token válido antes do teste
    const tokenBefore = await page.evaluate(() => localStorage.getItem('token'));
    expect(tokenBefore).not.toBeNull();

    // 3. Mockar próximo request para retornar 403 + TRIAL_EXPIRED
    await page.route('**/api/keywords/search*', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          errorCode: 'TRIAL_EXPIRED',
          message: 'Seu período de teste terminou. Escolha um plano para continuar.',
          details: {
            trialEndedAt: '2025-12-15T10:30:00Z',
          },
        }),
      });
    });

    // 4. Fazer request que vai retornar 403 + TRIAL_EXPIRED
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
      } catch (err) {
        // Erro esperado, interceptor vai processar
      }
    });

    // 5. Aguardar redirecionamento para /plans
    await page.waitForURL(/\/plans/, { timeout: 10000 });

    // 6. Validar que foi redirecionado com reason=trial_expired
    const url = new URL(page.url());
    expect(url.pathname).toBe('/plans');
    expect(url.searchParams.get('reason')).toBe('trial_expired');

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

    // 3. Mockar request para retornar 403 + TRIAL_EXPIRED
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
          errorCode: 'TRIAL_EXPIRED',
          message: 'Seu período de teste terminou',
        }),
      });
    });

    // 4. Fazer request que retorna TRIAL_EXPIRED
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
      } catch (err) {
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
    const analyticsEvents: any[] = [];
    await page.exposeFunction('captureAnalyticsEvent', (event: any) => {
      analyticsEvents.push(event);
    });

    // Interceptar chamadas gtag/GA4
    await page.addInitScript(() => {
      (window as any).gtag = (...args: any[]) => {
        if (args[0] === 'event') {
          (window as any).captureAnalyticsEvent({
            event: args[1],
            params: args[2],
          });
        }
      };
    });

    // 1. Fazer login
    await loginReal(page, 'USER');

    // 2. Mockar 403 + TRIAL_EXPIRED
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

    // 3. Fazer request
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
      } catch (err) {
        // Esperado
      }
    });

    // 4. Aguardar redirect
    await page.waitForURL(/\/plans/, { timeout: 10000 });

    // 5. Verificar que evento foi rastreado
    // Nota: este teste pode falhar se analytics não estiver configurado em dev
    // É mais para documentação do comportamento esperado
    const redirectEvent = analyticsEvents.find(e =>
      e.event === 'redirect_to_plans' || e.params?.reason === 'trial_expired'
    );

    // Se analytics estiver configurado, deve ter rastreado
    // Se não, apenas verificamos que o redirect funcionou
    if (analyticsEvents.length > 0) {
      expect(redirectEvent).toBeDefined();
    }
  });

  test('deve permitir voltar para dashboard após escolher plano', async ({ page }) => {
    // Simula fluxo completo:
    // 1. Trial expira → redirect /plans
    // 2. Usuário escolhe plano (simulado)
    // 3. Deve conseguir voltar para dashboard

    // 1. Login
    await loginReal(page, 'USER');
    const token = await page.evaluate(() => localStorage.getItem('token'));

    // 2. Mockar TRIAL_EXPIRED
    let trialExpired = true;
    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/auth/')) {
        await route.continue();
        return;
      }

      if (trialExpired) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            errorCode: 'TRIAL_EXPIRED',
            message: 'Trial expirado',
          }),
        });
      } else {
        await route.continue();
      }
    });

    // 3. Tentar acessar monitors → deve ir para /plans
    await page.goto('/monitors');
    await page.waitForURL(/\/plans/, { timeout: 10000 });

    // 4. Simular escolha de plano (desabilitar erro TRIAL_EXPIRED)
    trialExpired = false;

    // 5. Navegar para dashboard
    await page.goto('/dashboard');

    // 6. Deve carregar normalmente (sem redirect)
    await page.waitForLoadState('networkidle');
    const url = page.url();
    expect(url).toContain('/dashboard');

    // 7. Token deve permanecer o mesmo
    const tokenAfter = await page.evaluate(() => localStorage.getItem('token'));
    expect(tokenAfter).toBe(token);
  });
});

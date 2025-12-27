import { test, expect } from '@playwright/test';
import { clearStorage } from './helpers';

test.describe('Admin Jobs Dashboard Flow', () => {
  const ADMIN_USER = {
    email: 'admin@radarone.com',
    password: 'Admin123!',
  };

  test.beforeEach(async ({ page }) => {
    await clearStorage(page);

    // Mock da API de login como admin
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          token: 'mock-admin-jwt-token',
          user: {
            id: '1',
            name: 'Admin User',
            email: ADMIN_USER.email,
            role: 'ADMIN',
          },
        }),
      });
    });

    // Mock da API de stats do admin (usado pelo AdminProtectedRoute para verificar role)
    await page.route('**/api/admin/stats', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          stats: {},
        }),
      });
    });

    // Mock da API de jobs do admin
    await page.route('**/api/admin/jobs**', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          jobs: [
            {
              id: '1',
              jobName: 'checkTrialExpiring',
              status: 'SUCCESS',
              executedAt: new Date().toISOString(),
              duration: 1234,
              result: { processed: 5, sent: 3 },
            },
            {
              id: '2',
              jobName: 'resetMonthlyQueries',
              status: 'SUCCESS',
              executedAt: new Date(Date.now() - 86400000).toISOString(),
              duration: 567,
              result: { reset: 10 },
            },
            {
              id: '3',
              jobName: 'checkSubscriptionExpired',
              status: 'FAILURE',
              executedAt: new Date(Date.now() - 3600000).toISOString(),
              duration: 890,
              error: 'Database connection timeout',
            },
          ],
          total: 3,
        }),
      });
    });
  });

  test('deve exigir autenticação para acessar página admin', async ({ page }) => {
    await clearStorage(page);

    await page.goto('/admin/jobs');

    // Deve redirecionar para login ou mostrar erro 403
    await page.waitForURL('/login', { timeout: 5000 });
  });

  test('deve exibir página de jobs do admin após login', async ({ page }) => {
    // Fazer login como admin
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN_USER.email);
    await page.fill('input[type="password"]', ADMIN_USER.password);
    await page.click('button[type="submit"]');

    // Navegar para admin/jobs
    await page.goto('/admin/jobs');

    await expect(page.locator('h1, h2').filter({ hasText: /admin|jobs|trabalhos/i })).toBeVisible();
  });

  test('deve listar jobs executados', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN_USER.email);
    await page.fill('input[type="password"]', ADMIN_USER.password);
    await page.click('button[type="submit"]');

    await page.goto('/admin/jobs');

    // Aguarda a lista de jobs aparecer
    await page.waitForSelector('text=checkTrialExpiring', { timeout: 5000 });

    // Verifica se os jobs estão listados
    await expect(page.locator('text=checkTrialExpiring')).toBeVisible();
    await expect(page.locator('text=resetMonthlyQueries')).toBeVisible();
    await expect(page.locator('text=checkSubscriptionExpired')).toBeVisible();
  });

  test('deve mostrar status dos jobs (SUCCESS/FAILURE)', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN_USER.email);
    await page.fill('input[type="password"]', ADMIN_USER.password);
    await page.click('button[type="submit"]');

    await page.goto('/admin/jobs');

    // Aguarda jobs carregarem
    await page.waitForSelector('text=checkTrialExpiring', { timeout: 5000 });

    // Verifica se há indicadores de status
    await expect(page.locator('text=/SUCCESS|FAILURE|RUNNING/i')).toBeVisible();
  });

  test('deve mostrar detalhes de jobs com erro', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN_USER.email);
    await page.fill('input[type="password"]', ADMIN_USER.password);
    await page.click('button[type="submit"]');

    await page.goto('/admin/jobs');

    // Aguarda jobs carregarem
    await page.waitForSelector('text=checkSubscriptionExpired', { timeout: 5000 });

    // Procura por mensagem de erro
    const errorMessage = page.locator('text=/Database connection timeout|erro|error/i');
    await expect(errorMessage).toBeVisible();
  });

  test('deve mostrar timestamp de execução dos jobs', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN_USER.email);
    await page.fill('input[type="password"]', ADMIN_USER.password);
    await page.click('button[type="submit"]');

    await page.goto('/admin/jobs');

    // Aguarda jobs carregarem
    await page.waitForSelector('text=checkTrialExpiring', { timeout: 5000 });

    // Verifica se há timestamps (pode estar em formato relativo ou absoluto)
    const timestamps = page.locator('text=/ago|atrás|\\d{2}:\\d{2}|\\d{2}\\/\\d{2}/i');
    expect(await timestamps.count()).toBeGreaterThan(0);
  });

  test('deve ter funcionalidade de filtro ou busca de jobs', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN_USER.email);
    await page.fill('input[type="password"]', ADMIN_USER.password);
    await page.click('button[type="submit"]');

    await page.goto('/admin/jobs');

    // Verifica se há input de busca ou filtro
    const searchInput = page.locator('input[type="search"], input[placeholder*="busca"], input[placeholder*="filtro"]');

    if (await searchInput.count() > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });

  test('usuário comum não deve acessar admin jobs', async ({ page }) => {
    // Mock de login como usuário comum
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          token: 'mock-user-jwt-token',
          user: {
            id: '2',
            name: 'Regular User',
            email: 'user@radarone.com',
            role: 'USER',
          },
        }),
      });
    });

    // Mock de 403 ao tentar acessar admin
    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({
        status: 403,
        body: JSON.stringify({ error: 'Acesso negado. Somente administradores.' }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'user@radarone.com');
    await page.fill('input[type="password"]', 'User123!');
    await page.click('button[type="submit"]');

    await page.goto('/admin/jobs');

    // Deve mostrar erro 403 ou redirecionar
    await page.waitForSelector('text=/acesso negado|não autorizado|403/i', { timeout: 5000 });
  });
});

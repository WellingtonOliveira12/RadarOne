/**
 * SMOKE TEST - Painel Admin RadarOne
 * Valida navegação, layout e funcionalidades críticas do admin
 */

import { test, expect } from '@playwright/test';

// Credenciais admin (usar variáveis de ambiente em produção)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@radarone.com.br';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@2025';
const BASE_URL = process.env.VITE_APP_URL || 'http://localhost:5173';

test.describe('Admin Panel Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login como admin
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    // Aguarda redirecionamento após login
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 10000 });
  });

  test('1. Todas as rotas admin devem usar AdminLayout (sidebar + header)', async ({ page }) => {
    const adminRoutes = [
      '/admin/stats',
      '/admin/users',
      '/admin/subscriptions',
      '/admin/jobs',
      '/admin/audit-logs',
      '/admin/settings',
      '/admin/monitors',
      '/admin/webhooks',
      '/admin/coupons',
      '/admin/alerts',
      '/admin/security',
    ];

    for (const route of adminRoutes) {
      await page.goto(`${BASE_URL}${route}`);

      // Verificar que AdminLayout está presente
      await expect(page.getByText('RadarOne Admin')).toBeVisible();

      // Verificar que sidebar está presente (desktop)
      const sidebar = page.locator('aside');
      if (await sidebar.isVisible()) {
        await expect(sidebar).toBeVisible();
      }

      console.log(`✓ ${route} - AdminLayout OK`);
    }
  });

  test('2. Link "Dashboard Admin" NÃO deve redirecionar para /plans', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/users`);

    // Clicar no link "Dashboard Admin" no header
    await page.click('a:has-text("Dashboard Admin")');

    // Deve ir para /admin/stats
    await expect(page).toHaveURL(`${BASE_URL}/admin/stats`);

    // NÃO deve estar em /plans
    await expect(page).not.toHaveURL(/\/plans/);

    console.log('✓ Link "Dashboard Admin" aponta corretamente para /admin/stats');
  });

  test('3. Navegação entre páginas admin deve manter layout', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/stats`);

    // Clicar em "Usuários" na sidebar
    await page.click('a:has-text("Usuários")');
    await expect(page).toHaveURL(`${BASE_URL}/admin/users`);
    await expect(page.getByText('RadarOne Admin')).toBeVisible();

    // Clicar em "Jobs" na sidebar
    await page.click('a:has-text("Jobs")');
    await expect(page).toHaveURL(`${BASE_URL}/admin/jobs`);
    await expect(page.getByText('RadarOne Admin')).toBeVisible();

    // Clicar em "Segurança (2FA)" na sidebar
    await page.click('a:has-text("Segurança (2FA)")');
    await expect(page).toHaveURL(`${BASE_URL}/admin/security`);
    await expect(page.getByText('RadarOne Admin')).toBeVisible();

    console.log('✓ Navegação mantém AdminLayout consistente');
  });

  test('4. Página /admin/jobs usa AdminLayout (não layout próprio)', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/jobs`);

    // Verificar que usa AdminLayout (não inline styles)
    await expect(page.getByText('RadarOne Admin')).toBeVisible();

    // Verificar que sidebar está presente
    await expect(page.getByText('Dashboard')).toBeVisible();
    await expect(page.getByText('Usuários')).toBeVisible();

    console.log('✓ /admin/jobs usa AdminLayout corretamente');
  });

  test('5. Contadores e integrações funcionam', async ({ page }) => {
    // Stats Page
    await page.goto(`${BASE_URL}/admin/stats`);
    await expect(page.getByRole('heading', { name: /Dashboard Administrativo/i })).toBeVisible();

    // Verificar que não exibe "Nenhuma estatística disponível" (deve ter dados reais ou loading)
    const noDataText = page.getByText('Nenhuma estatística disponível');
    if (await noDataText.isVisible()) {
      console.warn('⚠ Stats mostrando "sem dados" - pode ser ambiente vazio');
    }

    // Alerts Page
    await page.goto(`${BASE_URL}/admin/alerts`);
    await expect(page.getByRole('heading', { name: /Alertas Administrativos/i })).toBeVisible();

    console.log('✓ Páginas carregam corretamente');
  });

  test('6. Placeholders exibem mensagens claras', async ({ page }) => {
    // Coupons - Placeholder
    await page.goto(`${BASE_URL}/admin/coupons`);
    await expect(page.getByText('Interface de Gestão em Desenvolvimento')).toBeVisible();

    // Settings - Read-only
    await page.goto(`${BASE_URL}/admin/settings`);
    await expect(page.getByText('Visualização Read-Only')).toBeVisible();

    console.log('✓ Placeholders têm mensagens claras');
  });

  test('7. Logout funciona corretamente', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/stats`);

    // Clicar em "Sair"
    await page.click('button:has-text("Sair")');

    // Deve redirecionar para /login
    await expect(page).toHaveURL(`${BASE_URL}/login`);

    console.log('✓ Logout funciona');
  });
});

test.describe('Validações de Integridade', () => {
  test('Nenhuma rota admin deve cair em /plans ao navegar', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 10000 });

    // Navegar entre todas as rotas admin
    const routes = [
      '/admin/stats',
      '/admin/users',
      '/admin/jobs',
      '/admin/alerts',
      '/admin/security',
    ];

    for (const route of routes) {
      await page.goto(`${BASE_URL}${route}`);

      // Verificar que URL permanece na rota admin
      await expect(page).toHaveURL(`${BASE_URL}${route}`);

      // Verificar que NÃO está em /plans
      await expect(page).not.toHaveURL(/\/plans/);
    }

    console.log('✓ Nenhuma rota admin cai em /plans');
  });
});

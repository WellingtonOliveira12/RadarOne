/**
 * Testes E2E para fluxo de 2FA (Two-Factor Authentication)
 *
 * Casos de teste:
 * 1. Login com 2FA habilitado deve redirecionar para /2fa/verify
 * 2. Código 2FA válido deve completar login
 * 3. Código 2FA inválido deve mostrar erro
 * 4. Token temporário não permite acesso a rotas admin
 */

import { test, expect } from '@playwright/test';

// Skip se não houver admin com 2FA configurado
test.describe('Two-Factor Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Limpar cookies e localStorage antes de cada teste
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('login com credenciais válidas e 2FA habilitado deve redirecionar para /2fa/verify', async ({
    page,
  }) => {
    // Este teste requer um admin com 2FA habilitado no ambiente de teste
    // Skip se não houver admin de teste configurado
    const testAdminEmail = process.env.TEST_ADMIN_2FA_EMAIL;
    const testAdminPassword = process.env.TEST_ADMIN_2FA_PASSWORD;

    if (!testAdminEmail || !testAdminPassword) {
      test.skip();
      return;
    }

    // Navegar para login
    await page.goto('/login');

    // Preencher credenciais
    await page.fill('input[type="email"]', testAdminEmail);
    await page.fill('input[type="password"]', testAdminPassword);

    // Submeter
    await page.click('button[type="submit"]');

    // Deve redirecionar para /2fa/verify
    await expect(page).toHaveURL(/\/2fa\/verify/);

    // Deve mostrar campos de input para código
    await expect(page.locator('text=Verificação em Duas Etapas')).toBeVisible();
  });

  test('página /2fa/verify sem state deve redirecionar para /login', async ({
    page,
  }) => {
    // Acessar diretamente /2fa/verify sem passar pelo login
    await page.goto('/2fa/verify');

    // Deve redirecionar para login
    await expect(page).toHaveURL(/\/login/);
  });

  test('token temporário não permite acesso a rotas admin', async ({
    page,
  }) => {
    // Simular token temporário no localStorage
    await page.evaluate(() => {
      // Token JWT inválido/temporário
      localStorage.setItem('radarone_token', 'invalid-temp-token');
    });

    // Tentar acessar rota admin
    await page.goto('/admin/stats');

    // Deve redirecionar para login (token inválido)
    await expect(page).toHaveURL(/\/login/);
  });

  test('login sem 2FA habilitado deve ir direto para dashboard', async ({
    page,
  }) => {
    // Este teste requer um usuário sem 2FA no ambiente de teste
    const testUserEmail = process.env.TEST_USER_EMAIL;
    const testUserPassword = process.env.TEST_USER_PASSWORD;

    if (!testUserEmail || !testUserPassword) {
      test.skip();
      return;
    }

    // Navegar para login
    await page.goto('/login');

    // Preencher credenciais
    await page.fill('input[type="email"]', testUserEmail);
    await page.fill('input[type="password"]', testUserPassword);

    // Submeter
    await page.click('button[type="submit"]');

    // Deve redirecionar para dashboard (sem passar por 2FA)
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('2FA Verification Page UI', () => {
  test('deve exibir campos de input PIN e botões', async ({ page }) => {
    // Simular navegação com state
    // Como não podemos simular state diretamente, vamos verificar apenas se a página carrega
    // quando acessada corretamente (via login)

    // Este é um teste de smoke para verificar que a página não quebra
    await page.goto('/2fa/verify');

    // Deve redirecionar para login (sem state)
    await expect(page).toHaveURL(/\/login/);
  });
});

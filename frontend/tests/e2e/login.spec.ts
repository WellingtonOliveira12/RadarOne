import { test, expect } from '@playwright/test';
import { TEST_USER, clearStorage, setupCommonMocks } from './helpers';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);

    // Setup common mocks para testes que fazem login
    await setupCommonMocks(page, 'USER');

    // Mock da API de login
    await page.route('**/api/auth/login', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();

      if (postData.email === TEST_USER.email && postData.password === TEST_USER.password) {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            token: 'mock-jwt-token',
            user: { id: '1', name: TEST_USER.name, email: TEST_USER.email, role: 'USER' },
          }),
        });
      } else {
        await route.fulfill({
          status: 401,
          body: JSON.stringify({ error: 'Credenciais inválidas' }),
        });
      }
    });

    // Mock da API de monitores
    await page.route('**/api/monitors', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: [], count: 0 }),
      });
    });
  });

  test('deve exibir a página de login corretamente', async ({ page }) => {
    await page.goto('/login');

    await expect(page).toHaveTitle(/RadarOne/);
    await expect(page.locator('h1, h2').filter({ hasText: /Login/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('deve mostrar erro ao tentar login com campos vazios', async ({ page }) => {
    await page.goto('/login');

    await page.click('button[type="submit"]');

    // HTML5 validation deve impedir o submit
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveAttribute('required');
  });

  test('deve mostrar erro ao tentar login com credenciais inválidas', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'invalid@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Aguarda mensagem de erro (toast ou alert)
    await page.waitForSelector('text=/erro|inválid|incorret/i', { timeout: 5000 });
  });

  test('deve fazer login com sucesso e redirecionar para dashboard', async ({ page }) => {
    await page.goto('/login');

    // Aguardar página carregar (AuthProvider montar)
    await page.waitForLoadState('networkidle');

    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // Aguarda redirecionamento (useAuth agora atualiza contexto corretamente)
    await page.waitForURL(/\/(dashboard|monitors)/, { timeout: 10000 });

    // Verifica se está autenticado
    const url = page.url();
    expect(url).toMatch(/\/(dashboard|monitors)/);
  });

  test('deve ter link para "Esqueci minha senha"', async ({ page }) => {
    await page.goto('/login');

    const forgotPasswordLink = page.locator('a', { hasText: /esqueci|forgot/i });
    await expect(forgotPasswordLink).toBeVisible();

    await forgotPasswordLink.click();
    await page.waitForURL('/forgot-password', { timeout: 5000 });
  });

  test('deve ter link para "Criar conta"', async ({ page }) => {
    await page.goto('/login');

    const registerLink = page.locator('a', { hasText: /criar conta|cadastr|register/i });
    await expect(registerLink).toBeVisible();
  });
});

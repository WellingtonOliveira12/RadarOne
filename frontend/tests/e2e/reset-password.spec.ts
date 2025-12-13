import { test, expect } from '@playwright/test';
import { clearStorage } from './helpers';

test.describe('Reset Password Flow', () => {
  const MOCK_TOKEN = 'mock-reset-token-123';

  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('deve exibir a página de redefinição de senha com token', async ({ page }) => {
    await page.goto(`/reset-password?token=${MOCK_TOKEN}`);

    await expect(page.locator('h1, h2').filter({ hasText: /redefin|reset|nova senha/i })).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('deve exibir erro quando token não é fornecido', async ({ page }) => {
    await page.goto('/reset-password');

    // Deve mostrar erro de token inválido ou redirecionar
    await page.waitForSelector('text=/token|inválido|expirado/i', { timeout: 5000 });
  });

  test('deve validar campos de senha obrigatórios', async ({ page }) => {
    await page.goto(`/reset-password?token=${MOCK_TOKEN}`);

    await page.click('button[type="submit"]');

    // HTML5 validation
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toHaveAttribute('required');
  });

  test('deve validar que as senhas coincidem', async ({ page }) => {
    await page.goto(`/reset-password?token=${MOCK_TOKEN}`);

    const passwordInputs = page.locator('input[type="password"]');

    await passwordInputs.first().fill('NovaSenh@123');
    await passwordInputs.last().fill('SenhaDiferente123');
    await page.click('button[type="submit"]');

    // Aguarda mensagem de erro
    await page.waitForSelector('text=/não coincidem|diferentes|match/i', { timeout: 5000 });
  });

  test('deve validar tamanho mínimo da senha', async ({ page }) => {
    await page.goto(`/reset-password?token=${MOCK_TOKEN}`);

    const passwordInputs = page.locator('input[type="password"]');

    await passwordInputs.first().fill('123');
    await passwordInputs.last().fill('123');
    await page.click('button[type="submit"]');

    // Aguarda mensagem de erro sobre tamanho mínimo
    await page.waitForSelector('text=/mínimo|caracteres|curta/i', { timeout: 5000 });
  });

  test('deve redefinir senha com sucesso', async ({ page }) => {
    await page.goto(`/reset-password?token=${MOCK_TOKEN}`);

    // Mock da API de reset
    await page.route('**/api/auth/reset-password', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, message: 'Senha redefinida com sucesso' }),
      });
    });

    const passwordInputs = page.locator('input[type="password"]');

    await passwordInputs.first().fill('NovaSenh@123');
    await passwordInputs.last().fill('NovaSenh@123');
    await page.click('button[type="submit"]');

    // Aguarda mensagem de sucesso
    await page.waitForSelector('text=/sucesso|redefinida|alterada/i', { timeout: 5000 });
  });

  test('deve redirecionar para login após reset bem-sucedido', async ({ page }) => {
    await page.goto(`/reset-password?token=${MOCK_TOKEN}`);

    // Mock da API
    await page.route('**/api/auth/reset-password', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      });
    });

    const passwordInputs = page.locator('input[type="password"]');

    await passwordInputs.first().fill('NovaSenh@123');
    await passwordInputs.last().fill('NovaSenh@123');
    await page.click('button[type="submit"]');

    // Aguarda redirecionamento para login
    await page.waitForURL('/login', { timeout: 10000 });
  });
});

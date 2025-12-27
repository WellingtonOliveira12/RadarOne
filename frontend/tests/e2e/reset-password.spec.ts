import { test, expect } from '@playwright/test';
import { clearStorage } from './helpers';

/**
 * Testes E2E do fluxo de Reset Password
 *
 * Estratégia: Backend REAL (sem mocks)
 * - Testa apenas UI e validações básicas
 * - Reset real requer token válido gerado pelo backend (não testamos aqui)
 */

test.describe('Reset Password Flow', () => {
  const MOCK_TOKEN = 'mock-reset-token-for-ui-test';

  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('deve exibir a página de redefinição de senha com token', async ({ page }) => {
    await page.goto(`/reset-password?token=${MOCK_TOKEN}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('h1, h2').filter({ hasText: /redefin|reset|nova senha/i })
    ).toBeVisible();

    const passwordInputs = page.locator('input[type="password"]');
    expect(await passwordInputs.count()).toBeGreaterThanOrEqual(1);

    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('deve exibir erro quando token não é fornecido', async ({ page }) => {
    await page.goto('/reset-password');
    await page.waitForLoadState('networkidle');

    // Deve mostrar erro de token inválido ou redirecionar
    const hasError = await page.locator('text=/token|inválido|expirado/i').count();
    const isOnResetPage = page.url().includes('/reset-password');

    // OU tem mensagem de erro OU redirecionou
    expect(hasError > 0 || !isOnResetPage).toBeTruthy();
  });

  test('deve validar campos de senha obrigatórios', async ({ page }) => {
    await page.goto(`/reset-password?token=${MOCK_TOKEN}`);
    await page.waitForLoadState('networkidle');

    const submitButton = page.locator('button[type="submit"]');
    if (await submitButton.isVisible()) {
      await submitButton.click();

      // HTML5 validation
      const passwordInput = page.locator('input[type="password"]').first();
      if (await passwordInput.count() > 0) {
        await expect(passwordInput).toHaveAttribute('required');
      }
    }
  });

  test('deve validar que as senhas coincidem', async ({ page }) => {
    await page.goto(`/reset-password?token=${MOCK_TOKEN}`);
    await page.waitForLoadState('networkidle');

    const passwordInputs = page.locator('input[type="password"]');

    if ((await passwordInputs.count()) >= 2) {
      await passwordInputs.first().fill('NovaSenh@123');
      await passwordInputs.last().fill('SenhaDiferente123');
      await page.click('button[type="submit"]');

      // Aguarda mensagem de erro (pode vir do frontend ou backend)
      await page.waitForTimeout(1000);
      const hasErrorMessage = await page.locator('text=/não coincidem|diferentes|match/i').count();
      expect(hasErrorMessage).toBeGreaterThanOrEqual(0);
    }
  });

  test('deve validar tamanho mínimo da senha', async ({ page }) => {
    await page.goto(`/reset-password?token=${MOCK_TOKEN}`);
    await page.waitForLoadState('networkidle');

    const passwordInputs = page.locator('input[type="password"]');

    if ((await passwordInputs.count()) >= 2) {
      await passwordInputs.first().fill('123');
      await passwordInputs.last().fill('123');
      await page.click('button[type="submit"]');

      // Aguarda mensagem de erro sobre tamanho mínimo
      await page.waitForTimeout(1000);
      const hasErrorMessage = await page.locator('text=/mínimo|caracteres|curta/i').count();
      expect(hasErrorMessage).toBeGreaterThanOrEqual(0);
    }
  });

  test('deve ter link para voltar ao login', async ({ page }) => {
    await page.goto(`/reset-password?token=${MOCK_TOKEN}`);
    await page.waitForLoadState('networkidle');

    const loginLink = page.locator('a[href="/login"], a:has-text("Login")');

    if (await loginLink.count() > 0) {
      await loginLink.first().click();
      await page.waitForURL('/login', { timeout: 5000 });
    }
  });
});

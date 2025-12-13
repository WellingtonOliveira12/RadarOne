import { test, expect } from '@playwright/test';
import { clearStorage } from './helpers';

test.describe('Forgot Password Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('deve exibir a página de recuperação de senha', async ({ page }) => {
    await page.goto('/forgot-password');

    await expect(page.locator('h1, h2').filter({ hasText: /esquec|forgot|recuper/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('deve validar email obrigatório', async ({ page }) => {
    await page.goto('/forgot-password');

    await page.click('button[type="submit"]');

    // HTML5 validation
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveAttribute('required');
  });

  test('deve validar formato de email', async ({ page }) => {
    await page.goto('/forgot-password');

    await page.fill('input[type="email"]', 'emailinvalido');
    await page.click('button[type="submit"]');

    // Verificar se o browser não permite submit com email inválido
    const emailInput = page.locator('input[type="email"]');
    const validationMessage = await emailInput.evaluate((el: HTMLInputElement) => el.validationMessage);
    expect(validationMessage).toBeTruthy();
  });

  test('deve enviar solicitação de reset com email válido', async ({ page }) => {
    await page.goto('/forgot-password');

    await page.fill('input[type="email"]', 'test@radarone.com');
    await page.click('button[type="submit"]');

    // Aguarda mensagem de sucesso
    await page.waitForSelector('text=/enviado|email|link/i', { timeout: 5000 });

    // Verifica se há mensagem de confirmação
    const successMessage = page.locator('text=/enviado|email|link/i');
    await expect(successMessage).toBeVisible();
  });

  test('deve ter link para voltar ao login', async ({ page }) => {
    await page.goto('/forgot-password');

    const loginLink = page.locator('a', { hasText: /voltar|login|entrar/i });
    await expect(loginLink).toBeVisible();

    await loginLink.click();
    await page.waitForURL('/login', { timeout: 5000 });
  });

  test('deve desabilitar botão durante o envio', async ({ page }) => {
    await page.goto('/forgot-password');

    await page.fill('input[type="email"]', 'test@radarone.com');

    // Intercepta a requisição para torná-la lenta
    await page.route('**/api/auth/forgot-password', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Verifica se botão está desabilitado durante loading
    await expect(submitButton).toBeDisabled();
  });
});

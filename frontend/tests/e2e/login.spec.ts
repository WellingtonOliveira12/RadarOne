import { test, expect } from '@playwright/test';
import { E2E_USERS, clearStorage, loginReal } from './helpers';

/**
 * Testes E2E do fluxo de Login
 *
 * Estratégia: Backend REAL + Seed E2E + Login REAL
 * - Sem mocks de API
 * - Credenciais reais criadas pelo seed (backend/prisma/seed-e2e.ts)
 */

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
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
    // Backend real vai retornar 401 e frontend vai mostrar erro
    await page.waitForSelector('text=/erro|inválid|incorret/i', { timeout: 5000 });
  });

  test('deve fazer login com sucesso e redirecionar para dashboard/monitors', async ({ page }) => {
    await page.goto('/login');

    // Aguardar página carregar (AuthProvider montar)
    await page.waitForLoadState('networkidle');

    // Preencher com credenciais REAIS do seed
    await page.fill('input[type="email"]', E2E_USERS.USER.email);
    await page.fill('input[type="password"]', E2E_USERS.USER.password);
    await page.click('button[type="submit"]');

    // Aguarda redirecionamento (backend REAL vai validar e retornar JWT válido)
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

  test('admin deve conseguir fazer login', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Login com credenciais de ADMIN do seed
    await page.fill('input[type="email"]', E2E_USERS.ADMIN.email);
    await page.fill('input[type="password"]', E2E_USERS.ADMIN.password);
    await page.click('button[type="submit"]');

    // Aguarda redirecionamento
    await page.waitForURL(/\/(dashboard|monitors)/, { timeout: 10000 });

    // Verifica se redirecionou
    const url = page.url();
    expect(url).toMatch(/\/(dashboard|monitors)/);
  });

  test('deve persistir sessão após refresh', async ({ page }) => {
    // Fazer login
    await loginReal(page, 'USER');

    // Pegar URL atual
    const currentURL = page.url();

    // Refresh
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Deve continuar na mesma URL (não redirecionar para /login)
    expect(page.url()).toBe(currentURL);
  });
});

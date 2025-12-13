import { Page } from '@playwright/test';

/**
 * Helpers compartilhados para testes E2E
 */

export const TEST_USER = {
  email: 'e2e-test@radarone.com',
  password: 'Test123456!',
  name: 'E2E Test User',
};

/**
 * Realiza login no sistema
 */
export async function login(page: Page, email = TEST_USER.email, password = TEST_USER.password) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Aguarda redirecionamento ou toast de sucesso
  await page.waitForURL(/\/(dashboard|monitors)/, { timeout: 5000 });
}

/**
 * Realiza logout
 */
export async function logout(page: Page) {
  await page.click('text=Sair');
  await page.waitForURL('/login', { timeout: 5000 });
}

/**
 * Aguarda toast aparecer
 */
export async function waitForToast(page: Page, message?: string) {
  if (message) {
    await page.waitForSelector(`text=${message}`, { timeout: 5000 });
  } else {
    // Aguarda qualquer toast do Chakra UI
    await page.waitForSelector('[role="status"]', { timeout: 5000 });
  }
}

/**
 * Limpa localStorage
 */
export async function clearStorage(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

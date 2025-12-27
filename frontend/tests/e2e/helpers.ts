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
 * Configura mocks comuns necessários para testes autenticados
 */
export async function setupCommonMocks(page: Page, userRole: 'USER' | 'ADMIN' = 'USER') {
  // Mock do endpoint /api/auth/me usado pelo TrialBanner e outros componentes
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        user: {
          id: '1',
          email: TEST_USER.email,
          name: TEST_USER.name,
          role: userRole,
          subscriptions: [
            {
              status: 'ACTIVE',
              plan: { name: 'Free' },
            },
          ],
        },
      }),
    });
  });
}

/**
 * Realiza login no sistema
 */
export async function login(page: Page, email = TEST_USER.email, password = TEST_USER.password) {
  await page.goto('/login');

  // Aguardar página carregar completamente (AuthProvider montar)
  await page.waitForLoadState('networkidle');

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Aguarda redirecionamento (agora funciona com useAuth)
  await page.waitForURL(/\/(dashboard|monitors)/, { timeout: 10000 });
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
 * Limpa localStorage e sessionStorage
 * IMPORTANTE: Navega para baseURL primeiro para estabelecer origin
 */
export async function clearStorage(page: Page) {
  // Navegar para baseURL para estabelecer context de origin
  // Isso previne SecurityError ao acessar localStorage
  await page.goto('/');

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

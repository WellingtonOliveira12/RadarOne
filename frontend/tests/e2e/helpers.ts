import { Page } from '@playwright/test';

/**
 * Helpers para testes E2E REAIS (sem mocks)
 *
 * Estratégia: Backend REAL + Seed E2E + Login REAL + Token JWT válido
 *
 * IMPORTANTE:
 * - Não use mocks de API (page.route)
 * - Todos os requests vão para o backend real
 * - Usuários e dados são criados pelo seed E2E (backend/prisma/seed-e2e.ts)
 */

/**
 * Credenciais dos usuários E2E (criados pelo seed)
 */
export const E2E_USERS = {
  USER: {
    email: 'e2e-test@radarone.com',
    password: 'Test123456!',
    name: 'E2E Test User',
    role: 'USER',
  },
  ADMIN: {
    email: 'e2e-admin@radarone.com',
    password: 'Admin123456!',
    name: 'E2E Admin User',
    role: 'ADMIN',
  },
  TRIAL: {
    email: 'e2e-trial@radarone.com',
    password: 'Trial123456!',
    name: 'E2E Trial User',
    role: 'USER',
  },
} as const;

/**
 * Limpa localStorage e sessionStorage
 * IMPORTANTE: Navega para baseURL primeiro para estabelecer origin
 */
export async function clearStorage(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/**
 * Faz login REAL no sistema via UI
 *
 * Fluxo:
 * 1. Navega para /login
 * 2. Preenche credenciais REAIS
 * 3. Submete formulário
 * 4. Backend valida e retorna JWT REAL
 * 5. RadarOne salva token no localStorage
 * 6. Aguarda redirecionamento para /monitors ou /dashboard
 *
 * @param page - Página do Playwright
 * @param userType - Tipo de usuário (USER, ADMIN, TRIAL)
 */
export async function loginReal(
  page: Page,
  userType: keyof typeof E2E_USERS = 'USER'
): Promise<void> {
  const user = E2E_USERS[userType];

  console.log(`[E2E] Fazendo login real como: ${user.email}`);

  await page.goto('/login');

  // Aguardar página carregar completamente
  await page.waitForLoadState('networkidle');

  // Preencher formulário
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);

  // Submit
  await page.click('button[type="submit"]');

  // Aguardar redirecionamento (login real pode levar alguns ms)
  await page.waitForURL(/\/(dashboard|monitors)/, { timeout: 10000 });

  console.log(`[E2E] Login real bem-sucedido: ${page.url()}`);
}

/**
 * Faz logout
 */
export async function logout(page: Page) {
  // Procurar botão/link de logout (pode variar entre "Sair", "Logout", etc.)
  const logoutButton = page.locator('text=Sair, text=Logout, button:has-text("Sair")').first();

  if (await logoutButton.isVisible({ timeout: 2000 })) {
    await logoutButton.click();
    await page.waitForURL('/login', { timeout: 5000 });
  } else {
    // Fallback: limpar storage manualmente
    await clearStorage(page);
    await page.goto('/login');
  }
}

/**
 * Aguarda toast aparecer (Chakra UI)
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
 * Aguarda elemento aparecer com timeout customizado
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout: number = 5000
) {
  await page.waitForSelector(selector, { timeout });
}

/**
 * Aguarda elemento desaparecer
 */
export async function waitForElementToDisappear(
  page: Page,
  selector: string,
  timeout: number = 5000
) {
  await page.waitForSelector(selector, { state: 'hidden', timeout });
}

/**
 * Aguarda requests de API específicos terminarem
 *
 * Útil quando você sabe que uma página vai fazer requests e quer esperar
 * todos terminarem antes de fazer assertions.
 */
export async function waitForAPIRequest(
  page: Page,
  urlPattern: string | RegExp,
  timeout: number = 5000
): Promise<void> {
  await page.waitForResponse((response) => {
    const url = response.url();
    if (typeof urlPattern === 'string') {
      return url.includes(urlPattern);
    }
    return urlPattern.test(url);
  }, { timeout });
}

/**
 * Helper para debug: imprime todos os requests /api/** feitos pela página
 *
 * Útil para diagnosticar se requests estão indo para o backend ou sendo bloqueados.
 */
export function debugAPIRequests(page: Page) {
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/')) {
      console.log(`[E2E REQUEST] ${request.method()} ${url}`);
    }
  });

  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      console.log(`[E2E RESPONSE] ${response.status()} ${url}`);
    }
  });
}

/**
 * Helper para debug: imprime erros de console do browser
 */
export function debugConsoleErrors(page: Page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error(`[BROWSER CONSOLE ERROR] ${msg.text()}`);
    }
  });

  page.on('pageerror', (error) => {
    console.error(`[BROWSER PAGE ERROR] ${error.message}`);
  });
}

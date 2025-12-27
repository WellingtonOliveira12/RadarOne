import { test, expect } from '@playwright/test';
import { clearStorage, TEST_USER } from './helpers';

/**
 * Testes E2E para fluxo de Trial
 * Agora usando mocks para simular diferentes estados de trial
 */

test.describe('Trial Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Forçar variante A para testes determinísticos (A/B testing)
    await page.addInitScript(() => {
      sessionStorage.setItem('ab_test_trialExpiredToast', 'A');
      sessionStorage.setItem('ab_test_trialExpiredBanner', 'A');
      sessionStorage.setItem('ab_test_trialExpiringBanner', 'A');
    });

    await clearStorage(page);

    // Mock comum de login
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          token: 'mock-jwt-token',
          user: { id: '1', name: TEST_USER.name, email: TEST_USER.email, role: 'USER' },
        }),
      });
    });

    // Mock comum de monitores
    await page.route('**/api/monitors', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: [], count: 0 }),
      });
    });
  });

  test('deve mostrar banner de trial expirando quando faltam poucos dias', async ({ page }) => {
    // Mock de /api/auth/me com trial expirando em 2 dias
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 2);

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: {
            id: '1',
            email: TEST_USER.email,
            name: TEST_USER.name,
            role: 'USER',
            subscriptions: [
              {
                status: 'TRIAL',
                trialEndsAt: trialEndsAt.toISOString(),
                plan: { name: 'Free' },
              },
            ],
          },
        }),
      });
    });

    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|monitors)/, { timeout: 10000 });

    // Navegar para monitors
    await page.goto('/monitors');

    // Verificar se banner de trial aparece
    await expect(page.locator('text=/Seu trial expira em \\d+ dias?/i')).toBeVisible({
      timeout: 5000,
    });

    // Verificar botão "Ver planos"
    const verPlanosButton = page.locator('a:has-text("Ver planos")');
    await expect(verPlanosButton).toBeVisible();

    // Clicar no botão deve ir para /plans
    await verPlanosButton.click();
    await page.waitForURL('/plans');
  });

  test('deve redirecionar para /plans quando trial expirar (403 TRIAL_EXPIRED)', async ({ page }) => {
    // Mock de /api/auth/me com trial expirado
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() - 1);

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: {
            id: '1',
            email: TEST_USER.email,
            name: TEST_USER.name,
            role: 'USER',
            subscriptions: [
              {
                status: 'TRIAL',
                trialEndsAt: trialEndsAt.toISOString(),
                plan: { name: 'Free' },
              },
            ],
          },
        }),
      });
    });

    // Mock de /api/monitors retornando 403 TRIAL_EXPIRED
    await page.route('**/api/monitors', async (route) => {
      await route.fulfill({
        status: 403,
        body: JSON.stringify({
          error: 'Seu período de teste gratuito expirou. Assine um plano para continuar.',
          errorCode: 'TRIAL_EXPIRED',
        }),
      });
    });

    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|monitors)/, { timeout: 10000 });

    // Tentar acessar /monitors (deve redirecionar para /plans por causa do interceptor)
    await page.goto('/monitors');

    // Deve redirecionar para /plans com query param
    await page.waitForURL(/\/plans\?reason=trial_expired/, { timeout: 10000 });

    // Verificar banner de trial expirado
    await expect(page.locator('text=/Seu período grátis expirou/i')).toBeVisible();
  });

  test('deve mostrar banner de trial expirado em /plans com query param', async ({ page }) => {
    // Acessar /plans com query param
    await page.goto('/plans?reason=trial_expired');

    // Verificar banner amarelo de trial expirado
    await expect(page.locator('text=/Seu período grátis expirou/i')).toBeVisible();
    await expect(page.locator('text=/Assine um plano para continuar/i')).toBeVisible();
  });

  test('não deve mostrar banner de trial se o usuário não está em trial', async ({ page }) => {
    // Mock de /api/auth/me com assinatura ACTIVE
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: {
            id: '1',
            email: TEST_USER.email,
            name: TEST_USER.name,
            role: 'USER',
            subscriptions: [
              {
                status: 'ACTIVE',
                plan: { name: 'Pro' },
              },
            ],
          },
        }),
      });
    });

    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|monitors)/, { timeout: 10000 });

    // Navegar para monitors
    await page.goto('/monitors');

    // Aguardar página carregar
    await page.waitForLoadState('networkidle');

    // Banner NÃO deve aparecer
    await expect(page.locator('text=/Seu trial expira/i')).not.toBeVisible();
  });

  test('não deve mostrar banner se trial ainda tem mais de 7 dias', async ({ page }) => {
    // Mock de /api/auth/me com trial de 10 dias
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 10);

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: {
            id: '1',
            email: TEST_USER.email,
            name: TEST_USER.name,
            role: 'USER',
            subscriptions: [
              {
                status: 'TRIAL',
                trialEndsAt: trialEndsAt.toISOString(),
                plan: { name: 'Free' },
              },
            ],
          },
        }),
      });
    });

    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|monitors)/, { timeout: 10000 });

    // Navegar para monitors
    await page.goto('/monitors');

    // Aguardar página carregar
    await page.waitForLoadState('networkidle');

    // Banner NÃO deve aparecer (só aparece entre 1-7 dias)
    await expect(page.locator('text=/Seu trial expira/i')).not.toBeVisible();
  });
});

test.describe('Register Flow - Duplicate User', () => {
  test('deve mostrar mensagem clara ao cadastrar com email existente', async ({ page }) => {
    // Mock de registro retornando erro de duplicata
    await page.route('**/api/auth/register', async (route) => {
      await route.fulfill({
        status: 400,
        body: JSON.stringify({
          error: 'Você já tem cadastro com este email',
        }),
      });
    });

    // Ir para página de registro
    await page.goto('/register');

    // Preencher com email já existente
    await page.fill('input[name="name"]', 'Teste Duplicado');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="cpf"]', '123.456.789-00');
    await page.fill('input[name="phone"]', '(11) 98765-4321');
    await page.fill('input[name="password"]', 'Senha123!');
    await page.fill('input[name="confirmPassword"]', 'Senha123!');

    // Submeter formulário
    await page.click('button[type="submit"]');

    // Aguardar mensagem de erro
    await expect(page.locator('text=/Você já tem cadastro/i')).toBeVisible({ timeout: 5000 });

    // Verificar link para login
    const loginLink = page.locator('a:has-text("Ir para login")');
    await expect(loginLink).toBeVisible();

    // Clicar no link deve ir para /login
    await loginLink.click();
    await page.waitForURL('/login');
  });
});

test.describe('Login Flow', () => {
  test('deve redirecionar automaticamente para /monitors após login', async ({ page }) => {
    // Mock de /api/auth/me
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: {
            id: '1',
            email: TEST_USER.email,
            name: TEST_USER.name,
            role: 'USER',
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

    // Mock de /api/auth/login
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          token: 'mock-jwt-token',
          user: { id: '1', name: TEST_USER.name, email: TEST_USER.email, role: 'USER' },
        }),
      });
    });

    // Mock de /api/monitors
    await page.route('**/api/monitors', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: [], count: 0 }),
      });
    });

    // Ir para página de login
    await page.goto('/login');

    // Fazer login
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // Deve redirecionar para /monitors
    await page.waitForURL(/\/monitors/, { timeout: 10000 });
  });
});

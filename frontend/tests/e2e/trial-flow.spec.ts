import { test, expect } from '@playwright/test';
import { login, clearStorage, TEST_USER } from './helpers';

/**
 * Testes E2E para fluxo de Trial
 *
 * IMPORTANTE: Alguns testes requerem manipulação manual do banco de dados.
 * Veja instruções em backend/tests/helpers/trial-helpers.sql
 */

test.describe('Trial Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('deve mostrar banner de trial expirando quando faltam poucos dias', async ({ page }) => {
    /**
     * PRÉ-REQUISITO: Usuário de teste com trial expirando em 2-3 dias
     *
     * Para configurar manualmente:
     * UPDATE subscriptions
     * SET trial_ends_at = NOW() + INTERVAL '2 days'
     * WHERE user_id = (SELECT id FROM users WHERE email = 'e2e-test@radarone.com')
     *   AND status = 'TRIAL';
     */

    // Login
    await login(page);

    // Navegar para monitors
    await page.goto('/monitors');

    // Verificar se banner de trial aparece
    await expect(page.locator('text=/Seu trial expira em \\d+ dias?/i')).toBeVisible({
      timeout: 5000
    });

    // Verificar botão "Ver planos"
    const verPlanosButton = page.locator('a:has-text("Ver planos")');
    await expect(verPlanosButton).toBeVisible();

    // Clicar no botão deve ir para /plans
    await verPlanosButton.click();
    await page.waitForURL('/plans');
  });

  test('deve redirecionar para /plans quando trial expirar (403 TRIAL_EXPIRED)', async ({ page }) => {
    /**
     * PRÉ-REQUISITO: Usuário de teste com trial EXPIRADO
     *
     * Para configurar manualmente:
     * UPDATE subscriptions
     * SET trial_ends_at = NOW() - INTERVAL '1 day', status = 'TRIAL'
     * WHERE user_id = (SELECT id FROM users WHERE email = 'e2e-test@radarone.com');
     */

    // Login
    await login(page);

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
    /**
     * PRÉ-REQUISITO: Usuário de teste com assinatura ACTIVE (paga)
     *
     * Para configurar manualmente:
     * UPDATE subscriptions
     * SET status = 'ACTIVE', is_trial = false
     * WHERE user_id = (SELECT id FROM users WHERE email = 'e2e-test@radarone.com');
     */

    // Login
    await login(page);

    // Navegar para monitors
    await page.goto('/monitors');

    // Aguardar página carregar
    await page.waitForLoadState('networkidle');

    // Banner NÃO deve aparecer
    await expect(page.locator('text=/Seu trial expira/i')).not.toBeVisible();
  });

  test('não deve mostrar banner se trial ainda tem mais de 7 dias', async ({ page }) => {
    /**
     * PRÉ-REQUISITO: Usuário de teste com trial de 10+ dias
     *
     * Para configurar manualmente:
     * UPDATE subscriptions
     * SET trial_ends_at = NOW() + INTERVAL '10 days'
     * WHERE user_id = (SELECT id FROM users WHERE email = 'e2e-test@radarone.com')
     *   AND status = 'TRIAL';
     */

    // Login
    await login(page);

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
    // Ir para página de registro
    await page.goto('/register');

    // Preencher com email já existente
    await page.fill('input[name="name"]', 'Teste Duplicado');
    await page.fill('input[name="email"]', TEST_USER.email); // Email que já existe
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
    await page.goto('/login');

    // Preencher formulário
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);

    // Submit
    await page.click('button[type="submit"]');

    // Deve redirecionar automaticamente (não ficar na tela de login)
    await page.waitForURL(/\/(dashboard|monitors)/, { timeout: 5000 });

    // Verificar que não está mais em /login
    expect(page.url()).not.toContain('/login');
  });
});

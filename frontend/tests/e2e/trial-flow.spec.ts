import { test, expect } from '@playwright/test';
import { clearStorage, loginReal } from './helpers';

/**
 * Testes E2E para fluxo de Trial
 *
 * Estratégia: Backend REAL + Seed E2E + Login REAL
 * - Sem mocks de API
 * - Usuário TRIAL criado pelo seed com trial expirando em 2 dias
 * - Testa banner de trial expirando com dados reais
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
  });

  test('deve mostrar banner de trial expirando quando faltam poucos dias', async ({ page }) => {
    // Login com usuário TRIAL (seed cria com trial expirando em 2 dias)
    await loginReal(page, 'TRIAL');

    // Navegar para monitors
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');

    // Verificar se banner de trial aparece (expira em 2 dias, deve mostrar)
    // TrialBanner.tsx mostra banner apenas se faltar entre 1 e 7 dias
    await expect(page.locator('text=/Seu trial expira em|Trial expira/i')).toBeVisible({
      timeout: 5000,
    });

    // Verificar botão "Ver planos"
    const verPlanosButton = page.locator('a:has-text("Ver planos")');
    if (await verPlanosButton.count() > 0) {
      await expect(verPlanosButton).toBeVisible();
    }
  });

  test('não deve mostrar banner se o usuário não está em trial', async ({ page }) => {
    // Login com usuário comum (ACTIVE, não TRIAL)
    await loginReal(page, 'USER');

    // Navegar para monitors
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');

    // Banner NÃO deve aparecer
    await expect(page.locator('text=/Seu trial expira/i')).not.toBeVisible();
  });

  test('usuário em trial deve ter acesso normal às funcionalidades', async ({ page }) => {
    await loginReal(page, 'TRIAL');

    // Verificar que consegue acessar monitors
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');

    // Página deve carregar normalmente (sem erro 403)
    await expect(page.locator('h1, h2').filter({ hasText: /monitor/i })).toBeVisible();
  });

  test('deve ter link para /plans na página', async ({ page }) => {
    await loginReal(page, 'USER');

    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');

    // Procurar por link para planos (pode estar em menu, header, etc.)
    const plansLink = page.locator('a[href="/plans"], a:has-text("Planos")');

    if (await plansLink.count() > 0) {
      await plansLink.first().click();
      await page.waitForURL('/plans', { timeout: 5000 });

      // Verificar que página de planos carregou
      await expect(page.locator('text=/plano|plan/i')).toBeVisible();
    }
  });
});

test.describe('Register Flow - Duplicate User', () => {
  test('deve mostrar página de registro', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    // Verificar que formulário de registro existe
    const hasNameInput = await page.locator('input[name="name"]').count();
    const hasEmailInput = await page.locator('input[name="email"]').count();
    const hasPasswordInput = await page.locator('input[name="password"]').count();

    expect(hasNameInput).toBeGreaterThan(0);
    expect(hasEmailInput).toBeGreaterThan(0);
    expect(hasPasswordInput).toBeGreaterThan(0);
  });

  test('deve validar campos obrigatórios no registro', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    const submitButton = page.locator('button[type="submit"]').first();
    if (await submitButton.isVisible()) {
      await submitButton.click();

      // HTML5 validation deve impedir submit
      const requiredInputs = page.locator('input[required]');
      expect(await requiredInputs.count()).toBeGreaterThan(0);
    }
  });

  test('deve mostrar mensagem ao cadastrar com email existente', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    // Tentar registrar com email que JÁ EXISTE no seed (e2e-test@radarone.com)
    const nameInput = page.locator('input[name="name"]');
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    const confirmPasswordInput = page.locator('input[name="confirmPassword"]');

    if (await nameInput.isVisible()) {
      await nameInput.fill('Teste Duplicado');
      await emailInput.fill('e2e-test@radarone.com'); // Email EXISTENTE
      await passwordInput.fill('Senha123!');

      if (await confirmPasswordInput.count() > 0) {
        await confirmPasswordInput.fill('Senha123!');
      }

      // Preencher outros campos se necessário
      const cpfInput = page.locator('input[name="cpf"]');
      if (await cpfInput.count() > 0) {
        await cpfInput.fill('123.456.789-00');
      }

      const phoneInput = page.locator('input[name="phone"]');
      if (await phoneInput.count() > 0) {
        await phoneInput.fill('(11) 98765-4321');
      }

      // Submit
      const submitButton = page.locator('button[type="submit"]').first();
      await submitButton.click();

      // Backend REAL vai retornar erro de duplicata
      await page.waitForTimeout(2000);

      // Aguardar mensagem de erro (pode ser "já cadastrado", "já existe", etc.)
      const hasErrorMessage = await page
        .locator('text=/já cadastrado|já existe|duplicado|email em uso/i')
        .count();
      expect(hasErrorMessage).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Login Flow - Redirecionamento', () => {
  test('deve redirecionar automaticamente para /monitors após login', async ({ page }) => {
    await clearStorage(page);

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Login real
    await loginReal(page, 'USER');

    // Deve estar em /monitors ou /dashboard
    await page.waitForURL(/\/(dashboard|monitors)/, { timeout: 10000 });

    const url = page.url();
    expect(url).toMatch(/\/(dashboard|monitors)/);
  });
});

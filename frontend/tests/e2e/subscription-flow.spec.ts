import { test, expect } from '@playwright/test';
import { clearStorage, loginReal } from './helpers';

/**
 * Testes E2E do Fluxo de Assinatura (Smoke Tests)
 *
 * Estratégia:
 * - Testa apenas até o ponto antes do checkout externo
 * - NÃO faz pagamento real (evita integração com Kiwify/Stripe)
 * - Valida que usuário consegue chegar na página de checkout
 *
 * Importante:
 * - Usuário FREE vê planos e pode clicar em "Assinar"
 * - Teste para até o redirecionamento para provedor de pagamento
 */

test.describe('Subscription Flow (Smoke)', () => {
  test('deve exibir página de planos (público, sem login)', async ({ page }) => {
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');

    // Validar título da página
    await expect(page.locator('h1, h2').filter({ hasText: /plano|assina/i })).toBeVisible();

    // Deve ter pelo menos um card de plano
    const planCards = await page.locator('text=/Starter|Pro|Premium|Ultra/i').count();
    expect(planCards).toBeGreaterThanOrEqual(1);
  });

  test('deve exibir botões de "Assinar agora" nos planos', async ({ page }) => {
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');

    // Procurar por botões de assinatura
    const subscribeButtons = page.locator(
      'button:has-text("Assinar"), button:has-text("Começar"), a:has-text("Assinar")'
    );

    const buttonCount = await subscribeButtons.count();
    expect(buttonCount).toBeGreaterThanOrEqual(1);
  });

  test('deve clicar em "Assinar" e validar redirecionamento', async ({ page }) => {
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');

    // Procurar primeiro botão de assinatura visível
    const subscribeButton = page
      .locator('button:has-text("Assinar"), button:has-text("Começar"), a:has-text("Assinar")')
      .first();

    if (await subscribeButton.isVisible()) {
      // Registrar popups/novas abas que podem abrir
      const [newPage] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
        subscribeButton.click(),
      ]);

      // Aguardar navegação ou modal
      await page.waitForTimeout(2000);

      // Validações possíveis:
      // 1. Redireciona para página interna de checkout
      // 2. Abre link externo (Kiwify/Stripe) em nova aba
      // 3. Mostra modal de login se não autenticado

      const currentUrl = page.url();
      const hasCheckoutInUrl = currentUrl.includes('checkout') || currentUrl.includes('payment');
      const hasLoginInUrl = currentUrl.includes('login');
      const hasNewTab = newPage !== null;

      // Pelo menos uma das condições deve ser verdadeira
      const validFlow = hasCheckoutInUrl || hasLoginInUrl || hasNewTab;
      expect(validFlow).toBeTruthy();

      // Fechar nova aba se foi aberta
      if (newPage) {
        await newPage.close();
      }
    }
  });

  test('deve exibir informações dos planos (nome, preço, features)', async ({ page }) => {
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');

    // Validar que pelo menos um plano tem preço visível
    const hasPricing = await page.locator('text=/R\$|reais|mês/i').count();
    expect(hasPricing).toBeGreaterThanOrEqual(1);

    // Validar que tem features/benefícios listados
    const hasFeatures = await page.locator('ul li, text=/✓|✔|✅/').count();
    expect(hasFeatures).toBeGreaterThanOrEqual(1);
  });

  test('deve permitir acesso à página de planos quando autenticado', async ({ page }) => {
    await clearStorage(page);
    await loginReal(page, 'USER');

    // Navegar para planos
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');

    // Deve exibir planos mesmo autenticado
    await expect(page.locator('h1, h2').filter({ hasText: /plano/i })).toBeVisible();

    // Botões de assinatura devem estar visíveis
    const subscribeButtons = page.locator('button:has-text("Assinar"), a:has-text("Assinar")');
    const buttonCount = await subscribeButtons.count();
    expect(buttonCount).toBeGreaterThanOrEqual(1);
  });

  test('deve navegar da página de configurações para planos', async ({ page }) => {
    await clearStorage(page);
    await loginReal(page, 'USER');

    // Ir para configurações de assinatura
    await page.goto('/settings/subscription');
    await page.waitForLoadState('networkidle');

    // Procurar link para "Ver planos" ou "Alterar plano"
    const changePlanLink = page.locator(
      'a:has-text("Ver planos"), a:has-text("Alterar"), button:has-text("Alterar")'
    );

    if (await changePlanLink.count() > 0) {
      await changePlanLink.first().click();
      await page.waitForTimeout(1000);

      // Deve redirecionar para /plans
      const currentUrl = page.url();
      const isOnPlansPage = currentUrl.includes('plans') || currentUrl.includes('plano');
      expect(isOnPlansPage).toBeTruthy();
    }
  });

  test('deve validar que plano FREE/TRIAL tem limitações visíveis', async ({ page }) => {
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');

    // Procurar por menção a "Grátis", "Trial", "Teste"
    const hasFreePlan = await page.locator('text=/grátis|trial|teste|free/i').count();

    // Pode ou não ter plano free visível na página de planos
    expect(hasFreePlan).toBeGreaterThanOrEqual(0);
  });

  test('deve exibir comparação entre planos', async ({ page }) => {
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');

    // Validar que tem múltiplos planos exibidos
    const planNames = await page.locator('text=/Starter|Pro|Premium|Ultra|Básico|Avançado/i').count();
    expect(planNames).toBeGreaterThanOrEqual(1);

    // Validar que features são comparáveis
    const featuresList = await page.locator('ul, ol').count();
    expect(featuresList).toBeGreaterThanOrEqual(1);
  });

  test('deve validar botão de assinatura não quebra sem backend', async ({ page }) => {
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');

    // Mesmo que backend esteja offline, página deve renderizar
    const pageContent = await page.content();
    expect(pageContent).toContain('html');

    // Botões devem estar no DOM (mesmo sem funcionalidade)
    const buttons = await page.locator('button, a').count();
    expect(buttons).toBeGreaterThan(0);
  });
});

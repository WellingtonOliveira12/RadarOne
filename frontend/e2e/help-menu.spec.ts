import { test, expect } from '@playwright/test';

/**
 * Testes E2E para navegação do menu Ajuda
 */
test.describe('Menu Ajuda', () => {
  test('deve abrir e navegar pelas opções do menu Ajuda', async ({ page }) => {
    // Ir para a página principal (assumindo que usuário não está logado)
    await page.goto('/');
    
    // Se houver botão de login, clicar para ir ao dashboard (ajustar conforme UI real)
    const loginLink = page.locator('a[href="/login"]');
    if (await loginLink.isVisible()) {
      await page.goto('/dashboard');
    }
    
    // Localizar e clicar no botão "Ajuda"
    const helpButton = page.locator('button:has-text("Ajuda")');
    await expect(helpButton).toBeVisible();
    await helpButton.click();
    
    // Verificar que o menu dropdown apareceu
    const manualLink = page.locator('a[href="/manual"]');
    const faqLink = page.locator('a[href="/faq"]');
    const contactLink = page.locator('a[href="/contact"]');
    
    await expect(manualLink).toBeVisible();
    await expect(faqLink).toBeVisible();
    await expect(contactLink).toBeVisible();
  });
  
  test('deve navegar para página Manual', async ({ page }) => {
    await page.goto('/dashboard');
    
    const helpButton = page.locator('button:has-text("Ajuda")');
    await helpButton.click();
    
    const manualLink = page.locator('a[href="/manual"]');
    await manualLink.click();
    
    // Verificar que navegou para /manual
    await expect(page).toHaveURL(/\/manual/);
    
    // Verificar conteúdo da página Manual
    await expect(page.locator('h1')).toContainText(/Manual|Guia/i);
  });
  
  test('deve navegar para página FAQ', async ({ page }) => {
    await page.goto('/dashboard');
    
    const helpButton = page.locator('button:has-text("Ajuda")');
    await helpButton.click();
    
    const faqLink = page.locator('a[href="/faq"]');
    await faqLink.click();
    
    // Verificar que navegou para /faq
    await expect(page).toHaveURL(/\/faq/);
    
    // Verificar conteúdo da página FAQ
    await expect(page.locator('h1')).toContainText(/FAQ|Perguntas/i);
  });
  
  test('deve navegar para página Fale Conosco', async ({ page }) => {
    await page.goto('/dashboard');
    
    const helpButton = page.locator('button:has-text("Ajuda")');
    await helpButton.click();
    
    const contactLink = page.locator('a[href="/contact"]');
    await contactLink.click();
    
    // Verificar que navegou para /contact
    await expect(page).toHaveURL(/\/contact/);
    
    // Verificar conteúdo da página de contato
    await expect(page.locator('h1')).toContainText(/Contato|Fale Conosco/i);
  });
});

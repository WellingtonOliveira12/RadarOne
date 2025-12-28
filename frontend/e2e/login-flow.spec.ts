import { test, expect } from '@playwright/test';

/**
 * Testes E2E básicos para fluxo de login
 */
test.describe('Fluxo de Login', () => {
  test.beforeEach(async ({ page }) => {
    // Limpar localStorage antes de cada teste
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });
  
  test('deve exibir formulário de login', async ({ page }) => {
    await page.goto('/login');
    
    // Verificar elementos do formulário
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    
    // Verificar link para recuperação de senha
    await expect(page.locator('a[href="/forgot-password"]')).toBeVisible();
  });
  
  test('deve mostrar erro com credenciais inválidas', async ({ page }) => {
    await page.goto('/login');
    
    // Preencher com credenciais inválidas
    await page.fill('input[type="email"]', 'invalido@exemplo.com');
    await page.fill('input[type="password"]', 'senhaerrada');
    
    // Submeter formulário
    await page.click('button[type="submit"]');
    
    // Aguardar e verificar mensagem de erro
    // Ajustar o seletor conforme a implementação real
    await expect(page.locator('text=/erro|inválido|incorret/i')).toBeVisible({ timeout: 5000 });
  });
  
  test('deve validar formato de email', async ({ page }) => {
    await page.goto('/login');
    
    // Tentar submit com email inválido
    await page.fill('input[type="email"]', 'email-invalido');
    await page.fill('input[type="password"]', '123456');
    await page.click('button[type="submit"]');
    
    // Verificar mensagem de validação de email
    await expect(page.locator('text=/email.*inválido/i')).toBeVisible({ timeout: 5000 });
  });
});

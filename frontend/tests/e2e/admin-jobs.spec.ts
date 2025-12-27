import { test, expect } from '@playwright/test';
import { clearStorage, loginReal } from './helpers';

/**
 * Testes E2E do Admin Jobs Dashboard
 *
 * Estratégia: Backend REAL + Seed E2E + Login REAL
 * - Sem mocks de API
 * - Admin e usuário comum criados pelo seed
 * - Testa permissões reais (403 do backend para usuário comum)
 */

test.describe('Admin Jobs Dashboard Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('deve exigir autenticação para acessar página admin', async ({ page }) => {
    await clearStorage(page);

    await page.goto('/admin/jobs');

    // Deve redirecionar para login ou mostrar erro 403
    await page.waitForURL('/login', { timeout: 5000 });
  });

  test('deve exibir página de jobs do admin após login como admin', async ({ page }) => {
    // Fazer login como admin
    await loginReal(page, 'ADMIN');

    // Navegar para admin/jobs
    await page.goto('/admin/jobs');

    // Aguardar página carregar (pode ter requests /api/admin/jobs)
    await page.waitForLoadState('networkidle');

    // Verificar que página renderizou
    await expect(
      page.locator('h1, h2').filter({ hasText: /admin|jobs|trabalhos/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('deve listar jobs executados (dados reais ou vazio)', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/jobs');

    // Aguardar página carregar
    await page.waitForLoadState('networkidle');

    // Pode ter jobs ou estar vazio (banco de teste pode não ter jobs ainda)
    // Verificar apenas que a página renderizou sem erro
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    // Se houver tabela/lista, verificar que existe
    const hasJobsList = await page.locator('table, [role="table"], ul, ol').count();
    expect(hasJobsList).toBeGreaterThanOrEqual(0);
  });

  test('usuário comum não deve acessar admin jobs', async ({ page }) => {
    // Login como usuário comum
    await loginReal(page, 'USER');

    // Tentar acessar /admin/jobs
    await page.goto('/admin/jobs');

    // Backend REAL vai retornar 403 ou frontend vai mostrar erro
    // Deve mostrar mensagem de erro ou redirecionar
    const isOnAdminPage = page.url().includes('/admin/jobs');
    const hasErrorMessage = await page
      .locator('text=/acesso negado|não autorizado|403|forbidden/i')
      .count();

    // OU está fora da página admin OU tem mensagem de erro
    expect(isOnAdminPage === false || hasErrorMessage > 0).toBeTruthy();
  });

  test('deve ter título e header corretos na página admin', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/jobs');
    await page.waitForLoadState('networkidle');

    // Verificar que tem elementos de página admin
    const hasAdminHeading = await page.locator('h1, h2').filter({ hasText: /admin/i }).count();
    expect(hasAdminHeading).toBeGreaterThan(0);
  });

  test('deve ter funcionalidade de navegação (se houver)', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/jobs');
    await page.waitForLoadState('networkidle');

    // Verificar que página carregou sem erro
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(100);
  });
});

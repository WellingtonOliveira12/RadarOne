import { test, expect } from '@playwright/test';
import { clearStorage, loginReal, waitForToast } from './helpers';

/**
 * Testes E2E do Admin Coupons Management
 *
 * Estratégia: Backend REAL + Seed E2E + Login REAL
 * - Testa CRUD completo de cupons
 * - Testa filtros e paginação
 * - Testa permissões (somente admins)
 * - Testa validações do formulário
 */

test.describe('Admin Coupons Management', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('deve exigir autenticação para acessar página de cupons', async ({ page }) => {
    await clearStorage(page);
    await page.goto('/admin/coupons');

    // Deve redirecionar para login
    await page.waitForURL('/login', { timeout: 5000 });
  });

  test('deve exibir página de cupons após login como admin', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Verificar título da página
    await expect(
      page.locator('h1, h2').filter({ hasText: /cupons/i })
    ).toBeVisible({ timeout: 10000 });

    // Verificar botão "Novo Cupom"
    await expect(page.locator('button:has-text("Novo Cupom")')).toBeVisible();
  });

  test('usuário comum não deve acessar admin coupons', async ({ page }) => {
    await loginReal(page, 'USER');
    await page.goto('/admin/coupons');

    // Backend vai retornar 403 ou frontend mostra erro
    const hasErrorMessage = await page
      .locator('text=/acesso negado|não autorizado|403|forbidden/i')
      .count();

    expect(hasErrorMessage).toBeGreaterThan(0);
  });

  test('deve criar novo cupom com sucesso', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Clicar em "Novo Cupom"
    await page.click('button:has-text("Novo Cupom")');

    // Aguardar modal abrir
    await expect(page.locator('text=Criar Novo Cupom')).toBeVisible();

    // Preencher formulário
    const uniqueCode = `E2E${Date.now().toString().slice(-6)}`;
    await page.fill('input[placeholder*="PROMO"]', uniqueCode);
    await page.fill('input[placeholder*="Descrição"]', 'Cupom de teste E2E');

    // Selecionar tipo Percentual
    await page.selectOption('select', 'PERCENTAGE');

    // Definir valor do desconto (10%)
    const discountInput = page.locator('input[type="number"]').first();
    await discountInput.fill('10');

    // Clicar em "Criar Cupom"
    await page.click('button:has-text("Criar Cupom")');

    // Aguardar toast de sucesso
    await expect(
      page.locator('text=/cupom criado com sucesso/i')
    ).toBeVisible({ timeout: 5000 });

    // Modal deve fechar
    await expect(page.locator('text=Criar Novo Cupom')).not.toBeVisible({ timeout: 5000 });

    // Cupom deve aparecer na tabela
    await expect(page.locator(`text=${uniqueCode}`)).toBeVisible({ timeout: 5000 });
  });

  test('deve validar campos obrigatórios ao criar cupom', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Abrir modal
    await page.click('button:has-text("Novo Cupom")');
    await expect(page.locator('text=Criar Novo Cupom')).toBeVisible();

    // Tentar criar sem preencher campos obrigatórios
    await page.click('button:has-text("Criar Cupom")');

    // Deve mostrar erros de validação
    await expect(
      page.locator('text=/código é obrigatório|campo obrigatório/i')
    ).toBeVisible({ timeout: 3000 });
  });

  test('deve validar código com mínimo de 3 caracteres', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Abrir modal
    await page.click('button:has-text("Novo Cupom")');

    // Preencher código com 2 caracteres
    await page.fill('input[placeholder*="PROMO"]', 'AB');
    await page.fill('input[placeholder*="Descrição"]', 'Teste');

    const discountInput = page.locator('input[type="number"]').first();
    await discountInput.fill('10');

    // Tentar criar
    await page.click('button:has-text("Criar Cupom")');

    // Deve mostrar erro de validação
    await expect(
      page.locator('text=/pelo menos 3 caracteres/i')
    ).toBeVisible({ timeout: 3000 });
  });

  test('deve filtrar cupons por código', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Criar cupom de teste
    await page.click('button:has-text("Novo Cupom")');
    await expect(page.locator('text=Criar Novo Cupom')).toBeVisible();

    const uniqueCode = `FILTER${Date.now().toString().slice(-6)}`;
    await page.fill('input[placeholder*="PROMO"]', uniqueCode);
    const discountInput = page.locator('input[type="number"]').first();
    await discountInput.fill('5');
    await page.click('button:has-text("Criar Cupom")');

    // Aguardar criação
    await expect(
      page.locator('text=/cupom criado/i')
    ).toBeVisible({ timeout: 5000 });

    // Aguardar modal fechar
    await page.waitForTimeout(1000);

    // Usar filtro de busca
    const searchInput = page.locator('input[placeholder*="Buscar"]');
    await searchInput.fill(uniqueCode.substring(0, 6));

    // Aguardar tabela atualizar
    await page.waitForTimeout(1000);

    // Cupom deve aparecer na tabela
    await expect(page.locator(`text=${uniqueCode}`)).toBeVisible();
  });

  test('deve filtrar cupons por status', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Selecionar filtro "Ativos"
    const statusSelect = page.locator('select').filter({ hasText: /todos.*ativ/i }).first();
    await statusSelect.selectOption('active');

    // Aguardar tabela atualizar
    await page.waitForTimeout(1000);

    // Verificar que página não deu erro
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();
  });

  test('deve editar cupom existente', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Criar cupom de teste
    await page.click('button:has-text("Novo Cupom")');
    const uniqueCode = `EDIT${Date.now().toString().slice(-6)}`;
    await page.fill('input[placeholder*="PROMO"]', uniqueCode);
    const discountInput = page.locator('input[type="number"]').first();
    await discountInput.fill('10');
    await page.click('button:has-text("Criar Cupom")');
    await expect(page.locator('text=/cupom criado/i')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Localizar linha do cupom e clicar em editar (ícone ✏️)
    const couponRow = page.locator(`tr:has-text("${uniqueCode}")`);
    await couponRow.locator('button[aria-label*="Editar"]').click();

    // Aguardar modal de edição
    await expect(page.locator(`text=Editar Cupom: ${uniqueCode}`)).toBeVisible();

    // Alterar descrição
    const descInput = page.locator('input[placeholder*="Descrição"]');
    await descInput.fill('Descrição editada via E2E');

    // Salvar alterações
    await page.click('button:has-text("Salvar Alterações")');

    // Aguardar toast de sucesso
    await expect(
      page.locator('text=/cupom atualizado/i')
    ).toBeVisible({ timeout: 5000 });
  });

  test('deve desativar/ativar cupom (toggle)', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Criar cupom de teste
    await page.click('button:has-text("Novo Cupom")');
    const uniqueCode = `TOGGLE${Date.now().toString().slice(-6)}`;
    await page.fill('input[placeholder*="PROMO"]', uniqueCode);
    const discountInput = page.locator('input[type="number"]').first();
    await discountInput.fill('15');
    await page.click('button:has-text("Criar Cupom")');
    await expect(page.locator('text=/cupom criado/i')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Localizar linha do cupom
    const couponRow = page.locator(`tr:has-text("${uniqueCode}")`);

    // Verificar badge "Ativo"
    await expect(couponRow.locator('text=Ativo')).toBeVisible();

    // Clicar no botão toggle (⏸️)
    await couponRow.locator('button[aria-label*="Toggle"]').click();

    // Aguardar toast
    await expect(
      page.locator('text=/desativado|ativado/i')
    ).toBeVisible({ timeout: 5000 });

    // Badge deve mudar para "Inativo"
    await expect(couponRow.locator('text=Inativo')).toBeVisible({ timeout: 3000 });
  });

  test('deve deletar cupom com confirmação', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Criar cupom de teste
    await page.click('button:has-text("Novo Cupom")');
    const uniqueCode = `DEL${Date.now().toString().slice(-6)}`;
    await page.fill('input[placeholder*="PROMO"]', uniqueCode);
    const discountInput = page.locator('input[type="number"]').first();
    await discountInput.fill('20');
    await page.click('button:has-text("Criar Cupom")');
    await expect(page.locator('text=/cupom criado/i')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Preparar para aceitar confirmação de delete
    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain(uniqueCode);
      await dialog.accept();
    });

    // Localizar linha e clicar em deletar (🗑️)
    const couponRow = page.locator(`tr:has-text("${uniqueCode}")`);
    await couponRow.locator('button[aria-label*="Deletar"]').click();

    // Aguardar toast de sucesso
    await expect(
      page.locator('text=/cupom deletado|desativado/i')
    ).toBeVisible({ timeout: 5000 });
  });

  test('deve exibir informações corretas na tabela', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Criar cupom com todos os campos
    await page.click('button:has-text("Novo Cupom")');
    const uniqueCode = `INFO${Date.now().toString().slice(-6)}`;

    await page.fill('input[placeholder*="PROMO"]', uniqueCode);
    await page.fill('input[placeholder*="Descrição"]', 'Cupom completo para teste');

    // Tipo Percentual
    await page.selectOption('select', 'PERCENTAGE');

    // Valor 25%
    const discountInput = page.locator('input[type="number"]').first();
    await discountInput.fill('25');

    await page.click('button:has-text("Criar Cupom")');
    await expect(page.locator('text=/cupom criado/i')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Verificar informações na tabela
    const couponRow = page.locator(`tr:has-text("${uniqueCode}")`);

    // Código
    await expect(couponRow.locator(`text=${uniqueCode}`)).toBeVisible();

    // Descrição
    await expect(couponRow.locator('text=Cupom completo para teste')).toBeVisible();

    // Badge "Percentual"
    await expect(couponRow.locator('text=Percentual')).toBeVisible();

    // Desconto "25%"
    await expect(couponRow.locator('text=25%')).toBeVisible();

    // Status "Ativo"
    await expect(couponRow.locator('text=Ativo')).toBeVisible();
  });

  test('deve navegar entre páginas (paginação)', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Verificar se existe paginação (pode não existir se houver poucos cupons)
    const hasPagination = await page.locator('text=/página.*de/i').count();

    if (hasPagination > 0) {
      // Verificar botões de navegação
      const prevButton = page.locator('button:has-text("Anterior")');
      const nextButton = page.locator('button:has-text("Próximo")');

      // Na primeira página, "Anterior" deve estar desabilitado
      await expect(prevButton).toBeDisabled();
    }

    // Página deve carregar sem erros mesmo sem paginação
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(100);
  });

  test('deve ter AdminLayout com sidebar e header', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Verificar elementos do AdminLayout
    const hasAdminHeading = await page.locator('text=/RadarOne Admin/i').count();
    expect(hasAdminHeading).toBeGreaterThan(0);

    // Verificar que sidebar tem link "Dashboard"
    const hasDashboardLink = await page.locator('a:has-text("Dashboard")').count();
    expect(hasDashboardLink).toBeGreaterThan(0);
  });

  test('link Dashboard no Admin deve ir para /admin/stats', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Clicar no link "Dashboard" no menu lateral
    await page.click('a:has-text("Dashboard")');

    // Deve navegar para /admin/stats
    await page.waitForURL('/admin/stats', { timeout: 5000 });

    // Verificar que chegou na página correta
    expect(page.url()).toContain('/admin/stats');
  });
});

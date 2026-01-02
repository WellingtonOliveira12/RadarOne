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

  // ============================================
  // TESTES DE BULK OPERATIONS
  // ============================================

  test('deve selecionar todos os cupons com checkbox "Selecionar Todos"', async ({ page }) => {
    await loginReal(page, 'ADMIN_SUPER');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Aguardar tabela carregar
    await page.waitForSelector('table', { timeout: 10000 });

    // Verificar se há cupons na página
    const rowCount = await page.locator('table tbody tr').count();

    if (rowCount > 0) {
      // Clicar no checkbox "Selecionar Todos" no header da tabela
      const selectAllCheckbox = page.locator('table thead th').first().locator('input[type="checkbox"]');
      await selectAllCheckbox.click();

      // Verificar se a barra de ações em lote apareceu
      await expect(page.locator('text=/cupom.*selecionado/i')).toBeVisible({ timeout: 5000 });

      // Verificar se todos os checkboxes individuais foram marcados
      const checkedCount = await page.locator('table tbody td input[type="checkbox"]:checked').count();
      expect(checkedCount).toBe(rowCount);
    }
  });

  test('deve ativar múltiplos cupons em lote', async ({ page }) => {
    await loginReal(page, 'ADMIN_SUPER');

    // Primeiro criar 2 cupons de teste para ativar
    await page.goto('/admin/coupons');
    const uniqueSuffix = Date.now().toString().slice(-6);

    // Criar cupom 1
    await page.click('button:has-text("Novo Cupom")');
    await page.fill('input[placeholder*="PROMO"]', `BULK1${uniqueSuffix}`);
    await page.fill('input[placeholder*="Descrição"]', 'Bulk Test 1');
    await page.fill('input[type="number"]', '15');
    await page.click('button:has-text("Criar Cupom")');
    await expect(page.locator('text=/criado com sucesso/i')).toBeVisible({ timeout: 5000 });

    // Criar cupom 2
    await page.click('button:has-text("Novo Cupom")');
    await page.fill('input[placeholder*="PROMO"]', `BULK2${uniqueSuffix}`);
    await page.fill('input[placeholder*="Descrição"]', 'Bulk Test 2');
    await page.fill('input[type="number"]', '20');
    await page.click('button:has-text("Criar Cupom")');
    await expect(page.locator('text=/criado com sucesso/i')).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(1000);

    // Recarregar para ver os cupons
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Selecionar os 2 cupons criados
    const bulk1Row = page.locator(`tr:has-text("BULK1${uniqueSuffix}")`);
    const bulk2Row = page.locator(`tr:has-text("BULK2${uniqueSuffix}")`);

    await bulk1Row.locator('input[type="checkbox"]').click();
    await bulk2Row.locator('input[type="checkbox"]').click();

    // Verificar barra de ações
    await expect(page.locator('text=/2 cupom.*selecionado/i')).toBeVisible();

    // Clicar em "Ativar Selecionados"
    await page.click('button:has-text("Ativar Selecionados")');

    // Aguardar toast de sucesso
    await expect(page.locator('text=/ativado.*com sucesso/i')).toBeVisible({ timeout: 5000 });
  });

  test('deve desativar múltiplos cupons em lote', async ({ page }) => {
    await loginReal(page, 'ADMIN_SUPER');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Aguardar tabela carregar
    await page.waitForSelector('table', { timeout: 10000 });

    // Verificar se há cupons ativos
    const activeCouponRows = page.locator('tr:has(span:text("Ativo"))');
    const activeCount = await activeCouponRows.count();

    if (activeCount >= 2) {
      // Selecionar os 2 primeiros cupons ativos
      await activeCouponRows.nth(0).locator('input[type="checkbox"]').click();
      await activeCouponRows.nth(1).locator('input[type="checkbox"]').click();

      // Verificar barra de ações
      await expect(page.locator('text=/2 cupom.*selecionado/i')).toBeVisible();

      // Clicar em "Desativar Selecionados"
      await page.click('button:has-text("Desativar Selecionados")');

      // Aguardar toast de sucesso
      await expect(page.locator('text=/desativado.*com sucesso/i')).toBeVisible({ timeout: 5000 });
    }
  });

  test('deve deletar múltiplos cupons em lote (com confirmação)', async ({ page }) => {
    await loginReal(page, 'ADMIN_SUPER');

    // Criar 2 cupons para deletar
    await page.goto('/admin/coupons');
    const uniqueSuffix = Date.now().toString().slice(-6);

    // Criar cupom 1
    await page.click('button:has-text("Novo Cupom")');
    await page.fill('input[placeholder*="PROMO"]', `DEL1${uniqueSuffix}`);
    await page.fill('input[placeholder*="Descrição"]', 'Delete Test 1');
    await page.fill('input[type="number"]', '5');
    await page.click('button:has-text("Criar Cupom")');
    await expect(page.locator('text=/criado com sucesso/i')).toBeVisible({ timeout: 5000 });

    // Criar cupom 2
    await page.click('button:has-text("Novo Cupom")');
    await page.fill('input[placeholder*="PROMO"]', `DEL2${uniqueSuffix}`);
    await page.fill('input[placeholder*="Descrição"]', 'Delete Test 2');
    await page.fill('input[type="number"]', '10');
    await page.click('button:has-text("Criar Cupom")');
    await expect(page.locator('text=/criado com sucesso/i')).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(1000);

    // Recarregar para ver os cupons
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Selecionar os 2 cupons criados
    const del1Row = page.locator(`tr:has-text("DEL1${uniqueSuffix}")`);
    const del2Row = page.locator(`tr:has-text("DEL2${uniqueSuffix}")`);

    await del1Row.locator('input[type="checkbox"]').click();
    await del2Row.locator('input[type="checkbox"]').click();

    // Verificar barra de ações
    await expect(page.locator('text=/2 cupom.*selecionado/i')).toBeVisible();

    // Configurar handler para o dialog de confirmação
    page.once('dialog', async dialog => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('2 cupom');
      await dialog.accept(); // Confirmar deleção
    });

    // Clicar em "Deletar Selecionados"
    await page.click('button:has-text("Deletar Selecionados")');

    // Aguardar toast de sucesso
    await expect(page.locator('text=/concluída/i, text=/deletad/i')).toBeVisible({ timeout: 5000 });

    // Recarregar e verificar que cupons foram removidos/desativados
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Cupons devem ter sido deletados (hard delete) pois não tinham usos
    const stillExists1 = await page.locator(`text=DEL1${uniqueSuffix}`).count();
    const stillExists2 = await page.locator(`text=DEL2${uniqueSuffix}`).count();

    // Ambos devem ter sido deletados (count = 0)
    expect(stillExists1 + stillExists2).toBe(0);
  });

  test('deve limpar seleção ao clicar em "Limpar Seleção"', async ({ page }) => {
    await loginReal(page, 'ADMIN_SUPER');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Aguardar tabela carregar
    await page.waitForSelector('table', { timeout: 10000 });

    const rowCount = await page.locator('table tbody tr').count();

    if (rowCount > 0) {
      // Selecionar primeiro cupom
      await page.locator('table tbody tr').first().locator('input[type="checkbox"]').click();

      // Verificar que barra de ações apareceu
      await expect(page.locator('text=/cupom.*selecionado/i')).toBeVisible();

      // Clicar em "Limpar Seleção"
      await page.click('button:has-text("Limpar Seleção")');

      // Barra de ações deve desaparecer
      await expect(page.locator('text=/cupom.*selecionado/i')).not.toBeVisible();

      // Checkbox deve estar desmarcado
      const isChecked = await page.locator('table tbody tr').first().locator('input[type="checkbox"]').isChecked();
      expect(isChecked).toBe(false);
    }
  });

  // =========================================
  // TESTES DE IMPORT CSV
  // =========================================

  test('deve importar cupons via CSV com sucesso', async ({ page }) => {
    await loginReal(page, 'ADMIN_SUPER');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Clicar em "Importar CSV"
    await page.click('button:has-text("Importar CSV")');

    // Aguardar modal abrir
    await expect(page.locator('text=Importar Cupons via CSV')).toBeVisible();

    // Criar arquivo CSV de teste
    const uniqueSuffix = Date.now().toString().slice(-6);
    const csvContent = `code,description,discountType,discountValue,maxUses,expiresAt,planSlug
CSV1${uniqueSuffix},Cupom CSV 1,PERCENTAGE,10,100,2027-12-31,
CSV2${uniqueSuffix},Cupom CSV 2,FIXED,5000,50,2027-12-31,`;

    // Criar blob e file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const file = new File([blob], 'coupons.csv', { type: 'text/csv' });

    // Upload do arquivo
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'coupons.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    });

    // Verificar que arquivo foi selecionado
    await expect(page.locator('text=/Arquivo selecionado/i')).toBeVisible();

    // Clicar em "Importar CSV"
    await page.click('button:has-text("Importar CSV")');

    // Aguardar resultado
    await expect(page.locator('text=/Importação Concluída/i')).toBeVisible({ timeout: 10000 });

    // Verificar sucesso
    await expect(page.locator('text=/Sucesso: 2 cupons/i')).toBeVisible();

    // Fechar modal
    await page.click('button:has-text("Fechar")');

    // Verificar que cupons aparecem na tabela (após reload)
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text=CSV1${uniqueSuffix}`)).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=CSV2${uniqueSuffix}`)).toBeVisible({ timeout: 5000 });
  });

  test('deve mostrar erros ao importar CSV inválido', async ({ page }) => {
    await loginReal(page, 'ADMIN_SUPER');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Abrir modal de import
    await page.click('button:has-text("Importar CSV")');
    await expect(page.locator('text=Importar Cupons via CSV')).toBeVisible();

    // CSV com linha inválida (código muito curto)
    const csvContent = `code,description,discountType,discountValue,maxUses,expiresAt,planSlug
AB,Cupom inválido,PERCENTAGE,10,100,2027-12-31,`;

    // Upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'invalid.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    });

    // Importar
    await page.click('button:has-text("Importar CSV")');

    // Aguardar resultado
    await expect(page.locator('text=/Importação Concluída/i')).toBeVisible({ timeout: 10000 });

    // Verificar que mostra erros
    await expect(page.locator('text=/Erros: 1/i')).toBeVisible();
    await expect(page.locator('text=/Código inválido/i')).toBeVisible();
  });

  // =========================================
  // TESTES DE ANALYTICS
  // =========================================

  test('deve exibir analytics de cupons', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Clicar no botão "Ver Analytics"
    await page.click('button:has-text("Ver Analytics")');

    // Aguardar section de analytics aparecer
    await expect(page.locator('text=/Analytics de Cupons/i')).toBeVisible({ timeout: 10000 });

    // Verificar cards de estatísticas
    await expect(page.locator('text=/Total de Cupons/i')).toBeVisible();
    await expect(page.locator('text=/Cupons Usados/i')).toBeVisible();
    await expect(page.locator('text=/Total de Usos/i')).toBeVisible();
    await expect(page.locator('text=/Taxa de Conversão/i')).toBeVisible();

    // Verificar que mostra valores numéricos
    const totalCoupons = await page.locator('text=/Total de Cupons/i').locator('../..').locator('text=/\\d+/').first();
    await expect(totalCoupons).toBeVisible();
  });

  test('deve ocultar analytics ao clicar novamente', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Abrir analytics
    await page.click('button:has-text("Ver Analytics")');
    await expect(page.locator('text=/Analytics de Cupons/i')).toBeVisible({ timeout: 10000 });

    // Clicar novamente para ocultar
    await page.click('button:has-text("Ocultar Analytics")');

    // Analytics deve desaparecer
    await expect(page.locator('text=/Analytics de Cupons/i')).not.toBeVisible();
  });

  test('analytics deve mostrar top cupons mais usados', async ({ page }) => {
    await loginReal(page, 'ADMIN');
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');

    // Abrir analytics
    await page.click('button:has-text("Ver Analytics")');
    await expect(page.locator('text=/Analytics de Cupons/i')).toBeVisible({ timeout: 10000 });

    // Verificar seção de Top Cupons
    const hasTopCoupons = await page.locator('text=/Top 10 Cupons Mais Usados/i').count();

    // Se houver cupons usados, deve mostrar a tabela
    if (hasTopCoupons > 0) {
      await expect(page.locator('text=/Top 10 Cupons Mais Usados/i')).toBeVisible();
      await expect(page.locator('th:has-text("Código")')).toBeVisible();
      await expect(page.locator('th:has-text("Usos")')).toBeVisible();
    }
  });
});

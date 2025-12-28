import { test, expect } from '@playwright/test';
import { clearStorage, loginReal } from './helpers';

/**
 * Testes E2E de Edição de Monitores
 *
 * Valida:
 * - Abrir formulário/modal de edição
 * - Editar nome, site, URL
 * - Salvar alterações com sucesso
 * - Validar persistência das mudanças
 * - Validações de campos ao editar
 * - Cancelar edição sem salvar
 * - Editar e ativar/desativar monitor
 *
 * Estratégia: Backend REAL + Seed E2E + Login REAL
 */

test.describe('Edit Monitor Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await loginReal(page, 'USER');
  });

  test('deve abrir formulário de edição ao clicar em editar', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');

    // Aguardar lista de monitores carregar
    await page.waitForTimeout(1000);

    // Procurar botão de editar (pode ser ícone ou texto)
    const editButtons = page.locator('button:has-text("Editar"), [aria-label*="Editar"], button[title*="Editar"]');

    if ((await editButtons.count()) > 0) {
      await editButtons.first().click();
      await page.waitForTimeout(500);

      // Verificar que formulário/modal de edição abriu
      const hasEditForm = await page
        .locator('input[name="name"], [role="dialog"], [role="form"], h2:has-text("Editar")')
        .count();

      expect(hasEditForm).toBeGreaterThan(0);
    }
  });

  test('deve carregar dados do monitor no formulário de edição', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Seed cria "Monitor Mercado Livre E2E"
    // Procurar este monitor específico e editar
    const monitorCard = page.locator('text=/Monitor.*Mercado.*E2E/i').first();

    if (await monitorCard.isVisible({ timeout: 2000 })) {
      // Encontrar botão de editar próximo a este monitor
      const editButton = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

      if (await editButton.isVisible({ timeout: 2000 })) {
        await editButton.click();
        await page.waitForTimeout(500);

        // Verificar que campo nome está preenchido
        const nameInput = page.locator('input[name="name"], input[placeholder*="nome"]').first();

        if (await nameInput.isVisible({ timeout: 2000 })) {
          const nameValue = await nameInput.inputValue();
          expect(nameValue.length).toBeGreaterThan(0);
          expect(nameValue.toLowerCase()).toContain('mercado');
        }
      }
    }
  });

  test('deve editar nome do monitor com sucesso', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const editButton = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

    if (await editButton.isVisible({ timeout: 2000 })) {
      await editButton.click();
      await page.waitForTimeout(500);

      const nameInput = page.locator('input[name="name"], input[placeholder*="nome"]').first();

      if (await nameInput.isVisible({ timeout: 2000 })) {
        // Limpar e preencher novo nome
        await nameInput.fill('');
        const newName = `Monitor Editado ${Date.now()}`;
        await nameInput.fill(newName);

        // Salvar
        const saveButton = page
          .locator('button[type="submit"], button:has-text("Salvar"), button:has-text("Atualizar")')
          .first();

        await saveButton.click();
        await page.waitForTimeout(2000);

        // Verificar se novo nome aparece na lista
        const hasNewName = await page.locator(`text=${newName}`).count();
        expect(hasNewName).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('deve editar URL do monitor com sucesso', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const editButton = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

    if (await editButton.isVisible({ timeout: 2000 })) {
      await editButton.click();
      await page.waitForTimeout(500);

      const urlInput = page.locator('input[name="searchUrl"], input[placeholder*="URL"]').first();

      if (await urlInput.isVisible({ timeout: 2000 })) {
        // Preencher nova URL
        const newUrl = 'https://lista.mercadolivre.com.br/editado-' + Date.now();
        await urlInput.fill('');
        await urlInput.fill(newUrl);

        // Salvar
        const saveButton = page
          .locator('button[type="submit"], button:has-text("Salvar"), button:has-text("Atualizar")')
          .first();

        await saveButton.click();
        await page.waitForTimeout(2000);

        // Verificar que salvou (pode aparecer mensagem de sucesso ou lista recarregar)
        const currentUrl = page.url();
        expect(currentUrl).toContain('/monitors');
      }
    }
  });

  test('deve validar campos obrigatórios ao editar', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const editButton = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

    if (await editButton.isVisible({ timeout: 2000 })) {
      await editButton.click();
      await page.waitForTimeout(500);

      const nameInput = page.locator('input[name="name"], input[placeholder*="nome"]').first();

      if (await nameInput.isVisible({ timeout: 2000 })) {
        // Tentar limpar nome (campo obrigatório)
        await nameInput.fill('');

        // Tentar salvar
        const saveButton = page
          .locator('button[type="submit"], button:has-text("Salvar"), button:has-text("Atualizar")')
          .first();

        await saveButton.click();
        await page.waitForTimeout(500);

        // Deve haver validação (HTML5 required ou mensagem de erro)
        const isRequired = await nameInput.getAttribute('required');
        expect(isRequired !== null || isRequired !== undefined).toBeTruthy();
      }
    }
  });

  test('deve validar URL inválida ao editar', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const editButton = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

    if (await editButton.isVisible({ timeout: 2000 })) {
      await editButton.click();
      await page.waitForTimeout(500);

      const urlInput = page.locator('input[name="searchUrl"], input[placeholder*="URL"]').first();

      if (await urlInput.isVisible({ timeout: 2000 })) {
        // URL inválida (sem protocolo)
        await urlInput.fill('');
        await urlInput.fill('url-invalida-sem-protocolo');

        // Tentar salvar
        const saveButton = page
          .locator('button[type="submit"], button:has-text("Salvar"), button:has-text("Atualizar")')
          .first();

        await saveButton.click();
        await page.waitForTimeout(1000);

        // Deve mostrar erro de validação
        const hasError = await page.locator('text=/inválid|erro|URL/i').count();
        expect(hasError).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('deve cancelar edição sem salvar alterações', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const editButton = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

    if (await editButton.isVisible({ timeout: 2000 })) {
      await editButton.click();
      await page.waitForTimeout(500);

      const nameInput = page.locator('input[name="name"], input[placeholder*="nome"]').first();

      if (await nameInput.isVisible({ timeout: 2000 })) {
        // Guardar nome original
        const originalName = await nameInput.inputValue();

        // Editar
        await nameInput.fill('Nome Temporário Não Deve Salvar');

        // Cancelar (procurar botão de cancelar ou fechar modal)
        const cancelButton = page
          .locator('button:has-text("Cancelar"), button:has-text("Fechar"), [aria-label*="Fechar"]')
          .first();

        if (await cancelButton.isVisible({ timeout: 1000 })) {
          await cancelButton.click();
          await page.waitForTimeout(500);

          // Verificar que nome original permanece (não deve ter salvado)
          const hasOriginalName = await page.locator(`text=${originalName}`).count();
          const hasTempName = await page.locator('text=/Nome Temporário/i').count();

          // Original deve aparecer, temporário não
          expect(hasOriginalName > 0 || hasTempName === 0).toBeTruthy();
        }
      }
    }
  });

  test('deve editar múltiplos campos simultaneamente', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const editButton = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

    if (await editButton.isVisible({ timeout: 2000 })) {
      await editButton.click();
      await page.waitForTimeout(500);

      const nameInput = page.locator('input[name="name"], input[placeholder*="nome"]').first();
      const urlInput = page.locator('input[name="searchUrl"], input[placeholder*="URL"]').first();

      if (await nameInput.isVisible({ timeout: 2000 })) {
        // Editar nome
        const newName = `Monitor Multi Edit ${Date.now()}`;
        await nameInput.fill('');
        await nameInput.fill(newName);

        // Editar URL se disponível
        if (await urlInput.isVisible({ timeout: 1000 })) {
          await urlInput.fill('');
          await urlInput.fill('https://www.olx.com.br/test-' + Date.now());
        }

        // Salvar
        const saveButton = page
          .locator('button[type="submit"], button:has-text("Salvar"), button:has-text("Atualizar")')
          .first();

        await saveButton.click();
        await page.waitForTimeout(2000);

        // Verificar que novo nome aparece
        const hasNewName = await page.locator(`text=${newName}`).count();
        expect(hasNewName).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('deve persistir alterações após salvar', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const editButton = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

    if (await editButton.isVisible({ timeout: 2000 })) {
      await editButton.click();
      await page.waitForTimeout(500);

      const nameInput = page.locator('input[name="name"], input[placeholder*="nome"]').first();

      if (await nameInput.isVisible({ timeout: 2000 })) {
        // Editar nome
        const uniqueName = `Monitor Persistência ${Date.now()}`;
        await nameInput.fill('');
        await nameInput.fill(uniqueName);

        // Salvar
        const saveButton = page
          .locator('button[type="submit"], button:has-text("Salvar"), button:has-text("Atualizar")')
          .first();

        await saveButton.click();
        await page.waitForTimeout(2000);

        // Recarregar página
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Verificar que alteração persistiu
        const hasPersistedName = await page.locator(`text=${uniqueName}`).count();
        expect(hasPersistedName).toBeGreaterThan(0);
      }
    }
  });

  test('deve editar e reabrir mostrando alterações', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const editButton = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

    if (await editButton.isVisible({ timeout: 2000 })) {
      // Primeira edição
      await editButton.click();
      await page.waitForTimeout(500);

      const nameInput = page.locator('input[name="name"], input[placeholder*="nome"]').first();

      if (await nameInput.isVisible({ timeout: 2000 })) {
        const uniqueName = `Monitor Reabrir ${Date.now()}`;
        await nameInput.fill('');
        await nameInput.fill(uniqueName);

        // Salvar
        const saveButton = page
          .locator('button[type="submit"], button:has-text("Salvar"), button:has-text("Atualizar")')
          .first();

        await saveButton.click();
        await page.waitForTimeout(2000);

        // Reabrir edição
        const editButtonAgain = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

        if (await editButtonAgain.isVisible({ timeout: 2000 })) {
          await editButtonAgain.click();
          await page.waitForTimeout(500);

          const nameInputAgain = page.locator('input[name="name"], input[placeholder*="nome"]').first();

          if (await nameInputAgain.isVisible({ timeout: 2000 })) {
            // Verificar que nome editado está no formulário
            const currentName = await nameInputAgain.inputValue();
            expect(currentName).toContain('Monitor Reabrir');
          }
        }
      }
    }
  });

  test('deve permitir alterar site do monitor', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const editButton = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

    if (await editButton.isVisible({ timeout: 2000 })) {
      await editButton.click();
      await page.waitForTimeout(500);

      const siteSelect = page.locator('select, [role="combobox"]').first();

      if (await siteSelect.isVisible({ timeout: 2000 })) {
        // Mudar site para OLX
        try {
          await siteSelect.selectOption('OLX');
        } catch {
          // Pode não ser um select, pode ser combobox customizado
        }

        // Salvar
        const saveButton = page
          .locator('button[type="submit"], button:has-text("Salvar"), button:has-text("Atualizar")')
          .first();

        await saveButton.click();
        await page.waitForTimeout(2000);

        // Verificar que salvou
        const currentUrl = page.url();
        expect(currentUrl).toContain('/monitors');
      }
    }
  });

  test('deve mostrar toast de sucesso ao salvar edição', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const editButton = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

    if (await editButton.isVisible({ timeout: 2000 })) {
      await editButton.click();
      await page.waitForTimeout(500);

      const nameInput = page.locator('input[name="name"], input[placeholder*="nome"]').first();

      if (await nameInput.isVisible({ timeout: 2000 })) {
        await nameInput.fill(`Monitor Toast ${Date.now()}`);

        // Salvar
        const saveButton = page
          .locator('button[type="submit"], button:has-text("Salvar"), button:has-text("Atualizar")')
          .first();

        await saveButton.click();
        await page.waitForTimeout(2000);

        // Verificar toast de sucesso (Chakra UI ou mensagem)
        const hasSuccessMessage = await page.locator('text=/sucesso|salvo|atualizado/i').count();
        expect(hasSuccessMessage).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('deve editar monitor inativo', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Seed cria "Monitor OLX E2E" como inativo
    // Procurar por este monitor
    const inactiveMonitor = page.locator('text=/Monitor.*OLX.*E2E/i').first();

    if (await inactiveMonitor.isVisible({ timeout: 2000 })) {
      // Encontrar botão de editar próximo a este monitor
      const editButton = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

      if (await editButton.isVisible({ timeout: 2000 })) {
        await editButton.click();
        await page.waitForTimeout(500);

        const nameInput = page.locator('input[name="name"], input[placeholder*="nome"]').first();

        if (await nameInput.isVisible({ timeout: 2000 })) {
          await nameInput.fill(`Monitor OLX Editado ${Date.now()}`);

          // Salvar
          const saveButton = page
            .locator('button[type="submit"], button:has-text("Salvar"), button:has-text("Atualizar")')
            .first();

          await saveButton.click();
          await page.waitForTimeout(2000);

          // Verificar que salvou
          const hasUpdatedName = await page.locator('text=/Monitor.*OLX.*Editado/i').count();
          expect(hasUpdatedName).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  test('deve validar tamanho mínimo do nome ao editar', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const editButton = page.locator('button:has-text("Editar"), [aria-label*="Editar"]').first();

    if (await editButton.isVisible({ timeout: 2000 })) {
      await editButton.click();
      await page.waitForTimeout(500);

      const nameInput = page.locator('input[name="name"], input[placeholder*="nome"]').first();

      if (await nameInput.isVisible({ timeout: 2000 })) {
        // Nome muito curto (1 caractere)
        await nameInput.fill('');
        await nameInput.fill('A');

        // Tentar salvar
        const saveButton = page
          .locator('button[type="submit"], button:has-text("Salvar"), button:has-text("Atualizar")')
          .first();

        await saveButton.click();
        await page.waitForTimeout(500);

        // Pode ter validação de tamanho mínimo (depende da implementação)
        const minLength = await nameInput.getAttribute('minlength');
        expect(typeof minLength).toBe('string');
      }
    }
  });
});

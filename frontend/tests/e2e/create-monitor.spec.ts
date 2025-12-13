import { test, expect } from '@playwright/test';
import { login, clearStorage, TEST_USER } from './helpers';

test.describe('Create Monitor Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);

    // Mock da API de login
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          token: 'mock-jwt-token',
          user: { id: '1', name: TEST_USER.name, email: TEST_USER.email, role: 'USER' },
        }),
      });
    });

    // Mock da API de monitores - lista
    await page.route('**/api/monitors', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true, data: [], count: 0 }),
        });
      } else if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          body: JSON.stringify({
            success: true,
            data: {
              id: 'new-monitor-id',
              name: 'Teste Monitor',
              site: 'MERCADO_LIVRE',
              searchUrl: 'https://lista.mercadolivre.com.br/teste',
              active: true,
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await login(page);
  });

  test('deve exibir a página de monitores', async ({ page }) => {
    await page.goto('/monitors');

    await expect(page.locator('h1, h2').filter({ hasText: /monitor/i })).toBeVisible();
  });

  test('deve ter formulário de criação de monitor', async ({ page }) => {
    await page.goto('/monitors');

    // Verificar campos do formulário
    await expect(page.locator('input[name="name"], input[placeholder*="nome"]')).toBeVisible();
    await expect(page.locator('select, [role="combobox"]')).toBeVisible(); // Site selector
    await expect(page.locator('button[type="submit"], button:has-text("Criar"), button:has-text("Salvar")')).toBeVisible();
  });

  test('deve validar campos obrigatórios ao criar monitor', async ({ page }) => {
    await page.goto('/monitors');

    const submitButton = page.locator('button[type="submit"], button:has-text("Criar"), button:has-text("Salvar")').first();
    await submitButton.click();

    // HTML5 validation ou mensagem de erro
    await page.waitForTimeout(500);

    // Verifica se há algum campo required
    const requiredInputs = page.locator('input[required]');
    expect(await requiredInputs.count()).toBeGreaterThan(0);
  });

  test('deve criar um monitor com sucesso', async ({ page }) => {
    await page.goto('/monitors');

    // Preencher formulário
    await page.fill('input[name="name"], input[placeholder*="nome"]', 'Monitor Teste E2E');

    // Selecionar site (pode ser select ou combobox do Chakra)
    const siteSelector = page.locator('select').first();
    if (await siteSelector.count() > 0) {
      await siteSelector.selectOption('MERCADO_LIVRE');
    }

    // URL de busca
    const urlInput = page.locator('input[name="searchUrl"], input[placeholder*="URL"]');
    if (await urlInput.count() > 0) {
      await urlInput.fill('https://lista.mercadolivre.com.br/teste');
    }

    // Submit
    const submitButton = page.locator('button[type="submit"], button:has-text("Criar"), button:has-text("Salvar")').first();
    await submitButton.click();

    // Aguarda sucesso (toast ou redirecionamento)
    await page.waitForSelector('text=/sucesso|criado|salvo/i', { timeout: 5000 });
  });

  test('deve listar monitores existentes', async ({ page }) => {
    // Mock com monitores existentes
    await page.route('**/api/monitors', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            success: true,
            data: [
              {
                id: '1',
                name: 'Monitor 1',
                site: 'MERCADO_LIVRE',
                searchUrl: 'https://lista.mercadolivre.com.br/teste1',
                active: true,
              },
              {
                id: '2',
                name: 'Monitor 2',
                site: 'OLX',
                searchUrl: 'https://olx.com.br/teste2',
                active: false,
              },
            ],
            count: 2,
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/monitors');
    await page.reload();

    // Aguarda lista aparecer
    await page.waitForSelector('text=Monitor 1', { timeout: 5000 });
    await expect(page.locator('text=Monitor 1')).toBeVisible();
    await expect(page.locator('text=Monitor 2')).toBeVisible();
  });

  test('deve mostrar erro ao exceder limite de monitores', async ({ page }) => {
    // Mock de erro de limite
    await page.route('**/api/monitors', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 403,
          body: JSON.stringify({
            error: 'Limite de monitores atingido. Faça upgrade do seu plano.',
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/monitors');

    // Tentar criar monitor
    await page.fill('input[name="name"], input[placeholder*="nome"]', 'Monitor Excedente');
    const submitButton = page.locator('button[type="submit"], button:has-text("Criar")').first();
    await submitButton.click();

    // Aguarda mensagem de erro
    await page.waitForSelector('text=/limite|upgrade|plano/i', { timeout: 5000 });
  });
});

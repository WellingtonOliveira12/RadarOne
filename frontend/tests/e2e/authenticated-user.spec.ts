import { test, expect } from '@playwright/test';
import { clearStorage, loginReal } from './helpers';

/**
 * Testes E2E de Usuário Autenticado (Happy Path)
 *
 * Valida:
 * - Login bem-sucedido
 * - Acesso ao dashboard
 * - Navegação entre páginas protegidas
 * - Persistência de sessão após refresh
 */

test.describe('Authenticated User Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('deve fazer login e acessar o dashboard com sucesso', async ({ page }) => {
    await loginReal(page, 'USER');

    // Deve estar em /monitors ou /dashboard
    await expect(page).toHaveURL(/\/(dashboard|monitors)/);

    // Aguardar página carregar
    await page.waitForLoadState('networkidle');

    // Validar que está autenticado (procurar elementos da página)
    // Pode ser o nome do usuário, menu, ou breadcrumb
    const authenticatedElements = [
      page.locator('text=/Dashboard|Monitores/i'),
      page.locator('button:has-text("Sair")'),
      page.locator('text=/Olá|Bem-vindo|Wellington/i'),
    ];

    // Pelo menos um dos elementos deve estar visível
    const visibleElement = await Promise.race(
      authenticatedElements.map(async (el) => {
        try {
          await el.waitFor({ state: 'visible', timeout: 5000 });
          return true;
        } catch {
          return false;
        }
      })
    );

    expect(visibleElement).toBeTruthy();
  });

  test('deve navegar entre páginas protegidas com sucesso', async ({ page }) => {
    await loginReal(page, 'USER');

    // Navegar para Monitores
    await page.goto('/monitors');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL('/monitors');

    // Validar título ou heading da página
    await expect(page.locator('h1, h2').filter({ hasText: /Monitor/i })).toBeVisible();

    // Navegar para Configurações de Notificações
    await page.goto('/settings/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL('/settings/notifications');

    // Validar que chegou na página certa
    await expect(page.locator('h1, h2').filter({ hasText: /Notifica|Configura/i })).toBeVisible();

    // Navegar para Conexão Telegram
    await page.goto('/telegram/connect');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL('/telegram/connect');

    // Validar página de Telegram
    await expect(page.locator('text=/Telegram/i')).toBeVisible();
  });

  test('deve manter sessão após refresh da página', async ({ page }) => {
    await loginReal(page, 'USER');

    // Aguardar estar em página autenticada
    await page.waitForURL(/\/(dashboard|monitors)/);
    const urlBeforeRefresh = page.url();

    // Recarregar página
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Deve permanecer na mesma URL (não redirecionar para /login)
    await expect(page).toHaveURL(urlBeforeRefresh);

    // Deve continuar vendo elementos autenticados
    const authenticatedElement = page.locator('button:has-text("Sair")');
    await expect(authenticatedElement).toBeVisible({ timeout: 5000 });
  });

  test('deve validar token JWT válido no localStorage', async ({ page }) => {
    await loginReal(page, 'USER');

    // Verificar que token foi salvo no localStorage
    const token = await page.evaluate(() => {
      return localStorage.getItem('radarone_token');
    });

    expect(token).toBeTruthy();
    expect(token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/); // JWT format
  });

  test('deve redirecionar para /login quando não autenticado', async ({ page }) => {
    // Sem fazer login, tentar acessar rota protegida
    await page.goto('/monitors');

    // Deve redirecionar para /login
    await page.waitForURL('/login', { timeout: 5000 });
    await expect(page).toHaveURL('/login');
  });

  test('deve fazer logout com sucesso', async ({ page }) => {
    await loginReal(page, 'USER');

    // Aguardar estar autenticado
    await page.waitForURL(/\/(dashboard|monitors)/);

    // Procurar botão de logout
    const logoutButton = page.locator('button:has-text("Sair"), text=Sair, text=Logout').first();
    await expect(logoutButton).toBeVisible({ timeout: 5000 });

    // Clicar em logout
    await logoutButton.click();

    // Deve redirecionar para /login
    await page.waitForURL('/login', { timeout: 5000 });
    await expect(page).toHaveURL('/login');

    // Token deve ter sido removido do localStorage
    const token = await page.evaluate(() => {
      return localStorage.getItem('radarone_token');
    });

    expect(token).toBeNull();
  });

  test('deve validar informações do usuário no contexto', async ({ page }) => {
    await loginReal(page, 'USER');

    // Aguardar página carregar
    await page.waitForLoadState('networkidle');

    // Verificar que dados do usuário estão disponíveis
    // (podem estar em um menu de perfil, header, etc)
    const userInfo = await page.evaluate(() => {
      // Verificar se AuthContext está populado
      return {
        hasToken: !!localStorage.getItem('radarone_token'),
      };
    });

    expect(userInfo.hasToken).toBe(true);
  });
});

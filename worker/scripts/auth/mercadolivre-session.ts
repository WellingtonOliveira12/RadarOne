#!/usr/bin/env npx ts-node
/**
 * ============================================================
 * GERADOR DE SESSÃO - MERCADO LIVRE
 * ============================================================
 *
 * Script específico para gerar sessão do Mercado Livre.
 * Inclui validação extra e testes de busca.
 *
 * Uso:
 *   npx ts-node scripts/auth/mercadolivre-session.ts
 *   npx ts-node scripts/auth/mercadolivre-session.ts --validate
 *   npx ts-node scripts/auth/mercadolivre-session.ts --test-search "iphone 14"
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const SITE_ID = 'MERCADO_LIVRE';
const DISPLAY_NAME = 'Mercado Livre';
const LOGIN_URL = 'https://www.mercadolivre.com.br/login';
const HOME_URL = 'https://www.mercadolivre.com.br/';
const ACCOUNT_URL = 'https://myaccount.mercadolivre.com.br/';
const SEARCH_BASE = 'https://lista.mercadolivre.com.br/';

const LOGGED_IN_SELECTORS = [
  '[data-js="user-info"]',
  '.nav-header-user-info',
  '.nav-menu-user-info',
  '#nav-header-menu-switch',
  '[class*="user-nickname"]',
  '.nav-icon-user-default-icon',
];

const LOGIN_PAGE_SELECTORS = [
  'input[name="user_id"]',
  '#login_user_id',
  'form[action*="login"]',
];

const LOGIN_REQUIRED_TEXTS = [
  'para continuar, acesse sua conta',
  'acesse sua conta',
  'faça login',
  'entre na sua conta',
];

// Diretório de sessões
const SESSIONS_DIR = path.join(process.cwd(), 'sessions');
const SESSION_PATH = path.join(SESSIONS_DIR, 'mercado_livre.json');

// ============================================================
// HELPERS
// ============================================================

function printHeader(): void {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  GERADOR DE SESSÃO - MERCADO LIVRE');
  console.log('═'.repeat(60));
  console.log('');
}

async function waitForEnter(message: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

async function checkLoggedIn(page: Page): Promise<{ isLoggedIn: boolean; method: string }> {
  // Método 1: Seletores
  for (const selector of LOGGED_IN_SELECTORS) {
    try {
      const element = await page.$(selector);
      if (element) {
        return { isLoggedIn: true, method: `Seletor: ${selector}` };
      }
    } catch {
      // Continua
    }
  }

  // Método 2: Verifica se NÃO é página de login
  const bodyText = await page.evaluate(() =>
    document.body?.innerText?.toLowerCase() || ''
  );

  for (const text of LOGIN_REQUIRED_TEXTS) {
    if (bodyText.includes(text)) {
      return { isLoggedIn: false, method: `Texto de login: ${text}` };
    }
  }

  for (const selector of LOGIN_PAGE_SELECTORS) {
    try {
      const element = await page.$(selector);
      if (element) {
        return { isLoggedIn: false, method: `Seletor de login: ${selector}` };
      }
    } catch {
      // Continua
    }
  }

  // Método 3: Verifica se tem nome de usuário na página
  const hasUserName = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    // Procura por padrões como "Olá, Nome" ou "Minha conta"
    return text.includes('Minha conta') || text.includes('Minhas compras');
  });

  if (hasUserName) {
    return { isLoggedIn: true, method: 'Texto de usuário logado' };
  }

  return { isLoggedIn: false, method: 'Não determinado' };
}

async function testSearch(page: Page, query: string): Promise<boolean> {
  console.log(`\n🔍 Testando busca: "${query}"...`);

  const searchUrl = `${SEARCH_BASE}${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Verifica se precisa de login
  const bodyText = await page.evaluate(() =>
    document.body?.innerText?.toLowerCase() || ''
  );

  for (const text of LOGIN_REQUIRED_TEXTS) {
    if (bodyText.includes(text)) {
      console.log(`❌ Busca requer login: "${text}"`);
      return false;
    }
  }

  // Verifica se tem resultados
  const hasResults = await page.evaluate(() => {
    const selectors = [
      '.ui-search-result',
      '.ui-search-layout__item',
      '[class*="search-result"]',
    ];

    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      if (elements.length > 0) {
        return elements.length;
      }
    }
    return 0;
  });

  if (hasResults > 0) {
    console.log(`✅ Busca funcionando: ${hasResults} resultados encontrados`);
    return true;
  }

  // Verifica se é "nenhum resultado" legítimo
  if (bodyText.includes('não encontramos') || bodyText.includes('sem resultados')) {
    console.log('ℹ️  Busca funcionando: nenhum resultado (legítimo)');
    return true;
  }

  console.log('⚠️  Busca: estado indeterminado');
  return false;
}

// ============================================================
// MODOS DE OPERAÇÃO
// ============================================================

async function generateSession(): Promise<void> {
  printHeader();
  console.log('📍 Modo: Gerar nova sessão');
  console.log('');

  await fs.mkdir(SESSIONS_DIR, { recursive: true });

  let browser: Browser | null = null;

  try {
    console.log('🚀 Abrindo navegador...');

    browser = await chromium.launch({
      headless: false,
      slowMo: 50,
      args: ['--start-maximized'],
    });

    const context = await browser.newContext({
      viewport: null,
      locale: 'pt-BR',
    });

    const page = await context.newPage();

    console.log(`📄 Navegando para ${LOGIN_URL}...`);
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    console.log('');
    console.log('═'.repeat(60));
    console.log('');
    console.log('👤 FAÇA LOGIN MANUALMENTE NO NAVEGADOR');
    console.log('');
    console.log('   1. Complete o login no navegador');
    console.log('   2. Se houver verificação por e-mail/SMS, complete');
    console.log('   3. Aguarde a página inicial do ML carregar');
    console.log('   4. Volte aqui e pressione ENTER');
    console.log('');
    console.log('═'.repeat(60));
    console.log('');

    await waitForEnter('📌 Pressione ENTER quando estiver logado... ');

    console.log('');
    console.log('🔍 Verificando login...');

    // Navega para home
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const loginCheck = await checkLoggedIn(page);
    console.log(`   Status: ${loginCheck.isLoggedIn ? '✅ Logado' : '❌ Não logado'}`);
    console.log(`   Método: ${loginCheck.method}`);

    if (!loginCheck.isLoggedIn) {
      console.log('');
      console.log('⚠️  Login não detectado. Verificando página de conta...');

      await page.goto(ACCOUNT_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const accountCheck = await checkLoggedIn(page);
      console.log(`   Status: ${accountCheck.isLoggedIn ? '✅ Logado' : '❌ Não logado'}`);

      if (!accountCheck.isLoggedIn) {
        await waitForEnter('\n   Salvar sessão mesmo assim? (ENTER sim, Ctrl+C cancelar) ');
      }
    }

    // Testa busca
    const searchWorks = await testSearch(page, 'iphone');

    // Salva sessão
    console.log('\n💾 Salvando sessão...');
    await context.storageState({ path: SESSION_PATH });
    console.log(`✅ Sessão salva em: ${SESSION_PATH}`);

    // Gera base64
    const sessionContent = await fs.readFile(SESSION_PATH, 'utf-8');
    const base64Content = Buffer.from(sessionContent).toString('base64');

    // Salva base64 em arquivo separado para facilitar cópia
    const base64Path = path.join(SESSIONS_DIR, 'mercado_livre.base64.txt');
    await fs.writeFile(base64Path, base64Content, 'utf-8');

    console.log('');
    console.log('═'.repeat(60));
    console.log('');
    console.log('📋 CONFIGURAÇÃO PARA O RENDER:');
    console.log('');
    console.log('   Opção 1 - Variável de Ambiente:');
    console.log(`   Nome: SESSION_MERCADO_LIVRE`);
    console.log(`   Valor: (conteúdo do arquivo ${base64Path})`);
    console.log('');
    console.log('   Opção 2 - Secret File:');
    console.log(`   Path no Render: /tmp/radarone-sessions/mercado_livre.json`);
    console.log(`   Conteúdo: copie de ${SESSION_PATH}`);
    console.log('');
    console.log('═'.repeat(60));
    console.log('');
    console.log(`📁 Arquivos gerados:`);
    console.log(`   - ${SESSION_PATH} (storageState JSON)`);
    console.log(`   - ${base64Path} (base64 para env var)`);
    console.log('');
    console.log('✨ Sessão gerada com sucesso!');
    console.log('');

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function validateSession(): Promise<void> {
  printHeader();
  console.log('📍 Modo: Validar sessão existente');
  console.log('');

  try {
    await fs.access(SESSION_PATH);
  } catch {
    console.error(`❌ Sessão não encontrada: ${SESSION_PATH}`);
    console.error('   Execute primeiro: npx ts-node scripts/auth/mercadolivre-session.ts');
    process.exit(1);
  }

  let browser: Browser | null = null;

  try {
    console.log('🚀 Abrindo navegador com sessão...');

    browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      storageState: SESSION_PATH,
      locale: 'pt-BR',
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    // Teste 1: Home
    console.log('\n🔍 Teste 1: Verificando home...');
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const homeCheck = await checkLoggedIn(page);
    console.log(`   Home: ${homeCheck.isLoggedIn ? '✅ Logado' : '❌ Não logado'} (${homeCheck.method})`);

    // Teste 2: Minha conta
    console.log('\n🔍 Teste 2: Verificando minha conta...');
    await page.goto(ACCOUNT_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const accountCheck = await checkLoggedIn(page);
    console.log(`   Conta: ${accountCheck.isLoggedIn ? '✅ Logado' : '❌ Não logado'} (${accountCheck.method})`);

    // Teste 3: Busca
    const searchWorks = await testSearch(page, 'iphone 14');

    // Resultado
    console.log('');
    console.log('═'.repeat(60));
    console.log('');

    const allPassed = homeCheck.isLoggedIn && accountCheck.isLoggedIn && searchWorks;

    if (allPassed) {
      console.log('✅ SESSÃO VÁLIDA - Todos os testes passaram');
    } else {
      console.log('⚠️  SESSÃO PODE ESTAR EXPIRADA');
      console.log('   Recomendação: gere uma nova sessão');
    }

    console.log('');
    console.log('═'.repeat(60));
    console.log('');

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function testSearchWithSession(query: string): Promise<void> {
  printHeader();
  console.log(`📍 Modo: Testar busca "${query}"`);
  console.log('');

  try {
    await fs.access(SESSION_PATH);
  } catch {
    console.error(`❌ Sessão não encontrada: ${SESSION_PATH}`);
    process.exit(1);
  }

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
      storageState: SESSION_PATH,
      locale: 'pt-BR',
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();
    const result = await testSearch(page, query);

    process.exit(result ? 0 : 1);

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--validate') || args.includes('-v')) {
    await validateSession();
  } else if (args.includes('--test-search') || args.includes('-t')) {
    const queryIndex = args.findIndex(a => a === '--test-search' || a === '-t');
    const query = args[queryIndex + 1] || 'iphone';
    await testSearchWithSession(query);
  } else if (args.includes('--help') || args.includes('-h')) {
    printHeader();
    console.log('Uso:');
    console.log('  npx ts-node scripts/auth/mercadolivre-session.ts');
    console.log('      Gera nova sessão (abre navegador para login manual)');
    console.log('');
    console.log('  npx ts-node scripts/auth/mercadolivre-session.ts --validate');
    console.log('      Valida sessão existente');
    console.log('');
    console.log('  npx ts-node scripts/auth/mercadolivre-session.ts --test-search "query"');
    console.log('      Testa busca com sessão existente');
    console.log('');
  } else {
    await generateSession();
  }
}

main().catch((error) => {
  console.error('Erro fatal:', error);
  process.exit(1);
});

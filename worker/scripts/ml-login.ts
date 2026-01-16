#!/usr/bin/env npx ts-node
/**
 * ============================================================
 * ML LOGIN - Script para Login Manual no Mercado Livre
 * ============================================================
 *
 * Este script abre um navegador VISIVEL para voce fazer login
 * manualmente no Mercado Livre. Apos o login, ele salva a sessao
 * (storageState) que pode ser usada pelo worker.
 *
 * USO:
 *   npm run ml:login
 *
 * O QUE FAZ:
 *   1. Abre Chromium visivel na pagina do Mercado Livre
 *   2. Voce faz login manualmente (QR Code, SMS, Email, etc)
 *   3. Pressiona ENTER quando estiver logado
 *   4. Salva a sessao em worker/sessions/mercadolivre/storageState.json
 *   5. Gera base64 para configurar no Render
 *
 * PROXIMOS PASSOS:
 *   - Local: A sessao ja esta salva e pode ser usada
 *   - Render: Configure ML_STORAGE_STATE_B64 com o valor base64
 */

import { chromium, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================
// CONFIGURACOES
// ============================================================

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions', 'mercadolivre');
const STORAGE_STATE_PATH = path.join(SESSIONS_DIR, 'storageState.json');
const BASE64_PATH = path.join(SESSIONS_DIR, 'storageState.base64.txt');

const ML_LOGIN_URL = 'https://www.mercadolivre.com.br/';
const ML_PROFILE_URL = 'https://www.mercadolivre.com.br/minha-conta';

// ============================================================
// UTILIDADES
// ============================================================

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function waitForEnter(message: string): Promise<void> {
  const rl = createReadlineInterface();
  return new Promise((resolve) => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

async function isLoggedIn(context: BrowserContext): Promise<boolean> {
  const page = await context.newPage();

  try {
    await page.goto(ML_PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Verifica se esta na pagina de login ou perfil
    const url = page.url();
    const isLoginPage = url.includes('/login') || url.includes('/gz/account-verification');

    if (isLoginPage) {
      await page.close();
      return false;
    }

    // Verifica seletores que indicam usuario logado
    const loggedInSelectors = [
      '[data-js="user-info"]',
      '.nav-header-user-info',
      '.nav-menu-user-info',
      '#nav-header-menu-switch',
      '[class*="user-nickname"]',
      '.user-info',
    ];

    for (const selector of loggedInSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await page.close();
          return true;
        }
      } catch {
        // Continua verificando
      }
    }

    // Verifica se tem textos de login
    const bodyText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '');
    const hasLoginText = bodyText.includes('entre na sua conta') ||
                         bodyText.includes('acesse sua conta') ||
                         bodyText.includes('faca login');

    await page.close();
    return !hasLoginText;
  } catch (error) {
    try { await page.close(); } catch {}
    return false;
  }
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  console.log('');
  console.log('='.repeat(60));
  console.log('  MERCADO LIVRE - LOGIN MANUAL');
  console.log('='.repeat(60));
  console.log('');
  console.log('Este script vai abrir um navegador para voce fazer login');
  console.log('manualmente no Mercado Livre.');
  console.log('');
  console.log('IMPORTANTE:');
  console.log('  - O navegador vai abrir em modo VISIVEL');
  console.log('  - Faca login usando seu metodo preferido');
  console.log('    (QR Code, SMS, Email, senha, etc)');
  console.log('  - Apos fazer login, volte aqui e pressione ENTER');
  console.log('');
  console.log('-'.repeat(60));

  // Cria diretorio de sessoes
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    console.log(`Diretorio criado: ${SESSIONS_DIR}`);
  }

  // Lanca browser VISIVEL (headful)
  console.log('');
  console.log('Abrindo navegador...');

  const browser = await chromium.launch({
    headless: false, // IMPORTANTE: Modo visivel!
    args: [
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    locale: 'pt-BR',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    // Navega para o Mercado Livre
    console.log('Navegando para Mercado Livre...');
    await page.goto(ML_LOGIN_URL, { waitUntil: 'domcontentloaded' });

    console.log('');
    console.log('-'.repeat(60));
    console.log('');
    console.log('>>> O navegador esta aberto <<<');
    console.log('');
    console.log('INSTRUCOES:');
    console.log('  1. No navegador, clique em "Entre" ou "Entrar"');
    console.log('  2. Faca login com seu metodo preferido');
    console.log('  3. Complete qualquer verificacao (SMS, Email, etc)');
    console.log('  4. Quando estiver logado, volte aqui');
    console.log('');

    await waitForEnter('Pressione ENTER quando estiver logado no Mercado Livre...');

    // Verifica se realmente esta logado
    console.log('');
    console.log('Verificando status de login...');

    const logged = await isLoggedIn(context);

    if (!logged) {
      console.log('');
      console.log('AVISO: Nao foi possivel confirmar que voce esta logado.');
      console.log('Verifique se completou o login e tente novamente.');
      console.log('');
      await waitForEnter('Pressione ENTER para tentar salvar mesmo assim, ou Ctrl+C para cancelar...');
    } else {
      console.log('Login confirmado!');
    }

    // Salva storageState
    console.log('');
    console.log('Salvando sessao...');

    await context.storageState({ path: STORAGE_STATE_PATH });
    console.log(`Sessao salva em: ${STORAGE_STATE_PATH}`);

    // Gera base64
    const storageContent = fs.readFileSync(STORAGE_STATE_PATH, 'utf-8');
    const base64Content = Buffer.from(storageContent).toString('base64');
    fs.writeFileSync(BASE64_PATH, base64Content, 'utf-8');
    console.log(`Base64 salvo em: ${BASE64_PATH}`);

    // Mostra resumo
    console.log('');
    console.log('='.repeat(60));
    console.log('  SESSAO SALVA COM SUCESSO!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Arquivos gerados:');
    console.log(`  - ${STORAGE_STATE_PATH}`);
    console.log(`  - ${BASE64_PATH}`);
    console.log('');
    console.log('-'.repeat(60));
    console.log('PROXIMOS PASSOS:');
    console.log('-'.repeat(60));
    console.log('');
    console.log('1. Para usar LOCALMENTE:');
    console.log('   A sessao ja sera carregada automaticamente.');
    console.log('');
    console.log('2. Para usar no RENDER (Opcao A - Secret File):');
    console.log('   - Va em Environment > Secret Files');
    console.log('   - Crie um arquivo: ml-storage-state.json');
    console.log('   - Cole o conteudo de storageState.json');
    console.log('   - Configure: ML_STORAGE_STATE_PATH=/etc/secrets/ml-storage-state.json');
    console.log('');
    console.log('3. Para usar no RENDER (Opcao B - ENV Base64):');
    console.log('   - Va em Environment > Environment Variables');
    console.log('   - Crie: ML_STORAGE_STATE_B64');
    console.log('   - Cole o conteudo de storageState.base64.txt');
    console.log('');
    console.log('Para copiar o base64, execute:');
    console.log(`   npm run ml:state:encode`);
    console.log('');
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('');
    console.error('ERRO:', error.message);
    console.error('');
  } finally {
    // Fecha browser
    console.log('');
    console.log('Fechando navegador...');
    await browser.close();
  }
}

// Executa
main().catch((error) => {
  console.error('Erro fatal:', error);
  process.exit(1);
});

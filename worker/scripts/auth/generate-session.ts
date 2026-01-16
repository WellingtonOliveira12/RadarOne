#!/usr/bin/env npx ts-node
/**
 * ============================================================
 * GERADOR DE SESSÃO - Script CLI
 * ============================================================
 *
 * Este script deve ser executado LOCALMENTE (não no Render).
 * Ele abre um navegador visível para você fazer login manualmente,
 * depois captura e salva o storageState.
 *
 * Uso:
 *   npx ts-node scripts/auth/generate-session.ts MERCADO_LIVRE
 *   npx ts-node scripts/auth/generate-session.ts SUPERBID
 *
 * Após gerar:
 * 1. O arquivo JSON é salvo em ./sessions/{site}.json
 * 2. O base64 é exibido para configurar como env var no Render
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';

// Importa configurações de sites
// Note: ajuste o path se necessário dependendo de onde rodar
const AUTH_SITES: Record<string, any> = {
  MERCADO_LIVRE: {
    siteId: 'MERCADO_LIVRE',
    displayName: 'Mercado Livre',
    loginUrl: 'https://www.mercadolivre.com.br/login',
    validationUrl: 'https://www.mercadolivre.com.br/',
    domain: 'mercadolivre.com.br',
    loggedInSelectors: [
      '[data-js="user-info"]',
      '.nav-header-user-info',
      '.nav-menu-user-info',
      '#nav-header-menu-switch',
    ],
  },
  SUPERBID: {
    siteId: 'SUPERBID',
    displayName: 'Superbid',
    loginUrl: 'https://www.superbid.net/login',
    validationUrl: 'https://www.superbid.net/',
    domain: 'superbid.net',
    loggedInSelectors: ['.user-menu', '.minha-conta'],
  },
  SODRE_SANTORO: {
    siteId: 'SODRE_SANTORO',
    displayName: 'Sodré Santoro',
    loginUrl: 'https://www.sodresantoro.com.br/login',
    validationUrl: 'https://www.sodresantoro.com.br/',
    domain: 'sodresantoro.com.br',
    loggedInSelectors: ['.user-area'],
  },
  ZUKERMAN: {
    siteId: 'ZUKERMAN',
    displayName: 'Zukerman Leilões',
    loginUrl: 'https://www.zfranca.com.br/login',
    validationUrl: 'https://www.zfranca.com.br/',
    domain: 'zfranca.com.br',
    loggedInSelectors: ['.user-logged'],
  },
};

// Diretório de sessões
const SESSIONS_DIR = path.join(process.cwd(), 'sessions');

// ============================================================
// HELPERS
// ============================================================

function printHeader(): void {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  GERADOR DE SESSÃO - RadarOne');
  console.log('═'.repeat(60));
  console.log('');
}

function printUsage(): void {
  console.log('Uso: npx ts-node scripts/auth/generate-session.ts <SITE_ID>');
  console.log('');
  console.log('Sites disponíveis:');
  for (const [siteId, config] of Object.entries(AUTH_SITES)) {
    console.log(`  - ${siteId.padEnd(20)} (${config.displayName})`);
  }
  console.log('');
  console.log('Exemplo:');
  console.log('  npx ts-node scripts/auth/generate-session.ts MERCADO_LIVRE');
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

async function checkLoggedIn(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        return true;
      }
    } catch {
      // Continua verificando
    }
  }
  return false;
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  printHeader();

  // Obtém site da linha de comando
  const siteId = process.argv[2]?.toUpperCase();

  if (!siteId) {
    console.error('❌ Erro: Site não especificado\n');
    printUsage();
    process.exit(1);
  }

  const config = AUTH_SITES[siteId];
  if (!config) {
    console.error(`❌ Erro: Site "${siteId}" não suportado\n`);
    printUsage();
    process.exit(1);
  }

  console.log(`📍 Site: ${config.displayName} (${siteId})`);
  console.log(`🔗 URL de Login: ${config.loginUrl}`);
  console.log('');

  // Garante que diretório de sessões existe
  await fs.mkdir(SESSIONS_DIR, { recursive: true });

  let browser: Browser | null = null;

  try {
    console.log('🚀 Abrindo navegador...');
    console.log('');

    // Lança browser em modo HEADFUL (visível)
    browser = await chromium.launch({
      headless: false,
      slowMo: 100, // Desacelera um pouco para visualização
      args: [
        '--start-maximized',
      ],
    });

    const context = await browser.newContext({
      viewport: null, // Usa tamanho da janela
      locale: 'pt-BR',
    });

    const page = await context.newPage();

    // Navega para página de login
    console.log(`📄 Navegando para ${config.loginUrl}...`);
    await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded' });

    console.log('');
    console.log('═'.repeat(60));
    console.log('');
    console.log('👤 FAÇA LOGIN MANUALMENTE NO NAVEGADOR');
    console.log('');
    console.log('   1. Complete o login no navegador que abriu');
    console.log('   2. Se houver MFA/OTP, complete também');
    console.log('   3. Aguarde a página inicial carregar');
    console.log('   4. Volte aqui e pressione ENTER');
    console.log('');
    console.log('═'.repeat(60));
    console.log('');

    await waitForEnter('📌 Pressione ENTER quando estiver logado... ');

    console.log('');
    console.log('🔍 Verificando login...');

    // Navega para URL de validação
    await page.goto(config.validationUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Verifica se está logado
    const isLoggedIn = await checkLoggedIn(page, config.loggedInSelectors);

    if (!isLoggedIn) {
      console.log('');
      console.log('⚠️  Não foi possível detectar que você está logado.');
      console.log('   Os seletores de validação podem estar desatualizados.');
      console.log('');

      const continueAnyway = await waitForEnter(
        '   Deseja salvar a sessão mesmo assim? (ENTER para sim, Ctrl+C para cancelar) '
      );
    }

    console.log('');
    console.log('💾 Salvando sessão...');

    // Salva storageState
    const sessionPath = path.join(SESSIONS_DIR, `${siteId.toLowerCase()}.json`);
    await context.storageState({ path: sessionPath });

    console.log(`✅ Sessão salva em: ${sessionPath}`);
    console.log('');

    // Gera base64 para env var
    const sessionContent = await fs.readFile(sessionPath, 'utf-8');
    const base64Content = Buffer.from(sessionContent).toString('base64');

    console.log('═'.repeat(60));
    console.log('');
    console.log('📋 CONFIGURAÇÃO PARA O RENDER:');
    console.log('');
    console.log(`   Nome da variável: SESSION_${siteId}`);
    console.log('');
    console.log('   Valor (base64):');
    console.log('');

    // Exibe base64 em chunks para facilitar cópia
    const chunkSize = 76;
    for (let i = 0; i < base64Content.length; i += chunkSize) {
      console.log(`   ${base64Content.slice(i, i + chunkSize)}`);
    }

    console.log('');
    console.log('═'.repeat(60));
    console.log('');
    console.log('📝 PRÓXIMOS PASSOS:');
    console.log('');
    console.log('   1. Copie o valor base64 acima');
    console.log('   2. No Render, vá em Environment > Add Environment Variable');
    console.log(`   3. Nome: SESSION_${siteId}`);
    console.log('   4. Cole o valor base64');
    console.log('   5. Faça redeploy do worker');
    console.log('');
    console.log('   OU use Secret Files:');
    console.log(`   1. Copie o arquivo: ${sessionPath}`);
    console.log(`   2. No Render, crie Secret File: /tmp/radarone-sessions/${siteId.toLowerCase()}.json`);
    console.log('');
    console.log('═'.repeat(60));
    console.log('');
    console.log('✨ Concluído!');
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error(`❌ Erro: ${error.message}`);
    console.error('');
    process.exit(1);
  } finally {
    if (browser) {
      console.log('🔒 Fechando navegador...');
      await browser.close();
    }
  }
}

// Executa
main().catch((error) => {
  console.error('Erro fatal:', error);
  process.exit(1);
});

#!/usr/bin/env npx ts-node
/**
 * ============================================================
 * GERADOR DE SESSÃO PARA USUÁRIO
 * ============================================================
 *
 * Script interativo que guia o usuário para fazer login e exportar storageState.
 * O arquivo gerado deve ser enviado via upload no RadarOne.
 *
 * USO:
 *   npx ts-node scripts/generate-user-session.ts
 *   # ou
 *   npm run session:generate
 */

import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================
// CONFIGURAÇÃO DE SITES
// ============================================================

interface SiteConfig {
  name: string;
  loginUrl: string;
  successIndicators: string[];
  outputFile: string;
  instructions: string[];
}

const SITES: Record<string, SiteConfig> = {
  MERCADO_LIVRE: {
    name: 'Mercado Livre',
    loginUrl: 'https://www.mercadolivre.com.br/login',
    successIndicators: [
      '[data-js="user-info"]',
      '.nav-header-user-info',
      '.nav-menu-user-info',
      '#nav-header-menu-switch',
    ],
    outputFile: 'mercadolivre-session.json',
    instructions: [
      '1. O navegador vai abrir na página de login do Mercado Livre',
      '2. Digite seu email e clique em "Continuar"',
      '3. Digite sua senha e clique em "Entrar"',
      '4. Se pedir verificação 2FA (código por SMS/email/app), complete',
      '5. Aguarde a página inicial carregar completamente',
      '6. O script vai detectar automaticamente e salvar a sessão',
    ],
  },
  SUPERBID: {
    name: 'Superbid',
    loginUrl: 'https://www.superbid.net/login',
    successIndicators: ['.user-menu', '.logged-in', '[data-user]'],
    outputFile: 'superbid-session.json',
    instructions: [
      '1. O navegador vai abrir na página de login do Superbid',
      '2. Digite seu email e senha',
      '3. Clique em "Entrar"',
      '4. Complete qualquer verificação adicional se solicitado',
      '5. Aguarde a página inicial carregar',
      '6. O script vai detectar automaticamente e salvar a sessão',
    ],
  },
};

// ============================================================
// HELPERS
// ============================================================

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function printBox(title: string, lines: string[]): void {
  const maxLen = Math.max(title.length, ...lines.map((l) => l.length)) + 4;
  const border = '═'.repeat(maxLen);

  console.log(`\n╔${border}╗`);
  console.log(`║  ${title.padEnd(maxLen - 2)}║`);
  console.log(`╠${border}╣`);
  for (const line of lines) {
    console.log(`║  ${line.padEnd(maxLen - 2)}║`);
  }
  console.log(`╚${border}╝\n`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.clear();
  printBox('RADARONE - GERADOR DE SESSÃO AUTENTICADA', [
    'Este script ajuda você a criar uma sessão de login',
    'para usar no RadarOne.',
    '',
    'Seus dados de login NÃO são armazenados.',
    'Apenas os cookies de sessão são salvos.',
  ]);

  // Lista sites disponíveis
  console.log('Sites disponíveis:\n');
  const siteKeys = Object.keys(SITES);
  siteKeys.forEach((key, i) => {
    console.log(`  ${i + 1}. ${SITES[key].name}`);
  });

  // Escolha do site
  const choice = await prompt('\nDigite o número do site: ');
  const siteIndex = parseInt(choice) - 1;

  if (isNaN(siteIndex) || siteIndex < 0 || siteIndex >= siteKeys.length) {
    console.error('\n❌ Opção inválida. Tente novamente.\n');
    process.exit(1);
  }

  const siteKey = siteKeys[siteIndex];
  const config = SITES[siteKey];

  // Mostra instruções
  printBox(`INSTRUÇÕES - ${config.name.toUpperCase()}`, config.instructions);

  await prompt('Pressione ENTER para abrir o navegador...');

  console.log('\n🌐 Abrindo navegador...\n');

  // Abre navegador VISÍVEL
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
    slowMo: 50, // Deixa um pouco mais lento para o usuário acompanhar
  });

  const context = await browser.newContext({
    locale: 'pt-BR',
    viewport: null, // Usa tamanho da janela
  });

  const page = await context.newPage();

  console.log(`📍 Navegando para ${config.loginUrl}\n`);
  await page.goto(config.loginUrl);

  console.log('⏳ Aguardando você fazer login...');
  console.log('   (O script detecta automaticamente quando você terminar)\n');

  // Aguarda indicador de login com timeout de 5 minutos
  try {
    // Tenta cada seletor
    const selector = config.successIndicators.join(', ');

    await page.waitForSelector(selector, {
      timeout: 5 * 60 * 1000, // 5 minutos
      state: 'attached',
    });

    // Aguarda mais um pouco para cookies serem definidos
    console.log('🔄 Detectado! Aguardando cookies serem salvos...');
    await page.waitForTimeout(3000);

    console.log('✅ Login detectado com sucesso!\n');

    // Salva storageState
    const outputPath = path.join(process.cwd(), config.outputFile);
    const storageState = await context.storageState();

    // Estatísticas
    const cookieCount = storageState.cookies.length;
    const domains = [...new Set(storageState.cookies.map((c) => c.domain))];

    await fs.writeFile(outputPath, JSON.stringify(storageState, null, 2));

    printBox('SESSÃO SALVA COM SUCESSO!', [
      `Arquivo: ${config.outputFile}`,
      `Cookies: ${cookieCount}`,
      `Domínios: ${domains.slice(0, 3).join(', ')}${domains.length > 3 ? '...' : ''}`,
      '',
      'PRÓXIMO PASSO:',
      '',
      '1. Acesse o RadarOne',
      '2. Vá em Configurações → Conexões',
      '3. Clique em "Conectar ' + config.name + '"',
      '4. Faça upload do arquivo ' + config.outputFile,
    ]);

    // Gera base64 também (útil para env var)
    const base64 = Buffer.from(JSON.stringify(storageState)).toString('base64');
    const base64File = config.outputFile.replace('.json', '-base64.txt');
    await fs.writeFile(path.join(process.cwd(), base64File), base64);

    console.log(`💡 Também gerado: ${base64File} (para configurar via env var)\n`);
  } catch (error: any) {
    if (error.name === 'TimeoutError') {
      console.error('\n❌ Tempo esgotado (5 minutos).');
      console.error('   O login não foi detectado a tempo.');
      console.error('   Tente novamente e complete o login mais rapidamente.\n');
    } else {
      console.error(`\n❌ Erro: ${error.message}\n`);
    }
  } finally {
    console.log('🔒 Fechando navegador...\n');
    await browser.close();
  }
}

// Executa
main().catch((error) => {
  console.error('Erro fatal:', error);
  process.exit(1);
});

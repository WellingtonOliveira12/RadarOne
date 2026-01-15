#!/usr/bin/env node
/**
 * Verifica se os browsers do Playwright estão disponíveis
 *
 * Executado no início do worker para diagnóstico.
 * NÃO falha se os browsers não existirem (apenas loga warning).
 */

const path = require('path');
const fs = require('fs');

const BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ||
  path.resolve(process.cwd(), 'pw-browsers');

console.log('🎭 Playwright Browser Check');
console.log(`   CWD: ${process.cwd()}`);
console.log(`   PLAYWRIGHT_BROWSERS_PATH: ${BROWSERS_PATH}`);

if (!fs.existsSync(BROWSERS_PATH)) {
  console.warn('⚠️  Diretório de browsers NÃO existe!');
  console.warn('   Os scrapers vão falhar ao tentar usar Playwright.');
  console.warn('   Execute: npm run playwright:setup');
  // Não falha, apenas avisa
} else {
  const contents = fs.readdirSync(BROWSERS_PATH);
  const chromiumDirs = contents.filter(d => d.startsWith('chromium'));

  if (chromiumDirs.length > 0) {
    console.log(`✅ Browsers disponíveis: ${chromiumDirs.join(', ')}`);
  } else {
    console.warn('⚠️  Chromium NÃO encontrado no diretório de browsers!');
    console.warn(`   Conteúdo: ${contents.join(', ') || '(vazio)'}`);
  }
}

console.log('');

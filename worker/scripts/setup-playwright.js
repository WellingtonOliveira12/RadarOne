#!/usr/bin/env node
/**
 * Setup Playwright Browsers
 *
 * Este script instala os browsers do Playwright em um diretório
 * controlado dentro do projeto, garantindo que eles existam em runtime.
 *
 * Usado no build do Render para evitar problemas de cache.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Diretório dos browsers (relativo ao diretório de trabalho atual, que deve ser worker/)
const BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ||
  path.resolve(process.cwd(), 'pw-browsers');

console.log('='.repeat(60));
console.log('🎭 Playwright Browser Setup');
console.log('='.repeat(60));
console.log(`📁 CWD: ${process.cwd()}`);
console.log(`📁 PLAYWRIGHT_BROWSERS_PATH: ${BROWSERS_PATH}`);

// Cria o diretório se não existir
if (!fs.existsSync(BROWSERS_PATH)) {
  console.log('📁 Criando diretório de browsers...');
  fs.mkdirSync(BROWSERS_PATH, { recursive: true });
}

// Instala os browsers
console.log('\n📥 Instalando Chromium...');
try {
  execSync('npx playwright install chromium', {
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: BROWSERS_PATH,
    },
  });
  console.log('✅ Chromium instalado com sucesso!');
} catch (error) {
  console.error('❌ Erro ao instalar Chromium:', error.message);
  process.exit(1);
}

// Verifica se os browsers foram instalados
console.log('\n🔍 Verificando instalação...');

try {
  const contents = fs.readdirSync(BROWSERS_PATH);
  console.log(`📁 Conteúdo de pw-browsers: ${contents.join(', ')}`);

  const chromiumDirs = contents.filter(d => d.startsWith('chromium'));
  if (chromiumDirs.length > 0) {
    console.log(`✅ Chromium encontrado: ${chromiumDirs.join(', ')}`);
  } else {
    console.error('❌ Nenhum diretório do Chromium encontrado!');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Erro ao verificar instalação:', error.message);
  process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('✅ Setup completo!');
console.log('='.repeat(60));
console.log('\n📌 CONFIGURE NO RENDER (Environment Variables):');
console.log(`   PLAYWRIGHT_BROWSERS_PATH=./pw-browsers`);
console.log('');

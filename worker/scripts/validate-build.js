#!/usr/bin/env node
/**
 * Validate Build Script
 *
 * Valida que o build foi executado corretamente:
 * 1. Prisma client foi gerado
 * 2. Playwright browser foi instalado
 * 3. Diretório dist existe
 *
 * Usado após o build para garantir que tudo está OK.
 */

const fs = require('fs');
const path = require('path');

const ERRORS = [];
const WARNINGS = [];

console.log('='.repeat(60));
console.log('🔍 Validando Build do Worker');
console.log('='.repeat(60));

// 1. Verificar schema Prisma
const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');
if (fs.existsSync(schemaPath)) {
  console.log('✅ Schema Prisma encontrado: prisma/schema.prisma');
} else {
  ERRORS.push('Schema Prisma não encontrado em prisma/schema.prisma');
}

// 2. Verificar Prisma Client gerado
const prismaClientPath = path.resolve(__dirname, '../node_modules/.prisma/client');
if (fs.existsSync(prismaClientPath)) {
  const files = fs.readdirSync(prismaClientPath);
  if (files.length > 0) {
    console.log(`✅ Prisma Client gerado: ${files.length} arquivos em node_modules/.prisma/client`);
  } else {
    ERRORS.push('Diretório .prisma/client existe mas está vazio');
  }
} else {
  ERRORS.push('Prisma Client NÃO foi gerado em node_modules/.prisma/client');
}

// 3. Verificar @prisma/client em node_modules
const prismaClientPkgPath = path.resolve(__dirname, '../node_modules/@prisma/client');
if (fs.existsSync(prismaClientPkgPath)) {
  console.log('✅ @prisma/client instalado em node_modules');
} else {
  ERRORS.push('@prisma/client NÃO encontrado em node_modules');
}

// 4. Verificar Playwright browsers
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ||
  path.resolve(__dirname, '../pw-browsers');

if (fs.existsSync(browsersPath)) {
  const contents = fs.readdirSync(browsersPath);
  const chromiumDirs = contents.filter(d => d.startsWith('chromium'));

  if (chromiumDirs.length > 0) {
    console.log(`✅ Playwright Chromium instalado: ${chromiumDirs.join(', ')}`);

    // Verificar se o executable existe
    const chromiumDir = path.join(browsersPath, chromiumDirs[0]);
    const possibleExecs = [
      path.join(chromiumDir, 'chrome-linux', 'chrome'),
      path.join(chromiumDir, 'chrome'),
    ];

    let found = false;
    for (const exec of possibleExecs) {
      if (fs.existsSync(exec)) {
        console.log(`✅ Chromium executable: ${exec}`);
        found = true;
        break;
      }
    }

    if (!found) {
      WARNINGS.push(`Chromium executable não encontrado em ${chromiumDir}`);
    }
  } else {
    ERRORS.push(`Diretório ${browsersPath} existe mas Chromium não encontrado`);
  }
} else {
  ERRORS.push(`Diretório de browsers não existe: ${browsersPath}`);
}

// 5. Verificar diretório dist
const distPath = path.resolve(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  const files = fs.readdirSync(distPath);
  console.log(`✅ Diretório dist existe: ${files.length} itens`);

  // Verificar arquivos essenciais
  const essentialFiles = ['bootstrap.js', 'worker.js'];
  for (const file of essentialFiles) {
    if (fs.existsSync(path.join(distPath, file))) {
      console.log(`   ✅ ${file}`);
    } else {
      WARNINGS.push(`Arquivo ${file} não encontrado em dist/`);
    }
  }
} else {
  ERRORS.push('Diretório dist NÃO existe');
}

// Resumo
console.log('\n' + '='.repeat(60));
console.log('📋 Resumo da Validação');
console.log('='.repeat(60));

if (WARNINGS.length > 0) {
  console.log('\n⚠️  WARNINGS:');
  WARNINGS.forEach(w => console.log(`   - ${w}`));
}

if (ERRORS.length > 0) {
  console.log('\n❌ ERRORS:');
  ERRORS.forEach(e => console.log(`   - ${e}`));
  console.log('\n❌ BUILD VALIDATION FAILED');
  process.exit(1);
} else {
  console.log('\n✅ BUILD VALIDATION PASSED');
  process.exit(0);
}

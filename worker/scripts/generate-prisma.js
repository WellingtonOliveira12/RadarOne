/**
 * Script para gerar Prisma Client localmente no worker
 *
 * Este script resolve o problema de gerar o Prisma Client no node_modules
 * do worker quando o schema está no backend.
 *
 * Funciona tanto localmente quanto no Render.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKEND_SCHEMA_PATH = path.join(__dirname, '../../backend/prisma/schema.prisma');
const LOCAL_SCHEMA_PATH = path.join(__dirname, '../prisma/schema.prisma');
const LOCAL_PRISMA_DIR = path.join(__dirname, '../prisma');

// Verifica se o schema do backend existe
if (!fs.existsSync(BACKEND_SCHEMA_PATH)) {
  console.error('❌ Schema do backend não encontrado:', BACKEND_SCHEMA_PATH);
  process.exit(1);
}

console.log('📋 Gerando Prisma Client para o worker...');

// Cria pasta prisma se não existir
if (!fs.existsSync(LOCAL_PRISMA_DIR)) {
  fs.mkdirSync(LOCAL_PRISMA_DIR, { recursive: true });
}

// Lê o schema do backend
let schema = fs.readFileSync(BACKEND_SCHEMA_PATH, 'utf8');

// Verifica se já tem output definido
if (!schema.includes('output')) {
  // Adiciona output para gerar no node_modules local
  schema = schema.replace(
    /generator client \{[\s\S]*?provider = "prisma-client-js"/,
    `generator client {\n  provider = "prisma-client-js"\n  output   = "../node_modules/.prisma/client"`
  );
}

// Escreve schema modificado localmente
fs.writeFileSync(LOCAL_SCHEMA_PATH, schema);
console.log('✅ Schema copiado para:', LOCAL_SCHEMA_PATH);

// Executa prisma generate
try {
  console.log('🔄 Executando prisma generate...');
  execSync('npx prisma generate', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
  console.log('✅ Prisma Client gerado com sucesso!');
} catch (error) {
  console.error('❌ Erro ao gerar Prisma Client:', error.message);
  process.exit(1);
}

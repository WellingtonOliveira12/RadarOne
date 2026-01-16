#!/usr/bin/env npx ts-node
/**
 * ============================================================
 * ML STATE ENCODE - Gera Base64 do storageState
 * ============================================================
 *
 * Este script le o storageState.json salvo e gera o valor
 * base64 para configurar no Render como variavel de ambiente.
 *
 * USO:
 *   npm run ml:state:encode
 *
 * SAIDA:
 *   - Exibe o base64 no terminal (pronto para copiar)
 *   - Salva em worker/sessions/mercadolivre/storageState.base64.txt
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// CONFIGURACOES
// ============================================================

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions', 'mercadolivre');
const STORAGE_STATE_PATH = path.join(SESSIONS_DIR, 'storageState.json');
const BASE64_PATH = path.join(SESSIONS_DIR, 'storageState.base64.txt');

// ============================================================
// MAIN
// ============================================================

function main(): void {
  console.log('');
  console.log('='.repeat(60));
  console.log('  MERCADO LIVRE - ENCODE STORAGE STATE');
  console.log('='.repeat(60));
  console.log('');

  // Verifica se arquivo existe
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    console.log('ERRO: Arquivo storageState.json nao encontrado!');
    console.log('');
    console.log(`Esperado em: ${STORAGE_STATE_PATH}`);
    console.log('');
    console.log('Execute primeiro: npm run ml:login');
    console.log('');
    process.exit(1);
  }

  // Le o arquivo
  const storageContent = fs.readFileSync(STORAGE_STATE_PATH, 'utf-8');

  // Valida se e JSON valido
  try {
    const parsed = JSON.parse(storageContent);
    if (!parsed.cookies || !parsed.origins) {
      throw new Error('Estrutura invalida');
    }
    console.log(`Arquivo valido: ${parsed.cookies.length} cookies, ${parsed.origins.length} origins`);
  } catch (error) {
    console.log('ERRO: Arquivo storageState.json nao e um storageState valido!');
    console.log('');
    console.log('Execute novamente: npm run ml:login');
    console.log('');
    process.exit(1);
  }

  // Gera base64
  const base64Content = Buffer.from(storageContent).toString('base64');

  // Salva em arquivo
  fs.writeFileSync(BASE64_PATH, base64Content, 'utf-8');
  console.log(`Base64 salvo em: ${BASE64_PATH}`);

  // Mostra estatisticas
  console.log('');
  console.log('-'.repeat(60));
  console.log(`Tamanho original: ${storageContent.length} bytes`);
  console.log(`Tamanho base64:   ${base64Content.length} bytes`);
  console.log('-'.repeat(60));
  console.log('');

  // Mostra instrucoes
  console.log('='.repeat(60));
  console.log('  COMO CONFIGURAR NO RENDER');
  console.log('='.repeat(60));
  console.log('');
  console.log('OPCAO 1 - Secret File (Recomendado para arquivos grandes):');
  console.log('  1. Va em: Dashboard > Seu Servico > Environment > Secret Files');
  console.log('  2. Clique em "Add Secret File"');
  console.log('  3. Nome: ml-storage-state.json');
  console.log('  4. Cole o conteudo de: storageState.json');
  console.log('  5. Adicione env var: ML_STORAGE_STATE_PATH=/etc/secrets/ml-storage-state.json');
  console.log('');
  console.log('OPCAO 2 - Variavel de Ambiente Base64:');
  console.log('  1. Va em: Dashboard > Seu Servico > Environment');
  console.log('  2. Adicione nova variavel: ML_STORAGE_STATE_B64');
  console.log('  3. Cole o valor abaixo:');
  console.log('');
  console.log('-'.repeat(60));
  console.log('BASE64 (copie tudo):');
  console.log('-'.repeat(60));
  console.log('');

  // Se for muito grande, mostra parcialmente
  if (base64Content.length > 5000) {
    console.log(`${base64Content.slice(0, 500)}...`);
    console.log('');
    console.log(`[Valor truncado - ${base64Content.length} caracteres total]`);
    console.log(`[Copie de: ${BASE64_PATH}]`);
  } else {
    console.log(base64Content);
  }

  console.log('');
  console.log('-'.repeat(60));
  console.log('');
  console.log('Para copiar para a area de transferencia (macOS):');
  console.log(`  cat "${BASE64_PATH}" | pbcopy`);
  console.log('');
  console.log('Para Linux:');
  console.log(`  cat "${BASE64_PATH}" | xclip -selection clipboard`);
  console.log('');
  console.log('='.repeat(60));
}

// Executa
main();

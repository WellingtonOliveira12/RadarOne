/**
 * Bootstrap do Worker - RadarOne
 *
 * IMPORTANTE: Este arquivo DEVE ser o entrypoint do worker.
 * Ele configura as variáveis de ambiente ANTES de qualquer import
 * que possa carregar o Playwright.
 *
 * Problema original:
 * - O Playwright lê PLAYWRIGHT_BROWSERS_PATH no momento do import
 * - Se dotenv.config() rodar depois do import, já é tarde demais
 *
 * Solução:
 * - Este bootstrap define o env ANTES de importar qualquer coisa
 * - Usa import dinâmico para carregar o app depois do env estar pronto
 */

import path from 'path';
import fs from 'fs';

// =============================================================================
// 1. CONFIGURAR PLAYWRIGHT_BROWSERS_PATH ANTES DE TUDO
// =============================================================================

const BROWSERS_PATH = path.resolve(process.cwd(), 'pw-browsers');

// Define a variável de ambiente se não estiver definida ou se estiver apontando
// para o cache padrão do Render que não funciona
if (
  !process.env.PLAYWRIGHT_BROWSERS_PATH ||
  process.env.PLAYWRIGHT_BROWSERS_PATH.includes('/opt/render/.cache')
) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS_PATH;
}

console.log('='.repeat(60));
console.log('🚀 RadarOne Worker Bootstrap');
console.log('='.repeat(60));
console.log(`📁 CWD: ${process.cwd()}`);
console.log(`📁 PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH}`);

// Verifica se o diretório de browsers existe
if (fs.existsSync(BROWSERS_PATH)) {
  try {
    const contents = fs.readdirSync(BROWSERS_PATH);
    const chromiumDirs = contents.filter((d) => d.startsWith('chromium'));

    if (chromiumDirs.length > 0) {
      console.log(`✅ Chromium encontrado: ${chromiumDirs.join(', ')}`);

      // Verifica o executablePath
      const chromiumDir = path.join(BROWSERS_PATH, chromiumDirs[0]);
      const possiblePaths = [
        path.join(chromiumDir, 'chrome-linux', 'chrome'),
        path.join(chromiumDir, 'chrome'),
        path.join(chromiumDir, 'chromium'),
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          console.log(`✅ Executable encontrado: ${p}`);
          break;
        }
      }
    } else {
      console.warn('⚠️  Diretório pw-browsers existe mas Chromium não encontrado!');
      console.warn(`   Conteúdo: ${contents.join(', ') || '(vazio)'}`);
    }
  } catch (err) {
    console.error('❌ Erro ao verificar browsers:', err);
  }
} else {
  console.warn('⚠️  Diretório pw-browsers NÃO existe!');
  console.warn('   Os scrapers com Playwright vão falhar.');
  console.warn('   Execute: npm run playwright:setup');
}

console.log('');

// =============================================================================
// 2. CARREGAR DOTENV AGORA (antes do app, mas depois do PLAYWRIGHT config)
// =============================================================================

// Carrega dotenv manualmente para garantir outras variáveis
import dotenv from 'dotenv';
dotenv.config();

// =============================================================================
// 3. VERIFICAR PLAYWRIGHT EXECUTABLE PATH APÓS CONFIG
// =============================================================================

// Importa playwright dinamicamente apenas para verificar o path
// Isso é seguro porque PLAYWRIGHT_BROWSERS_PATH já está definido
async function verifyPlaywrightPath(): Promise<void> {
  try {
    const { chromium } = await import('playwright');
    const execPath = chromium.executablePath();
    console.log(`🎭 Playwright executablePath: ${execPath}`);

    if (execPath.includes('/opt/render/.cache')) {
      console.error('❌ ERRO: Playwright ainda está usando /opt/render/.cache!');
      console.error('   Isso indica que PLAYWRIGHT_BROWSERS_PATH não foi respeitado.');
      console.error('   Verifique se os browsers foram instalados corretamente.');
    } else if (fs.existsSync(execPath)) {
      console.log('✅ Executable existe e está no path correto!');
    } else {
      console.error(`❌ ERRO: Executable não existe em: ${execPath}`);
    }
  } catch (err) {
    console.error('❌ Erro ao verificar Playwright:', err);
  }
}

// =============================================================================
// 4. INICIAR O APP
// =============================================================================

async function main(): Promise<void> {
  // Verifica o path do Playwright
  await verifyPlaywrightPath();

  console.log('');
  console.log('📦 Carregando worker principal...');
  console.log('');

  // Importa o worker principal dinamicamente
  // Isso garante que todos os scrapers serão importados DEPOIS
  // de PLAYWRIGHT_BROWSERS_PATH estar configurado
  await import('./worker');
}

main().catch((err) => {
  console.error('❌ Erro fatal no bootstrap:', err);
  process.exit(1);
});

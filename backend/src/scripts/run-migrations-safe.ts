/**
 * ============================================================
 * SCRIPT DE MIGRATIONS SEGURO - RadarOne Backend
 * ============================================================
 *
 * Executa `prisma migrate deploy` com retry/backoff para lidar
 * com problemas de advisory lock no PostgreSQL (P1002).
 *
 * Estratégia:
 * - 5 tentativas com backoff exponencial: 2s, 5s, 10s, 20s, 40s
 * - Se falhar por timeout/lock, tenta novamente
 * - Se falhar por outro motivo, sai com erro imediatamente
 * - Se todas as tentativas falharem, sai com código 1
 *
 * Uso:
 *   node scripts/run-migrations-safe.js
 *
 * No Render Start Command:
 *   node scripts/run-migrations-safe.js && node dist/server.js
 */

import { execSync, ExecSyncOptions } from 'child_process';

// Configuração de retry
const MAX_RETRIES = 5;
const BACKOFF_DELAYS = [2000, 5000, 10000, 20000, 40000]; // ms

// Padrões de erro que indicam retry
const RETRYABLE_PATTERNS = [
  'P1002', // Prisma timeout getting advisory lock
  'advisory lock',
  'could not acquire lock',
  'timeout exceeded',
  'connection timed out',
  'ECONNRESET',
  'ETIMEDOUT',
];

function isRetryableError(errorOutput: string): boolean {
  const lowerError = errorOutput.toLowerCase();
  return RETRYABLE_PATTERNS.some(pattern =>
    lowerError.includes(pattern.toLowerCase())
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'): void {
  const timestamp = new Date().toISOString();
  const prefix = {
    INFO: '✅',
    WARN: '⚠️',
    ERROR: '❌',
  }[level];

  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function runMigrations(): Promise<void> {
  log('Iniciando migrations com retry/backoff...');
  log(`DATABASE_URL configurado: ${process.env.DATABASE_URL ? 'Sim' : 'Não'}`);

  // Usa DATABASE_URL_DIRECT se disponível (conexão sem pooler para migrations)
  const databaseUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

  if (!databaseUrl) {
    log('DATABASE_URL não configurada!', 'ERROR');
    process.exit(1);
  }

  // Se tiver URL direta, usa ela para migrations
  const useDirectUrl = !!process.env.DATABASE_URL_DIRECT;
  if (useDirectUrl) {
    log('Usando DATABASE_URL_DIRECT para migrations (conexão direta sem pooler)');
  }

  const execOptions: ExecSyncOptions = {
    stdio: 'pipe',
    encoding: 'utf-8',
    env: {
      ...process.env,
      // Usa URL direta se disponível
      DATABASE_URL: databaseUrl,
    },
  };

  // ── HOTFIX: resolver migration falhada + resetar 2FA do admin ──
  // A migration 20260201140000_reset_admin_2fa falhou e bloqueia deploys.
  // REMOVER este bloco após o admin re-configurar 2FA.
  try {
    log('Verificando migrations falhadas...');
    execSync(
      `npx prisma migrate resolve --rolled-back 20260201140000_reset_admin_2fa`,
      execOptions
    );
    log('Migration falhada marcada como rolled-back');
  } catch {
    // Ignora se migration não existe ou já foi resolvida
  }

  // Resetar 2FA do admin via SQL direto (não depende de migration)
  try {
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient();
    const result = await db.$executeRaw`
      UPDATE "User"
      SET two_factor_enabled = false, two_factor_secret = NULL, two_factor_backup_codes = '{}'
      WHERE id = 'cmjul3uys000043avi0csh1wg' AND two_factor_enabled = true
    `;
    if (result > 0) {
      log('2FA resetado para admin bloqueado');
    }
    await db.$disconnect();
  } catch (e: any) {
    log(`Aviso ao resetar 2FA: ${e.message}`, 'WARN');
  }
  // ── FIM HOTFIX ──

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log(`Tentativa ${attempt}/${MAX_RETRIES}...`);

    try {
      // Executa prisma migrate deploy
      const output = execSync('npx prisma migrate deploy', execOptions);

      if (output) {
        console.log(output.toString());
      }

      log('Migrations aplicadas com sucesso!');
      return;
    } catch (error: any) {
      const errorOutput = error.stderr?.toString() || error.stdout?.toString() || error.message || '';

      // Log do erro (sem expor credentials)
      const sanitizedError = errorOutput
        .replace(/postgresql:\/\/[^@]+@/g, 'postgresql://***@')
        .replace(/password=[^&\s]+/gi, 'password=***');

      log(`Erro na tentativa ${attempt}: ${sanitizedError.slice(0, 500)}`, 'ERROR');

      // Verifica se é erro retryable
      if (isRetryableError(errorOutput)) {
        if (attempt < MAX_RETRIES) {
          const delay = BACKOFF_DELAYS[attempt - 1];
          log(`Erro de lock/timeout detectado. Aguardando ${delay / 1000}s antes de retry...`, 'WARN');
          await sleep(delay);
          continue;
        } else {
          log('Todas as tentativas falharam por timeout/lock', 'ERROR');
          log('Possíveis causas:', 'WARN');
          log('  - Outra migration em execução', 'WARN');
          log('  - Conexão com banco instável', 'WARN');
          log('  - Considere usar DATABASE_URL_DIRECT sem pooler', 'WARN');
          process.exit(1);
        }
      } else {
        // Erro não-retryable (ex: SQL error, schema conflict)
        log('Erro não-retryable detectado. Abortando imediatamente.', 'ERROR');
        log('Verifique os logs e corrija o schema antes de redeployar.', 'ERROR');
        process.exit(1);
      }
    }
  }

  // Não deveria chegar aqui, mas por segurança
  log('Migrations falharam após todas as tentativas', 'ERROR');
  process.exit(1);
}

// Executa
runMigrations().catch(err => {
  log(`Erro inesperado: ${err.message}`, 'ERROR');
  process.exit(1);
});

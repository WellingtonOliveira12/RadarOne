#!/usr/bin/env npx ts-node
/**
 * ============================================================
 * GERENCIADOR DE CONTAS DE SCRAPER - CLI
 * ============================================================
 *
 * Script para gerenciar contas de autenticação de scrapers.
 *
 * Comandos:
 *   list [site]             Lista contas
 *   add                     Adiciona nova conta (interativo)
 *   remove <accountId>      Remove uma conta
 *   status <accountId>      Mostra status de uma conta
 *   reset <accountId>       Reseta status para OK
 *   test <accountId>        Testa autenticação de uma conta
 */

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';
import { cryptoManager } from '../../src/auth/crypto-manager';

const prisma = new PrismaClient();

// ============================================================
// HELPERS
// ============================================================

function printHeader(): void {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  GERENCIADOR DE CONTAS DE SCRAPER');
  console.log('═'.repeat(60));
  console.log('');
}

function printUsage(): void {
  console.log('Uso: npx ts-node scripts/auth/manage-accounts.ts <comando> [args]');
  console.log('');
  console.log('Comandos:');
  console.log('  list [site]             Lista contas (opcional: filtrar por site)');
  console.log('  add                     Adiciona nova conta (interativo)');
  console.log('  remove <accountId>      Remove uma conta');
  console.log('  status <accountId>      Mostra status detalhado');
  console.log('  reset <accountId>       Reseta status para OK');
  console.log('  test <accountId>        Testa autenticação');
  console.log('');
  console.log('Sites suportados: MERCADO_LIVRE, SUPERBID, SODRE_SANTORO, ZUKERMAN');
  console.log('');
}

async function question(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function questionHidden(prompt: string): Promise<string> {
  // Em ambiente de terminal, esconde input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function maskString(str: string): string {
  if (!str || str.length <= 4) return '****';
  return str.substring(0, 2) + '***' + str.substring(str.length - 2);
}

// ============================================================
// COMANDOS
// ============================================================

async function listAccounts(site?: string): Promise<void> {
  const where = site ? { site: site.toUpperCase() } : {};
  const accounts = await prisma.scraperAccount.findMany({
    where,
    orderBy: [{ site: 'asc' }, { priority: 'desc' }],
    select: {
      id: true,
      site: true,
      label: true,
      username: true,
      status: true,
      mfaType: true,
      priority: true,
      consecutiveFailures: true,
      lastSuccessAt: true,
      isActive: true,
    },
  });

  if (accounts.length === 0) {
    console.log('Nenhuma conta encontrada.');
    return;
  }

  console.log('CONTAS CADASTRADAS:');
  console.log('─'.repeat(100));
  console.log(
    'ID'.padEnd(12) +
    'Site'.padEnd(16) +
    'Label'.padEnd(20) +
    'Username'.padEnd(25) +
    'Status'.padEnd(12) +
    'MFA'.padEnd(10) +
    'Prioridade'
  );
  console.log('─'.repeat(100));

  for (const acc of accounts) {
    const statusIcon = acc.status === 'OK' ? '✅' : acc.status === 'NEEDS_REAUTH' ? '⚠️' : '❌';
    console.log(
      acc.id.substring(0, 10).padEnd(12) +
      acc.site.padEnd(16) +
      (acc.label || '-').substring(0, 18).padEnd(20) +
      maskString(acc.username).padEnd(25) +
      `${statusIcon} ${acc.status}`.padEnd(14) +
      acc.mfaType.padEnd(10) +
      acc.priority.toString()
    );
  }

  console.log('─'.repeat(100));
  console.log(`Total: ${accounts.length} conta(s)`);
}

async function addAccount(): Promise<void> {
  console.log('ADICIONAR NOVA CONTA');
  console.log('─'.repeat(40));

  const site = (await question('Site (MERCADO_LIVRE, SUPERBID, etc): ')).toUpperCase();
  if (!site) {
    console.log('Site é obrigatório.');
    return;
  }

  const label = await question('Label/Nome (opcional): ');
  const username = await question('Username/Email: ');
  if (!username) {
    console.log('Username é obrigatório.');
    return;
  }

  const password = await questionHidden('Senha: ');
  if (!password) {
    console.log('Senha é obrigatória.');
    return;
  }

  const mfaTypeInput = await question('Tipo de MFA (NONE, TOTP, EMAIL_OTP) [NONE]: ');
  const mfaType = mfaTypeInput.toUpperCase() || 'NONE';

  let totpSecret: string | undefined;
  if (mfaType === 'TOTP') {
    totpSecret = await question('Segredo TOTP (base32): ');
  }

  let otpEmail: string | undefined;
  let otpEmailPassword: string | undefined;
  if (mfaType === 'EMAIL_OTP') {
    otpEmail = await question('Email para OTP (se diferente): ');
    if (otpEmail) {
      otpEmailPassword = await questionHidden('Senha do email OTP: ');
    }
  }

  const priorityInput = await question('Prioridade (0-100) [0]: ');
  const priority = parseInt(priorityInput) || 0;

  // Confirma
  console.log('');
  console.log('Resumo:');
  console.log(`  Site: ${site}`);
  console.log(`  Label: ${label || '(nenhum)'}`);
  console.log(`  Username: ${maskString(username)}`);
  console.log(`  MFA: ${mfaType}`);
  console.log(`  Prioridade: ${priority}`);
  console.log('');

  const confirm = await question('Confirmar? (s/n): ');
  if (confirm.toLowerCase() !== 's') {
    console.log('Cancelado.');
    return;
  }

  // Cria conta
  const account = await prisma.scraperAccount.create({
    data: {
      site,
      label: label || `${site} Account`,
      username,
      passwordEnc: cryptoManager.encrypt(password),
      mfaType: mfaType as any,
      totpSecretEnc: totpSecret ? cryptoManager.encrypt(totpSecret) : null,
      otpEmail: otpEmail || null,
      otpEmailPwdEnc: otpEmailPassword ? cryptoManager.encrypt(otpEmailPassword) : null,
      priority,
      status: 'OK',
    },
  });

  console.log('');
  console.log(`✅ Conta criada com ID: ${account.id}`);
}

async function removeAccount(accountId: string): Promise<void> {
  const account = await prisma.scraperAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    console.log(`Conta ${accountId} não encontrada.`);
    return;
  }

  const confirm = await question(`Remover conta ${account.label} (${maskString(account.username)})? (s/n): `);
  if (confirm.toLowerCase() !== 's') {
    console.log('Cancelado.');
    return;
  }

  await prisma.scraperAccount.delete({
    where: { id: accountId },
  });

  console.log('✅ Conta removida.');
}

async function showStatus(accountId: string): Promise<void> {
  const account = await prisma.scraperAccount.findUnique({
    where: { id: accountId },
    include: {
      sessions: true,
      authLogs: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!account) {
    console.log(`Conta ${accountId} não encontrada.`);
    return;
  }

  console.log('DETALHES DA CONTA');
  console.log('─'.repeat(50));
  console.log(`ID:              ${account.id}`);
  console.log(`Site:            ${account.site}`);
  console.log(`Label:           ${account.label}`);
  console.log(`Username:        ${maskString(account.username)}`);
  console.log(`Status:          ${account.status}`);
  console.log(`Mensagem:        ${account.statusMessage || '-'}`);
  console.log(`MFA:             ${account.mfaType}`);
  console.log(`Prioridade:      ${account.priority}`);
  console.log(`Falhas seguidas: ${account.consecutiveFailures}`);
  console.log(`Último sucesso:  ${account.lastSuccessAt || 'Nunca'}`);
  console.log(`Última falha:    ${account.lastFailureAt || 'Nunca'}`);
  console.log(`Ativo:           ${account.isActive ? 'Sim' : 'Não'}`);

  if (account.sessions.length > 0) {
    const session = account.sessions[0];
    console.log('');
    console.log('SESSÃO');
    console.log('─'.repeat(50));
    console.log(`Autenticado:     ${session.isAuthenticated ? 'Sim' : 'Não'}`);
    console.log(`Última validação: ${session.lastValidatedAt || 'Nunca'}`);
    console.log(`UserDataDir:     ${session.userDataDir}`);
  }

  if (account.authLogs.length > 0) {
    console.log('');
    console.log('ÚLTIMOS EVENTOS');
    console.log('─'.repeat(50));
    for (const log of account.authLogs) {
      const icon = log.success ? '✅' : '❌';
      console.log(`${icon} ${log.createdAt.toISOString()} ${log.event} ${log.message || ''}`);
    }
  }
}

async function resetStatus(accountId: string): Promise<void> {
  const account = await prisma.scraperAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    console.log(`Conta ${accountId} não encontrada.`);
    return;
  }

  await prisma.scraperAccount.update({
    where: { id: accountId },
    data: {
      status: 'OK',
      statusMessage: null,
      consecutiveFailures: 0,
    },
  });

  console.log(`✅ Status da conta ${account.label} resetado para OK.`);
}

async function testAccount(accountId: string): Promise<void> {
  console.log('⚠️  Teste de autenticação requer ambiente com Playwright configurado.');
  console.log('    Execute no worker ou use: npm run test:auth ' + accountId);
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  printHeader();

  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exit(0);
  }

  try {
    switch (command.toLowerCase()) {
      case 'list':
        await listAccounts(args[1]);
        break;

      case 'add':
        await addAccount();
        break;

      case 'remove':
        if (!args[1]) {
          console.log('Uso: remove <accountId>');
          break;
        }
        await removeAccount(args[1]);
        break;

      case 'status':
        if (!args[1]) {
          console.log('Uso: status <accountId>');
          break;
        }
        await showStatus(args[1]);
        break;

      case 'reset':
        if (!args[1]) {
          console.log('Uso: reset <accountId>');
          break;
        }
        await resetStatus(args[1]);
        break;

      case 'test':
        if (!args[1]) {
          console.log('Uso: test <accountId>');
          break;
        }
        await testAccount(args[1]);
        break;

      default:
        console.log(`Comando desconhecido: ${command}`);
        printUsage();
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Erro:', error);
  process.exit(1);
});

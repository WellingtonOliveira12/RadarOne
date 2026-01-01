/**
 * Script de migração: Popular cpf_hash para registros existentes
 *
 * Este script descriptografa todos os CPFs existentes e gera o hash SHA256
 * para preencher o campo cpf_hash.
 *
 * IMPORTANTE:
 * - Rodar DEPOIS de aplicar a migration que adiciona a coluna cpf_hash
 * - Rodar ANTES de criar o unique constraint
 * - Pode rodar múltiplas vezes (idempotente)
 *
 * Uso:
 *   npm run migrate:cpf-hash
 *   ts-node scripts/migrate-cpf-to-hash.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { decryptCpf, hashCpf } from '../src/utils/crypto';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function migrateCpfToHash() {
  console.log('═'.repeat(60));
  console.log('MIGRANDO CPF PARA HASH - RADARONE');
  console.log('═'.repeat(60));
  console.log('');

  try {
    // Buscar todos os usuários com CPF criptografado mas sem hash
    const usersWithCpf = await prisma.user.findMany({
      where: {
        cpfEncrypted: { not: null },
        OR: [
          { cpfHash: null },
          { cpfHash: '' }
        ]
      },
      select: {
        id: true,
        email: true,
        cpfEncrypted: true,
        cpfHash: true
      }
    });

    console.log(`📊 Usuários com CPF para migrar: ${usersWithCpf.length}`);
    console.log('');

    if (usersWithCpf.length === 0) {
      console.log('✅ Nenhum usuário precisa de migração.');
      console.log('   Todos os CPFs já possuem hash.');
      console.log('');
      process.exit(0);
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ userId: string; email: string; error: string }> = [];

    for (const user of usersWithCpf) {
      try {
        // Descriptografar CPF
        const decryptedCpf = decryptCpf(user.cpfEncrypted!);

        // Gerar hash
        const cpfHashValue = hashCpf(decryptedCpf);

        // Atualizar no banco
        await prisma.user.update({
          where: { id: user.id },
          data: { cpfHash: cpfHashValue }
        });

        successCount++;
        console.log(`✅ ${user.email} → hash gerado`);
      } catch (error: any) {
        errorCount++;
        const errorMsg = error.message || 'Erro desconhecido';
        errors.push({
          userId: user.id,
          email: user.email,
          error: errorMsg
        });
        console.log(`❌ ${user.email} → ERRO: ${errorMsg}`);
      }
    }

    console.log('');
    console.log('═'.repeat(60));
    console.log('📊 RESUMO DA MIGRAÇÃO');
    console.log('═'.repeat(60));
    console.log(`✅ Sucesso: ${successCount} CPFs`);
    console.log(`❌ Erros: ${errorCount} CPFs`);
    console.log('');

    if (errors.length > 0) {
      console.log('⚠️  ERROS ENCONTRADOS:');
      console.log('─'.repeat(60));
      errors.forEach(err => {
        console.log(`\nUsuário: ${err.email} (${err.userId})`);
        console.log(`Erro: ${err.error}`);
      });
      console.log('');
      console.log('⚠️  Resolva os erros acima antes de criar o unique constraint.');
      console.log('');
      process.exit(1);
    }

    console.log('✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('');
    console.log('📝 Próximos passos:');
    console.log('   1. Criar unique constraint no banco:');
    console.log('      ALTER TABLE users ADD CONSTRAINT users_cpf_hash_key UNIQUE (cpf_hash);');
    console.log('');
    console.log('   2. Ou aplicar a migration que já contém o constraint.');
    console.log('');

    process.exit(0);
  } catch (error: any) {
    console.error('');
    console.error('❌ ERRO FATAL:', error.message);
    console.error('');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

migrateCpfToHash();

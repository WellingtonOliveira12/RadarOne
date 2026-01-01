/**
 * Script para corrigir o email do admin
 * Problema: admin@radarone.com -> admin@radarone.com.br
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function fixAdminEmail() {
  console.log('🔧 CORRIGINDO EMAIL DO ADMIN\n');

  const oldEmail = 'admin@radarone.com';
  const newEmail = 'admin@radarone.com.br';
  const correctPassword = 'RadarOne2025@Secure!';

  // 1. Buscar admin antigo
  const oldAdmin = await prisma.user.findUnique({
    where: { email: oldEmail }
  });

  if (!oldAdmin) {
    console.log(`❌ Admin com email ${oldEmail} não encontrado`);
    console.log('   Nada a corrigir.\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`✅ Admin encontrado: ${oldAdmin.email}`);
  console.log(`   ID: ${oldAdmin.id}`);
  console.log(`   Nome: ${oldAdmin.name}`);
  console.log(`   Role: ${oldAdmin.role}\n`);

  // 2. Verificar se já existe admin com o novo email
  const existingNew = await prisma.user.findUnique({
    where: { email: newEmail }
  });

  if (existingNew) {
    console.log(`⚠️  Já existe um usuário com email ${newEmail}`);
    console.log(`   Vou deletar o antigo (${oldEmail}) e manter o novo.\n`);

    await prisma.user.delete({
      where: { email: oldEmail }
    });

    console.log(`✅ Admin antigo deletado: ${oldEmail}\n`);
  } else {
    // 3. Atualizar email
    console.log(`🔄 Atualizando email: ${oldEmail} → ${newEmail}\n`);

    await prisma.user.update({
      where: { email: oldEmail },
      data: { email: newEmail }
    });

    console.log(`✅ Email atualizado com sucesso!\n`);
  }

  // 4. Verificar hash da senha
  const finalAdmin = await prisma.user.findUnique({
    where: { email: newEmail }
  });

  if (!finalAdmin || !finalAdmin.passwordHash) {
    console.log('❌ Admin não encontrado após atualização');
    await prisma.$disconnect();
    return;
  }

  console.log('🔐 TESTANDO SENHA...\n');

  const isMatch = await bcrypt.compare(correctPassword, finalAdmin.passwordHash);

  console.log(`   Senha testada: ${correctPassword}`);
  console.log(`   Resultado: ${isMatch ? '✅ CORRETA' : '❌ INCORRETA'}\n`);

  if (!isMatch) {
    console.log('🔧 GERANDO NOVO HASH...\n');

    const newHash = await bcrypt.hash(correctPassword, 10);

    await prisma.user.update({
      where: { email: newEmail },
      data: { passwordHash: newHash }
    });

    console.log('✅ Hash atualizado com sucesso!\n');

    // Testar novamente
    const verifyAdmin = await prisma.user.findUnique({
      where: { email: newEmail }
    });

    if (verifyAdmin?.passwordHash) {
      const finalMatch = await bcrypt.compare(correctPassword, verifyAdmin.passwordHash);
      console.log(`   Verificação final: ${finalMatch ? '✅ SENHA CORRETA' : '❌ AINDA INCORRETA'}\n`);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ CORREÇÃO CONCLUÍDA!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n📧 Email: ${newEmail}`);
  console.log(`🔑 Senha: ${correctPassword}`);
  console.log(`\n🧪 TESTE AGORA:`);
  console.log(`curl -i https://radarone.onrender.com/api/auth/login \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"email":"${newEmail}","password":"${correctPassword}"}'`);
  console.log('\n');

  await prisma.$disconnect();
}

fixAdminEmail().catch((error) => {
  console.error('❌ ERRO:', error);
  process.exit(1);
});

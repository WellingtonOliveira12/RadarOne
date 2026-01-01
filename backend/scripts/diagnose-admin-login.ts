/**
 * Script de diagnóstico para o problema de login admin 401
 * Verifica:
 * 1. Se o usuário existe no banco
 * 2. Se os dados estão corretos
 * 3. Se o bcrypt compare funciona
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Carregar .env
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function diagnoseAdminLogin() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 DIAGNÓSTICO DE LOGIN ADMIN - RadarOne Production');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Credenciais que estão sendo testadas
  const testEmail = 'admin@radarone.com.br';
  const testPassword = 'RadarOne2025@Secure!';

  console.log('📋 CREDENCIAIS DE TESTE:');
  console.log(`   Email: ${testEmail}`);
  console.log(`   Senha: ${testPassword}\n`);

  // 1. Verificar conexão com banco
  console.log('1️⃣  VERIFICANDO CONEXÃO COM BANCO...');
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL?.substring(0, 50)}...`);

  try {
    await prisma.$connect();
    console.log('   ✅ Conectado ao banco Neon\n');
  } catch (error) {
    console.log('   ❌ ERRO ao conectar ao banco:', error);
    process.exit(1);
  }

  // 2. Buscar usuário no banco (case insensitive)
  console.log('2️⃣  BUSCANDO USUÁRIO NO BANCO...');

  // Teste 1: Busca exata
  let user = await prisma.user.findUnique({
    where: { email: testEmail }
  });

  console.log(`   Busca exata (${testEmail}): ${user ? '✅ ENCONTRADO' : '❌ NÃO ENCONTRADO'}`);

  // Teste 2: Busca case insensitive
  if (!user) {
    const users = await prisma.user.findMany({
      where: {
        email: {
          equals: testEmail,
          mode: 'insensitive'
        }
      }
    });

    if (users.length > 0) {
      user = users[0];
      console.log(`   Busca insensitive: ✅ ENCONTRADO (email real: "${user.email}")`);
    } else {
      console.log(`   Busca insensitive: ❌ NÃO ENCONTRADO`);
    }
  }

  // Teste 3: Listar todos admins
  const allAdmins = await prisma.user.findMany({
    where: {
      role: 'ADMIN'
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      blocked: true,
      passwordHash: true,
      createdAt: true
    }
  });

  console.log(`\n   📊 TODOS OS ADMINS NO BANCO (${allAdmins.length}):`);
  allAdmins.forEach((admin, i) => {
    console.log(`   ${i + 1}. ${admin.email}`);
    console.log(`      - ID: ${admin.id}`);
    console.log(`      - Nome: ${admin.name}`);
    console.log(`      - Role: ${admin.role}`);
    console.log(`      - Active: ${admin.isActive}`);
    console.log(`      - Blocked: ${admin.blocked}`);
    console.log(`      - Hash existe: ${admin.passwordHash ? 'SIM' : 'NÃO'}`);
    console.log(`      - Hash (primeiros 20 chars): ${admin.passwordHash?.substring(0, 20)}...`);
    console.log(`      - Criado em: ${admin.createdAt}`);
  });

  if (!user) {
    console.log('\n❌ PROBLEMA IDENTIFICADO: Usuário não existe no banco!');
    console.log('\n💡 SOLUÇÃO: Execute o SQL no Neon:');
    console.log('   1. Acesse: https://console.neon.tech');
    console.log('   2. Projeto: radarone_prod');
    console.log('   3. SQL Editor → Cole o SQL do arquivo ADMIN_CREDENTIALS.md');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('\n3️⃣  VALIDANDO DADOS DO USUÁRIO...');
  console.log(`   ✅ Usuário encontrado: ${user.email}`);
  console.log(`   - ID: ${user.id}`);
  console.log(`   - Nome: ${user.name}`);
  console.log(`   - Role: ${user.role} ${user.role === 'ADMIN' ? '✅' : '❌ (deveria ser ADMIN)'}`);
  console.log(`   - isActive: ${user.isActive} ${user.isActive ? '✅' : '❌ (deveria ser true)'}`);
  console.log(`   - blocked: ${user.blocked} ${!user.blocked ? '✅' : '❌ (deveria ser false)'}`);
  console.log(`   - passwordHash existe: ${user.passwordHash ? '✅' : '❌ (deveria existir)'}`);

  if (user.passwordHash) {
    console.log(`   - Hash completo: ${user.passwordHash}`);
  }

  // Verificar se há problemas que impedem login
  const loginBlockers: string[] = [];
  if (user.role !== 'ADMIN') loginBlockers.push('role não é ADMIN');
  if (!user.isActive) loginBlockers.push('isActive = false');
  if (user.blocked) loginBlockers.push('blocked = true');
  if (!user.passwordHash) loginBlockers.push('passwordHash está vazio');

  if (loginBlockers.length > 0) {
    console.log(`\n❌ PROBLEMAS IDENTIFICADOS (${loginBlockers.length}):`);
    loginBlockers.forEach(blocker => console.log(`   - ${blocker}`));
  } else {
    console.log('\n   ✅ Todos os campos estão corretos!');
  }

  // 4. Testar bcrypt compare
  if (user.passwordHash) {
    console.log('\n4️⃣  TESTANDO BCRYPT COMPARE...');

    try {
      const isMatch = await bcrypt.compare(testPassword, user.passwordHash);
      console.log(`   bcrypt.compare('${testPassword}', hash)`);
      console.log(`   Resultado: ${isMatch ? '✅ MATCH (senha correta)' : '❌ NO MATCH (senha incorreta)'}`);

      if (!isMatch) {
        console.log('\n❌ PROBLEMA IDENTIFICADO: Hash não corresponde à senha!');
        console.log('\n💡 GERANDO NOVO HASH...');

        const newHash = await bcrypt.hash(testPassword, 10);
        console.log(`   Novo hash: ${newHash}`);

        console.log('\n📝 SQL PARA ATUALIZAR NO NEON:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`UPDATE users`);
        console.log(`SET password_hash = '${newHash}'`);
        console.log(`WHERE email = '${testEmail}';`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
    } catch (error) {
      console.log(`   ❌ ERRO ao executar bcrypt.compare:`, error);
    }
  }

  // 5. Verificar normalização de email
  console.log('\n5️⃣  VERIFICANDO NORMALIZAÇÃO DE EMAIL...');
  console.log(`   Email original: "${testEmail}"`);
  console.log(`   toLowerCase(): "${testEmail.toLowerCase()}"`);
  console.log(`   trim(): "${testEmail.trim()}"`);
  console.log(`   toLowerCase().trim(): "${testEmail.toLowerCase().trim()}"`);
  console.log(`   Email no banco: "${user.email}"`);
  console.log(`   Match exato: ${testEmail === user.email ? '✅' : '❌'}`);
  console.log(`   Match case insensitive: ${testEmail.toLowerCase() === user.email.toLowerCase() ? '✅' : '❌'}`);

  // 6. Resumo Final
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 RESUMO DO DIAGNÓSTICO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const canLogin = user.passwordHash &&
                   user.role === 'ADMIN' &&
                   user.isActive &&
                   !user.blocked;

  if (canLogin && user.passwordHash) {
    const passwordMatches = await bcrypt.compare(testPassword, user.passwordHash);

    if (passwordMatches) {
      console.log('✅ LOGIN DEVERIA FUNCIONAR!');
      console.log('\n   Todos os requisitos estão OK:');
      console.log('   ✅ Usuário existe no banco');
      console.log('   ✅ Role = ADMIN');
      console.log('   ✅ isActive = true');
      console.log('   ✅ blocked = false');
      console.log('   ✅ passwordHash existe');
      console.log('   ✅ bcrypt compare = true');
      console.log('\n   🔍 PRÓXIMO PASSO: Verificar código do endpoint /api/auth/login');
      console.log('      - Normalização de email (toLowerCase, trim)');
      console.log('      - Campo correto sendo lido (passwordHash vs password_hash)');
      console.log('      - Logs de debug no endpoint');
    } else {
      console.log('❌ LOGIN VAI FALHAR!');
      console.log('\n   Problema: Senha não corresponde ao hash');
      console.log('   Execute o SQL UPDATE acima para corrigir');
    }
  } else {
    console.log('❌ LOGIN VAI FALHAR!');
    console.log('\n   Problemas encontrados:');
    if (!user.passwordHash) console.log('   ❌ passwordHash está vazio');
    if (user.role !== 'ADMIN') console.log('   ❌ role não é ADMIN');
    if (!user.isActive) console.log('   ❌ isActive = false');
    if (user.blocked) console.log('   ❌ blocked = true');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await prisma.$disconnect();
  process.exit(canLogin ? 0 : 1);
}

diagnoseAdminLogin().catch((error) => {
  console.error('❌ ERRO FATAL:', error);
  process.exit(1);
});

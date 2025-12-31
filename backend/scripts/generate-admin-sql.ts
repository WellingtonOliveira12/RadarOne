/**
 * Script para gerar SQL de criação de admin
 * Uso: ts-node-dev scripts/generate-admin-sql.ts
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';

async function generateAdminSQL() {
  // Credenciais para produção
  const email = 'admin@radarone.com.br';
  const password = 'RadarOne2025@Secure!'; // Senha forte
  const name = 'Administrador RadarOne';

  // Gerar hash da senha
  const passwordHash = await bcrypt.hash(password, 10);

  // Gerar ID único
  const id = crypto.randomUUID();

  console.log('\n🔐 CRIAÇÃO DE ADMINISTRADOR - PRODUÇÃO\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('📋 CREDENCIAIS DE ACESSO:\n');
  console.log(`   📧 Email:    ${email}`);
  console.log(`   🔑 Senha:    ${password}`);
  console.log(`   👤 Nome:     ${name}`);
  console.log(`   🛡️  Role:     ADMIN\n`);

  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('📝 SQL PARA EXECUTAR NO NEON (PostgreSQL):\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const sql = `-- Criar usuário administrador RadarOne
INSERT INTO users (
  id,
  name,
  email,
  password_hash,
  role,
  is_active,
  blocked,
  created_at,
  updated_at
) VALUES (
  '${id}',
  '${name}',
  '${email}',
  '${passwordHash}',
  'ADMIN',
  true,
  false,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  role = 'ADMIN',
  is_active = true,
  blocked = false;

-- Verificar se foi criado
SELECT id, name, email, role, is_active, blocked, created_at
FROM users
WHERE email = '${email}';`;

  console.log(sql);
  console.log('\n═══════════════════════════════════════════════════════════════\n');

  console.log('🚀 INSTRUÇÕES:\n');
  console.log('1. Acesse: https://console.neon.tech');
  console.log('2. Selecione seu projeto RadarOne');
  console.log('3. Vá em "SQL Editor"');
  console.log('4. Cole o SQL acima');
  console.log('5. Clique em "Run"');
  console.log('\n6. Após executar, acesse: https://radarone.com.br/login');
  console.log(`7. Faça login com: ${email}`);
  console.log(`8. Use a senha: ${password}`);
  console.log('\n9. ⚠️  IMPORTANTE: Troque a senha após primeiro login!');
  console.log('   Acesse: https://radarone.com.br/admin/security (ative 2FA também)\n');

  console.log('═══════════════════════════════════════════════════════════════\n');
}

generateAdminSQL();

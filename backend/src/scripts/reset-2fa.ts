/**
 * Reset 2FA para um usuário específico
 *
 * Uso:
 *   npx ts-node src/scripts/reset-2fa.ts <userId_ou_email>
 *
 * Exemplo:
 *   npx ts-node src/scripts/reset-2fa.ts cmjul3uys000043avi0csh1wg
 *   npx ts-node src/scripts/reset-2fa.ts admin@radarone.com.br
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const identifier = process.argv[2];

  if (!identifier) {
    console.error('Uso: npx ts-node src/scripts/reset-2fa.ts <userId_ou_email>');
    process.exit(1);
  }

  // Buscar por ID ou email
  const user = await prisma.user.findFirst({
    where: identifier.includes('@')
      ? { email: identifier.toLowerCase() }
      : { id: identifier },
    select: {
      id: true,
      email: true,
      name: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
    },
  });

  if (!user) {
    console.error(`Usuário não encontrado: ${identifier}`);
    process.exit(1);
  }

  console.log(`Usuário encontrado:`);
  console.log(`  ID:    ${user.id}`);
  console.log(`  Nome:  ${user.name}`);
  console.log(`  Email: ${user.email}`);
  console.log(`  2FA:   ${user.twoFactorEnabled ? 'ATIVO' : 'Desativado'}`);
  console.log(`  Secret: ${user.twoFactorSecret ? 'Presente' : 'Ausente'}`);

  if (!user.twoFactorEnabled) {
    console.log('\n2FA já está desativado. Nada a fazer.');
    process.exit(0);
  }

  // Reset
  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
    },
  });

  console.log(`\n✅ 2FA desativado com sucesso para ${user.email}`);
  console.log('O usuário pode fazer login normalmente e re-configurar 2FA.');
}

main()
  .catch((err) => {
    console.error('Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

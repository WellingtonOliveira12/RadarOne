import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Inicializar Prisma com adapter (mesmo padrão do server.ts)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn']
});

async function createAdmin() {
  const email = 'admin@radarone.com';
  const password = 'admin123'; // TROCAR EM PRODUÇÃO!

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('❌ Admin já existe');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.create({
    data: {
      name: 'Administrador',
      email,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    }
  });

  console.log('✅ Admin criado:', admin.email);
  console.log('📧 Email:', email);
  console.log('🔑 Senha:', password);

  await prisma.$disconnect();
}

createAdmin();

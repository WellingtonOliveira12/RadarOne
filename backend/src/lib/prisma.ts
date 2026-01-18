/**
 * Prisma Client Instance
 *
 * Este arquivo exporta uma única instância do PrismaClient para ser
 * usada em toda a aplicação. Isso evita dependências circulares e
 * garante que apenas uma conexão seja aberta.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Cria o pool de conexões Postgres
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Cria o adapter Prisma para Postgres
const adapter = new PrismaPg(pool);

// Instância única do PrismaClient
export const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

// Exporta também o tipo do PrismaClient para uso em tipagens
export type { PrismaClient };

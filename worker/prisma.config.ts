/**
 * Prisma 7 Configuration - Worker
 *
 * No Prisma 7, a URL de conexão com o banco de dados é configurada
 * neste arquivo ao invés de no schema.prisma
 *
 * O worker compartilha o mesmo schema do backend
 */

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: '../backend/prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});

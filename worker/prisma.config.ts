/**
 * Prisma 7 Configuration - Worker
 *
 * No Prisma 7, a URL de conexão com o banco de dados é configurada
 * neste arquivo ao invés de no schema.prisma
 *
 * O worker usa uma cópia local do schema (gerada pelo script generate-prisma.js)
 * que configura o output do client para o node_modules local
 */

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});

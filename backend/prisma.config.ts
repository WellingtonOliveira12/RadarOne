/**
 * Prisma 7 Configuration
 *
 * No Prisma 7, a URL de conexão com o banco de dados é configurada
 * neste arquivo ao invés de no schema.prisma
 */

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  // engineType: 'library', // Comentado - usando adapter Postgres
});

import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Normaliza código de cupom
 * - Remove espaços
 * - Converte para uppercase
 * - Remove acentos/diacríticos
 */
function normalizeCouponCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function normalizeCoupons() {
  try {
    console.log('🔄 Normalizando códigos de cupons existentes...\n');

    // Buscar todos os cupons
    const coupons = await prisma.coupon.findMany({
      select: {
        id: true,
        code: true
      }
    });

    console.log(`📊 Encontrados ${coupons.length} cupons`);

    let updated = 0;
    let skipped = 0;

    for (const coupon of coupons) {
      const normalizedCode = normalizeCouponCode(coupon.code);

      if (coupon.code !== normalizedCode) {
        console.log(`  ✏️  "${coupon.code}" → "${normalizedCode}"`);

        await prisma.coupon.update({
          where: { id: coupon.id },
          data: { code: normalizedCode }
        });

        updated++;
      } else {
        skipped++;
      }
    }

    console.log(`\n✅ Normalização concluída:`);
    console.log(`   Atualizados: ${updated}`);
    console.log(`   Já normalizados: ${skipped}`);
    console.log(`   Total: ${coupons.length}`);

  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

normalizeCoupons();

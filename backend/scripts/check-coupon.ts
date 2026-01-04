import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkCoupon() {
  try {
    console.log('🔍 Buscando cupom VITALÍCIO...');

    // Buscar com case-insensitive
    const coupon = await prisma.coupon.findFirst({
      where: {
        code: {
          contains: 'VITALICIO',
          mode: 'insensitive'
        }
      }
    });

    if (coupon) {
      console.log('✅ Cupom encontrado:');
      console.log(JSON.stringify(coupon, null, 2));
    } else {
      console.log('❌ Cupom VITALÍCIO não encontrado no banco');
      console.log('\n📋 Cupons disponíveis:');
      const allCoupons = await prisma.coupon.findMany({
        select: {
          code: true,
          isActive: true,
          purpose: true,
          expiresAt: true,
          discountType: true,
          discountValue: true
        },
        take: 10
      });
      console.log(JSON.stringify(allCoupons, null, 2));
    }
  } catch (error: any) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

checkCoupon();

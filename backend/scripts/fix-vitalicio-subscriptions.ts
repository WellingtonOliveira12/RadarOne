/**
 * Script de Migration de Dados - FIX: Cupom VITALICIO e Subscriptions
 *
 * O que este script faz:
 * 1. Atualiza o cupom "VITALICIO" para isLifetime=true
 * 2. Identifica usuários na allowlist (VITALICIO_ALLOWED_EMAILS)
 * 3. Atualiza subscriptions existentes desses usuários para:
 *    - status='ACTIVE'
 *    - isLifetime=true
 *    - validUntil=null
 *    - trialEndsAt=null
 *    - isTrial=false
 *
 * COMO EXECUTAR:
 * npx ts-node scripts/fix-vitalicio-subscriptions.ts
 */

import { prisma } from '../src/server';

async function fixVitalicioSubscriptions() {
  console.log('[FIX] 🔧 Iniciando correção de cupom VITALICIO e subscriptions...\n');

  try {
    // 1. Atualizar cupom VITALICIO para isLifetime=true
    console.log('[1/3] Atualizando cupom VITALICIO...');
    const vitalicioCoupon = await prisma.coupon.findFirst({
      where: {
        code: {
          equals: 'VITALICIO',
          mode: 'insensitive'
        }
      }
    });

    if (!vitalicioCoupon) {
      console.warn('⚠️  Cupom VITALICIO não encontrado no banco. Ignorando step 1.');
    } else {
      await prisma.coupon.update({
        where: { id: vitalicioCoupon.id },
        data: {
          isLifetime: true,
          purpose: 'TRIAL_UPGRADE',
          durationDays: null // Vitalício não precisa de durationDays
        }
      });
      console.log(`✅ Cupom VITALICIO atualizado:`);
      console.log(`   - isLifetime=true`);
      console.log(`   - purpose=TRIAL_UPGRADE`);
      console.log(`   - durationDays=null\n`);
    }

    // 2. Buscar usuários allowlisted
    console.log('[2/3] Identificando usuários allowlisted...');
    const allowedEmails = process.env.VITALICIO_ALLOWED_EMAILS || '';
    if (!allowedEmails.trim()) {
      console.warn('⚠️  VITALICIO_ALLOWED_EMAILS não configurada. Nenhum usuário será atualizado.');
      console.log('\n[FIX] ✅ Script concluído (parcialmente)');
      return;
    }

    const emailList = allowedEmails.split(',').map(e => e.trim().toLowerCase());
    console.log(`📧 Emails allowlisted: ${emailList.join(', ')}\n`);

    // 3. Para cada email allowlisted, atualizar subscriptions
    console.log('[3/3] Atualizando subscriptions dos usuários allowlisted...');
    let totalFixed = 0;

    for (const email of emailList) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true }
      });

      if (!user) {
        console.warn(`⚠️  Usuário ${email} não encontrado no banco. Ignorando.`);
        continue;
      }

      console.log(`\n👤 Usuário: ${user.name} (${user.email})`);

      // Buscar subscriptions existentes (ACTIVE ou TRIAL)
      const subscriptions = await prisma.subscription.findMany({
        where: {
          userId: user.id,
          status: { in: ['ACTIVE', 'TRIAL'] }
        },
        include: { plan: true },
        orderBy: { createdAt: 'desc' }
      });

      if (subscriptions.length === 0) {
        console.log(`   ℹ️  Nenhuma subscription ACTIVE/TRIAL encontrada. Criando nova...`);

        // Buscar plano PRO (ou o primeiro plano premium disponível)
        const proPlan = await prisma.plan.findFirst({
          where: {
            OR: [
              { slug: 'pro' },
              { slug: 'premium' },
              { slug: 'ultra' }
            ]
          },
          orderBy: { priority: 'desc' }
        });

        if (!proPlan) {
          console.error(`   ❌ Nenhum plano premium encontrado. Usuário ${email} não pode receber assinatura vitalícia.`);
          continue;
        }

        // Criar nova subscription vitalícia
        await prisma.subscription.create({
          data: {
            userId: user.id,
            planId: proPlan.id,
            status: 'ACTIVE',
            isLifetime: true,
            isTrial: false,
            validUntil: null,
            trialEndsAt: null,
            queriesLimit: 999999,
            externalProvider: 'COUPON_VITALICIO_MIGRATION'
          }
        });

        console.log(`   ✅ Subscription vitalícia criada (plano: ${proPlan.name})`);
        totalFixed++;
      } else {
        // Atualizar subscription mais recente
        const latestSub = subscriptions[0];
        console.log(`   📦 Subscription encontrada (id: ${latestSub.id}, status: ${latestSub.status}, plano: ${latestSub.plan.name})`);

        if (latestSub.isLifetime) {
          console.log(`   ℹ️  Subscription já é vitalícia. Ignorando.`);
          continue;
        }

        // Atualizar para vitalício
        await prisma.subscription.update({
          where: { id: latestSub.id },
          data: {
            status: 'ACTIVE',
            isLifetime: true,
            isTrial: false,
            validUntil: null,
            trialEndsAt: null
          }
        });

        console.log(`   ✅ Subscription atualizada para vitalícia`);
        totalFixed++;
      }
    }

    console.log(`\n[FIX] ✅ Script concluído com sucesso!`);
    console.log(`   Total de subscriptions corrigidas/criadas: ${totalFixed}`);

  } catch (error) {
    console.error('[FIX] ❌ Erro ao executar script:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  fixVitalicioSubscriptions()
    .then(() => {
      console.log('\n[FIX] Script finalizado');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n[FIX] Script falhou:', err);
      process.exit(1);
    });
}

export { fixVitalicioSubscriptions };

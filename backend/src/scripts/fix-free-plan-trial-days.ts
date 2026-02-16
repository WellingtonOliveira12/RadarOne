/**
 * ============================================================
 * FIX: Corrigir trialDays do plano FREE e subscriptions afetadas
 * ============================================================
 *
 * CAUSA RAIZ: seed.ts definia trialDays=0 para o plano FREE.
 * Isso fazia com que startTrialForUser criasse trials com
 * trialEndsAt = now (expirado instantaneamente).
 *
 * Este script:
 * 1. Atualiza o plano FREE para trialDays=7
 * 2. Corrige subscriptions TRIAL que nasceram com trialEndsAt ≈ createdAt
 *    (diferença < 1 hora = trial que nasceu expirado)
 *
 * IDEMPOTENTE: pode ser executado múltiplas vezes sem efeito colateral.
 *
 * Uso:
 *   npx ts-node src/scripts/fix-free-plan-trial-days.ts
 *   # ou em produção:
 *   node dist/scripts/fix-free-plan-trial-days.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== FIX: Corrigir trialDays do plano FREE ===\n');

  // 1. Corrigir o plano FREE
  const freePlan = await prisma.plan.findUnique({ where: { slug: 'free' } });

  if (!freePlan) {
    console.error('ERRO: Plano FREE não encontrado no banco!');
    process.exit(1);
  }

  console.log(`Plano FREE encontrado: id=${freePlan.id}, trialDays=${freePlan.trialDays}`);

  if (freePlan.trialDays < 1) {
    await prisma.plan.update({
      where: { slug: 'free' },
      data: { trialDays: 7 }
    });
    console.log('✅ Plano FREE atualizado: trialDays = 7');
  } else {
    console.log(`✅ Plano FREE já tem trialDays=${freePlan.trialDays} (OK, nada a fazer)`);
  }

  // 2. Encontrar subscriptions TRIAL que nasceram expiradas
  //    (trialEndsAt - createdAt < 1 hora = foram criadas com trialDays=0)
  const brokenTrials = await prisma.subscription.findMany({
    where: {
      planId: freePlan.id,
      status: { in: ['TRIAL', 'EXPIRED'] },
      isTrial: true,
    },
    include: { user: true }
  });

  let fixedCount = 0;

  for (const sub of brokenTrials) {
    if (!sub.trialEndsAt || !sub.createdAt) continue;

    const diffMs = sub.trialEndsAt.getTime() - sub.createdAt.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // Se a diferença entre trialEndsAt e createdAt é menor que 1 hora,
    // significa que o trial nasceu expirado (trialDays era 0)
    if (diffHours < 1) {
      const newTrialEndsAt = new Date(sub.createdAt);
      newTrialEndsAt.setDate(newTrialEndsAt.getDate() + 7);

      // Só corrigir se o novo trialEndsAt ainda está no futuro
      const now = new Date();
      const newStatus = newTrialEndsAt > now ? 'TRIAL' : sub.status;

      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          trialEndsAt: newTrialEndsAt,
          validUntil: newTrialEndsAt,
          status: newStatus,
        }
      });

      fixedCount++;
      console.log(
        `  Corrigido: user=${sub.user?.email || sub.userId}, ` +
        `old_trialEndsAt=${sub.trialEndsAt.toISOString()}, ` +
        `new_trialEndsAt=${newTrialEndsAt.toISOString()}, ` +
        `status=${newStatus}`
      );
    }
  }

  console.log(`\n✅ ${fixedCount} subscriptions corrigidas de ${brokenTrials.length} analisadas`);
  console.log('\n=== FIX concluído ===');
}

main()
  .catch((e) => {
    console.error('ERRO no script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

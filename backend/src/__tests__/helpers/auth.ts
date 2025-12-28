import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../../server';

/**
 * Helper de autenticação para testes de integração
 * Cria usuário com trial/subscription válida para passar no middleware checkTrialExpired
 */

export interface AuthedUser {
  token: string;
  userId: string;
  email: string;
  planId: string;
  subscriptionId: string;
}

/**
 * Cria usuário autenticado com trial ativo (7 dias no futuro)
 *
 * O middleware checkTrialExpired valida:
 * - Subscription com status 'TRIAL' ou 'ACTIVE'
 * - Se TRIAL: trialEndsAt deve ser no futuro
 *
 * @param email Email opcional (gera único se não fornecido)
 * @returns Objeto com token JWT, userId, email, planId, subscriptionId
 */
export async function createAuthedUserWithActiveTrial(
  email?: string
): Promise<AuthedUser> {
  const testEmail = email || `test-${Date.now()}@example.com`;
  const hashedPassword = await bcrypt.hash('Test123!', 10);

  // 1. Garantir que o plano FREE existe (upsert)
  const freePlan = await prisma.plan.upsert({
    where: { slug: 'free' },
    update: {},
    create: {
      name: 'Free',
      slug: 'free',
      description: 'Plano gratuito com trial de 7 dias',
      priceCents: 0,
      billingPeriod: 'MONTHLY',
      trialDays: 7,
      maxMonitors: 3,
      maxSites: 2,
      maxAlertsPerDay: 10,
      checkInterval: 60,
      isActive: true,
    },
  });

  // 2. Criar usuário de teste
  const user = await prisma.user.create({
    data: {
      email: testEmail,
      passwordHash: hashedPassword,
      name: 'Test User',
      role: 'USER',
    },
  });

  // 3. Criar subscription com trial ativo (7 dias no futuro)
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 dias

  const subscription = await prisma.subscription.create({
    data: {
      userId: user.id,
      planId: freePlan.id,
      status: 'TRIAL',
      trialEndsAt,
      isTrial: true,
      queriesLimit: 100,
      queriesUsed: 0,
    },
  });

  // 4. Gerar token JWT válido
  const secret = process.env.JWT_SECRET!;
  const token = jwt.sign({ userId: user.id }, secret, { expiresIn: '1h' });

  return {
    token,
    userId: user.id,
    email: user.email,
    planId: freePlan.id,
    subscriptionId: subscription.id,
  };
}

/**
 * Limpa usuário de teste e suas dependências
 * @param userId ID do usuário a ser removido
 */
export async function cleanupTestUser(userId: string): Promise<void> {
  // Deletar em ordem: dependências primeiro, depois usuário
  await prisma.monitor.deleteMany({ where: { userId } });
  await prisma.subscription.deleteMany({ where: { userId } });
  await prisma.usageLog.deleteMany({ where: { userId } });
  await prisma.notificationLog.deleteMany({ where: { userId } });
  await prisma.telegramAccount.deleteMany({ where: { userId } });
  await prisma.notificationSettings.delete({ where: { userId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } });
}

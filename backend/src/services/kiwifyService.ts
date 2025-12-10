/**
 * Kiwify Service
 * Gerencia integração com a API da Kiwify para checkout e assinaturas
 *
 * Documentação: https://docs.kiwify.com.br/
 *
 * IMPORTANTE:
 * - Kiwify usa redirecionamento para checkout (não API REST)
 * - Após pagamento, Kiwify envia webhook para ativar assinatura
 * - Cada plano deve ter um product_id único na Kiwify
 */

import { prisma } from '../server';

export interface CheckoutParams {
  userId: string;
  planSlug: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutResponse {
  checkoutUrl: string;
  planName: string;
  price: number;
}

/**
 * Gera URL de checkout da Kiwify
 *
 * FLUXO:
 * 1. Busca plano e usuário
 * 2. Gera URL de checkout baseada no kiwifyProductId
 * 3. Frontend redireciona usuário para essa URL
 * 4. Usuário paga na Kiwify
 * 5. Kiwify envia webhook 'compra_aprovada'
 * 6. Webhook ativa subscription no RadarOne
 */
export async function generateCheckoutUrl(params: CheckoutParams): Promise<CheckoutResponse> {
  const { userId, planSlug, successUrl, cancelUrl } = params;

  // 1. Buscar plano
  const plan = await prisma.plan.findUnique({
    where: { slug: planSlug },
  });

  if (!plan) {
    throw new Error(`Plano não encontrado: ${planSlug}`);
  }

  if (!plan.kiwifyProductId) {
    throw new Error(
      `Plano ${plan.name} não tem kiwifyProductId configurado. Configure no Prisma Studio ou seed.`
    );
  }

  // 2. Buscar usuário
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error(`Usuário não encontrado: ${userId}`);
  }

  // 3. Construir URL de checkout da Kiwify
  // Formato: https://pay.kiwify.com.br/{product_id}?email={email}&name={name}
  const baseUrl = process.env.KIWIFY_BASE_URL || 'https://pay.kiwify.com.br';
  const productId = plan.kiwifyProductId;

  const checkoutUrl = new URL(`${baseUrl}/${productId}`);

  // Adicionar parâmetros do cliente
  checkoutUrl.searchParams.set('email', user.email);
  checkoutUrl.searchParams.set('name', user.name);

  // URLs de retorno (opcional)
  if (successUrl) {
    checkoutUrl.searchParams.set('success_url', successUrl);
  }
  if (cancelUrl) {
    checkoutUrl.searchParams.set('cancel_url', cancelUrl);
  }

  console.log('[KIWIFY] Checkout URL gerada:', checkoutUrl.toString());

  return {
    checkoutUrl: checkoutUrl.toString(),
    planName: plan.name,
    price: plan.priceCents / 100,
  };
}

/**
 * Verifica se um plano tem integração Kiwify configurada
 */
export async function isPlanKiwifyEnabled(planSlug: string): Promise<boolean> {
  const plan = await prisma.plan.findUnique({
    where: { slug: planSlug },
    select: { kiwifyProductId: true },
  });

  return !!plan?.kiwifyProductId;
}

/**
 * Lista todos os planos com Kiwify configurado
 */
export async function getKiwifyEnabledPlans() {
  return await prisma.plan.findMany({
    where: {
      kiwifyProductId: { not: null },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      priceCents: true,
      kiwifyProductId: true,
    },
  });
}

/**
 * Configura kiwifyProductId para um plano
 * (Usado em setup/admin)
 */
export async function setKiwifyProductId(planSlug: string, productId: string) {
  return await prisma.plan.update({
    where: { slug: planSlug },
    data: { kiwifyProductId: productId },
  });
}

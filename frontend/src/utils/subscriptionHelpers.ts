/**
 * Helpers para verificar status de subscription do usuário
 * Usado pelos guards de rota para validação ANTES de renderizar componentes
 */

export interface Subscription {
  id: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' | 'SUSPENDED';
  isTrial?: boolean;
  isLifetime?: boolean;
  trialEndsAt?: string | null;
  validUntil?: string | null;
  plan?: {
    name: string;
    slug: string;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: 'USER' | 'ADMIN' | 'ADMIN_SUPER' | 'ADMIN_SUPPORT' | 'ADMIN_FINANCE' | 'ADMIN_READ';
  subscriptions?: Subscription[];
}

export type SubscriptionBlockReason = 'trial_expired' | 'subscription_required' | 'no_subscription';

export interface SubscriptionStatus {
  hasValidSubscription: boolean;
  reason?: SubscriptionBlockReason;
  subscription?: Subscription;
}

/**
 * Verifica se o usuário tem subscription válida
 * Retorna status + motivo se bloqueado
 *
 * Lógica (baseada no middleware backend checkTrialExpired):
 * 1. Se não tem subscriptions → BLOQUEADO (no_subscription)
 * 2. Se tem subscription ACTIVE → OK
 * 3. Se tem subscription TRIAL:
 *    - Se trialEndsAt < now → BLOQUEADO (trial_expired)
 *    - Senão → OK
 * 4. Qualquer outro status → BLOQUEADO (subscription_required)
 */
export function getSubscriptionStatus(user: User | null): SubscriptionStatus {
  // Não autenticado
  if (!user) {
    return {
      hasValidSubscription: false,
      reason: 'no_subscription',
    };
  }

  // Sem subscriptions
  if (!user.subscriptions || user.subscriptions.length === 0) {
    return {
      hasValidSubscription: false,
      reason: 'subscription_required',
    };
  }

  const now = new Date();

  // Percorrer TODAS as subscriptions (ordenadas por createdAt desc pelo backend)
  // e encontrar a PRIMEIRA válida. Isso evita que um trial expirado antigo
  // mascare um trial/subscription mais recente válido.
  let lastExpiredTrial: Subscription | undefined;

  for (const subscription of user.subscriptions) {
    // Subscription ACTIVE → OK
    if (subscription.status === 'ACTIVE') {
      // Vitalício ou sem data de expiração → sempre válido
      if (subscription.isLifetime || !subscription.validUntil) {
        return { hasValidSubscription: true, subscription };
      }
      // Verificar se validUntil >= now
      if (new Date(subscription.validUntil) >= now) {
        return { hasValidSubscription: true, subscription };
      }
      // ACTIVE expirado — continuar buscando
      continue;
    }

    // Subscription TRIAL → verificar se expirou (exceto se vitalício)
    if (subscription.status === 'TRIAL') {
      if (subscription.isLifetime) {
        return { hasValidSubscription: true, subscription };
      }

      if (subscription.trialEndsAt) {
        if (new Date(subscription.trialEndsAt) >= now) {
          return { hasValidSubscription: true, subscription };
        }
        // Trial expirado — guardar para usar como reason se nenhuma válida for encontrada
        if (!lastExpiredTrial) {
          lastExpiredTrial = subscription;
        }
        continue;
      }

      // TRIAL sem trialEndsAt (edge case) → considerar válido
      return { hasValidSubscription: true, subscription };
    }

    // Outros status (CANCELLED, EXPIRED, SUSPENDED, PAST_DUE) → pular
  }

  // Nenhuma subscription válida encontrada
  if (lastExpiredTrial) {
    return {
      hasValidSubscription: false,
      reason: 'trial_expired',
      subscription: lastExpiredTrial,
    };
  }

  return {
    hasValidSubscription: false,
    reason: 'subscription_required',
  };
}

/**
 * Mapeia motivo de bloqueio para mensagem amigável
 * Usado em banners/toasts
 */
export function getSubscriptionMessage(reason: SubscriptionBlockReason | string): string {
  const messages: Record<string, string> = {
    trial_expired: 'Seu período de teste gratuito expirou. Escolha um plano para continuar usando o RadarOne.',
    subscription_required: 'Você precisa assinar um plano para acessar este recurso.',
    no_subscription: 'Você precisa assinar um plano para acessar este recurso.',
    session_expired: 'Sua sessão expirou por inatividade. Faça login novamente.',
  };

  return messages[reason] || 'Acesso restrito. Por favor, verifique sua assinatura.';
}

/**
 * Verifica se a URL atual é uma rota permitida mesmo sem subscription
 * Rotas públicas + /plans + /logout
 */
export function isPublicRoute(pathname: string): boolean {
  const publicRoutes = [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/plans',
    '/manual',
    '/faq',
    '/contact',
    '/health',
  ];

  return publicRoutes.includes(pathname);
}

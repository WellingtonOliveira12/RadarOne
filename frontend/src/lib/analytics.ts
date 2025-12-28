/**
 * Analytics Service - Google Analytics 4 Integration
 *
 * Sistema de analytics robusto e tree-shakeable para rastrear eventos importantes.
 * Integra com Google Analytics 4 (gtag.js) com fallback seguro.
 */

// Tipos do Google Analytics
declare global {
  interface Window {
    gtag?: (
      command: 'config' | 'event' | 'js',
      targetId: string | Date,
      config?: Record<string, any>
    ) => void;
    dataLayer?: any[];
  }
}

// Configuração
const ANALYTICS_ID = import.meta.env.VITE_ANALYTICS_ID;
const IS_ENABLED = Boolean(ANALYTICS_ID);
const IS_DEV = import.meta.env.DEV;

/**
 * Inicializa o Google Analytics
 * NOTA: O script principal é carregado no main.tsx antes do React.
 * Esta função serve apenas para verificação e debug.
 */
export function initAnalytics(): void {
  if (!IS_ENABLED) {
    if (IS_DEV) {
      console.log('[GA4] ⚠️ Analytics desabilitado (VITE_ANALYTICS_ID não configurado)');
    }
    return;
  }

  // Verifica se foi carregado corretamente
  if (window.gtag && window.dataLayer) {
    if (IS_DEV) {
      console.log('[GA4] ✅ Analytics verificado - funcionando corretamente');
      console.log('[GA4] 📊 ID:', ANALYTICS_ID);
      console.log('[GA4] 🔍 window.gtag:', typeof window.gtag === 'function' ? '✅' : '❌');
      console.log('[GA4] 🔍 window.dataLayer:', Array.isArray(window.dataLayer) ? '✅' : '❌');
    }
  } else if (IS_DEV) {
    console.warn('[GA4] ⚠️ Analytics não foi carregado corretamente');
    console.warn('[GA4] Verifique se VITE_ANALYTICS_ID está configurado');
  }
}

/**
 * Rastreia um evento customizado
 */
export function trackEvent(
  eventName: string,
  params?: Record<string, any>
): void {
  // Log em desenvolvimento
  if (IS_DEV) {
    console.log('[ANALYTICS] Event:', eventName, params);
  }

  // Se analytics não está habilitado, retorna
  if (!IS_ENABLED) return;

  // Se gtag não está disponível, retorna silenciosamente
  if (!window.gtag) {
    console.warn('[ANALYTICS] gtag não disponível ainda');
    return;
  }

  try {
    window.gtag('event', eventName, params);
  } catch (error) {
    console.error('[ANALYTICS] Erro ao rastrear evento:', error);
  }
}

/**
 * Rastreia uma visualização de página
 */
export function trackPageView(path: string, title?: string): void {
  if (IS_DEV) {
    console.log('[ANALYTICS] PageView:', path, title);
  }

  if (!IS_ENABLED || !window.gtag) return;

  try {
    window.gtag('event', 'page_view', {
      page_path: path,
      page_title: title || document.title,
    });
  } catch (error) {
    console.error('[ANALYTICS] Erro ao rastrear pageview:', error);
  }
}

/**
 * Rastreia login de usuário
 */
export function trackLogin(method: string = 'email'): void {
  trackEvent('login', { method });
}

/**
 * Rastreia registro de usuário
 */
export function trackSignUp(method: string = 'email'): void {
  trackEvent('sign_up', { method });
}

/**
 * Rastreia recuperação de senha
 */
export function trackPasswordReset(): void {
  trackEvent('password_reset');
}

/**
 * Rastreia solicitação de recuperação de senha
 */
export function trackForgotPassword(): void {
  trackEvent('forgot_password');
}

/**
 * Rastreia criação de assinatura
 */
export function trackSubscriptionCreated(planName: string, value?: number): void {
  trackEvent('subscription_created', {
    plan_name: planName,
    value,
    currency: 'BRL',
  });
}

/**
 * Rastreia cancelamento de assinatura
 */
export function trackSubscriptionCancelled(planName: string): void {
  trackEvent('subscription_cancelled', {
    plan_name: planName,
  });
}

/**
 * Rastreia criação de monitor
 */
export function trackMonitorCreated(site: string, mode: string): void {
  trackEvent('monitor_created', {
    site,
    mode,
  });
}

/**
 * Rastreia remoção de monitor
 */
export function trackMonitorDeleted(site: string): void {
  trackEvent('monitor_deleted', {
    site,
  });
}

/**
 * Rastreia visualização de planos
 */
export function trackViewPlans(): void {
  trackEvent('view_plans');
}

/**
 * Rastreia clique em "Assinar plano"
 */
export function trackSelectPlan(planName: string, price: number): void {
  trackEvent('select_plan', {
    plan_name: planName,
    value: price,
    currency: 'BRL',
  });
}

/**
 * Rastreia quando trial expira e usuário é bloqueado
 */
export function trackTrialExpired(params?: {
  planName?: string;
  daysExpired?: number;
  endpoint?: string;
  source?: 'api' | 'manual';
}): void {
  trackEvent('trial_expired', {
    plan_name: params?.planName,
    days_expired: params?.daysExpired,
    endpoint: params?.endpoint,
    source: params?.source || 'api',
  });
}

/**
 * Rastreia quando usuário é redirecionado para /plans por trial expirado
 */
export function trackRedirectToPlans(reason: string): void {
  trackEvent('redirect_to_plans', {
    reason,
  });
}

/**
 * Rastreia quando banner de trial expirando é mostrado
 */
export function trackTrialExpiringBannerShown(daysRemaining: number, planName?: string): void {
  trackEvent('trial_expiring_banner_shown', {
    days_remaining: daysRemaining,
    plan_name: planName,
  });
}

/**
 * Rastreia quando toast de trial expirado é mostrado
 */
export function trackTrialExpiredToastShown(): void {
  trackEvent('trial_expired_toast_shown');
}

/**
 * Rastreia clique no menu Ajuda
 */
export function trackHelpMenuClick(action: 'open' | 'manual' | 'faq' | 'contact'): void {
  trackEvent('help_menu_interaction', {
    action,
    location: 'header',
  });
}

/**
 * Rastreia navegação para páginas de ajuda
 */
export function trackHelpPageView(page: 'manual' | 'faq' | 'contact'): void {
  trackEvent('help_page_view', {
    help_page: page,
  });
}

/**
 * Verifica se analytics está habilitado
 */
export function isAnalyticsEnabled(): boolean {
  return IS_ENABLED;
}

/**
 * Mascara o email para privacidade
 * Exemplo: john@example.com -> j***@example.com
 */
export function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!domain) return email;

  const masked = localPart.charAt(0) + '***';
  return `${masked}@${domain}`;
}

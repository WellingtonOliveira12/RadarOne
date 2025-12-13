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
 * Deve ser chamado uma vez no início da aplicação
 */
export function initAnalytics(): void {
  if (!IS_ENABLED) {
    if (IS_DEV) {
      console.log('[ANALYTICS] Desabilitado (VITE_ANALYTICS_ID não configurado)');
    }
    return;
  }

  // Verifica se já foi inicializado
  if (window.gtag) {
    console.warn('[ANALYTICS] Já foi inicializado anteriormente');
    return;
  }

  try {
    // Cria o script do Google Analytics
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}`;
    document.head.appendChild(script);

    // Inicializa o dataLayer
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };

    window.gtag('js', new Date());
    window.gtag('config', ANALYTICS_ID, {
      send_page_view: false, // Vamos controlar manualmente
      anonymize_ip: true, // LGPD compliance
    });

    if (IS_DEV) {
      console.log('[ANALYTICS] Inicializado com sucesso:', ANALYTICS_ID);
    }
  } catch (error) {
    console.error('[ANALYTICS] Erro ao inicializar:', error);
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

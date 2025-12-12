/**
 * Analytics Service
 *
 * Camada simples de analytics para rastrear eventos importantes.
 * Pode ser expandida futuramente para integrar com Google Analytics, Segment, etc.
 */

export function trackEvent(eventName: string, payload?: Record<string, any>) {
  // Log no console para desenvolvimento
  console.log('[ANALYTICS]', eventName, payload);

  // TODO: Integrar com serviço de analytics real (Google Analytics, Segment, etc.)
  // Exemplo:
  // if (window.gtag) {
  //   window.gtag('event', eventName, payload);
  // }

  // Exemplo com segment:
  // if (window.analytics) {
  //   window.analytics.track(eventName, payload);
  // }
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

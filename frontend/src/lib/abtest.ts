/**
 * A/B Testing - Sistema simples para testar variantes de mensagens
 *
 * Características:
 * - Split 50/50
 * - Persistência por sessão (sessionStorage)
 * - Tracking de variante exibida
 * - Sem biblioteca externa
 */

import { trackEvent } from './analytics';

/**
 * Variantes de mensagens disponíveis
 */
export const AB_TEST_VARIANTS = {
  trialExpiredToast: {
    A: 'Seu período grátis expirou. Escolha um plano para continuar.',
    B: 'Seu teste gratuito terminou. Assine agora para continuar aproveitando!',
  },
  trialExpiredBanner: {
    A: 'Seu período grátis expirou. Assine um plano para continuar usando o RadarOne.',
    B: 'Seu teste de 7 dias terminou. Escolha seu plano e continue monitorando!',
  },
  trialExpiringBanner: {
    A: (days: number) => `Seu trial expira em ${days} ${days === 1 ? 'dia' : 'dias'}!`,
    B: (days: number) => `Faltam apenas ${days} ${days === 1 ? 'dia' : 'dias'} do seu teste gratuito!`,
  },
} as const;

export type ABTestKey = keyof typeof AB_TEST_VARIANTS;
export type ABVariant = 'A' | 'B';

/**
 * Chave de sessão para cada teste
 */
function getSessionKey(testKey: ABTestKey): string {
  return `ab_test_${testKey}`;
}

/**
 * Obtém ou cria uma variante para um teste específico
 * Usa sessionStorage para persistir durante a sessão
 */
export function getABVariant(testKey: ABTestKey): ABVariant {
  // Verificar se já existe variante salva nesta sessão
  const stored = sessionStorage.getItem(getSessionKey(testKey));

  if (stored === 'A' || stored === 'B') {
    return stored as ABVariant;
  }

  // Gerar nova variante (50/50)
  const variant: ABVariant = Math.random() < 0.5 ? 'A' : 'B';

  // Salvar na sessão
  sessionStorage.setItem(getSessionKey(testKey), variant);

  // Trackear que usuário foi atribuído a esta variante
  trackEvent('ab_test_assigned', {
    test_key: testKey,
    variant,
  });

  return variant;
}

/**
 * Obtém a mensagem correta baseada no teste A/B
 */
export function getABMessage(testKey: ABTestKey, ...args: any[]): string {
  const variant = getABVariant(testKey);
  const message = AB_TEST_VARIANTS[testKey][variant];

  // Se for função, executar com argumentos
  if (typeof message === 'function') {
    return message(...args);
  }

  return message;
}

/**
 * Trackeia que uma variante foi exibida
 */
export function trackABVariantShown(testKey: ABTestKey, context?: string): void {
  const variant = getABVariant(testKey);

  trackEvent('ab_test_variant_shown', {
    test_key: testKey,
    variant,
    context,
  });
}

/**
 * Força uma variante específica (útil para testes)
 * ⚠️ Usar apenas em desenvolvimento/debug
 */
export function forceABVariant(testKey: ABTestKey, variant: ABVariant): void {
  if (import.meta.env.DEV) {
    sessionStorage.setItem(getSessionKey(testKey), variant);
    console.log(`[AB TEST] Forçado ${testKey} = ${variant}`);
  } else {
    console.warn('[AB TEST] forceABVariant só funciona em desenvolvimento');
  }
}

/**
 * Limpa todas as variantes (útil para testes)
 */
export function clearABTests(): void {
  Object.keys(AB_TEST_VARIANTS).forEach((testKey) => {
    sessionStorage.removeItem(getSessionKey(testKey as ABTestKey));
  });
  console.log('[AB TEST] Todas as variantes foram limpas');
}

/**
 * Obtém todas as variantes atribuídas nesta sessão
 */
export function getABTestState(): Record<ABTestKey, ABVariant> {
  const state = {} as Record<ABTestKey, ABVariant>;

  Object.keys(AB_TEST_VARIANTS).forEach((testKey) => {
    const stored = sessionStorage.getItem(getSessionKey(testKey as ABTestKey));
    if (stored) {
      state[testKey as ABTestKey] = stored as ABVariant;
    }
  });

  return state;
}

/**
 * Helper para debug em console
 */
if (import.meta.env.DEV) {
  (window as any).abtest = {
    getVariant: getABVariant,
    getMessage: getABMessage,
    force: forceABVariant,
    clear: clearABTests,
    state: getABTestState,
  };

  console.log('[AB TEST] Helpers disponíveis em window.abtest');
}

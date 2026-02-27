/**
 * A/B Testing Backend - Sistema para testar variantes de subject lines de email
 *
 * Características:
 * - Split 50/50 aleatório
 * - Variantes de subject para emails de cupons abandonados
 * - Logs para tracking manual
 */

import { logInfo } from './loggerHelpers';

/**
 * Variantes de subject lines para emails
 */
export const EMAIL_SUBJECT_VARIANTS = {
  // 1º Email - Cupons Abandonados (24h)
  firstReminderStandard: {
    A: (couponCode: string, discountText: string) =>
      `💰 Não esqueça seu cupom ${couponCode} - ${discountText} de desconto!`,
    B: (couponCode: string, discountText: string) =>
      `🎁 Seu cupom ${couponCode} está esperando - ${discountText} OFF!`,
  },
  firstReminderMedium: {
    A: (couponCode: string, discountText: string) =>
      `💎 Cupom Especial ${couponCode} - ${discountText} de desconto exclusivo`,
    B: (couponCode: string, discountText: string) =>
      `✨ Aproveite: ${discountText} de desconto com cupom ${couponCode}`,
  },
  firstReminderHigh: {
    A: (couponCode: string, discountText: string) =>
      `🔥 DESCONTO MÁXIMO: ${discountText} com cupom ${couponCode}!`,
    B: (couponCode: string, discountText: string) =>
      `⭐ EXCLUSIVO: Cupom ${couponCode} - ${discountText} de desconto!`,
  },

  // 2º Email - Cupons Abandonados (48h - Urgência)
  secondReminderStandard: {
    A: (couponCode: string, discountText: string) =>
      `⏰ ÚLTIMA CHANCE: Cupom ${couponCode} - ${discountText} de desconto expira em breve!`,
    B: (couponCode: string, discountText: string) =>
      `⚠️ Não perca! Cupom ${couponCode} (${discountText} OFF) expira logo`,
  },
  secondReminderMedium: {
    A: (couponCode: string, discountText: string) =>
      `🚨 URGENTE: ${discountText} de desconto com ${couponCode} - última chance!`,
    B: (couponCode: string, discountText: string) =>
      `⏳ Corre! Seu cupom ${couponCode} (${discountText} OFF) está acabando`,
  },
  secondReminderHigh: {
    A: (couponCode: string, discountText: string) =>
      `🔴 ALERTA FINAL: ${discountText} de desconto com ${couponCode} - NÃO PERCA!`,
    B: (couponCode: string, discountText: string) =>
      `⚡ ÚLTIMA HORA: Cupom ${couponCode} - ${discountText} OFF - Expira HOJE!`,
  },
} as const;

export type EmailSubjectTestKey = keyof typeof EMAIL_SUBJECT_VARIANTS;
export type ABVariant = 'A' | 'B';

/**
 * Obtém uma variante aleatória (50/50) para um teste específico
 */
export function getEmailSubjectVariant(testKey: EmailSubjectTestKey): ABVariant {
  return Math.random() < 0.5 ? 'A' : 'B';
}

/**
 * Obtém o subject line baseado no teste A/B
 */
export function getEmailSubject(
  testKey: EmailSubjectTestKey,
  couponCode: string,
  discountText: string
): { subject: string; variant: ABVariant } {
  const variant = getEmailSubjectVariant(testKey);
  const subjectFn = EMAIL_SUBJECT_VARIANTS[testKey][variant];
  const subject = subjectFn(couponCode, discountText);

  // Log para tracking (pode ser integrado com analytics posteriormente)
  logInfo('A/B TEST: Email subject variant selected', { testKey, variant });

  return { subject, variant };
}

/**
 * Determinar qual teste usar baseado em categoria e reminder
 */
export function getSubjectTestKey(
  category: 'high' | 'medium' | 'standard',
  isSecondReminder: boolean
): EmailSubjectTestKey {
  if (isSecondReminder) {
    if (category === 'high') return 'secondReminderHigh';
    if (category === 'medium') return 'secondReminderMedium';
    return 'secondReminderStandard';
  } else {
    if (category === 'high') return 'firstReminderHigh';
    if (category === 'medium') return 'firstReminderMedium';
    return 'firstReminderStandard';
  }
}

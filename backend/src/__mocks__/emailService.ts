import { vi } from 'vitest';
import type { SendEmailOptions } from '../services/emailService';

/**
 * Mock completo do EmailService para testes
 * Simula envio de emails sem fazer chamadas reais à API
 */

const mockSuccessResponse = () => ({
  success: true,
  messageId: `mock-${Date.now()}`
});

const mockVoidResponse = () => Promise.resolve();

export const sendEmail = vi.fn(async (options: SendEmailOptions) => {
  console.log('[MOCK] sendEmail:', options.to, options.subject);
  return mockSuccessResponse();
});

export const sendNotificationEmail = vi.fn(async (to: string, subject: string, html: string) => {
  console.log('[MOCK] sendNotificationEmail:', to, subject);
  return mockVoidResponse();
});

export const sendAlertEmail = vi.fn(async (to: string, adTitle: string, adUrl: string, monitorName: string) => {
  console.log('[MOCK] sendAlertEmail:', to, adTitle);
  return mockSuccessResponse();
});

export const sendWelcomeEmail = vi.fn(async (to: string, name: string) => {
  console.log('[MOCK] sendWelcomeEmail:', to, name);
  return mockSuccessResponse();
});

export const sendPasswordResetEmail = vi.fn(async (to: string, resetToken: string) => {
  console.log('[MOCK] sendPasswordResetEmail:', to);
  return mockSuccessResponse();
});

export const sendPasswordChangedEmail = vi.fn(async (to: string) => {
  console.log('[MOCK] sendPasswordChangedEmail:', to);
  return mockSuccessResponse();
});

export const sendTrialStartedEmail = vi.fn(async (to: string, planName: string, trialEndsAt: Date) => {
  console.log('[MOCK] sendTrialStartedEmail:', to, planName);
  return mockSuccessResponse();
});

export const sendTrialEndingEmail = vi.fn(async (to: string, name: string, daysRemaining: number, planName: string) => {
  console.log('[MOCK] sendTrialEndingEmail:', to, planName, daysRemaining);
  return mockSuccessResponse();
});

export const sendTrialExpiredEmail = vi.fn(async (to: string, name: string, planName: string) => {
  console.log('[MOCK] sendTrialExpiredEmail:', to, planName);
  return mockSuccessResponse();
});

export const sendSubscriptionExpiredEmail = vi.fn(async (to: string, name: string, planName: string) => {
  console.log('[MOCK] sendSubscriptionExpiredEmail:', to, planName);
  return mockSuccessResponse();
});

export const sendNewListingEmail = vi.fn(async (to: string, listingTitle: string, listingUrl: string) => {
  console.log('[MOCK] sendNewListingEmail:', to, listingTitle);
  return mockSuccessResponse();
});

export const sendMonthlyQueriesResetReport = vi.fn(async (to: string, resetCount: number) => {
  console.log('[MOCK] sendMonthlyQueriesResetReport:', to, resetCount);
  return mockSuccessResponse();
});

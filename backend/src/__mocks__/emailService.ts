import { vi } from 'vitest';
import type { SendEmailOptions } from '../services/emailService';

/**
 * Mock do EmailService para testes
 * Simula envio de emails sem fazer chamadas reais à API
 */

export const sendEmail = vi.fn(async (options: SendEmailOptions) => {
  console.log('[MOCK] Email enviado:', options.to, options.subject);

  return {
    success: true,
    messageId: `mock-${Date.now()}`
  };
});

export const sendPasswordResetEmail = vi.fn(async (to: string, resetLink: string) => {
  console.log('[MOCK] Password reset email enviado para:', to);

  return {
    success: true,
    messageId: `mock-${Date.now()}`
  };
});

export const sendVerificationEmail = vi.fn(async (to: string, verificationLink: string) => {
  console.log('[MOCK] Verification email enviado para:', to);

  return {
    success: true,
    messageId: `mock-${Date.now()}`
  };
});

export const sendNewAdNotification = vi.fn(async (to: string, adData: any) => {
  console.log('[MOCK] New ad notification enviado para:', to);

  return {
    success: true,
    messageId: `mock-${Date.now()}`
  };
});

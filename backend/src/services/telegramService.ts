/**
 * Telegram Service — Barrel re-exports
 *
 * This file re-exports all Telegram functionality from specialized services:
 * - telegram-client.ts — Shared API client, constants, sendTelegramMessage
 * - telegram-notification.service.ts — Alert message formatting and delivery
 * - telegram-bot.service.ts — Bot management, webhooks, diagnostics
 * - telegram-connection.service.ts — User connection and verification flows
 */

// Client (shared constants + sendTelegramMessage)
export {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_API_BASE,
  TELEGRAM_WEBHOOK_SECRET,
  sendTelegramMessage,
} from './telegram-client';
export type { SendTelegramMessageOptions } from './telegram-client';

// Notifications
export { sendAlertTelegram } from './telegram-notification.service';

// Bot management & webhooks
export {
  getBotInfo,
  getWebhookInfo,
  setTelegramWebhook,
  setupTelegramWebhook,
  processWebhookMessage,
  validateWebhookSecret,
  getBackendInfo,
  getExpectedWebhookUrl,
  diagnoseTelegram,
} from './telegram-bot.service';

// Connection & verification
export {
  generateLinkCode,
  getChatIdForUser,
  getUserTelegramAccount,
  generateConnectToken,
  processStartCommand,
  getTelegramStatus,
  disconnectTelegram,
} from './telegram-connection.service';

/**
 * Centralized Application Configuration
 *
 * All hardcoded values extracted into environment-variable-driven config.
 * Each value has a sensible default but can be overridden via env vars.
 */

// ============================================
// Authentication & Tokens
// ============================================
export const AUTH_CONFIG = {
  /** Access token lifetime (e.g., '15m', '1h') */
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',

  /** Refresh token validity in days */
  refreshTokenExpiryDays: Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7,

  /** Maximum concurrent sessions per user */
  maxTokensPerUser: Number(process.env.MAX_TOKENS_PER_USER) || 5,

  /** 2FA code token lifetime */
  twoFactorTokenExpiresIn: process.env.TWO_FACTOR_TOKEN_EXPIRES_IN || '5m',

  /** Password reset token lifetime */
  passwordResetTokenExpiresIn: process.env.PASSWORD_RESET_TOKEN_EXPIRES_IN || '30m',

  /** Revoked token cleanup period in days */
  revokedTokenCleanupDays: Number(process.env.REVOKED_TOKEN_CLEANUP_DAYS) || 30,

  /** Refresh token cookie name */
  refreshTokenCookieName: process.env.REFRESH_TOKEN_COOKIE_NAME || 'radarone_refresh',
} as const;

// ============================================
// Job Scheduler (Cron Expressions)
// ============================================
export const SCHEDULER_CONFIG = {
  /** Warmup ping interval (prevents Render sleep) */
  warmupPingCron: process.env.WARMUP_PING_CRON || '*/10 * * * *',

  /** Check trials expiring — daily at 9 AM */
  checkTrialExpiringCron: process.env.CHECK_TRIAL_EXPIRING_CRON || '0 9 * * *',

  /** Check subscriptions expired — daily at 10 AM */
  checkSubscriptionExpiredCron: process.env.CHECK_SUBSCRIPTION_EXPIRED_CRON || '0 10 * * *',

  /** Reset monthly queries — 1st of month at 3 AM */
  resetMonthlyQueriesCron: process.env.RESET_MONTHLY_QUERIES_CRON || '0 3 1 * *',

  /** Check coupon alerts — daily at 11 AM */
  checkCouponAlertsCron: process.env.CHECK_COUPON_ALERTS_CRON || '0 11 * * *',

  /** Check trial upgrade expiring — daily at 12 PM */
  checkTrialUpgradeExpiringCron: process.env.CHECK_TRIAL_UPGRADE_EXPIRING_CRON || '0 12 * * *',

  /** Check abandoned coupons — daily at 1 PM */
  checkAbandonedCouponsCron: process.env.CHECK_ABANDONED_COUPONS_CRON || '0 13 * * *',

  /** Check sessions expiring — daily at 2 PM */
  checkSessionExpiringCron: process.env.CHECK_SESSION_EXPIRING_CRON || '0 14 * * *',

  /** Timezone for all scheduled jobs */
  timezone: process.env.SCHEDULER_TIMEZONE || 'America/Sao_Paulo',

  /** Health check timeout in ms */
  healthCheckTimeoutMs: Number(process.env.HEALTH_CHECK_TIMEOUT_MS) || 10000,
} as const;

// ============================================
// Trial & Plan Defaults
// ============================================
export const PLAN_CONFIG = {
  /** Fallback trial duration when plan.trialDays is 0 or invalid */
  fallbackTrialDays: Number(process.env.FALLBACK_TRIAL_DAYS) || 7,

  /** Default plan limits when no plan is found */
  defaultLimits: {
    maxMonitors: Number(process.env.DEFAULT_MAX_MONITORS) || 1,
    maxSites: Number(process.env.DEFAULT_MAX_SITES) || 1,
    maxAlertsPerDay: Number(process.env.DEFAULT_MAX_ALERTS_PER_DAY) || 3,
  },

  /** Admin notification email for reports */
  adminEmail: process.env.ADMIN_EMAIL || 'admin@radarone.com',
} as const;

// ============================================
// Notification Thresholds
// ============================================
export const NOTIFICATION_CONFIG = {
  /** Days before trial expiry to send warning email */
  trialWarningDaysBefore: Number(process.env.TRIAL_WARNING_DAYS_BEFORE) || 3,

  /** Hours before first abandoned coupon reminder */
  abandonedCouponFirstReminderHours: Number(process.env.ABANDONED_COUPON_FIRST_REMINDER_HOURS) || 24,

  /** Hours before second abandoned coupon reminder */
  abandonedCouponSecondReminderHours: Number(process.env.ABANDONED_COUPON_SECOND_REMINDER_HOURS) || 48,

  /** Days before session expiry to notify */
  sessionExpiringWarningDays: Number(process.env.SESSION_EXPIRING_WARNING_DAYS) || 3,

  /** Hours for notification deduplication */
  notificationDedupHours: Number(process.env.NOTIFICATION_DEDUP_HOURS) || 24,
} as const;

// ============================================
// HTTP & External Services
// ============================================
export const HTTP_CONFIG = {
  /** Telegram API request timeout in ms */
  telegramRequestTimeoutMs: Number(process.env.TELEGRAM_REQUEST_TIMEOUT_MS) || 10000,

  /** Telegram connection token expiry in minutes */
  telegramConnectionExpiryMinutes: Number(process.env.TELEGRAM_CONNECTION_EXPIRY_MINUTES) || 15,
} as const;

// ============================================
// Pagination Defaults
// ============================================
export const PAGINATION_CONFIG = {
  /** Default page size for admin lists */
  adminDefaultPageSize: Number(process.env.ADMIN_DEFAULT_PAGE_SIZE) || 10,

  /** Default page size for user-facing lists */
  defaultPageSize: Number(process.env.DEFAULT_PAGE_SIZE) || 20,

  /** Max alerts per page */
  alertsDefaultPageSize: Number(process.env.ALERTS_DEFAULT_PAGE_SIZE) || 50,
} as const;

# RadarOne - Database Schema Documentation

**Version:** 1.0
**Date:** 2026-02-26
**Phase:** Brownfield Discovery - Phase 2 Output
**Author:** @data-engineer (Dara)
**Schema Source:** `backend/prisma/schema.prisma`

---

## Overview

- **Database:** PostgreSQL 15+
- **ORM:** Prisma 7
- **Total Models:** 26
- **Total Enums:** 12
- **ID Strategy:** CUID (`@default(cuid())`)
- **Naming Convention:** camelCase in code, snake_case in database (`@map`)

---

## Models

### 1. User (`users`)

Core user model with LGPD compliance, 2FA, and admin security features.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| name | String | required | User display name |
| email | String | unique | Login email |
| phone | String? | optional | Phone number |
| passwordHash | String | required | bcrypt hash |
| cpfEncrypted | String? | optional | AES-256-GCM encrypted CPF |
| cpfLast4 | String? | optional | Last 4 digits for verification |
| cpfHash | String? | optional | SHA-256 for dedup |
| blocked | Boolean | default(false) | Account block flag |
| twoFactorSecret | String? | optional | TOTP secret (encrypted) |
| twoFactorEnabled | Boolean | default(false) | 2FA enabled flag |
| twoFactorBackupCodes | String[] | default([]) | Hashed backup codes |
| lastPasswordValidated | DateTime? | optional | Password revalidation timestamp |
| sessionTimeoutMinutes | Int? | optional | Custom session timeout |
| allowedIps | String[] | default([]) | IP whitelist (foundation) |
| lastLoginAt | DateTime? | optional | Last login timestamp |
| lastLoginIp | String? | optional | Last login IP |
| role | UserRole | default(USER) | User role |
| isActive | Boolean | default(true) | Soft delete flag |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Update timestamp |

**Relations:** Subscription[], Monitor[], UsageLog[], TelegramAccount[], NotificationLog[], NotificationSettings?, UserSession[], RefreshToken[], SiteExecutionStats[]

### 2. RefreshToken (`refresh_tokens`)

Secure refresh token storage with family-based replay attack detection.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| userId | String | FK -> User | Owner |
| tokenHash | String | unique | SHA-256 of token |
| family | String | required | Token family for replay detection |
| expiresAt | DateTime | required | Expiration |
| revokedAt | DateTime? | optional | Revocation timestamp |
| replacedBy | String? | optional | Successor token ID |
| userAgent | String? | optional | Client user agent |
| ipAddress | String? | optional | Client IP |
| createdAt | DateTime | auto | Creation timestamp |

**Indexes:** userId, family, expiresAt

### 3. TelegramAccount (`telegram_accounts`)

Linked Telegram accounts for notifications.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| userId | String | FK -> User | Owner |
| chatId | String | unique | Telegram chat ID |
| username | String? | optional | @username |
| active | Boolean | default(true) | Active flag |
| linkedAt | DateTime | auto | Link timestamp |

**Indexes:** userId

### 4. NotificationSettings (`notification_settings`)

Per-user notification preferences.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| userId | String | unique, FK -> User | Owner |
| emailEnabled | Boolean | default(true) | Email notifications |
| telegramEnabled | Boolean | default(false) | Telegram notifications |
| telegramUsername | String? | optional | @username |
| telegramChatId | String? | optional | Numeric chat ID |
| telegramLinkCode | String? | optional | Temporary link code |
| telegramLinkExpiresAt | DateTime? | optional | Link code expiry |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Update timestamp |

### 5. Plan (`plans`)

SaaS subscription plan definitions.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| name | String | unique | Plan name (FREE, STARTER, PRO, PREMIUM, ULTRA) |
| slug | String | unique | URL-safe slug |
| description | String? | optional | Plan description |
| priceCents | Int | required | Price in cents (BRL) |
| billingPeriod | String | required | MONTHLY, YEARLY, SEMIANNUAL |
| trialDays | Int | default(7) | Trial period length |
| maxMonitors | Int | required | Monitor limit |
| maxSites | Int | required | Site limit |
| maxAlertsPerDay | Int | required | Daily alert limit |
| checkInterval | Int | default(60) | Check interval (minutes) |
| isRecommended | Boolean | default(false) | Upsell highlight |
| priority | Int | default(0) | Sort order |
| isActive | Boolean | default(true) | Active flag |
| isLifetime | Boolean | default(false) | Lifetime plan flag |
| kiwifyProductId | String? | optional | Kiwify integration |
| checkoutUrl | String? | optional | Payment checkout URL |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Update timestamp |

**Relations:** Subscription[], Coupon[]

### 6. Subscription (`subscriptions`)

User subscription instances.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| userId | String | FK -> User | Subscriber |
| planId | String | FK -> Plan | Subscribed plan |
| status | SubscriptionStatus | default(TRIAL) | Current status |
| startDate | DateTime | auto | Start date |
| validUntil | DateTime? | optional | Period end date |
| trialEndsAt | DateTime? | optional | Trial expiry |
| queriesUsed | Int | default(0) | Monthly usage counter |
| queriesLimit | Int | required | Monthly limit |
| isLifetime | Boolean | default(false) | Lifetime flag |
| isTrial | Boolean | default(false) | Trial flag |
| externalProvider | String? | optional | STRIPE, KIWIFY, ASAAS |
| externalSubId | String? | optional | External subscription ID |
| kiwifyOrderId | String? | unique | Kiwify order ID |
| kiwifyCustomerId | String? | optional | Kiwify customer ID |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Update timestamp |

**Indexes:** userId, status, validUntil

### 7. Coupon (`coupons`)

Discount and trial upgrade coupons.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| code | String | unique | Coupon code |
| description | String? | optional | Description |
| discountType | String | required | PERCENT or FIXED |
| discountValue | Int | required | Value (% or cents) |
| purpose | String? | optional | DISCOUNT or TRIAL_UPGRADE |
| durationDays | Int? | optional | Trial upgrade duration |
| isLifetime | Boolean | default(false) | Lifetime subscription |
| appliesToPlanId | String? | FK -> Plan | Restricted to plan |
| maxUses | Int? | optional | Usage limit |
| usedCount | Int | default(0) | Current usage count |
| expiresAt | DateTime? | optional | Expiry date |
| isActive | Boolean | default(true) | Active flag |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Update timestamp |

**Relations:** Plan?, CouponUsage[]

### 8. CouponUsage (`coupon_usage`)

Tracks coupon redemptions.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| couponId | String | FK -> Coupon | Redeemed coupon |
| userId | String | **NO FK** | User who redeemed |
| usedAt | DateTime | auto | Redemption timestamp |

**Indexes:** couponId, userId
**NOTE:** `userId` has NO foreign key relation to User (data integrity risk)

### 9. CouponValidation (`coupon_validations`)

Tracks coupon validation attempts for analytics and abandonment notifications.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| couponId | String | required | Validated coupon |
| userId | String? | **NO FK** | User (nullable) |
| userEmail | String? | optional | Email for reminders |
| purpose | String | required | DISCOUNT or TRIAL_UPGRADE |
| location | String | required | Where validated |
| converted | Boolean | default(false) | Checkout completed |
| reminderSentAt | DateTime? | optional | 1st reminder timestamp |
| secondReminderSentAt | DateTime? | optional | 2nd reminder timestamp |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Update timestamp |

**Indexes:** couponId, userId, converted, createdAt, reminderSentAt
**NOTE:** `userId` has NO foreign key relation to User (data integrity risk)

### 10. PushSubscription (`push_subscriptions`)

Web Push API subscription storage.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| userId | String | required | Subscriber |
| endpoint | String | unique | Push service URL |
| p256dh | String | required | Encryption public key |
| auth | String | required | Auth key |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Update timestamp |

**Indexes:** userId

### 11. Monitor (`monitors`)

User-configured marketplace monitoring targets.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| userId | String | FK -> User | Owner |
| name | String | required | Monitor name |
| site | MonitorSite | required | Target marketplace |
| mode | MonitorMode | default(URL_ONLY) | Search mode |
| searchUrl | String? | optional | Direct URL |
| filtersJson | Json? | optional | Structured filters |
| priceMin | Float? | optional | Min price filter |
| priceMax | Float? | optional | Max price filter |
| country | String? | optional | ISO-3166-1 alpha-2 |
| stateRegion | String? | optional | State/region |
| city | String? | optional | City |
| keywords | String[] | default([]) | Search keywords |
| excludeKeywords | String[] | default([]) | Exclusion keywords |
| checkInterval | Int | default(60) | Check interval (min) |
| active | Boolean | default(true) | Active flag |
| lastCheckedAt | DateTime? | optional | Last check timestamp |
| lastResultHash | String? | optional | Change detection hash |
| lastAlertAt | DateTime? | optional | Last alert timestamp |
| alertsEnabled | Boolean | default(true) | Alerts enabled |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Update timestamp |

**Indexes:** userId, active, site
**Relations:** User, AdSeen[], MonitorLog[], SiteExecutionStats[]

### 12. AdSeen (`ads_seen`)

Discovered marketplace listings.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| monitorId | String | FK -> Monitor | Parent monitor |
| externalId | String | required | Marketplace listing ID |
| title | String | required | Listing title |
| description | String? | optional | Listing description |
| price | Float? | optional | Listing price |
| url | String | required | Listing URL |
| imageUrl | String? | optional | Image URL |
| location | String? | optional | Listing location |
| publishedAt | DateTime? | optional | Publication date |
| firstSeenAt | DateTime | auto | First discovery |
| lastSeenAt | DateTime | auto | Last seen |
| alertSent | Boolean | default(false) | Alert sent flag |
| alertSentAt | DateTime? | optional | Alert sent timestamp |
| metadata | Json? | optional | Extra data |

**Unique Constraint:** (monitorId, externalId)
**Indexes:** monitorId

### 13. MonitorLog (`monitor_logs`)

Scraper execution logs.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| monitorId | String | FK -> Monitor | Executed monitor |
| status | LogStatus | required | SUCCESS/ERROR/PARTIAL/SKIPPED |
| adsFound | Int | default(0) | Total ads found |
| newAds | Int | default(0) | New ads count |
| alertsSent | Int | default(0) | Alerts sent |
| error | String? | optional | Error message |
| executionTime | Int? | optional | Duration (ms) |
| diagnosis | Json? | optional | DiagnosisRecord |
| createdAt | DateTime | auto | Execution timestamp |

**Indexes:** monitorId, createdAt

### 14. UserSession (`user_sessions`)

Scraper authentication sessions (Playwright storage state).

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| userId | String | FK -> User | Session owner |
| site | String | required | Marketplace name |
| domain | String | required | Domain |
| accountLabel | String? | optional | Multi-account label |
| status | UserSessionStatus | default(ACTIVE) | Session status |
| encryptedStorageState | String? | Text | AES-256-GCM encrypted |
| cookies | Json? | optional | **LEGACY** |
| localStorage | Json? | optional | **LEGACY** |
| metadata | Json? | optional | Session metadata |
| expiresAt | DateTime? | optional | Expiry |
| lastUsedAt | DateTime? | auto | Last use |
| lastErrorAt | DateTime? | optional | Last error |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Update timestamp |

**Unique Constraint:** (userId, site, domain)
**Indexes:** userId, (site, status), expiresAt
**NOTE:** `cookies` and `localStorage` are legacy fields, should be removed after migration

### 15. UsageLog (`usage_logs`)

User action tracking for quota enforcement.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| userId | String | FK -> User | Actor |
| action | String | required | Action name (should be enum) |
| details | Json? | optional | Action details |
| queriesUsed | Int | default(1) | Queries consumed |
| createdAt | DateTime | auto | Timestamp |

**Indexes:** userId, createdAt

### 16. WebhookLog (`webhook_logs`)

Kiwify webhook event log.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| event | String | required | Event type |
| payload | Json | required | Full payload |
| processed | Boolean | default(false) | Processing status |
| error | String? | optional | Error message |
| createdAt | DateTime | auto | Timestamp |

**Indexes:** event, processed

### 17. NotificationLog (`notification_logs`)

Notification delivery history.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| userId | String | FK -> User | Recipient |
| channel | NotificationChannel | required | EMAIL or TELEGRAM |
| title | String | required | Notification title |
| message | String | Text | Notification body |
| target | String | required | Masked recipient |
| status | NotificationStatus | required | SUCCESS or FAILED |
| error | String? | Text | Error details |
| createdAt | DateTime | auto | Timestamp |

**Indexes:** userId, createdAt, status

### 18. TelegramConnectToken (`telegram_connect_tokens`)

Temporary tokens for Telegram bot linking.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| userId | String | required | Linking user |
| token | String | unique | Deep link token |
| status | TokenStatus | default(PENDING) | PENDING/USED/EXPIRED |
| expiresAt | DateTime | required | Expiry |
| usedAt | DateTime? | optional | Usage timestamp |
| createdAt | DateTime | auto | Creation timestamp |

**Indexes:** userId, token, status, expiresAt

### 19. SupportTicket (`support_tickets`)

Customer support tickets.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| userId | String? | optional | Submitter (nullable) |
| email | String | required | Contact email |
| category | String | required | Ticket category |
| subject | String | required | Subject line |
| message | String | Text | Ticket body |
| attachmentUrl | String? | optional | Attachment |
| status | TicketStatus | default(OPEN) | OPEN/IN_PROGRESS/RESOLVED/CLOSED |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Update timestamp |

**Indexes:** userId, status, createdAt

### 20. AuditLog (`audit_logs`)

Admin action audit trail.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| adminId | String | **NO FK** | Admin actor |
| adminEmail | String | required | Admin email |
| action | String | required | Action type |
| targetType | String | required | Entity type |
| targetId | String? | optional | Entity ID |
| beforeData | Json? | optional | Previous state |
| afterData | Json? | optional | New state |
| ipAddress | String? | optional | Client IP |
| userAgent | String? | optional | Client UA |
| createdAt | DateTime | auto | Timestamp |

**Indexes:** adminId, action, targetType, createdAt
**NOTE:** `adminId` has NO foreign key relation to User (data integrity risk)

### 21. SystemSetting (`system_settings`)

Runtime system configuration (key-value store).

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| key | String | unique | Setting key |
| value | String | required | Setting value (string) |
| type | String | default("STRING") | Value type hint |
| description | String? | optional | Documentation |
| category | String | default("GENERAL") | Category grouping |
| isPublic | Boolean | default(false) | Public visibility |
| updatedBy | String? | optional | Last updater |
| updatedAt | DateTime | auto | Update timestamp |
| createdAt | DateTime | auto | Creation timestamp |

**Indexes:** key, category

### 22. AdminAlert (`admin_alerts`)

Operational alert system for administrators.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| type | String | required | Alert type (should be enum) |
| severity | AlertSeverity | default(INFO) | INFO/WARNING/ERROR/CRITICAL |
| title | String | required | Alert title |
| message | String | Text | Alert body |
| source | String? | optional | Source identifier |
| metadata | Json? | optional | Extra data |
| isRead | Boolean | default(false) | Read status |
| readBy | String? | optional | Reader admin ID |
| readAt | DateTime? | optional | Read timestamp |
| createdAt | DateTime | auto | Creation timestamp |

**Indexes:** isRead, severity, createdAt

### 23. JobRun (`job_runs`)

Scheduled job execution history.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| jobName | String | required | Job identifier |
| status | JobRunStatus | default(RUNNING) | Execution status |
| startedAt | DateTime | auto | Start time |
| completedAt | DateTime? | optional | End time |
| durationMs | Int? | optional | Duration (ms) |
| processedCount | Int | default(0) | Records processed |
| successCount | Int | default(0) | Successes |
| errorCount | Int | default(0) | Errors |
| summary | String? | Text | Execution summary |
| errorMessage | String? | Text | Error details |
| metadata | Json? | optional | Extra data |
| triggeredBy | String? | optional | SCHEDULER/MANUAL/API |
| createdAt | DateTime | auto | Creation timestamp |

**Indexes:** jobName, status, startedAt, createdAt

### 24. ScraperAccount (`scraper_accounts`)

Scraper authentication account pool.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| site | String | required | Marketplace name |
| label | String | required | Friendly name |
| username | String | required | Login email/user |
| passwordEnc | String | required | AES-256 encrypted password |
| totpSecretEnc | String? | optional | Encrypted TOTP secret |
| otpEmail | String? | optional | OTP email address |
| otpEmailPwdEnc | String? | optional | OTP email password (encrypted) |
| mfaType | ScraperMFAType | default(NONE) | MFA type configured |
| status | ScraperAccountStatus | default(OK) | Operational status |
| statusMessage | String? | optional | Status details |
| priority | Int | default(0) | Selection priority |
| lastSuccessAt | DateTime? | optional | Last success |
| lastFailureAt | DateTime? | optional | Last failure |
| consecutiveFailures | Int | default(0) | Failure streak |
| maxRequestsPerHour | Int | default(100) | Rate limit |
| requestsThisHour | Int | default(0) | Current hour count |
| hourResetAt | DateTime? | optional | Rate limit reset |
| isActive | Boolean | default(true) | Active flag |
| metadata | Json? | optional | Extra data |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Update timestamp |

**Unique Constraint:** (site, username)
**Indexes:** site, status, isActive
**Relations:** ScraperSession[], ScraperAuthLog[]

### 25. ScraperSession (`scraper_sessions`)

Scraper browser session state.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| accountId | String | unique, FK -> ScraperAccount | Parent account |
| isAuthenticated | Boolean | default(false) | Auth status |
| lastValidatedAt | DateTime? | optional | Last validation |
| expiresAt | DateTime? | optional | Expiry |
| userDataDir | String | required | Browser data path |
| userAgent | String? | optional | Browser UA |
| lastUrl | String? | optional | Last visited URL |
| cookieCount | Int | default(0) | Cookie count |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Update timestamp |

**Indexes:** isAuthenticated

### 26. SiteExecutionStats (`site_execution_stats`)

Per-execution performance metrics.

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid | Primary key |
| site | MonitorSite | required | Marketplace |
| monitorId | String | FK -> Monitor | Executed monitor |
| userId | String | FK -> User | Monitor owner |
| startedAt | DateTime | required | Start time |
| finishedAt | DateTime | required | End time |
| durationMs | Int | required | Duration (ms) |
| pageType | PageType | required | Detected page type |
| adsFound | Int | default(0) | Ads found |
| success | Boolean | default(false) | Success flag |
| errorCode | String? | optional | Error code |
| createdAt | DateTime | auto | Creation timestamp |

**Indexes:** site, createdAt, success, (site, createdAt)

---

## Enums

| Enum | Values |
|------|--------|
| UserRole | USER, ADMIN, ADMIN_SUPER, ADMIN_SUPPORT, ADMIN_FINANCE, ADMIN_READ |
| SubscriptionStatus | TRIAL, ACTIVE, PAST_DUE, CANCELLED, EXPIRED, SUSPENDED |
| MonitorSite | MERCADO_LIVRE, OLX, FACEBOOK_MARKETPLACE, WEBMOTORS, ICARROS, ZAP_IMOVEIS, VIVA_REAL, IMOVELWEB, LEILAO, OUTRO |
| MonitorMode | URL_ONLY, STRUCTURED_FILTERS |
| LogStatus | SUCCESS, ERROR, PARTIAL, SKIPPED |
| UserSessionStatus | ACTIVE, EXPIRED, NEEDS_REAUTH, INVALID |
| NotificationChannel | EMAIL, TELEGRAM |
| NotificationStatus | SUCCESS, FAILED |
| TokenStatus | PENDING, USED, EXPIRED |
| TicketStatus | OPEN, IN_PROGRESS, RESOLVED, CLOSED |
| AlertSeverity | INFO, WARNING, ERROR, CRITICAL |
| JobRunStatus | RUNNING, SUCCESS, PARTIAL, FAILED, TIMEOUT |
| PageType | CONTENT, BLOCKED, CAPTCHA, LOGIN_REQUIRED, CHECKPOINT, NO_RESULTS, EMPTY, UNKNOWN, ERROR |
| ScraperMFAType | NONE, TOTP, EMAIL_OTP, SMS_OTP, APP_APPROVAL |
| ScraperAccountStatus | OK, DEGRADED, NEEDS_REAUTH, BLOCKED, SITE_CHANGED, DISABLED |

---

## Relationship Diagram

```
User (1)
 |--- (N) Subscription ---> (1) Plan
 |--- (N) Monitor
 |       |--- (N) AdSeen
 |       |--- (N) MonitorLog
 |       |--- (N) SiteExecutionStats
 |--- (N) UsageLog
 |--- (N) TelegramAccount
 |--- (N) NotificationLog
 |--- (1) NotificationSettings
 |--- (N) UserSession
 |--- (N) RefreshToken
 |--- (N) SiteExecutionStats

Plan (1)
 |--- (N) Subscription
 |--- (N) Coupon

Coupon (1)
 |--- (N) CouponUsage
 |--- (?) CouponValidation  [NO FK]

ScraperAccount (1)
 |--- (1) ScraperSession
 |--- (N) ScraperAuthLog

[Standalone Models]
 - WebhookLog
 - TelegramConnectToken
 - SupportTicket
 - AuditLog          [adminId has NO FK to User]
 - SystemSetting
 - AdminAlert
 - JobRun
 - PushSubscription
```

---

## Indexes Inventory

| Model | Indexed Fields |
|-------|---------------|
| RefreshToken | userId, family, expiresAt |
| TelegramAccount | userId |
| Subscription | userId, status, validUntil |
| CouponUsage | couponId, userId |
| CouponValidation | couponId, userId, converted, createdAt, reminderSentAt |
| PushSubscription | userId |
| Monitor | userId, active, site |
| AdSeen | monitorId |
| MonitorLog | monitorId, createdAt |
| UserSession | userId, (site+status), expiresAt |
| UsageLog | userId, createdAt |
| WebhookLog | event, processed |
| NotificationLog | userId, createdAt, status |
| TelegramConnectToken | userId, token, status, expiresAt |
| SupportTicket | userId, status, createdAt |
| AuditLog | adminId, action, targetType, createdAt |
| SystemSetting | key, category |
| AdminAlert | isRead, severity, createdAt |
| JobRun | jobName, status, startedAt, createdAt |
| ScraperAccount | site, status, isActive |
| ScraperSession | isAuthenticated |
| ScraperAuthLog | accountId, event, createdAt |
| SiteExecutionStats | site, createdAt, success, (site+createdAt) |

---

## Security Features

| Feature | Implementation | Models Affected |
|---------|---------------|-----------------|
| AES-256-GCM Encryption | CPF, session storage, scraper passwords | User, UserSession, ScraperAccount |
| SHA-256 Hashing | CPF dedup, token storage | User, RefreshToken |
| bcrypt | Password hashing | User |
| Token Family Tracking | Replay attack detection | RefreshToken |
| Soft Delete | isActive flag | User, Plan, Coupon, ScraperAccount |
| Audit Trail | Before/after state snapshots | AuditLog |
| Masked PII | Notification targets masked | NotificationLog |

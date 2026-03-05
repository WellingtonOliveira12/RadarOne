# RadarOne - System Architecture

**Version:** 1.0
**Date:** 2026-02-26
**Phase:** Brownfield Discovery - Phase 1 Output
**Author:** @architect (Aria)

---

## Executive Summary

RadarOne is a SaaS marketplace monitoring platform that tracks listings across 9 Brazilian marketplaces (Mercado Livre, OLX, Facebook Marketplace, Webmotors, iCarros, Zapimoveis, Vivareal, Imovelweb, Leilao). The system uses a monorepo architecture with three independently deployable services: a REST API backend, a React SPA frontend, and a Playwright-based scraping worker. All services share a PostgreSQL database with 26 Prisma models.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React | 19.2.0 |
| **UI Library** | Chakra UI | 2.10.9 |
| **Frontend Bundler** | Vite | 7.2.4 |
| **Frontend Router** | React Router DOM | 7.10.0 |
| **Frontend Charts** | Recharts | 3.6.0 |
| **Frontend i18n** | i18next | 25.8.11 |
| **Frontend Validation** | Zod | 4.1.13 |
| **Backend Runtime** | Node.js | 18+ |
| **Backend Framework** | Express | 5.x |
| **ORM** | Prisma | 7.x |
| **Database** | PostgreSQL | 15+ |
| **Worker Automation** | Playwright | 1.57.0 |
| **Error Tracking** | Sentry | 10.30.0 (frontend) |
| **Language** | TypeScript | ~5.9.3 |
| **Testing (Frontend)** | Vitest | 4.0.15 |
| **Testing (E2E)** | Playwright Test | 1.57.0 |
| **HTTP Client** | Axios | 1.13.2 |
| **Hosting** | Render.com | - |
| **Containerization** | Docker / Docker Compose | - |

---

## Architecture Diagram

```
                            +------------------+
                            |   CloudFlare /   |
                            |   Render CDN     |
                            +--------+---------+
                                     |
                    +----------------+----------------+
                    |                                 |
           +-------v--------+              +---------v--------+
           |   Frontend     |              |    Backend API   |
           |   (React SPA)  |              |  (Express 5)     |
           |   Vite Build   |              |  Port: 3001      |
           |   Port: 5173   |   REST API   |                  |
           |                +------------->|  /api/v1/*       |
           |  Chakra UI 2   |              |  /api/admin/*    |
           |  React 19      |              |  /webhooks/*     |
           +----------------+              +--------+---------+
                                                    |
                                           +--------v---------+
                                           |   PostgreSQL     |
                                           |   26 Models      |
                                           |   12 Enums       |
                                           +--------+---------+
                                                    |
                                           +--------v---------+
                                           |   Worker         |
                                           |   (Playwright)   |
                                           |   9 Scrapers     |
                                           |   MarketplaceEng |
                                           |   Cron-based     |
                                           +------------------+

  External Services:
  +-------------+  +-------------+  +-----------+  +----------+
  |  Telegram   |  |   Kiwify    |  |  SendGrid |  |  Sentry  |
  |  Bot API    |  |  Webhooks   |  |  Email    |  |  Errors  |
  +-------------+  +-------------+  +-----------+  +----------+
```

---

## Component Details

### Backend (Express 5 + Prisma 7)

**Location:** `backend/`

**Entry Point:** `backend/src/server.ts`

**Architecture Pattern:** Controller-Service-Repository (CSR)

| Layer | Files | Responsibility |
|-------|-------|---------------|
| Controllers | `backend/src/controllers/*.ts` (12 files) | HTTP request handling, validation |
| Services | `backend/src/services/*.ts` (14 files) | Business logic |
| Routes | `backend/src/routes/*.ts` (13 files) | Route definitions |
| Middlewares | `backend/src/middlewares/*.ts` (5 files) | Auth, rate limiting, error handling |
| Jobs | `backend/src/jobs/*.ts` (6 files) | Scheduled tasks (cron) |

**Key Files (by complexity):**
- `backend/src/controllers/admin.controller.ts` - ~100KB, handles ALL admin operations (SRP violation)
- `backend/src/services/telegramService.ts` - ~42KB, Telegram bot integration (SRP violation)
- `backend/src/services/subscriptionService.ts` - Subscription lifecycle management
- `backend/src/services/billingService.ts` - Payment processing logic
- `backend/src/controllers/auth.controller.ts` - Authentication with 2FA support

**Scheduled Jobs:**
- `checkTrialExpiring` - Notify users with expiring trials
- `checkSubscriptionExpired` - Expire overdue subscriptions
- `checkAbandonedCoupons` - Send reminders for unused coupons
- `checkTrialUpgradeExpiring` - Handle trial upgrade expirations
- `checkSessionExpiring` - Clean up expired sessions
- `resetMonthlyQueries` - Reset monthly usage counters
- `checkCouponAlerts` - Coupon usage alerts

**External Integrations:**
- Telegram Bot API (notifications + account linking)
- Kiwify (payment webhooks)
- SendGrid / Email service (transactional emails)
- Sentry (error tracking)
- Web Push API (browser notifications)

### Frontend (React 19 + Chakra UI 2)

**Location:** `frontend/`

**Entry Point:** `frontend/src/main.tsx`

**Architecture Pattern:** Page-based SPA with Context API

**29 Routes organized in 3 tiers:**

| Tier | Routes | Auth Required |
|------|--------|---------------|
| Public | `/`, `/plans`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/2fa/verify`, `/health`, `/manual`, `/faq`, `/contact` | No |
| Protected | `/dashboard`, `/monitors`, `/settings/notifications`, `/notifications`, `/settings/subscription`, `/telegram/connect`, `/settings/connections` | Yes (+ valid subscription) |
| Admin | `/admin/stats`, `/admin/users`, `/admin/subscriptions`, `/admin/jobs`, `/admin/audit-logs`, `/admin/settings`, `/admin/monitors`, `/admin/webhooks`, `/admin/coupons`, `/admin/alerts`, `/admin/site-health`, `/admin/security` | Yes (admin role) |

**State Management:**
- `AuthContext` - Global auth state (user, tokens, subscription)
- Local `useState` hooks - Component-level state (238 instances)
- No global state library (Redux/Zustand not used)

**Code Splitting:**
- Admin pages use `React.lazy()` + `Suspense` (12 lazy-loaded pages)
- Public and protected pages are eagerly loaded

**i18n:**
- 3 languages supported (pt-BR, en, es)
- i18next with browser language detection
- ~70% translation coverage

### Worker (Playwright Scrapers)

**Location:** `worker/`

**Entry Point:** `worker/src/index.ts`

**Architecture Pattern:** Engine-based config-driven scraping

**Core Engine (`worker/src/engine/`):**
- `marketplace-engine.ts` - Main engine orchestrating scraping lifecycle
- `browser-manager.ts` - Playwright browser instance management
- `page-diagnoser.ts` - Detects page type (content, blocked, captcha, etc.)
- `ad-extractor.ts` - Extracts ad data using config selectors
- `url-builder.ts` - Builds search URLs from monitor filters
- `scroller.ts` - Infinite scroll / pagination handling
- `anti-detection.ts` - Bot detection evasion
- `auth-strategy.ts` - Authentication flow for sites requiring login
- `session-pool.ts` - Manages browser session reuse
- `site-registry.ts` - Maps MonitorSite enum to configs
- `location-matcher.ts` - Geo-location matching for ads

**Site Configs (`worker/src/engine/configs/`):**
- `mercadolivre.config.ts`
- `olx.config.ts`
- `facebook.config.ts`
- `zapimoveis.config.ts`
- `vivareal.config.ts`
- `imovelweb.config.ts`
- `webmotors.config.ts`
- `icarros.config.ts`
- `leilao.config.ts`

**Migration Status (Legacy -> Engine):**
- Migrated: Mercado Livre, OLX, Facebook Marketplace (3/9)
- Pending: Real Estate (Imovelweb, Vivareal, Zapimoveis) - configs exist, scrapers NOT migrated
- Pending: Vehicles (Webmotors, iCarros, Leilao) - configs exist, scrapers NOT migrated

**Supporting Services:**
- `worker/src/services/telegram-service.ts` - Send notifications via Telegram
- `worker/src/services/email-service.ts` - Send email notifications
- `worker/src/services/queue-manager.ts` - Monitor execution queue
- `worker/src/services/monitor-runner.ts` - Orchestrates monitor checks
- `worker/src/services/stats-recorder.ts` - Records execution statistics
- `worker/src/services/session-provider.ts` - Provides authenticated sessions
- `worker/src/services/user-session-service.ts` - User session management

---

## Database Overview

- **26 Prisma models** across authentication, subscriptions, monitoring, notifications, and admin domains
- **12 enums** defining status types, roles, and categories
- **Key relationships:** User -> Subscription -> Plan, User -> Monitor -> AdSeen, User -> NotificationLog
- **Dual schema:** Backend and Worker each maintain their own `schema.prisma` (sync issue identified)
- See `docs/database/SCHEMA.md` for full model details

---

## Infrastructure

### Deployment (Render.com)

| Service | Type | Configuration |
|---------|------|---------------|
| Backend API | Web Service | Node.js, auto-deploy from `main` |
| Frontend | Static Site | Vite build output |
| Worker | Background Worker | Long-running Playwright process |
| PostgreSQL | Managed Database | Render PostgreSQL |

### Docker

- `docker-compose.yml` at project root for local development
- `docker/` directory with service-specific Dockerfiles
- Services: backend, frontend, worker, postgres

### CI/CD

- GitHub-based workflow
- Render auto-deploy on push to `main`
- No formal CI pipeline (lint/test/build) identified in GitHub Actions

---

## Security Architecture

### Authentication
- JWT-based with access + refresh token rotation
- Refresh token family tracking (replay attack detection)
- 2FA/MFA support via TOTP
- Backup codes for 2FA recovery (hashed)
- Session timeout (configurable per user)
- IP whitelist foundation (field exists, not enforced)

### Encryption
- AES-256-GCM for sensitive data (CPF, session storage state, scraper credentials)
- SHA-256 hashing for CPF deduplication and token storage
- bcrypt for password hashing

### Authorization
- Role-based: USER, ADMIN, ADMIN_SUPER, ADMIN_SUPPORT, ADMIN_FINANCE, ADMIN_READ
- `AdminProtectedRoute` component for frontend admin routes
- `admin.middleware.ts` for backend admin endpoints
- Subscription-based feature gating (`RequireSubscriptionRoute`)

### Rate Limiting
- Configured in `backend/src/config/rateLimitConfig.ts`
- Applied via `rateLimit.middleware.ts`
- Per-endpoint configuration

### Known Security Issues
- 8 `dangerouslySetInnerHTML` usages in frontend (XSS risk)
- Dual token storage (memory + localStorage) increases attack surface
- No Content Security Policy (CSP) headers
- No Row-Level Security (RLS) in PostgreSQL
- 3 files use `$queryRaw` (SQL injection risk)

---

## Observability

### Current State
- Sentry integration (frontend + backend + worker)
- `MonitorLog` model tracks scraper execution results
- `SiteExecutionStats` model records per-execution metrics
- `AuditLog` tracks admin actions
- `JobRun` records scheduled job execution history
- `AdminAlert` system for operational alerts
- Health check endpoint (`/health`)

### Gaps Identified
- No slow query logging
- No p50/p95 latency metrics
- No queue depth visibility
- No circuit breaker dashboard
- No structured log aggregation (ELK/Datadog)
- No uptime monitoring integration

---

## Key Design Decisions

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| Monorepo | Shared types, easier cross-service changes | Larger repo, coupled deployments |
| Dual Prisma schemas | Worker deploys independently on Render | Sync drift risk (confirmed) |
| Config-driven engine | Reduce per-scraper code from ~200 LOC to ~30-60 LOC | Migration effort for 6 remaining scrapers |
| JWT + Refresh tokens | Stateless auth, mobile-friendly | Token storage complexity |
| Chakra UI 2 | Rapid UI development | 1 major version behind (v3 available) |
| No global state lib | Simple app, Context API sufficient | Performance issues with frequent re-renders |
| Lazy loading (admin) | Reduce initial bundle for end users | Slightly slower admin page loads |

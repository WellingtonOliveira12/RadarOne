# RadarOne - Frontend Specification

**Version:** 1.0
**Date:** 2026-02-26
**Phase:** Brownfield Discovery - Phase 3 Output
**Author:** @ux-design-expert (Uma)

---

## Architecture Overview

| Aspect | Detail |
|--------|--------|
| Framework | React 19.2.0 |
| UI Library | Chakra UI 2.10.9 (1 major behind) |
| Build Tool | Vite 7.2.4 |
| Router | React Router DOM 7.10.0 |
| State Management | React Context API + useState hooks |
| HTTP Client | Axios 1.13.2 |
| Charts | Recharts 3.6.0 |
| i18n | i18next 25.8.11 |
| Validation | Zod 4.1.13 |
| Error Tracking | Sentry React 10.30.0 |
| Testing | Vitest 4.0.15 + Testing Library |
| E2E Testing | Playwright 1.57.0 |
| Language | TypeScript ~5.9.3 |

**Entry Point:** `frontend/src/main.tsx`
**Router:** `frontend/src/router.tsx`

---

## Route Map (29 Routes)

### Public Routes (11)

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | LandingPage | Marketing landing page |
| `/plans` | PlansPage | Pricing and plan comparison |
| `/login` | LoginPage | User login (redirects if authenticated) |
| `/register` | RegisterPage | User registration (redirects if authenticated) |
| `/forgot-password` | ForgotPasswordPage | Password recovery request |
| `/reset-password` | ResetPasswordPage | Password reset form |
| `/2fa/verify` | TwoFactorVerifyPage | 2FA TOTP verification |
| `/health` | HealthCheckPage | System health check page |
| `/manual` | ManualPage | User manual |
| `/faq` | FAQPage | Frequently asked questions |
| `/contact` | ContactPage | Contact / support form |

### Protected Routes (7) - Require Authentication + Valid Subscription

| Route | Component | Description |
|-------|-----------|-------------|
| `/dashboard` | DashboardPage | User dashboard with monitor overview |
| `/monitors` | MonitorsPage | Monitor management (CRUD) |
| `/settings/notifications` | NotificationSettingsPage | Notification preferences |
| `/notifications` | NotificationHistoryPage | Notification history log |
| `/settings/subscription` | SubscriptionSettingsPage | Subscription management |
| `/telegram/connect` | TelegramConnectionPage | Telegram bot linking |
| `/settings/connections` | ConnectionsPage | Marketplace session connections |

### Admin Routes (12) - Require Admin Role, Lazy Loaded

| Route | Component | Description |
|-------|-----------|-------------|
| `/admin/stats` | AdminStatsPage | Platform statistics dashboard |
| `/admin/users` | AdminUsersPage | User management |
| `/admin/subscriptions` | AdminSubscriptionsPage | Subscription management |
| `/admin/jobs` | AdminJobsPage | Scheduled job monitoring |
| `/admin/audit-logs` | AdminAuditLogsPage | Admin audit trail |
| `/admin/settings` | AdminSettingsPage | System settings |
| `/admin/monitors` | AdminMonitorsPage | Global monitor management |
| `/admin/webhooks` | AdminWebhooksPage | Webhook log viewer |
| `/admin/coupons` | AdminCouponsPage | Coupon management |
| `/admin/alerts` | AdminAlertsPage | Admin alert center |
| `/admin/site-health` | AdminSiteHealthPage | Scraper site health dashboard |
| `/admin/security` | Security2FAPage | Admin 2FA configuration |

---

## State Management

### Global State (AuthContext)

**File:** `frontend/src/context/AuthContext.tsx`

Provides authentication state to the entire application:
- `user` - Current user object (id, name, email, role)
- `token` - JWT access token
- `subscription` - Active subscription details
- `isAuthenticated` - Boolean auth status
- `isAdmin` - Boolean admin status
- `login()` / `logout()` / `register()` - Auth actions
- `refreshToken()` - Token refresh

### Local State

- **238 `useState` hooks** across all components
- **Only 6 `useMemo`/`useCallback`** instances (memoization)
- No global state library (Redux, Zustand, Jotai not used)

### Custom Hooks

| Hook | File | Purpose |
|------|------|---------|
| usePageMeta | `frontend/src/hooks/usePageMeta.ts` | Dynamic page title/meta |
| useSessionTimeout | `frontend/src/hooks/useSessionTimeout.ts` | Auto-logout on inactivity |

---

## API Integration

### HTTP Client

**File:** `frontend/src/services/api.ts`

- Axios instance with base URL configuration
- Request interceptor: Attaches JWT token from AuthContext
- Response interceptor: Handles 401 (auto-logout), token refresh
- Auto-retry logic for failed requests

### Auth Service

**File:** `frontend/src/services/auth.ts`

- Login, register, forgot password, reset password
- 2FA verification flow
- Token refresh mechanism

### Token Storage

**File:** `frontend/src/services/tokenStorage.ts`

- **Dual storage strategy:** Memory variable + localStorage
- Access token in memory (XSS-safer)
- Refresh token in localStorage (persists across tabs)
- **Security concern:** Dual storage increases attack surface

---

## i18n Setup

**Configuration:** `frontend/src/i18n/config.ts`

| Language | Code | Coverage |
|----------|------|----------|
| Portuguese (Brazil) | pt-BR | ~100% (primary) |
| English | en | ~70% |
| Spanish | es | ~50% |

- Browser language detection enabled
- Fallback: pt-BR
- **Issue:** ~30% of UI strings are hardcoded in Portuguese, bypassing i18n

---

## Security Analysis

### XSS Vulnerabilities (CRITICAL)

**8 instances of `dangerouslySetInnerHTML`** found across the application:

These bypass React's built-in XSS protection. Each instance must be audited for:
- User-controlled input being rendered
- Proper sanitization (DOMPurify or equivalent)

**Recommendation:** Replace with React components or add DOMPurify sanitization.

### Token Storage (HIGH)

- Access token stored in memory variable (good)
- Refresh token stored in localStorage (acceptable but risky)
- Both stored simultaneously increases attack surface
- No httpOnly cookie option explored

**Recommendation:** Move refresh token to httpOnly cookie with SameSite=Strict.

### Missing CSP Headers (HIGH)

No Content Security Policy headers configured. The application is vulnerable to:
- Inline script injection
- External script loading
- Clickjacking (no X-Frame-Options either)

**Recommendation:** Add CSP headers via Render.com headers configuration or meta tags.

### Console Logs in Production (MEDIUM)

**11+ `console.log` statements** found in production code. These can leak sensitive information to browser devtools.

**Recommendation:** Remove all console.log or replace with conditional debug logging.

---

## Performance Analysis

### Bundle Optimization

| Technique | Status | Details |
|-----------|--------|---------|
| Code Splitting | Partial | Admin pages lazy-loaded, user pages eager |
| Tree Shaking | Default | Vite handles automatically |
| Memoization | Minimal | 6 memo instances for 238 useState hooks |
| Image Optimization | Unknown | No lazy loading or format optimization observed |
| Chunk Size | Unknown | No bundle analyzer configured |

### Re-render Issues

- 238 `useState` hooks with only 6 memoization instances
- AuthContext wraps entire app -- any auth state change re-renders everything
- No `React.memo()` on frequently-rendered list items
- Recharts components (AdminStatsPage) likely cause expensive re-renders

**Recommendation:**
1. Add `React.memo()` to list item components
2. Split AuthContext into separate contexts (auth, subscription, user)
3. Use `useMemo` for expensive computations in admin pages
4. Consider Zustand or Jotai for granular subscription-based updates

### Missing Optimizations

- No virtual scrolling for long lists (monitors, ads, logs)
- No debounce on search inputs
- No image lazy loading (`loading="lazy"`)
- No Suspense boundaries for data fetching

---

## Accessibility Audit

### Current State: POOR

| Metric | Count | Assessment |
|--------|-------|------------|
| `aria-*` attributes | 6 | Extremely low for 29 pages |
| `role` attributes | Unknown | Likely minimal |
| Keyboard navigation | Not tested | Unknown |
| Screen reader support | Not tested | Unknown |
| Color contrast | Not audited | Unknown |
| Focus management | Not tested | Unknown |

### Key Issues

1. **Missing ARIA labels:** Only 6 aria attributes in entire application
2. **No skip navigation:** No "Skip to content" link
3. **Form accessibility:** Forms likely missing `aria-describedby` for errors
4. **Modal accessibility:** Unknown if modals trap focus
5. **Dynamic content:** No `aria-live` regions for toast notifications
6. **Image alt text:** Not audited

**Recommendation:** Conduct WCAG 2.1 Level AA audit. Chakra UI provides accessibility primitives that should be leveraged.

---

## Test Coverage Analysis

### Current State: VERY LOW (~3%)

| Category | Test Files | Source Files | Coverage |
|----------|-----------|--------------|----------|
| Pages | 3 | 29 | ~10% |
| Services | 1 | 3 | ~33% |
| Utils | 1 | 6 | ~17% |
| Hooks | 0 | 2 | 0% |
| Components | 0 | 12 | 0% |
| Context | 0 | 1 | 0% |
| **Total** | **6** | **53+** | **~3%** |

### Existing Tests

| File | Tests |
|------|-------|
| `frontend/src/pages/__tests__/ResetPasswordPage.test.tsx` | Password reset form |
| `frontend/src/pages/__tests__/ForgotPasswordPage.test.tsx` | Forgot password form |
| `frontend/src/pages/__tests__/ConnectionsPage.test.tsx` | Connections page |
| `frontend/src/services/__tests__/api-auto-logout.test.ts` | Auto-logout on 401 |
| `frontend/src/lib/__tests__/logout.test.ts` | Logout utility |
| `frontend/src/utils/__tests__/subscriptionHelpers.test.ts` | Subscription helpers |

### Missing Critical Tests

- **AuthContext:** No tests for login/logout/refresh flow
- **ProtectedRoute:** No tests for route guard behavior
- **AdminProtectedRoute:** No tests for admin access control
- **MonitorsPage:** No tests (most complex user-facing page)
- **DashboardPage:** No tests (primary user page)
- **API interceptors:** Only auto-logout tested, no token refresh tests
- **All admin pages:** Zero test coverage (12 pages)

**Recommendation:** Priority test targets:
1. AuthContext (authentication flows)
2. API interceptors (token refresh, error handling)
3. MonitorsPage (core business logic)
4. Route guards (ProtectedRoute, AdminProtectedRoute)
5. DashboardPage (primary user entry point)

---

## UI Patterns and Inconsistencies

### Positive Patterns
- Consistent use of Chakra UI components
- Code splitting for admin pages
- PageLoader component for lazy-loaded pages
- ErrorBoundary at app level

### Inconsistencies
- Mixed Portuguese/English in UI (i18n not fully adopted)
- No consistent empty state pattern across pages
- No consistent error state pattern across pages
- Loading states vary (some use Spinner, some use Skeleton, some use nothing)
- Toast notifications use both `react-hot-toast` and Chakra's built-in toast

### Missing UI Patterns
- No offline indicator
- No connection status indicator
- No retry UI for failed API calls
- No confirmation dialogs for destructive actions (some pages)
- No breadcrumb navigation in admin section

---

## Component Architecture

```
frontend/src/
  |-- main.tsx                    # App entry point
  |-- App.tsx                     # Root component
  |-- router.tsx                  # Route definitions
  |-- context/
  |     |-- AuthContext.tsx        # Global auth state
  |-- components/
  |     |-- AppLayout.tsx          # Authenticated layout (sidebar + header)
  |     |-- AdminLayout.tsx        # Admin layout
  |     |-- PublicLayout.tsx       # Public pages layout
  |     |-- ProtectedRoute.tsx     # Auth route guard
  |     |-- AdminProtectedRoute.tsx # Admin route guard
  |     |-- RequireSubscriptionRoute.tsx # Subscription gate
  |     |-- RedirectIfAuthenticated.tsx  # Guest-only guard
  |     |-- ErrorBoundary.tsx      # Error boundary
  |     |-- TrialBanner.tsx        # Trial status banner
  |     |-- ExportButton.tsx       # Data export
  |     |-- LanguageSwitcher.tsx   # i18n switcher
  |     |-- admin/
  |     |     |-- CouponAnalytics.tsx # Coupon analytics widget
  |     |-- ui/
  |           |-- card.tsx          # Reusable card component
  |-- pages/                       # 29 page components
  |-- services/
  |     |-- api.ts                 # Axios instance
  |     |-- auth.ts                # Auth API calls
  |     |-- tokenStorage.ts        # Token persistence
  |-- hooks/
  |     |-- usePageMeta.ts         # Page metadata
  |     |-- useSessionTimeout.ts   # Session timeout
  |-- lib/
  |     |-- analytics.ts           # GA4 analytics
  |     |-- abtest.ts              # A/B testing
  |     |-- auth.ts                # Auth utilities
  |     |-- logout.ts              # Logout logic
  |     |-- pushNotifications.ts   # Web Push
  |     |-- sentry.ts              # Error tracking
  |     |-- toast.ts               # Toast notifications
  |-- utils/                       # Helper utilities
  |-- constants/                   # App constants
  |-- styles/                      # Custom styles
  |-- validation/                  # Zod schemas
  |-- i18n/                        # Internationalization
  |-- test/                        # Test setup
```

---

## Dependencies Health

| Package | Current | Latest Concern |
|---------|---------|----------------|
| @chakra-ui/react | 2.10.9 | v3 available (major breaking changes) |
| react | 19.2.0 | Current |
| react-router-dom | 7.10.0 | Current |
| axios | 1.13.2 | Current |
| @sentry/react | 10.30.0 | Current |
| vite | 7.2.4 | Current |
| typescript | ~5.9.3 | Current |
| zod | 4.1.13 | Current |

**Note:** Chakra UI 2 -> 3 migration is a significant effort but provides better performance, accessibility, and modern patterns.

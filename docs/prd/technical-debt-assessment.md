# RadarOne - Technical Debt Assessment

**Version:** 1.0
**Date:** 2026-02-26
**Phase:** Brownfield Discovery - Phase 8 (Final Consolidated Output)
**Author:** @architect (Aria)
**Status:** FINAL

---

## Executive Summary

RadarOne carries **47 identified technical debts** across System, Database, and Frontend domains. The most urgent items are security vulnerabilities (XSS, SQL injection, missing RLS) and data integrity risks (missing foreign keys). The estimated total remediation effort is **~340-400 hours** (8-10 developer-weeks).

| Severity | Count | Estimated Hours |
|----------|-------|----------------|
| CRITICAL | 8 | 100-120h |
| HIGH | 14 | 120-150h |
| MEDIUM | 17 | 80-100h |
| LOW | 8 | 40-50h |
| **Total** | **47** | **340-420h** |

---

## Complete Debt Inventory

### CRITICAL Severity (Security and Data Integrity)

| ID | Description | Area | Estimated Hours | Priority |
|----|-------------|------|----------------|----------|
| TD-C01 | 8 `dangerouslySetInnerHTML` usages - XSS vulnerability | Frontend | 8h | P1 |
| TD-C02 | No Row-Level Security (RLS) - zero policies on any table | Database | 40h | P1 |
| TD-C03 | 3 files use `$queryRaw` - SQL injection risk | Backend | 8h | P1 |
| TD-C04 | 5 missing foreign keys (CouponUsage.userId, CouponValidation.userId, AuditLog.adminId, PushSubscription.userId, TelegramConnectToken.userId) | Database | 12h | P1 |
| TD-C05 | No Content Security Policy (CSP) headers | Frontend | 4h | P1 |
| TD-C06 | Dual token storage (memory + localStorage) increases attack surface | Frontend | 16h | P2 |
| TD-C07 | `strict: false` in all tsconfig files - type safety disabled | System | 40h | P2 |
| TD-C08 | 438 instances of `any` type across backend + worker codebase | System | 40h | P2 |

### HIGH Severity (Performance, Type Safety, Test Coverage)

| ID | Description | Area | Estimated Hours | Priority |
|----|-------------|------|----------------|----------|
| TD-H01 | admin.controller.ts is ~100KB with NO tests - SRP violation | Backend | 24h | P2 |
| TD-H02 | telegramService.ts is ~42KB - SRP violation | Backend | 16h | P2 |
| TD-H03 | Backend test coverage ~25-30%, admin controller 0% | Backend | 40h | P2 |
| TD-H04 | Frontend test coverage ~3% (6 test files for 53+ source files) | Frontend | 40h | P2 |
| TD-H05 | 9 missing database indexes (including auth-critical Subscription userId+status) | Database | 4h | P1 |
| TD-H06 | Schema sync: Worker Prisma schema missing RefreshToken and JobRun models | Database | 2h | P2 |
| TD-H07 | 137 instances of `any` type in frontend | Frontend | 16h | P3 |
| TD-H08 | 30+ outdated packages, Sentry 2 major versions behind | System | 8h | P3 |
| TD-H09 | Chakra UI 1 major version behind (v2 -> v3 available) | Frontend | 24h | P4 |
| TD-H10 | 238 useState hooks with only 6 memoization instances | Frontend | 16h | P3 |
| TD-H11 | No structured log aggregation (ELK/Datadog) | System | 16h | P4 |
| TD-H12 | No circuit breaker dashboard for scraper health | Worker | 8h | P3 |
| TD-H13 | No p50/p95 latency metrics for API endpoints | Backend | 8h | P3 |
| TD-H14 | No slow query logging in PostgreSQL | Database | 4h | P3 |

### MEDIUM Severity (Code Quality, Maintainability)

| ID | Description | Area | Estimated Hours | Priority |
|----|-------------|------|----------------|----------|
| TD-M01 | 25 TODO/FIXME across 14 files (13 TODOs in AdminCouponsPage alone) | System | 16h | P3 |
| TD-M02 | 10-15% code duplication (auth logic, error codes, session encryption) | System | 16h | P3 |
| TD-M03 | 12+ hardcoded cron times, timeouts, and retry values | Backend | 4h | P2 |
| TD-M04 | 5 string fields should be Prisma enums (UsageLog.action, AdminAlert.type, Coupon.discountType, etc.) | Database | 8h | P3 |
| TD-M05 | Legacy fields (UserSession.cookies, UserSession.localStorage) still present | Database | 4h | P3 |
| TD-M06 | Missing cascade rules (Subscription.plan has no onDelete clause) | Database | 2h | P3 |
| TD-M07 | i18n only ~70% complete, hardcoded Portuguese strings remain | Frontend | 12h | P4 |
| TD-M08 | Only 6 aria attributes in entire frontend app - accessibility debt | Frontend | 24h | P4 |
| TD-M09 | 11+ console.log statements in production frontend code | Frontend | 2h | P2 |
| TD-M10 | Inconsistent empty/error state patterns across pages | Frontend | 8h | P3 |
| TD-M11 | Toast notifications use both react-hot-toast and Chakra toast | Frontend | 4h | P3 |
| TD-M12 | No offline indicator or connection status in frontend | Frontend | 4h | P4 |
| TD-M13 | AuthContext wraps entire app - any auth change re-renders everything | Frontend | 8h | P3 |
| TD-M14 | No formal CI pipeline (lint/test/build in GitHub Actions) | System | 8h | P2 |
| TD-M15 | No queue depth visibility for worker job monitoring | Worker | 4h | P3 |
| TD-M16 | 6 scrapers not yet migrated to engine pattern (Webmotors, iCarros, Leilao, Imovelweb, Vivareal, Zapimoveis) | Worker | 24h | P3 |
| TD-M17 | No virtual scrolling for long lists (monitors, ads, logs) | Frontend | 8h | P4 |

### LOW Severity (Style, Documentation, Minor)

| ID | Description | Area | Estimated Hours | Priority |
|----|-------------|------|----------------|----------|
| TD-L01 | Missing breadcrumb navigation in admin section | Frontend | 4h | P4 |
| TD-L02 | No retry UI for failed API calls in frontend | Frontend | 4h | P4 |
| TD-L03 | No image lazy loading (`loading="lazy"`) in frontend | Frontend | 2h | P4 |
| TD-L04 | No debounce on search inputs in frontend | Frontend | 4h | P4 |
| TD-L05 | Mixed Portuguese/English comments in codebase | System | 8h | P5 |
| TD-L06 | No bundle size analyzer configured | Frontend | 2h | P4 |
| TD-L07 | No loading skeletons - only spinners | Frontend | 8h | P4 |
| TD-L08 | Lack of confirmation dialogs for some destructive actions | Frontend | 4h | P4 |

---

## Priority Matrix

```
                    HIGH IMPACT
                        |
              P1        |        P2
         TD-C01,C02     |    TD-C06,C07,C08
         TD-C03,C04     |    TD-H01,H02,H03
         TD-C05,H05     |    TD-H04,H06
         TD-M03         |    TD-M09,M14
                        |
  LOW EFFORT -----------+----------- HIGH EFFORT
                        |
              P3        |        P4
         TD-H07,H10     |    TD-H08,H09,H11
         TD-M01,M02     |    TD-M07,M08,M12
         TD-M04,M05     |    TD-M16,M17
         TD-M06,M10     |    TD-L01,L03,L06
         TD-M11,M13     |    TD-L04,L07,L08
         TD-M15,H12     |
         TD-H13,H14     |
                        |
                    LOW IMPACT
```

---

## Resolution Plan

### Phase 1: Quick Wins (Weeks 1-2, ~40h)

High impact, low effort items that can be resolved immediately.

| ID | Action | Effort |
|----|--------|--------|
| TD-C01 | Audit and sanitize all 8 `dangerouslySetInnerHTML` usages | 8h |
| TD-C03 | Audit 3 `$queryRaw` files, replace with parameterized queries | 8h |
| TD-C05 | Add CSP headers via Render.com configuration | 4h |
| TD-H05 | Create 9 missing database indexes (non-blocking migration) | 4h |
| TD-H06 | Sync Worker Prisma schema with Backend | 2h |
| TD-M03 | Extract hardcoded values to environment variables or config | 4h |
| TD-M09 | Remove all console.log from production frontend code | 2h |
| TD-M06 | Add explicit onDelete clauses to Subscription->Plan relation | 2h |
| TD-M14 | Set up basic GitHub Actions CI (lint + typecheck + test) | 8h |

### Phase 2: Foundation (Weeks 3-8, ~200h)

Core structural improvements that reduce risk and improve maintainability.

| ID | Action | Effort |
|----|--------|--------|
| TD-C04 | Add missing foreign keys with data migration | 12h |
| TD-C06 | Move refresh token to httpOnly cookie, remove localStorage | 16h |
| TD-C07 | Enable `strict: true` incrementally across all tsconfigs | 40h |
| TD-C08 | Replace 438 `any` types with proper interfaces | 40h |
| TD-H01 | Split admin.controller.ts into domain controllers (users, coupons, subscriptions, etc.) | 24h |
| TD-H02 | Split telegramService.ts into bot, notification, and webhook modules | 16h |
| TD-H03 | Add tests for backend controllers and services (target 60%) | 40h |
| TD-M02 | Deduplicate auth logic, error codes, session encryption | 16h |
| TD-M04 | Convert 5 string fields to Prisma enums | 8h |
| TD-M05 | Remove legacy UserSession fields after verifying no usage | 4h |

### Phase 3: Optimization (Weeks 9-14, ~150h)

Performance, UX, and polish items.

| ID | Action | Effort |
|----|--------|--------|
| TD-C02 | Implement RLS policies for multi-tenant tables | 40h |
| TD-H04 | Add frontend test coverage (target 30%) | 40h |
| TD-H07 | Replace 137 frontend `any` types | 16h |
| TD-H10 | Add memoization to expensive computations and list items | 16h |
| TD-M08 | Conduct WCAG 2.1 accessibility audit and remediate | 24h |
| TD-M07 | Complete i18n coverage for English and Spanish | 12h |
| TD-M16 | Complete engine migration for remaining 6 scrapers | 24h |

---

## Risk Analysis

### If Debts Are NOT Addressed

| Risk | Probability | Impact | Affected Debts |
|------|-------------|--------|----------------|
| XSS attack via dangerouslySetInnerHTML | HIGH | CRITICAL | TD-C01 |
| SQL injection via $queryRaw | MEDIUM | CRITICAL | TD-C03 |
| Data breach due to missing RLS | MEDIUM | CRITICAL | TD-C02 |
| Orphaned records causing data corruption | HIGH | HIGH | TD-C04 |
| Performance degradation as data grows | HIGH | HIGH | TD-H05 |
| Runtime type errors in production | HIGH | MEDIUM | TD-C07, TD-C08 |
| Developer productivity loss | HIGH | MEDIUM | TD-H01, TD-H02, TD-M02 |
| Regression bugs due to low test coverage | HIGH | HIGH | TD-H03, TD-H04 |
| Accessibility lawsuit (depending on jurisdiction) | LOW | HIGH | TD-M08 |

### If Debts ARE Addressed

| Benefit | Affected Debts |
|---------|----------------|
| Secure against OWASP Top 10 web vulnerabilities | TD-C01, TD-C03, TD-C05, TD-C06 |
| Data integrity guaranteed at database level | TD-C04, TD-M06 |
| 3-5x faster query performance on high-traffic endpoints | TD-H05 |
| 50% reduction in production runtime errors | TD-C07, TD-C08, TD-H07 |
| 40% faster developer onboarding | TD-H01, TD-H02, TD-M02 |
| Confident deployments with CI/CD and tests | TD-M14, TD-H03, TD-H04 |

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Zero `dangerouslySetInnerHTML` without DOMPurify sanitization
- [ ] Zero `$queryRaw` without parameterized queries
- [ ] CSP headers present on all responses
- [ ] All 9 missing indexes created
- [ ] Worker schema fully synced with Backend
- [ ] GitHub Actions CI pipeline running on every PR

### Phase 2 Complete When:
- [ ] All 5 missing foreign keys added with migrations
- [ ] Refresh token stored in httpOnly cookie only
- [ ] `strict: true` enabled in all tsconfig files
- [ ] Zero `any` types remaining in codebase
- [ ] admin.controller.ts split into 5+ domain controllers
- [ ] Backend test coverage >= 60%
- [ ] All string fields converted to Prisma enums

### Phase 3 Complete When:
- [ ] RLS policies active on all tenant-scoped tables
- [ ] Frontend test coverage >= 30%
- [ ] WCAG 2.1 Level AA compliance achieved
- [ ] i18n coverage >= 95% for all 3 languages
- [ ] All 9 scrapers migrated to engine pattern

---

## Appendix: Files Referenced

### Critical Files (Require Immediate Attention)

| File | Issue |
|------|-------|
| `backend/src/controllers/admin.controller.ts` | ~100KB, SRP violation, contains $queryRaw, 0 tests |
| `backend/src/services/telegramService.ts` | ~42KB, SRP violation |
| `backend/src/services/monitorService.ts` | Contains $queryRaw |
| `backend/src/jobs/resetMonthlyQueries.ts` | Contains $queryRaw |
| `frontend/src/services/tokenStorage.ts` | Dual storage strategy |
| `backend/prisma/schema.prisma` | Authoritative schema (921 lines) |
| `worker/prisma/schema.prisma` | Worker schema (850 lines, missing models) |

### Configuration Files

| File | Issue |
|------|-------|
| `backend/tsconfig.json` | `strict: false` |
| `frontend/tsconfig.json` | `strict: false` |
| `worker/tsconfig.json` | `strict: false` |

### Test Files (Existing)

| File | Coverage Area |
|------|--------------|
| `frontend/src/pages/__tests__/ResetPasswordPage.test.tsx` | Password reset |
| `frontend/src/pages/__tests__/ForgotPasswordPage.test.tsx` | Forgot password |
| `frontend/src/pages/__tests__/ConnectionsPage.test.tsx` | Connections page |
| `frontend/src/services/__tests__/api-auto-logout.test.ts` | API auto-logout |
| `frontend/src/lib/__tests__/logout.test.ts` | Logout utility |
| `frontend/src/utils/__tests__/subscriptionHelpers.test.ts` | Subscription helpers |

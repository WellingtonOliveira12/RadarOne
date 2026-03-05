# Epic: Technical Debt Resolution — RadarOne

> **Epic ID:** EPIC-TD-001
> **Created:** 2026-02-26
> **Owner:** @pm (Morgan)
> **Status:** Draft
> **Origin:** Brownfield Discovery Phase 10

---

## Epic Overview

### Objective
Systematically resolve 35+ technical debts identified during the Brownfield Discovery audit, eliminating critical security vulnerabilities, establishing a solid foundation for scaling from 100 to 1,000+ users, and improving developer velocity by 40%.

### Scope
- **In Scope:** All 35+ debts across backend (Express), frontend (React), and worker (Playwright) layers
- **Out of Scope:** New feature development, marketplace integration additions, UI redesign
- **Layers affected:** Backend, Frontend, Worker, Database (Supabase/Prisma)

### Timeline
- **Total Duration:** 10 weeks (3 phases)
- **Phase 1 — Quick Wins:** Weeks 1-2 (40 hours)
- **Phase 2 — Foundation:** Weeks 3-6 (160 hours)
- **Phase 3 — Optimization:** Weeks 7-10 (80 hours)

### Budget
- **Total Estimated Effort:** 280 hours
- **Cost Basis:** R$150/hour
- **Total Budget:** R$42,000

---

## Stories

---

### Phase 1: Quick Wins (Weeks 1-2)

Stories in this phase address **critical security vulnerabilities** and **data integrity issues**. All P0 stories must be completed before Phase 2 begins.

---

#### Story 1.1: Fix XSS Vulnerabilities — Remove dangerouslySetInnerHTML

- **Story ID:** TD-1.1
- **Priority:** P0 (Critical)
- **Estimated Hours:** 8h
- **Assignee:** @dev

**Description:**
Remove all 8 instances of `dangerouslySetInnerHTML` in the frontend and replace them with safe rendering alternatives (DOMPurify sanitization or React component-based rendering).

**Acceptance Criteria:**
- [ ] All 8 `dangerouslySetInnerHTML` instances identified and catalogued
- [ ] Each instance replaced with DOMPurify sanitization or safe React rendering
- [ ] No XSS vectors remain in frontend code (verified with manual review)
- [ ] Existing functionality preserved — rendered HTML displays correctly
- [ ] Unit tests added for each replacement to prevent regression

**Files Affected:**
- `frontend/src/**/*.tsx` (8 files with dangerouslySetInnerHTML)
- `frontend/package.json` (add DOMPurify if needed)

---

#### Story 1.2: Add Content Security Policy Headers

- **Story ID:** TD-1.2
- **Priority:** P0 (Critical)
- **Estimated Hours:** 4h
- **Assignee:** @dev

**Description:**
Add CSP (Content Security Policy) headers to the backend Express server to prevent execution of unauthorized scripts, mitigating XSS and data injection attacks.

**Acceptance Criteria:**
- [ ] CSP headers configured in Express middleware
- [ ] Policy allows only trusted sources (self, CDN for fonts/styles)
- [ ] `script-src` restricts inline scripts and untrusted sources
- [ ] CSP violations logged (report-uri or report-to configured)
- [ ] No existing functionality broken by the new policy

**Files Affected:**
- `backend/src/app.ts` or `backend/src/middleware/` (CSP middleware)
- `backend/src/config/` (CSP configuration values)

---

#### Story 1.3: Fix Database Integrity — Foreign Keys, Schema Sync, and Indexes

- **Story ID:** TD-1.3
- **Priority:** P0 (Critical)
- **Estimated Hours:** 20h
- **Assignee:** @dev + @data-engineer

**Description:**
Address three related database integrity issues: add 5 missing foreign key constraints, sync the worker Prisma schema to include `RefreshToken` and `JobRun` tables, and add 9 missing database indexes on frequently queried columns.

**Acceptance Criteria:**
- [ ] 5 missing foreign key constraints added via Prisma migration
- [ ] Worker Prisma schema updated with `RefreshToken` and `JobRun` models
- [ ] 9 missing indexes added on columns used in WHERE, JOIN, and ORDER BY clauses
- [ ] Migration tested on staging database without data loss
- [ ] Query performance benchmarked before and after index addition (target: 30-60% improvement on affected queries)

**Files Affected:**
- `backend/prisma/schema.prisma`
- `worker/prisma/schema.prisma`
- `backend/prisma/migrations/` (new migration files)
- `worker/prisma/migrations/` (new migration files)

---

#### Story 1.4: Secure Token Storage — Migrate from localStorage

- **Story ID:** TD-1.4
- **Priority:** P1 (High)
- **Estimated Hours:** 4h
- **Assignee:** @dev

**Description:**
Migrate authentication token storage from `localStorage` (vulnerable to XSS exfiltration) to `httpOnly` secure cookies, ensuring tokens cannot be accessed by client-side JavaScript.

**Acceptance Criteria:**
- [ ] Auth tokens stored in `httpOnly`, `Secure`, `SameSite=Strict` cookies
- [ ] `localStorage` no longer contains any authentication tokens
- [ ] Backend sets and reads tokens from cookies instead of Authorization header (or supports both during migration)
- [ ] Login, logout, and token refresh flows verified end-to-end
- [ ] CSRF protection implemented alongside cookie-based auth

**Files Affected:**
- `frontend/src/services/auth*.ts` or `frontend/src/context/auth*.tsx`
- `frontend/src/utils/api*.ts` (HTTP client configuration)
- `backend/src/middleware/auth*.ts`
- `backend/src/routes/auth*.ts`

---

#### Story 1.5: Remove Production Debug Logs

- **Story ID:** TD-1.5
- **Priority:** P1 (High)
- **Estimated Hours:** 4h
- **Assignee:** @dev

**Description:**
Remove all `console.log`, `console.warn`, and `console.error` statements used for debugging from production code. Replace critical logging with structured logger (e.g., existing Sentry integration or Winston/Pino).

**Acceptance Criteria:**
- [ ] All debug `console.log` statements removed from `backend/src/` and `worker/src/`
- [ ] Critical operational logs replaced with structured logger calls
- [ ] ESLint rule `no-console` enabled (warn or error) to prevent regression
- [ ] Frontend `console.log` statements removed or gated behind `NODE_ENV === 'development'`
- [ ] No sensitive data (tokens, passwords, PII) found in remaining log statements

**Files Affected:**
- `backend/src/**/*.ts` (multiple files)
- `worker/src/**/*.ts` (multiple files)
- `frontend/src/**/*.tsx` (multiple files)
- `.eslintrc.*` or `eslint.config.*` (add no-console rule)

---

### Phase 2: Foundation (Weeks 3-6)

Stories in this phase establish **type safety**, **test coverage**, **code structure**, and **database security** as the foundation for sustainable growth.

---

#### Story 2.1: Enable Strict TypeScript — Eliminate `any` Types

- **Story ID:** TD-2.1
- **Priority:** P1 (High)
- **Estimated Hours:** 60h
- **Assignee:** @dev

**Description:**
Enable TypeScript `strict: true` across all three packages (backend, frontend, worker) and systematically replace 438+ `any` types in backend and 137+ in worker with proper type definitions. This is the single largest effort in the epic and should be approached incrementally, module by module.

**Acceptance Criteria:**
- [ ] `tsconfig.json` in all packages has `strict: true` enabled
- [ ] Backend `any` count reduced from 438 to fewer than 30 (justified exceptions documented)
- [ ] Worker `any` count reduced from 137 to fewer than 10 (justified exceptions documented)
- [ ] Frontend `any` types reviewed and replaced where applicable
- [ ] `npx tsc --noEmit` passes with zero errors in all packages

**Files Affected:**
- `backend/tsconfig.json`, `frontend/tsconfig.json`, `worker/tsconfig.json`
- `backend/src/**/*.ts` (438+ files with `any`)
- `worker/src/**/*.ts` (137+ files with `any`)
- `frontend/src/**/*.ts{x}` (to be audited)
- New type definition files: `backend/src/types/`, `worker/src/types/`

---

#### Story 2.2: Increase Test Coverage to 70%

- **Story ID:** TD-2.2
- **Priority:** P1 (High)
- **Estimated Hours:** 50h
- **Assignee:** @dev + @qa

**Description:**
Increase overall test coverage from the current 25-30% to a minimum of 70%. Focus on critical business logic paths: authentication, monitor CRUD operations, scraping engine, notification delivery, and billing/subscription management.

**Acceptance Criteria:**
- [ ] Overall test coverage reaches 70% (measured by `vitest --coverage` or `jest --coverage`)
- [ ] All critical paths have >85% coverage: auth, monitors, scraping engine, notifications
- [ ] Unit tests exist for all utility functions and shared modules
- [ ] Integration tests exist for key API endpoints (auth, monitors, subscriptions)
- [ ] Test suite runs in under 60 seconds on CI

**Files Affected:**
- `backend/src/**/*.spec.ts` or `backend/tests/` (new test files)
- `worker/src/**/*.spec.ts` or `worker/tests/` (new test files)
- `frontend/src/**/*.test.tsx` (new test files)
- `package.json` / `vitest.config.ts` (coverage configuration)

---

#### Story 2.3: Refactor Admin Controller — Split into Domain Controllers

- **Story ID:** TD-2.3
- **Priority:** P1 (High)
- **Estimated Hours:** 16h
- **Assignee:** @dev

**Description:**
Split the monolithic `admin.controller.ts` (100KB+) into 4 domain-specific controllers: `admin-users.controller.ts`, `admin-monitors.controller.ts`, `admin-subscriptions.controller.ts`, and `admin-system.controller.ts`. Maintain all existing functionality and routes.

**Acceptance Criteria:**
- [ ] `admin.controller.ts` replaced by 4 smaller controllers, each under 25KB
- [ ] All existing admin API routes preserved with identical behavior
- [ ] Shared admin middleware (auth, role checks) extracted to `admin.middleware.ts`
- [ ] All existing admin-related tests pass without modification (or updated to new paths)
- [ ] No duplicate code between the new controllers — shared logic extracted to services

**Files Affected:**
- `backend/src/controllers/admin.controller.ts` (to be split)
- `backend/src/controllers/admin-users.controller.ts` (new)
- `backend/src/controllers/admin-monitors.controller.ts` (new)
- `backend/src/controllers/admin-subscriptions.controller.ts` (new)
- `backend/src/controllers/admin-system.controller.ts` (new)
- `backend/src/middleware/admin.middleware.ts` (new or updated)
- `backend/src/routes/admin*.ts` (route registration updates)

---

#### Story 2.4: Refactor Telegram Service — Split into Specialized Services

- **Story ID:** TD-2.4
- **Priority:** P1 (High)
- **Estimated Hours:** 12h
- **Assignee:** @dev

**Description:**
Split `telegramService.ts` into 3 specialized services: `telegram-bot.service.ts` (bot management and webhook handling), `telegram-notification.service.ts` (message formatting and delivery), and `telegram-connection.service.ts` (user connection and verification flows).

**Acceptance Criteria:**
- [ ] `telegramService.ts` replaced by 3 focused services, each with clear single responsibility
- [ ] All existing Telegram functionality preserved (notifications, connections, bot commands)
- [ ] Shared Telegram API client extracted to `telegram-client.ts`
- [ ] All existing notification delivery tests pass
- [ ] Error handling improved with specific error types per service

**Files Affected:**
- `backend/src/services/telegramService.ts` (to be split)
- `backend/src/services/telegram-bot.service.ts` (new)
- `backend/src/services/telegram-notification.service.ts` (new)
- `backend/src/services/telegram-connection.service.ts` (new)
- `backend/src/services/telegram-client.ts` (new — shared API client)
- Files importing `telegramService` (update imports)

---

#### Story 2.5: Implement Row-Level Security Policies

- **Story ID:** TD-2.5
- **Priority:** P1 (High)
- **Estimated Hours:** 16h
- **Assignee:** @dev + @data-engineer

**Description:**
Implement Supabase Row-Level Security (RLS) policies on all critical tables to ensure users can only access their own data at the database level. This provides defense-in-depth beyond application-level authorization.

**Acceptance Criteria:**
- [ ] RLS enabled on all tables containing user data (monitors, alerts, connections, subscriptions)
- [ ] SELECT policies restrict access to `auth.uid() = user_id` on user-owned tables
- [ ] INSERT/UPDATE/DELETE policies prevent cross-user data modification
- [ ] Admin role has appropriate bypass policies for admin operations
- [ ] Service role key used by backend has appropriate access (not affected by RLS)

**Files Affected:**
- `backend/prisma/migrations/` (new migration with RLS policies)
- Supabase SQL migration files
- `backend/src/services/` (verify service role key usage)
- Documentation: RLS policy matrix

---

#### Story 2.6: SQL Injection Audit — Parameterize Raw Queries

- **Story ID:** TD-2.6
- **Priority:** P0 (Critical)
- **Estimated Hours:** 6h
- **Assignee:** @dev

**Description:**
Audit all 3 files containing raw SQL queries and replace string concatenation/interpolation with parameterized queries. Ensure no user input is ever concatenated directly into SQL strings.

**Acceptance Criteria:**
- [ ] All 3 raw SQL files identified and audited
- [ ] Every query using string interpolation converted to parameterized queries (`$1, $2` or Prisma `$queryRaw` with template literals)
- [ ] No instance of user input concatenated into SQL strings remains
- [ ] Each converted query tested with edge-case inputs (special characters, SQL keywords)
- [ ] ESLint rule or code review checklist item added to prevent future raw SQL

**Files Affected:**
- 3 files with raw SQL (to be identified during audit via `grep -r "queryRaw\|$query\|execute.*sql"`)
- `backend/src/**/*.ts` (files with raw SQL usage)
- `.eslintrc.*` (optional: custom rule for raw SQL detection)

---

### Phase 3: Optimization (Weeks 7-10)

Stories in this phase focus on **performance**, **user experience**, **accessibility**, and **maintainability** improvements for scaling to 1,000+ users.

---

#### Story 3.1: Update Outdated Dependencies

- **Story ID:** TD-3.1
- **Priority:** P2 (Medium)
- **Estimated Hours:** 20h
- **Assignee:** @dev

**Description:**
Update 30+ outdated dependencies across all packages, including critical updates for Sentry (error monitoring), Playwright (scraping engine), and security-related packages. Perform updates incrementally with testing between each batch.

**Acceptance Criteria:**
- [ ] All dependencies with known security vulnerabilities updated first
- [ ] Sentry SDK updated to latest version with configuration adjustments
- [ ] Playwright updated to latest stable version, scrapers verified
- [ ] No breaking changes introduced — all existing tests pass after each update batch
- [ ] `npm audit` returns zero critical and zero high vulnerabilities

**Files Affected:**
- `backend/package.json`, `frontend/package.json`, `worker/package.json`
- `package-lock.json` or equivalent lockfile
- Configuration files affected by breaking changes in updated packages
- `worker/src/scrapers/` (if Playwright API changes)

---

#### Story 3.2: Frontend Performance — Add Memoization

- **Story ID:** TD-3.2
- **Priority:** P2 (Medium)
- **Estimated Hours:** 16h
- **Assignee:** @dev

**Description:**
Reduce unnecessary re-renders across the React frontend by adding `React.memo`, `useMemo`, and `useCallback` where profiling indicates significant performance impact. Focus on list components, dashboard widgets, and data-heavy views.

**Acceptance Criteria:**
- [ ] React DevTools Profiler used to identify top 10 most expensive re-renders
- [ ] `React.memo` applied to pure presentational components (target: 15+ components)
- [ ] `useMemo` applied to expensive computations (filtering, sorting, aggregation)
- [ ] `useCallback` applied to event handlers passed as props to memoized children
- [ ] Lighthouse Performance score improved by at least 10 points on dashboard page

**Files Affected:**
- `frontend/src/components/**/*.tsx` (components to be memoized)
- `frontend/src/pages/**/*.tsx` (pages with expensive renders)
- `frontend/src/hooks/**/*.ts` (custom hooks with computation)

---

#### Story 3.3: Complete Internationalization (i18n)

- **Story ID:** TD-3.3
- **Priority:** P2 (Medium)
- **Estimated Hours:** 16h
- **Assignee:** @dev

**Description:**
Complete the i18n implementation for all untranslated pages, focusing on admin pages, help/FAQ sections, and error messages. Ensure consistent language support across the entire application.

**Acceptance Criteria:**
- [ ] All admin pages fully translated (PT-BR as primary, EN as secondary)
- [ ] Help and FAQ pages translated
- [ ] All error messages use i18n keys instead of hardcoded strings
- [ ] Date, number, and currency formatting uses locale-aware formatters
- [ ] No hardcoded user-facing strings remain in source code (verified by lint rule or grep)

**Files Affected:**
- `frontend/src/locales/` or `frontend/src/i18n/` (translation files)
- `frontend/src/pages/admin/**/*.tsx` (admin pages)
- `frontend/src/pages/help/**/*.tsx` (help pages)
- `frontend/src/components/**/*.tsx` (components with hardcoded strings)

---

#### Story 3.4: Accessibility Improvements

- **Story ID:** TD-3.4
- **Priority:** P2 (Medium)
- **Estimated Hours:** 12h
- **Assignee:** @dev + @ux-design-expert

**Description:**
Improve accessibility across the frontend by adding ARIA attributes, improving keyboard navigation, ensuring proper color contrast, and adding screen reader support for critical user flows.

**Acceptance Criteria:**
- [ ] All interactive elements have appropriate ARIA labels and roles
- [ ] Keyboard navigation works for all critical flows (login, create monitor, view results)
- [ ] Color contrast meets WCAG 2.1 AA standards (4.5:1 for text, 3:1 for large text)
- [ ] Focus indicators visible on all interactive elements
- [ ] Axe accessibility audit returns zero critical violations on key pages

**Files Affected:**
- `frontend/src/components/**/*.tsx` (add ARIA attributes)
- `frontend/src/styles/` or CSS modules (contrast and focus styles)
- `frontend/src/pages/**/*.tsx` (page-level accessibility)

---

#### Story 3.5: Extract Hardcoded Configuration Values

- **Story ID:** TD-3.5
- **Priority:** P2 (Medium)
- **Estimated Hours:** 8h
- **Assignee:** @dev

**Description:**
Extract hardcoded configuration values (API URLs, timeouts, retry counts, feature flags, magic numbers) into environment variables or a centralized configuration module. This improves deployability and makes the application easier to configure across environments.

**Acceptance Criteria:**
- [ ] All hardcoded API URLs replaced with environment variables
- [ ] Timeouts, retry counts, and pagination limits moved to config
- [ ] Magic numbers replaced with named constants in a config module
- [ ] `.env.example` updated with all new environment variables and documentation
- [ ] Application works correctly with default config values (zero-config local dev)

**Files Affected:**
- `backend/src/config/` (centralized config module)
- `worker/src/config/` (worker config module)
- `frontend/src/config/` (frontend config)
- `.env.example` (updated with new variables)
- Multiple files with hardcoded values (to be identified during implementation)

---

#### Story 3.6: UX Consistency — Error States and Empty States

- **Story ID:** TD-3.6
- **Priority:** P2 (Medium)
- **Estimated Hours:** 8h
- **Assignee:** @dev + @ux-design-expert

**Description:**
Implement consistent error state and empty state patterns across the application. Currently, many views show blank screens or generic errors when data is unavailable or an operation fails.

**Acceptance Criteria:**
- [ ] Reusable `ErrorBoundary` component created with user-friendly messaging
- [ ] Reusable `EmptyState` component created with contextual illustrations and CTAs
- [ ] All list views show `EmptyState` when no data is available
- [ ] All API-dependent views show `ErrorState` with retry option on failure
- [ ] Loading skeletons added to key data-heavy views (dashboard, monitor list)

**Files Affected:**
- `frontend/src/components/shared/ErrorBoundary.tsx` (new or updated)
- `frontend/src/components/shared/EmptyState.tsx` (new or updated)
- `frontend/src/components/shared/LoadingSkeleton.tsx` (new or updated)
- `frontend/src/pages/**/*.tsx` (apply patterns to all pages)

---

## Success Criteria

The epic is considered complete when:

1. **Zero critical vulnerabilities** — All P0 security issues resolved (XSS, SQL injection, token storage)
2. **Data integrity guaranteed** — All foreign keys, indexes, and schema synchronization in place
3. **Type safety >95%** — Fewer than 50 `any` types across entire codebase with `strict: true`
4. **Test coverage >70%** — All critical business paths tested
5. **Code modularity** — No single file exceeds 30KB; all controllers and services follow single responsibility
6. **Database security** — RLS policies active on all user-data tables
7. **Performance baseline** — Lighthouse Performance score >80 on key pages
8. **Accessibility** — Zero critical Axe violations on key pages
9. **Dependencies current** — Zero critical/high vulnerabilities in `npm audit`
10. **Build clean** — `tsc --noEmit`, `eslint`, and full test suite pass in CI

---

## Dependencies

| Dependency | Type | Impact |
|------------|------|--------|
| Supabase access for RLS policies | Infrastructure | Story 2.5 blocked without DB admin access |
| Staging environment for migration testing | Infrastructure | Story 1.3 requires staging DB |
| DOMPurify or sanitization library decision | Technical | Story 1.1 needs library choice |
| Sentry account/plan for updated SDK | External | Story 3.1 may need plan review |
| UX designer availability for accessibility audit | Resource | Stories 3.4, 3.6 benefit from design input |
| CI/CD pipeline for coverage gates | Infrastructure | Story 2.2 needs CI coverage reporting |

---

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Strict TypeScript migration breaks existing features | Medium | High | Incremental migration, module by module, with tests before and after |
| RLS policies break existing API queries | Medium | High | Test on staging first; implement with service role bypass for backend |
| Dependency updates introduce breaking changes | Medium | Medium | Update one package at a time; run full test suite after each |
| Team capacity reduced by ongoing feature work | High | Medium | Phase 1 (security) is non-negotiable; Phases 2-3 can flex timeline |
| Foreign key migrations fail on existing invalid data | Low | High | Run data integrity check before migration; fix orphaned records first |
| CSP headers break third-party integrations | Low | Medium | Start with report-only mode; switch to enforce after validation |

---

## Phase Transition Criteria

### Phase 1 -> Phase 2
- [ ] All P0 stories (1.1, 1.2, 1.3, 1.6) marked Done
- [ ] All P1 stories (1.4, 1.5) marked Done
- [ ] `npx tsc --noEmit` passes
- [ ] No critical vulnerabilities in security scan

### Phase 2 -> Phase 3
- [ ] All Phase 2 stories marked Done
- [ ] Test coverage >= 70%
- [ ] `any` count < 50 across all packages
- [ ] RLS policies verified on staging

### Epic Complete
- [ ] All 17 stories marked Done
- [ ] All 10 success criteria verified
- [ ] Final security scan clean
- [ ] Stakeholder sign-off received

---

> *Epic created as part of Brownfield Discovery Phase 10 by @pm (Morgan).*
> *Executive report available at: `docs/reports/TECHNICAL-DEBT-REPORT.md`*

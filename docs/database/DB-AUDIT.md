# RadarOne - Database Audit Report

**Version:** 1.0
**Date:** 2026-02-26
**Phase:** Brownfield Discovery - Phase 2 Output
**Author:** @data-engineer (Dara)
**Status:** NEEDS ATTENTION

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Missing Foreign Keys | 5 fields | CRITICAL |
| Missing Indexes | 9 indexes | HIGH |
| Schema Sync Issues | 2 models | HIGH |
| No Row-Level Security | 0 policies | CRITICAL |
| Legacy Fields | 2 fields | MEDIUM |
| String Fields Needing Enums | 5 fields | MEDIUM |
| Raw SQL Usage | 3 files | CRITICAL |
| Missing Cascade Rules | 1 relation | MEDIUM |

---

## 1. Missing Foreign Keys (CRITICAL)

These fields reference User IDs but have NO Prisma relation, meaning no referential integrity enforcement.

| Model | Field | Expected FK | Risk |
|-------|-------|-------------|------|
| CouponUsage | `userId` | User.id | Orphaned records if user deleted |
| CouponValidation | `userId` | User.id | Orphaned records if user deleted |
| AuditLog | `adminId` | User.id | Orphaned records, no join queries |
| PushSubscription | `userId` | User.id | No cascade delete on user removal |
| TelegramConnectToken | `userId` | User.id | No cascade delete on user removal |

**Impact:** Data integrity violations are possible. If a User is deleted, related CouponUsage, CouponValidation, AuditLog, PushSubscription, and TelegramConnectToken records become orphaned with no automatic cleanup.

**Recommendation:** Add Prisma relations with appropriate `onDelete` behavior:
- CouponUsage.userId -> User (onDelete: Cascade)
- CouponValidation.userId -> User (onDelete: SetNull, since nullable)
- AuditLog.adminId -> User (onDelete: SetNull or Restrict, audit data should persist)
- PushSubscription.userId -> User (onDelete: Cascade)
- TelegramConnectToken.userId -> User (onDelete: Cascade)

**Migration Complexity:** MEDIUM - requires migration to add foreign key constraints to existing data. Must verify no orphaned records exist before applying constraints.

---

## 2. Missing Indexes (HIGH)

Performance-critical queries that lack proper indexing:

| # | Model | Fields | Query Pattern | Impact |
|---|-------|--------|---------------|--------|
| 1 | Monitor | `userId + active` | Find active monitors for user | Dashboard load time |
| 2 | Monitor | `lastCheckedAt` | Find monitors due for check | Worker scheduling |
| 3 | AdSeen | `monitorId + alertSent` | Find unsent alerts | Notification pipeline |
| 4 | AdSeen | `firstSeenAt` | Time-based ad queries | Analytics |
| 5 | Subscription | `userId + status` | Active subscription lookup | Auth middleware (every request) |
| 6 | NotificationLog | `userId + channel` | Per-channel notification history | Notification page |
| 7 | MonitorLog | `monitorId + status` | Error analysis per monitor | Admin dashboard |
| 8 | SiteExecutionStats | `userId` | Per-user execution history | User dashboard |
| 9 | ScraperAuthLog | `accountId + success` | Auth failure analysis | Admin monitoring |

**Recommendation:** Create compound indexes. Priority order:
1. **Subscription (userId + status)** - hit on every authenticated request
2. **Monitor (userId + active)** - hit on every dashboard load
3. **Monitor (lastCheckedAt)** - hit on every worker cycle
4. **AdSeen (monitorId + alertSent)** - hit on every notification check
5. Remaining indexes as needed

**Migration Complexity:** LOW - index creation is non-blocking in PostgreSQL with `CONCURRENTLY`.

---

## 3. Schema Sync Issues (HIGH)

Backend and Worker maintain separate `schema.prisma` files that must stay synchronized.

| Issue | Backend | Worker |
|-------|---------|--------|
| RefreshToken model | Present | **MISSING** |
| JobRun model | Present | **MISSING** |
| ScraperAuthLog model | Present | Present (synced) |

**Files:**
- `backend/prisma/schema.prisma` - 921 lines (authoritative)
- `worker/prisma/schema.prisma` - 850 lines (subset)

**Impact:** Worker cannot query RefreshToken or JobRun tables. While the Worker may not need these models operationally, the schema divergence creates confusion and may cause Prisma migration conflicts.

**Recommendation:**
1. **Short-term:** Add missing models to Worker schema to maintain parity
2. **Long-term:** Evaluate shared schema approach (symlink or shared package in monorepo)

---

## 4. No Row-Level Security (CRITICAL)

**Current state:** Zero RLS policies exist on any table.

**Risk:** Any database connection with valid credentials has full read/write access to ALL rows. This is particularly dangerous for:
- Multi-tenant data isolation (User A seeing User B's monitors)
- Admin API bypassing application-level auth
- Direct database access (psql, pgAdmin) having no guardrails

**Affected tables (highest priority):**
1. `users` - PII data (email, CPF, phone)
2. `monitors` - User's private monitoring configurations
3. `ads_seen` - User's discovered listings
4. `subscriptions` - Financial data
5. `user_sessions` - Encrypted authentication sessions
6. `scraper_accounts` - Encrypted credentials

**Recommendation:** Implement RLS policies for multi-tenant isolation:
```sql
-- Example for monitors table
ALTER TABLE monitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_monitors ON monitors
  USING (user_id = current_setting('app.user_id')::text);
```

**Migration Complexity:** HIGH - requires:
1. Application-level changes to set `app.user_id` on each connection
2. Policy definitions for all tenant-scoped tables
3. Admin bypass roles
4. Thorough testing to prevent data leaks

---

## 5. Legacy Fields (MEDIUM)

| Model | Field | Status | Replacement |
|-------|-------|--------|-------------|
| UserSession | `cookies` (Json?) | DEPRECATED | `encryptedStorageState` |
| UserSession | `localStorage` (Json?) | DEPRECATED | `encryptedStorageState` |

**Context:** The UserSession model migrated from storing raw cookies/localStorage to AES-256-GCM encrypted Playwright storage state. The legacy fields remain for backward compatibility with `session-manager.ts`.

**Recommendation:**
1. Verify no code paths read from legacy fields
2. Run migration to drop columns
3. Update Worker schema accordingly

**Files referencing legacy fields:**
- `worker/src/auth/session-manager.ts` (legacy session manager)
- `worker/src/utils/session-manager.ts` (legacy utility)

---

## 6. String Fields Needing Enums (MEDIUM)

These fields use `String` type but have a finite, known set of values that should be Prisma enums:

| Model | Field | Current Values | Suggested Enum |
|-------|-------|---------------|----------------|
| UsageLog | `action` | MONITOR_CHECK, LOGIN, COUPON_REDEEM, etc. | UsageAction |
| AdminAlert | `type` | JOB_FAILURE, WEBHOOK_ERROR, SPIKE_MONITORS, MASS_EXPIRATION | AdminAlertType |
| Coupon | `discountType` | PERCENT, FIXED | DiscountType |
| Coupon | `purpose` | DISCOUNT, TRIAL_UPGRADE | CouponPurpose |
| Plan | `billingPeriod` | MONTHLY, YEARLY, SEMIANNUAL | BillingPeriod |
| SystemSetting | `type` | STRING, NUMBER, BOOLEAN, JSON | SettingType |
| SystemSetting | `category` | GENERAL, LIMITS, FEATURES, MAINTENANCE | SettingCategory |
| AuditLog | `action` | USER_BLOCKED, SUBSCRIPTION_UPDATED, etc. | AuditAction |
| AuditLog | `targetType` | USER, SUBSCRIPTION, COUPON, MONITOR, SYSTEM | AuditTargetType |
| ScraperAccount | `site` | MERCADO_LIVRE, SUPERBID, etc. | (use MonitorSite) |
| UserSession | `site` | MERCADO_LIVRE, SUPERBID, etc. | (use MonitorSite) |

**Impact:** String fields allow invalid values. No compile-time or migration-time validation.

**Recommendation:** Create Prisma enums and migrate existing data. Start with the most critical: `discountType`, `purpose`, `billingPeriod`.

**Migration Complexity:** MEDIUM - requires data migration to validate existing values before adding enum constraint.

---

## 7. Raw SQL Audit (CRITICAL)

Files using `$queryRaw` or `$executeRaw` that bypass Prisma's query builder and SQL injection protections:

| File | Usage | Risk |
|------|-------|------|
| `backend/src/controllers/admin.controller.ts` | Complex admin queries | HIGH - 100KB file, hard to audit |
| `backend/src/services/monitorService.ts` | Monitor aggregation queries | MEDIUM |
| `backend/src/jobs/resetMonthlyQueries.ts` | Batch reset queries | LOW - no user input |

**Recommendation:**
1. Audit ALL `$queryRaw` usages for SQL injection (parameterized queries)
2. Replace with Prisma queries where possible
3. For complex queries, ensure tagged template literals are used: `` Prisma.$queryRaw`SELECT ...` `` (auto-parameterized)
4. Add SQL injection tests

---

## 8. Missing Cascade Rules (MEDIUM)

| Relation | Current | Recommended | Risk |
|----------|---------|-------------|------|
| Subscription -> Plan | No onDelete | onDelete: Restrict | Deleting a plan could orphan subscriptions |
| Coupon -> Plan | No onDelete | onDelete: SetNull | Deleting a plan removes coupon restriction |
| CouponUsage -> Coupon | onDelete: (default) | onDelete: Cascade | Deleting coupon should clean usage |

**Recommendation:** Add explicit `onDelete` clauses to all relations. Default behavior in Prisma is database-default (usually RESTRICT), which may cause unexpected errors.

---

## Recommendations Summary (Priority Order)

| # | Action | Severity | Effort | Impact |
|---|--------|----------|--------|--------|
| 1 | Audit raw SQL for injection | CRITICAL | 4h | Security |
| 2 | Add missing foreign keys | CRITICAL | 8h | Data integrity |
| 3 | Plan RLS implementation | CRITICAL | 40h | Multi-tenant security |
| 4 | Add 9 missing indexes | HIGH | 4h | Performance |
| 5 | Sync Worker schema | HIGH | 2h | Developer experience |
| 6 | Convert strings to enums | MEDIUM | 8h | Type safety |
| 7 | Remove legacy fields | MEDIUM | 4h | Schema cleanliness |
| 8 | Add cascade rules | MEDIUM | 2h | Data consistency |

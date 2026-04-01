-- Multi-session pool support for anti-ban resilience
-- Safe migration: adds columns with defaults, changes constraint without data loss

-- 1. Add new enum values to UserSessionStatus
ALTER TYPE "UserSessionStatus" ADD VALUE IF NOT EXISTS 'COOLING_DOWN';
ALTER TYPE "UserSessionStatus" ADD VALUE IF NOT EXISTS 'DISABLED';

-- 2. Add pool management columns with safe defaults
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "is_primary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "consecutive_failures" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "failure_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "cooldown_until" TIMESTAMP(3);
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "last_success_at" TIMESTAMP(3);
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "last_failure_at" TIMESTAMP(3);
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "reason_code" TEXT;

-- 3. Mark all existing sessions as primary (they were the only session)
UPDATE "user_sessions" SET "is_primary" = true WHERE "is_primary" = false;

-- 4. Backfill last_success_at from last_used_at for ACTIVE sessions
UPDATE "user_sessions" SET "last_success_at" = "last_used_at"
WHERE "status" = 'ACTIVE' AND "last_success_at" IS NULL AND "last_used_at" IS NOT NULL;

-- 5. Drop old unique constraint and create new one allowing multiple sessions
-- The old constraint name from Prisma is "user_sessions_user_id_site_domain_key"
ALTER TABLE "user_sessions" DROP CONSTRAINT IF EXISTS "user_sessions_user_id_site_domain_key";

-- New unique constraint: allows multiple sessions per user/site/domain via accountLabel
CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_pool_unique"
  ON "user_sessions"("user_id", "site", "domain", "account_label");

-- 6. Add pool lookup index for fast session selection
CREATE INDEX IF NOT EXISTS "user_sessions_pool_lookup"
  ON "user_sessions"("user_id", "site", "status");

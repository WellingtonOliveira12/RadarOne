-- CreateEnum
CREATE TYPE "UserSessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'NEEDS_REAUTH', 'INVALID');

-- CreateEnum
CREATE TYPE "ScraperMFAType" AS ENUM ('NONE', 'TOTP', 'EMAIL_OTP', 'SMS_OTP', 'APP_APPROVAL');

-- CreateEnum
CREATE TYPE "ScraperAccountStatus" AS ENUM ('OK', 'DEGRADED', 'NEEDS_REAUTH', 'BLOCKED', 'SITE_CHANGED', 'DISABLED');

-- AlterEnum
ALTER TYPE "LogStatus" ADD VALUE 'SKIPPED';

-- AlterTable
ALTER TABLE "user_sessions" ADD COLUMN     "account_label" TEXT,
ADD COLUMN     "encrypted_storage_state" TEXT,
ADD COLUMN     "last_error_at" TIMESTAMP(3),
ADD COLUMN     "status" "UserSessionStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "cookies" DROP NOT NULL,
ALTER COLUMN "expires_at" DROP NOT NULL,
ALTER COLUMN "last_used_at" DROP NOT NULL;

-- CreateTable
CREATE TABLE "scraper_accounts" (
    "id" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_enc" TEXT NOT NULL,
    "totp_secret_enc" TEXT,
    "otp_email" TEXT,
    "otp_email_pwd_enc" TEXT,
    "mfa_type" "ScraperMFAType" NOT NULL DEFAULT 'NONE',
    "status" "ScraperAccountStatus" NOT NULL DEFAULT 'OK',
    "status_message" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "last_success_at" TIMESTAMP(3),
    "last_failure_at" TIMESTAMP(3),
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "max_requests_per_hour" INTEGER NOT NULL DEFAULT 100,
    "requests_this_hour" INTEGER NOT NULL DEFAULT 0,
    "hour_reset_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scraper_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraper_sessions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "is_authenticated" BOOLEAN NOT NULL DEFAULT false,
    "last_validated_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "user_data_dir" TEXT NOT NULL,
    "user_agent" TEXT,
    "last_url" TEXT,
    "cookie_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scraper_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraper_auth_logs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "message" TEXT,
    "url" TEXT,
    "page_type" TEXT,
    "duration" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scraper_auth_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scraper_accounts_site_idx" ON "scraper_accounts"("site");

-- CreateIndex
CREATE INDEX "scraper_accounts_status_idx" ON "scraper_accounts"("status");

-- CreateIndex
CREATE INDEX "scraper_accounts_is_active_idx" ON "scraper_accounts"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "scraper_accounts_site_username_key" ON "scraper_accounts"("site", "username");

-- CreateIndex
CREATE INDEX "scraper_sessions_is_authenticated_idx" ON "scraper_sessions"("is_authenticated");

-- CreateIndex
CREATE UNIQUE INDEX "scraper_sessions_account_id_key" ON "scraper_sessions"("account_id");

-- CreateIndex
CREATE INDEX "scraper_auth_logs_account_id_idx" ON "scraper_auth_logs"("account_id");

-- CreateIndex
CREATE INDEX "scraper_auth_logs_event_idx" ON "scraper_auth_logs"("event");

-- CreateIndex
CREATE INDEX "scraper_auth_logs_created_at_idx" ON "scraper_auth_logs"("created_at");

-- CreateIndex
CREATE INDEX "user_sessions_site_status_idx" ON "user_sessions"("site", "status");

-- AddForeignKey
ALTER TABLE "scraper_sessions" ADD CONSTRAINT "scraper_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "scraper_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraper_auth_logs" ADD CONSTRAINT "scraper_auth_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "scraper_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

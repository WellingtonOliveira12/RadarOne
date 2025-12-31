-- AlterTable
ALTER TABLE "users" ADD COLUMN     "allowed_ips" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "last_login_ip" TEXT,
ADD COLUMN     "last_password_validated" TIMESTAMP(3),
ADD COLUMN     "session_timeout_minutes" INTEGER,
ADD COLUMN     "two_factor_backup_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "two_factor_secret" TEXT;

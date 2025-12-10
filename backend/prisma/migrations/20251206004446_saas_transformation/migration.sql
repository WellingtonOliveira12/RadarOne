/*
  Warnings:

  - You are about to drop the column `current_uses` on the `coupons` table. All the data in the column will be lost.
  - You are about to drop the column `discount` on the `coupons` table. All the data in the column will be lost.
  - You are about to drop the column `plan_id` on the `coupons` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `coupons` table. All the data in the column will be lost.
  - You are about to drop the column `filters` on the `monitors` table. All the data in the column will be lost.
  - You are about to drop the column `monthly_queries` on the `plans` table. All the data in the column will be lost.
  - You are about to drop the column `multi_site` on the `plans` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `plans` table. All the data in the column will be lost.
  - You are about to drop the column `end_date` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `telegram_chat_id` on the `users` table. All the data in the column will be lost.
  - Added the required column `discount_type` to the `coupons` table without a default value. This is not possible if the table is not empty.
  - Added the required column `discount_value` to the `coupons` table without a default value. This is not possible if the table is not empty.
  - Added the required column `billing_period` to the `plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `max_alerts_per_day` to the `plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `max_sites` to the `plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price_cents` to the `plans` table without a default value. This is not possible if the table is not empty.
  - Made the column `max_monitors` on table `plans` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `password_hash` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MonitorMode" AS ENUM ('URL_ONLY', 'STRUCTURED_FILTERS');

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'PAST_DUE';

-- DropForeignKey
ALTER TABLE "coupons" DROP CONSTRAINT "coupons_plan_id_fkey";

-- AlterTable
ALTER TABLE "coupons" DROP COLUMN "current_uses",
DROP COLUMN "discount",
DROP COLUMN "plan_id",
DROP COLUMN "type",
ADD COLUMN     "applies_to_plan_id" TEXT,
ADD COLUMN     "discount_type" TEXT NOT NULL,
ADD COLUMN     "discount_value" INTEGER NOT NULL,
ADD COLUMN     "used_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "monitors" DROP COLUMN "filters",
ADD COLUMN     "filters_json" JSONB,
ADD COLUMN     "last_result_hash" TEXT,
ADD COLUMN     "mode" "MonitorMode" NOT NULL DEFAULT 'URL_ONLY',
ALTER COLUMN "search_url" DROP NOT NULL;

-- AlterTable
ALTER TABLE "plans" DROP COLUMN "monthly_queries",
DROP COLUMN "multi_site",
DROP COLUMN "price",
ADD COLUMN     "billing_period" TEXT NOT NULL,
ADD COLUMN     "is_recommended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_alerts_per_day" INTEGER NOT NULL,
ADD COLUMN     "max_sites" INTEGER NOT NULL,
ADD COLUMN     "price_cents" INTEGER NOT NULL,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trial_days" INTEGER NOT NULL DEFAULT 7,
ALTER COLUMN "max_monitors" SET NOT NULL;

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "end_date",
ADD COLUMN     "external_provider" TEXT,
ADD COLUMN     "external_sub_id" TEXT,
ADD COLUMN     "valid_until" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'TRIAL';

-- AlterTable
ALTER TABLE "users" DROP COLUMN "password",
DROP COLUMN "telegram_chat_id",
ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cpf_encrypted" TEXT,
ADD COLUMN     "cpf_last4" TEXT,
ADD COLUMN     "password_hash" TEXT NOT NULL;

-- DropEnum
DROP TYPE "CouponType";

-- CreateTable
CREATE TABLE "telegram_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "username" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_accounts_chat_id_key" ON "telegram_accounts"("chat_id");

-- CreateIndex
CREATE INDEX "telegram_accounts_user_id_idx" ON "telegram_accounts"("user_id");

-- CreateIndex
CREATE INDEX "monitors_site_idx" ON "monitors"("site");

-- CreateIndex
CREATE INDEX "subscriptions_valid_until_idx" ON "subscriptions"("valid_until");

-- AddForeignKey
ALTER TABLE "telegram_accounts" ADD CONSTRAINT "telegram_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_applies_to_plan_id_fkey" FOREIGN KEY ("applies_to_plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

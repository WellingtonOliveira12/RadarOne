-- AlterTable
ALTER TABLE "notification_settings" ADD COLUMN     "telegram_link_code" TEXT,
ADD COLUMN     "telegram_link_expires_at" TIMESTAMP(3);

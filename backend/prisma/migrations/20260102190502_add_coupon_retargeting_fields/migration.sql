-- AlterTable
ALTER TABLE "coupon_validations" ADD COLUMN     "reminder_sent_at" TIMESTAMP(3),
ADD COLUMN     "second_reminder_sent_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "coupon_validations_reminder_sent_at_idx" ON "coupon_validations"("reminder_sent_at");

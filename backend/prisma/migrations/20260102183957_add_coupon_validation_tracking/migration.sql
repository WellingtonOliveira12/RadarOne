-- CreateTable
CREATE TABLE "coupon_validations" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_email" TEXT,
    "purpose" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupon_validations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coupon_validations_coupon_id_idx" ON "coupon_validations"("coupon_id");

-- CreateIndex
CREATE INDEX "coupon_validations_user_id_idx" ON "coupon_validations"("user_id");

-- CreateIndex
CREATE INDEX "coupon_validations_converted_idx" ON "coupon_validations"("converted");

-- CreateIndex
CREATE INDEX "coupon_validations_created_at_idx" ON "coupon_validations"("created_at");

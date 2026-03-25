-- CreateTable
CREATE TABLE "apple_price_references" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "reference_price" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apple_price_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "apple_price_references_model_idx" ON "apple_price_references"("model");

-- CreateIndex
CREATE UNIQUE INDEX "apple_price_references_model_storage_key" ON "apple_price_references"("model", "storage");

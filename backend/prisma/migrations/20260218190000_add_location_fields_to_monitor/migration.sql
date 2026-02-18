-- AlterTable: Add location fields to monitors
ALTER TABLE "monitors" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'BR';
ALTER TABLE "monitors" ADD COLUMN "state_region" TEXT;
ALTER TABLE "monitors" ADD COLUMN "city" TEXT;

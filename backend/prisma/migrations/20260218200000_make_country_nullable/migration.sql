-- AlterTable: make country nullable (was String with default "BR")
-- null = sem filtro (worldwide), ISO-2 = filtro por país
ALTER TABLE "monitors" ALTER COLUMN "country" DROP NOT NULL;
ALTER TABLE "monitors" ALTER COLUMN "country" DROP DEFAULT;

-- Migrate existing "WORLDWIDE" values to null
UPDATE "monitors" SET "country" = NULL WHERE "country" = 'WORLDWIDE';

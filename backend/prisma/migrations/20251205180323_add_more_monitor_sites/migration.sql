-- AlterEnum: Add FACEBOOK_MARKETPLACE and OUTRO to MonitorSite
-- Remove LEILAO from MonitorSite (requires recreating enum)

-- Step 1: Create temporary enum with all new values
CREATE TYPE "MonitorSite_new" AS ENUM (
  'MERCADO_LIVRE',
  'OLX',
  'FACEBOOK_MARKETPLACE',
  'WEBMOTORS',
  'ICARROS',
  'ZAP_IMOVEIS',
  'VIVA_REAL',
  'IMOVELWEB',
  'OUTRO'
);

-- Step 2: Migrate existing data (if monitors with LEILAO exist, they need manual handling)
-- For now, we assume no LEILAO monitors exist or they should be migrated to OUTRO
ALTER TABLE monitors 
  ALTER COLUMN site TYPE "MonitorSite_new" 
  USING (
    CASE 
      WHEN site::text = 'LEILAO' THEN 'OUTRO'::text
      ELSE site::text
    END
  )::"MonitorSite_new";

-- Step 3: Drop old enum and rename new one
DROP TYPE "MonitorSite";
ALTER TYPE "MonitorSite_new" RENAME TO "MonitorSite";

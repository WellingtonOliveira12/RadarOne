-- MIGRATION: Adicionar constraint unique case-insensitive no email
-- Data: 2026-01-01
-- Objetivo: Garantir unicidade de email no banco (fallback se app falhar)
--
-- BENEFÍCIOS:
-- - Proteção em nível de banco (defense in depth)
-- - Previne race conditions no código
-- - Valida emails duplicados com case diferente

-- Remover unique constraint antigo (email exato)
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_key";

-- Criar índice unique case-insensitive
-- IMPORTANTE: Usa função LOWER() para case-insensitive
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique_lower" ON "users"(LOWER("email"));

-- INSTRUÇÕES:
-- 1. Antes de aplicar, verificar se há emails duplicados:
--    SELECT LOWER(email), COUNT(*) FROM users
--    GROUP BY LOWER(email) HAVING COUNT(*) > 1;
--
-- 2. Se houver duplicados, resolver manualmente (mesclar contas ou deletar)
--
-- 3. Aplicar migration

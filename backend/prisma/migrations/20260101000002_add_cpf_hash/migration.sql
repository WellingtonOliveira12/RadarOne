-- MIGRATION: Adicionar campo cpf_hash para validação robusta de CPF duplicado
-- Data: 2026-01-01
-- Objetivo: Usar hash SHA256 para detectar CPFs duplicados sem descriptografar todos
--
-- BENEFÍCIOS:
-- - Validação rápida: O(1) lookup vs O(n) decryption
-- - Não revela CPF original (hash one-way)
-- - Permite unique constraint no banco
-- - Elimina falsos positivos de colisão com cpfLast4

-- Adicionar coluna cpf_hash (nullable para dados existentes)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cpf_hash" TEXT;

-- Criar unique constraint (após popular dados existentes)
-- NOTA: Se houver dados existentes com CPF, precisa popular cpf_hash antes de aplicar constraint
-- Ver script: scripts/migrate-cpf-to-hash.ts

-- Criar índice unique para validação rápida
-- IMPORTANTE: Comentado porque precisa popular dados existentes primeiro
-- CREATE UNIQUE INDEX IF NOT EXISTS "users_cpf_hash_key" ON "users"("cpf_hash");

-- INSTRUÇÕES PARA PRODUÇÃO:
-- 1. Aplicar esta migration (adiciona coluna)
-- 2. Rodar script: npm run migrate:cpf-hash (popula cpf_hash para registros existentes)
-- 3. Aplicar próxima migration que cria unique constraint

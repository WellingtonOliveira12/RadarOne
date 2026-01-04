-- Migration: Add user_sessions table for login management
-- Data: 04/01/2026
-- Descrição: Adiciona tabela para gerenciar sessões de login em sites que exigem autenticação

-- Criar tabela user_sessions
CREATE TABLE IF NOT EXISTS "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "cookies" JSONB NOT NULL,
    "local_storage" JSONB,
    "metadata" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- Criar índices
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");
CREATE UNIQUE INDEX "user_sessions_user_id_site_domain_key" ON "user_sessions"("user_id", "site", "domain");

-- Adicionar foreign key
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Comentários
COMMENT ON TABLE "user_sessions" IS 'Sessões de login para sites que exigem autenticação (ex: leilões)';
COMMENT ON COLUMN "user_sessions"."cookies" IS 'Cookies da sessão (encrypted)';
COMMENT ON COLUMN "user_sessions"."local_storage" IS 'Local storage se necessário';
COMMENT ON COLUMN "user_sessions"."site" IS 'Identificador do site (ex: superbid, vipleiloes)';
COMMENT ON COLUMN "user_sessions"."domain" IS 'Domínio do site (ex: superbid.net)';

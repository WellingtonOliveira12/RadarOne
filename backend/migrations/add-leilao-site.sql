-- Migration: Add LEILAO to MonitorSite enum
-- Data: 2026-01-02
-- Autor: Claude Code (Auditoria Worker)

-- ============================================
-- Adiciona valor LEILAO ao enum MonitorSite
-- ============================================

-- Verifica se LEILAO já existe (evita erro em re-execução)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'MonitorSite' AND e.enumlabel = 'LEILAO'
    ) THEN
        ALTER TYPE "MonitorSite" ADD VALUE 'LEILAO';
        RAISE NOTICE 'LEILAO adicionado ao enum MonitorSite';
    ELSE
        RAISE NOTICE 'LEILAO já existe no enum MonitorSite - skip';
    END IF;
END$$;

-- ============================================
-- Validação
-- ============================================

-- Listar todos os valores do enum
SELECT unnest(enum_range(NULL::"MonitorSite")) AS site;

-- Verificar monitores existentes por site
SELECT site, COUNT(*) as total
FROM monitors
GROUP BY site
ORDER BY total DESC;

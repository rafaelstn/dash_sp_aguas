-- =============================================================================
-- Migration 0047, módulo Diagramas Unifilares.
-- =============================================================================
-- Contexto: o editor de Diagramas Unifilares era um protótipo Lovable
-- (Vite SPA) que guardava tudo em localStorage do navegador. Aqui ele vira
-- módulo do dashboard SP Águas - DMO, com persistência no mesmo Postgres.
--
-- Um diagrama é um esquema da rede hidrológica: nome, bacia opcional e um
-- array de `elementos` (reservatório, nível, chuva, linha/rio). Os elementos
-- são manipulados pelo editor (React Flow, fases A2/A3) e persistidos como
-- JSONB; o backend só guarda e devolve o array. O domínio que valida cada
-- elemento e calcula status por limiares vive em src/domain/diagramas.
--
-- Ver plano docs/superpowers/plans/2026-06-23-integracao-ecossistema-sibh.md
-- (Fase A1). RLS deny-by-default no padrão da migration 0040.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela de diagramas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diagramas (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           TEXT         NOT NULL,
  bacia          TEXT         NULL,
  descricao      TEXT         NULL,
  -- Array dos elementos do diagrama. O editor manipula; o backend só persiste.
  elementos      JSONB        NOT NULL DEFAULT '[]'::jsonb,
  criado_por     UUID         NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE diagramas IS
  'Diagramas unifilares da rede hidrológica. elementos (JSONB) guarda os 4 tipos de elemento manipulados pelo editor.';

COMMENT ON COLUMN diagramas.elementos IS
  'Array JSON dos elementos (reservatorio/nivel/chuva/linha). Validado no domínio src/domain/diagramas.';

-- Lista ordena por mais recente; índice descendente serve direto a essa query.
CREATE INDEX IF NOT EXISTS idx_diagramas_atualizado_em
  ON diagramas (atualizado_em DESC);

-- Filtro/auditoria por autor.
CREATE INDEX IF NOT EXISTS idx_diagramas_criado_por
  ON diagramas (criado_por) WHERE criado_por IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Trigger de atualizado_em (padrão da migration 0029)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_diagramas_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'diagramas_atualizado_em'
  ) THEN
    CREATE TRIGGER diagramas_atualizado_em
    BEFORE UPDATE ON diagramas
    FOR EACH ROW EXECUTE FUNCTION trg_diagramas_atualizado_em();
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- 3. RLS deny-by-default (padrão da migration 0040, defesa em profundidade)
-- -----------------------------------------------------------------------------
-- A app acessa via role de serviço do pooler Supabase (BYPASSRLS), então toda
-- I/O do backend continua passando. Sem policy para anon/authenticated ⇒ se a
-- anon key vazar ou alguém abrir o PostgREST direto, nada volta.
ALTER TABLE IF EXISTS diagramas ENABLE ROW LEVEL SECURITY;

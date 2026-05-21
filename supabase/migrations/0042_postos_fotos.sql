-- =============================================================================
-- Migration 0042 — Tabela `postos_fotos` (foto de capa do posto)
-- =============================================================================
-- Contexto: o agente em campo registra uma foto "de capa" do posto. Ela aparece
-- no app (tela de detalhe do posto, antes de preencher a ficha) e no cadastro do
-- posto no sistema principal (abaixo do mapa). Regra de negócio: se a foto mais
-- recente tiver mais de 1 ano, ou não existir, o app sugere atualizar (não
-- obrigatório por enquanto).
--
-- Decisões:
--   - Tabela de histórico (não coluna em `postos`): preserva fotos anteriores e
--     a data de cada uma; a "capa" é simplesmente a mais recente por prefixo.
--   - Arquivo no Supabase Storage (bucket `postos-fotos`); aqui guardamos só o
--     `storage_path` + metadados. Evita inchar o banco.
--   - `tirada_por` com ON DELETE SET NULL: LGPD — apagar usuário não apaga a
--     foto do posto (dado operacional do posto), só desvincula a autoria.
--   - RLS como defesa em profundidade: postos são dados compartilhados, então
--     SELECT/INSERT liberados a autenticados (a app já controla via repository).
--
-- Idempotente via IF NOT EXISTS + blocos DO $$ para policies.
-- =============================================================================

CREATE TABLE IF NOT EXISTS postos_fotos (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  prefixo      VARCHAR(32) NOT NULL REFERENCES postos (prefixo) ON UPDATE CASCADE ON DELETE CASCADE,
  storage_path TEXT        NOT NULL,
  tirada_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tirada_por   UUID        NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A capa é a foto mais recente do posto: este índice serve a busca por prefixo
-- ordenada por data desc.
CREATE INDEX IF NOT EXISTS idx_postos_fotos_prefixo_data
  ON postos_fotos (prefixo, tirada_em DESC);

COMMENT ON TABLE postos_fotos IS
  'Fotos de capa do posto (histórico). A capa exibida é a mais recente por prefixo. Arquivo no Supabase Storage (bucket postos-fotos); aqui só o storage_path + metadados.';

-- ---------------------------------------------------------------------------
-- Row Level Security — defesa em profundidade
-- ---------------------------------------------------------------------------
ALTER TABLE postos_fotos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'postos_fotos'
       AND policyname = 'postos_fotos_auth_select'
  ) THEN
    CREATE POLICY postos_fotos_auth_select ON postos_fotos
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'postos_fotos'
       AND policyname = 'postos_fotos_auth_insert'
  ) THEN
    CREATE POLICY postos_fotos_auth_insert ON postos_fotos
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END$$;

-- =============================================================================
-- Migration 0020 — Tabela `postos_favoritos` (ADR-0005)
-- =============================================================================
-- Contexto: técnico SPÁguas acessa frequentemente um subset estável de postos
-- (postos sob sua responsabilidade, ou em investigação ativa). Favoritar elimina
-- busca repetida e reduz fadiga. Com auth Supabase ativa (ADR-0004), cada
-- favorito é por usuário autenticado.
--
-- Decisões (ADR-0005):
--   - Tabela dedicada (não JSON em raw_user_meta_data): evita race conditions
--     em update parcial de JSON; permite JOIN e filtro eficientes.
--   - FK para auth.users com ON DELETE CASCADE: LGPD — apagar usuário apaga
--     seus favoritos.
--   - FK para postos(prefixo) com ON UPDATE CASCADE: prefixo é chave lógica
--     no resto do domínio; proteção defensiva.
--   - PK composta (usuario_id, prefixo): UNIQUE natural + evita surrogate UUID.
--   - RLS ON como defesa em profundidade: a app já filtra por usuario_id no
--     WHERE, mas RLS impede vazamento caso PostgREST seja exposto no futuro.
--
-- Idempotente via IF NOT EXISTS + blocos DO $$ para policies.
-- =============================================================================

CREATE TABLE IF NOT EXISTS postos_favoritos (
  usuario_id UUID        NOT NULL REFERENCES auth.users (id)  ON DELETE CASCADE,
  prefixo    VARCHAR(32) NOT NULL REFERENCES postos (prefixo) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, prefixo)
);

CREATE INDEX IF NOT EXISTS idx_postos_favoritos_usuario
  ON postos_favoritos (usuario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_postos_favoritos_prefixo
  ON postos_favoritos (prefixo);

COMMENT ON TABLE postos_favoritos IS
  'Favoritos por usuário autenticado (ADR-0005). Um técnico pode marcar N postos; a UI lista em /favoritos e filtra busca via &apenas_favoritos=1.';

-- ---------------------------------------------------------------------------
-- Row Level Security — defesa em profundidade
-- ---------------------------------------------------------------------------
ALTER TABLE postos_favoritos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'postos_favoritos'
       AND policyname = 'postos_favoritos_self_select'
  ) THEN
    CREATE POLICY postos_favoritos_self_select ON postos_favoritos
      FOR SELECT
      USING (usuario_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'postos_favoritos'
       AND policyname = 'postos_favoritos_self_insert'
  ) THEN
    CREATE POLICY postos_favoritos_self_insert ON postos_favoritos
      FOR INSERT
      WITH CHECK (usuario_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'postos_favoritos'
       AND policyname = 'postos_favoritos_self_delete'
  ) THEN
    CREATE POLICY postos_favoritos_self_delete ON postos_favoritos
      FOR DELETE
      USING (usuario_id = auth.uid());
  END IF;
END$$;

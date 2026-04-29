-- =============================================================================
-- Migration 0022 — Tabela `fichas_visita` (entrada digital de fichas de campo)
-- =============================================================================
-- Contexto: hoje as fichas de inspeção/manutenção/medição existem como PDFs
-- escaneados no HD de rede (capturados pelo indexer). O plano é que um app
-- mobile (futuro) permita ao técnico em campo digitar a ficha e enviar
-- direto pro banco — eliminando a etapa de scan e dando dados estruturados
-- pra analytics, alertas e relatórios.
--
-- Decisões arquiteturais:
--   - Tabela ÚNICA pra todos os tipos de ficha. Coluna `dados` JSONB carrega
--     o payload específico do tipo. Validado server-side via Zod schema.
--     Trade-off: perdemos constraints SQL por campo, mas ganhamos a
--     possibilidade de adicionar novos tipos sem migration nova
--     (basta um schema TS novo).
--   - `cod_tipo_documento` referencia `tipos_documento` (migration 0008) —
--     a MESMA taxonomia dos PDFs no HD. Permite, no futuro, exibir cronologia
--     unificada (PDF antigo + ficha digital nova) na mesma aba do posto.
--   - `origem` permite distinguir a fonte: `web_simulada` (formulário interno
--     pra testes), `app_campo` (futuro), `importacao` (migração em massa).
--   - Hard delete por simplicidade. Se virar requisito de auditoria, adicionar
--     coluna `deletada_em TIMESTAMPTZ` e mudar pra soft delete — mudança
--     contida no repository sem propagar.
--
-- Idempotente via IF NOT EXISTS + DO $$ pros triggers.
-- =============================================================================

CREATE TABLE IF NOT EXISTS fichas_visita (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  prefixo             VARCHAR(32)  NOT NULL REFERENCES postos (prefixo) ON UPDATE CASCADE,
  cod_tipo_documento  SMALLINT     NOT NULL REFERENCES tipos_documento (codigo),

  data_visita         DATE         NOT NULL,
  hora_inicio         TIME         NULL,
  hora_fim            TIME         NULL,

  tecnico_nome        TEXT         NOT NULL,
  tecnico_id          UUID         NULL,  -- FK pra auth.users quando app de campo tiver auth

  latitude_capturada  NUMERIC(10,7) NULL,  -- GPS do dispositivo no momento do envio
  longitude_capturada NUMERIC(10,7) NULL,

  observacoes         TEXT         NULL,
  dados               JSONB        NOT NULL DEFAULT '{}'::jsonb,

  origem              VARCHAR(16)  NOT NULL DEFAULT 'web_simulada',
  status              VARCHAR(16)  NOT NULL DEFAULT 'enviada',

  criada_em           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizada_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_fichas_visita_origem
    CHECK (origem IN ('web_simulada', 'app_campo', 'importacao')),
  CONSTRAINT chk_fichas_visita_status
    CHECK (status IN ('rascunho', 'enviada', 'aprovada')),
  CONSTRAINT chk_fichas_visita_horas
    CHECK (hora_fim IS NULL OR hora_inicio IS NULL OR hora_fim >= hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_fichas_visita_prefixo_data
  ON fichas_visita (prefixo, data_visita DESC);

CREATE INDEX IF NOT EXISTS idx_fichas_visita_tipo
  ON fichas_visita (cod_tipo_documento);

CREATE INDEX IF NOT EXISTS idx_fichas_visita_tecnico
  ON fichas_visita (tecnico_id, criada_em DESC)
  WHERE tecnico_id IS NOT NULL;

-- Trigger pra manter `atualizada_em` sempre fresca.
CREATE OR REPLACE FUNCTION trg_fichas_visita_atualizada_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizada_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'fichas_visita_atualizada_em'
  ) THEN
    CREATE TRIGGER fichas_visita_atualizada_em
    BEFORE UPDATE ON fichas_visita
    FOR EACH ROW EXECUTE FUNCTION trg_fichas_visita_atualizada_em();
  END IF;
END$$;

COMMENT ON TABLE fichas_visita IS
  'Fichas de campo digitalizadas (manutenção, inspeção, medição etc). Tabela única — payload específico por tipo na coluna dados (JSONB). Cronologia unificada com PDFs do HD via cod_tipo_documento.';

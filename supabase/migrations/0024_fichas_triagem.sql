-- =============================================================================
-- Migration 0024 — Tabela `fichas_triagem` (staging de fichas pré-aprovação)
-- =============================================================================
-- Contexto: ficha enviada pelo app móvel não entra direto em `fichas_visita`.
-- Passa por triagem manual de aprovador. Ver ADR-0008 §2.1.
--
-- Diferenças em relação ao ADR-0008 §2.1 (decisões aprovadas em 2026-05-08):
--   - O lock NÃO está inline aqui (`revisor_id`, `revisor_lock_expira_em`).
--     Foi extraído para tabela `triagem_locks` (migration 0026), permitindo
--     UNIQUE composto e invariantes mais fortes (um lock vivo por ficha).
--   - Coluna `idempotency_key UUID NULL` adicionada — opcional. Quando o app
--     manda no header `Idempotency-Key`, gravamos aqui. UNIQUE por
--     (tecnico_id, idempotency_key) garante que re-submissões com mesma key
--     em janela de tempo curto não duplicam ficha.
--   - Coluna `ficha_origem_id UUID NULL` aponta pra ficha de triagem anterior
--     em caso de re-envio após `devolvida`. Preserva linhagem.
--
-- Esta migration também adiciona `substitui_ficha_id` em `fichas_visita`
-- (decisão #4 do ADR-0008 §7) — campo necessário para tratar reabertura
-- de ficha aprovada por engano (cria-se uma nova ficha que substitui).
--
-- Idempotente via IF NOT EXISTS + DO $$. Reversível via:
--   DROP TABLE fichas_triagem;
--   ALTER TABLE fichas_visita DROP COLUMN IF EXISTS substitui_ficha_id;
-- =============================================================================

CREATE TABLE IF NOT EXISTS fichas_triagem (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  prefixo             VARCHAR(32)  NOT NULL REFERENCES postos (prefixo) ON UPDATE CASCADE,
  cod_tipo_documento  SMALLINT     NOT NULL REFERENCES tipos_documento (codigo),

  data_visita         DATE         NOT NULL,
  hora_inicio         TIME         NULL,
  hora_fim            TIME         NULL,

  -- Identificação do técnico (autor)
  tecnico_id          UUID         NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  tecnico_nome        TEXT         NOT NULL,

  -- GPS capturado pelo dispositivo
  latitude_capturada  NUMERIC(10,7) NULL,
  longitude_capturada NUMERIC(10,7) NULL,
  precisao_gps_m      NUMERIC(8,2)  NULL,

  observacoes         TEXT         NULL,
  dados               JSONB        NOT NULL DEFAULT '{}'::jsonb,

  origem              VARCHAR(16)  NOT NULL DEFAULT 'app_campo',

  -- Ciclo de vida (máquina de estados)
  estado              VARCHAR(16)  NOT NULL DEFAULT 'pendente',
  motivo_decisao      TEXT         NULL,
  decidida_por        UUID         NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  decidida_em         TIMESTAMPTZ  NULL,

  -- Promoção pra fichas_visita (preenchido só quando aprovada)
  ficha_visita_id     UUID         NULL REFERENCES fichas_visita (id) ON DELETE SET NULL,

  -- Linhagem (re-envio após devolvida)
  ficha_origem_id     UUID         NULL REFERENCES fichas_triagem (id) ON DELETE SET NULL,

  -- Idempotência opcional via header `Idempotency-Key` (UUID v4 do cliente)
  idempotency_key     UUID         NULL,

  criada_em           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizada_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_fichas_triagem_origem
    CHECK (origem IN ('app_campo', 'web_simulada', 'importacao')),

  -- 5 estados da máquina (spec §4.1)
  CONSTRAINT chk_fichas_triagem_estado
    CHECK (estado IN ('pendente', 'em_revisao', 'aprovada', 'rejeitada', 'devolvida')),

  -- Aprovada ⇒ existe ficha_visita_id + decidida (invariante de promoção atômica)
  CONSTRAINT chk_fichas_triagem_aprovada
    CHECK (
      (estado = 'aprovada'
        AND ficha_visita_id IS NOT NULL
        AND decidida_em IS NOT NULL
        AND decidida_por IS NOT NULL)
      OR (estado <> 'aprovada')
    ),

  -- Rejeitada/devolvida ⇒ motivo ≥ 20 chars (spec §4.3)
  CONSTRAINT chk_fichas_triagem_motivo
    CHECK (
      (estado IN ('rejeitada', 'devolvida')
        AND motivo_decisao IS NOT NULL
        AND length(motivo_decisao) >= 20
        AND decidida_em IS NOT NULL
        AND decidida_por IS NOT NULL)
      OR (estado NOT IN ('rejeitada', 'devolvida'))
    ),

  -- Pendente/em_revisao ⇒ sem decisão registrada
  CONSTRAINT chk_fichas_triagem_sem_decisao
    CHECK (
      (estado IN ('pendente', 'em_revisao')
        AND decidida_em IS NULL
        AND decidida_por IS NULL
        AND ficha_visita_id IS NULL)
      OR (estado NOT IN ('pendente', 'em_revisao'))
    ),

  CONSTRAINT chk_fichas_triagem_horas
    CHECK (hora_fim IS NULL OR hora_inicio IS NULL OR hora_fim >= hora_inicio)
);

-- Índices: acessos típicos do aprovador (lista de pendentes ordenada por data)
-- e do técnico (minhas fichas).
CREATE INDEX IF NOT EXISTS idx_fichas_triagem_estado_criada
  ON fichas_triagem (estado, criada_em DESC);

CREATE INDEX IF NOT EXISTS idx_fichas_triagem_tecnico
  ON fichas_triagem (tecnico_id, criada_em DESC);

CREATE INDEX IF NOT EXISTS idx_fichas_triagem_prefixo
  ON fichas_triagem (prefixo, criada_em DESC);

CREATE INDEX IF NOT EXISTS idx_fichas_triagem_tipo
  ON fichas_triagem (cod_tipo_documento);

-- Idempotência: par (tecnico_id, idempotency_key) único quando o header é
-- enviado. Permite que o app re-tente envio após falha de rede sem duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fichas_triagem_idempotency
  ON fichas_triagem (tecnico_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Trigger pra manter `atualizada_em` fresca. Reusa função criada na 0022.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'fichas_triagem_atualizada_em'
  ) THEN
    CREATE TRIGGER fichas_triagem_atualizada_em
    BEFORE UPDATE ON fichas_triagem
    FOR EACH ROW EXECUTE FUNCTION trg_fichas_visita_atualizada_em();
  END IF;
END$$;

REVOKE UPDATE, DELETE ON fichas_triagem FROM PUBLIC;

COMMENT ON TABLE fichas_triagem IS
  'Staging de fichas digitais antes da aprovação. Promovida pra fichas_visita só após aprovação humana. Ver ADR-0008 e docs/spec-modulo-mobile.md §3-4.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Reabertura de ficha aprovada — campo `substitui_ficha_id` em fichas_visita.
-- Quando uma ficha aprovada precisa ser corrigida, criamos uma NOVA ficha que
-- aponta pra original (decisão #4, ADR-0008 §7). Original permanece imutável,
-- substituta tem registro da relação. Dashboard pode ocultar substituídas.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE fichas_visita
  ADD COLUMN IF NOT EXISTS substitui_ficha_id UUID NULL REFERENCES fichas_visita (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fichas_visita_substitui
  ON fichas_visita (substitui_ficha_id)
  WHERE substitui_ficha_id IS NOT NULL;

COMMENT ON COLUMN fichas_visita.substitui_ficha_id IS
  'Quando preenchida, indica que esta ficha substitui outra (correção pós-aprovação). A ficha original permanece imutável. Ver ADR-0008 §7.';

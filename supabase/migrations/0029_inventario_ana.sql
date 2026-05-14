-- =============================================================================
-- Migration 0029, módulo Inventário ANA (Meta I.6 do PROGESTÃO 3).
-- =============================================================================
-- Contexto: a ANA mantém inventário oficial de estações de monitoramento
-- hidrológico do estado. A SPÁguas recebe ciclicamente planilha com
-- "dúvidas" (estações com inconsistência de coordenada, código, datas,
-- duplicata, município, rio ou sub-bacia) que precisam ser revisadas e
-- devolvidas no prazo da meta.
--
-- O ciclo atual (2026) tem 2.371 estações no inventário, 703 com
-- observação pendente, prazo 18/05/2026. Ver ADR-0011.
--
-- Esta migration cria 3 tabelas:
--   ana_revisao_lote    pacote de revisão (uma planilha = um lote)
--   ana_revisao_estacao linha-a-linha do inventário, com cruzamento opcional
--                       para a tabela `postos` interna
--   ana_revisao_evento  audit trail (governo.md §4, LGPD)
--
-- Estações ANA NUNCA alteram `postos` direto. Toda correção fica isolada em
-- `ana_revisao_estacao.correcoes` (JSONB) até promoção explícita pelo
-- aprovador. Defesa em profundidade: importação não vaza para a base oficial.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lote de revisão (upload de planilha)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ana_revisao_lote (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nome               TEXT         NOT NULL,
  arquivo_origem     TEXT         NULL,
  hash_sha256        CHAR(64)     NULL,
  total_estacoes     INTEGER      NOT NULL DEFAULT 0,
  total_pendencias   INTEGER      NOT NULL DEFAULT 0,
  prazo_resposta     DATE         NULL,
  criado_por         UUID         NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  criado_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  observacao         TEXT         NULL
);

COMMENT ON TABLE ana_revisao_lote IS
  'Pacote de revisão ANA. Uma planilha de Dúvidas = um lote. Ciclos PROGESTÃO geram um lote a cada rodada.';

-- -----------------------------------------------------------------------------
-- 2. Estação do inventário ANA (uma linha por estação na planilha)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ana_revisao_estacao (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id                  UUID         NOT NULL REFERENCES ana_revisao_lote (id) ON DELETE CASCADE,

  -- Chaves naturais
  codigo_ana               TEXT         NOT NULL,
  codigo_adicional         TEXT         NULL,

  -- Dados originais da planilha (snapshot read-only)
  nome                     TEXT         NULL,
  latitude                 NUMERIC      NULL,
  longitude                NUMERIC      NULL,
  altitude                 NUMERIC      NULL,
  area_drenagem_km2        NUMERIC      NULL,
  bacia_codigo             TEXT         NULL,
  bacia_nome               TEXT         NULL,
  subbacia_codigo          TEXT         NULL,
  subbacia_nome            TEXT         NULL,
  rio_codigo               TEXT         NULL,
  rio_nome                 TEXT         NULL,
  estado_sigla             TEXT         NULL,
  municipio_codigo         TEXT         NULL,
  municipio_nome           TEXT         NULL,
  responsavel_sigla        TEXT         NULL,
  estacao_tipo             TEXT         NULL,

  -- Pares de datas de operação por tipo de medição
  escala_inicio            DATE         NULL,
  escala_fim               DATE         NULL,
  descarga_liquida_inicio  DATE         NULL,
  descarga_liquida_fim     DATE         NULL,
  sedimentos_inicio        DATE         NULL,
  sedimentos_fim           DATE         NULL,
  qualidade_inicio         DATE         NULL,
  qualidade_fim            DATE         NULL,
  pluviometro_inicio       DATE         NULL,
  pluviometro_fim          DATE         NULL,
  telemetria_inicio        DATE         NULL,
  telemetria_fim           DATE         NULL,

  operando                 BOOLEAN      NULL,

  observacao_1             TEXT         NULL,
  observacao_2             TEXT         NULL,
  observacao_3             TEXT         NULL,
  observacao_4             TEXT         NULL,
  observacao_5             TEXT         NULL,

  -- Cruzamento com a base interna
  posto_id                 UUID         NULL REFERENCES postos (id) ON DELETE SET NULL,
  match_tipo               TEXT         NULL
                                        CHECK (match_tipo IN (
                                          'codigo_ana',
                                          'codigo_adicional',
                                          'manual',
                                          'sem_match'
                                        )),

  -- Estado de revisão
  status                   TEXT         NOT NULL DEFAULT 'pendente'
                                        CHECK (status IN (
                                          'pendente',
                                          'em_revisao',
                                          'revisada',
                                          'descartada',
                                          'sem_match',
                                          'promovida_a_posto'
                                        )),

  -- Valores corrigidos. Map { campo: novo_valor }. Vazio se sem correção.
  correcoes                JSONB        NOT NULL DEFAULT '{}'::jsonb,
  justificativa            TEXT         NULL,

  revisado_por             UUID         NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  revisado_em              TIMESTAMPTZ  NULL,

  criado_em                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (lote_id, codigo_ana)
);

COMMENT ON TABLE ana_revisao_estacao IS
  'Linha-a-linha do inventário ANA. correcoes JSONB mantém alterações pendentes sem tocar postos.';

CREATE INDEX IF NOT EXISTS idx_ana_revisao_estacao_lote_status
  ON ana_revisao_estacao (lote_id, status);

CREATE INDEX IF NOT EXISTS idx_ana_revisao_estacao_lote_operando
  ON ana_revisao_estacao (lote_id, operando);

CREATE INDEX IF NOT EXISTS idx_ana_revisao_estacao_posto
  ON ana_revisao_estacao (posto_id) WHERE posto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ana_revisao_estacao_codigo_ana
  ON ana_revisao_estacao (codigo_ana);

CREATE INDEX IF NOT EXISTS idx_ana_revisao_estacao_codigo_adicional
  ON ana_revisao_estacao (codigo_adicional) WHERE codigo_adicional IS NOT NULL;

-- Índice para filtrar pendências reais (com observação preenchida)
CREATE INDEX IF NOT EXISTS idx_ana_revisao_estacao_com_obs
  ON ana_revisao_estacao (lote_id)
  WHERE observacao_1 IS NOT NULL OR observacao_2 IS NOT NULL
     OR observacao_3 IS NOT NULL OR observacao_4 IS NOT NULL
     OR observacao_5 IS NOT NULL;

-- Trigger pra atualizado_em
CREATE OR REPLACE FUNCTION trg_ana_revisao_estacao_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'ana_revisao_estacao_atualizado_em'
  ) THEN
    CREATE TRIGGER ana_revisao_estacao_atualizado_em
    BEFORE UPDATE ON ana_revisao_estacao
    FOR EACH ROW EXECUTE FUNCTION trg_ana_revisao_estacao_atualizado_em();
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- 3. Audit trail (governo.md, LGPD)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ana_revisao_evento (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  estacao_id      UUID         NOT NULL REFERENCES ana_revisao_estacao (id) ON DELETE CASCADE,
  evento          TEXT         NOT NULL
                              CHECK (evento IN (
                                'criada',
                                'cruzada_com_posto',
                                'corrigida_auto',
                                'corrigida_manual',
                                'revisada',
                                'descartada',
                                'restaurada',
                                'promovida_a_posto',
                                'exportada',
                                'justificada'
                              )),
  ator_id         UUID         NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  valores_antes   JSONB        NULL,
  valores_depois  JSONB        NULL,
  observacao      TEXT         NULL,
  ip              INET         NULL,
  user_agent      TEXT         NULL,
  ocorreu_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ana_revisao_evento IS
  'Audit trail das ações sobre estações ANA. Imutável (sem UPDATE, sem DELETE em produção).';

CREATE INDEX IF NOT EXISTS idx_ana_revisao_evento_estacao_data
  ON ana_revisao_evento (estacao_id, ocorreu_em DESC);

CREATE INDEX IF NOT EXISTS idx_ana_revisao_evento_evento_data
  ON ana_revisao_evento (evento, ocorreu_em DESC);

REVOKE UPDATE, DELETE ON ana_revisao_evento FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 4. View de pendências (consumida pelo painel e pela fila)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ana_revisao_pendencias AS
SELECT
  e.lote_id,
  COUNT(*)                                                 AS total,
  COUNT(*) FILTER (WHERE e.operando = TRUE)                AS operando,
  COUNT(*) FILTER (WHERE e.operando = FALSE)               AS desativadas,
  COUNT(*) FILTER (WHERE e.posto_id IS NULL)               AS sem_match,
  COUNT(*) FILTER (WHERE e.status = 'pendente')            AS status_pendente,
  COUNT(*) FILTER (WHERE e.status = 'em_revisao')          AS status_em_revisao,
  COUNT(*) FILTER (WHERE e.status = 'revisada')            AS status_revisada,
  COUNT(*) FILTER (WHERE e.status = 'descartada')          AS status_descartada,
  COUNT(*) FILTER (WHERE e.status = 'promovida_a_posto')   AS status_promovida
FROM ana_revisao_estacao e
WHERE (
  e.observacao_1 IS NOT NULL OR e.observacao_2 IS NOT NULL
  OR e.observacao_3 IS NOT NULL OR e.observacao_4 IS NOT NULL
  OR e.observacao_5 IS NOT NULL
)
GROUP BY e.lote_id;

COMMENT ON VIEW v_ana_revisao_pendencias IS
  'Agregação de pendências por lote (estações com observação). Usado pelo painel e badge da sidenav.';

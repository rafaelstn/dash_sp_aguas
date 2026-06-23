-- =============================================================================
-- Migration 0046, modulo Monitor Pluviometrico, tabela de leituras.
-- =============================================================================
-- Contexto: serie temporal de chuva por estacao, importada do antigo Monitor
-- (origem `readings`) para o nosso esquema PT-BR. Cada linha guarda a leitura
-- de um instante, com os dois canais de medicao (manual e automatico) na mesma
-- linha, como no prototipo.
--
-- Equivalencia de campos (antigo => novo):
--   readings.id            => id (bigserial, mantido)
--   readings.station_id    => estacao_id (agora UUID -> estacoes_pluviometricas)
--   readings.timestamp     => momento (timestamp renomeado; nome reservado)
--   readings.manual_mm     => manual_mm
--   readings.automatico_mm => automatico_mm
--   readings.created_at    => criado_em
--
-- ON DELETE CASCADE: apagar a estacao apaga as leituras dela (serie nao faz
-- sentido sem a estacao, e nao ha audit trail de leitura a preservar).
--
-- Decisao sobre unicidade (idempotencia de ingestao):
--   Aplicamos UNIQUE (estacao_id, momento). Uma estacao tem no maximo UMA
--   leitura por instante: os canais manual e automatico ja sao colunas da
--   mesma linha, nao linhas separadas. Com isso a importacao do SIBH pode usar
--   ON CONFLICT (estacao_id, momento) DO UPDATE e reprocessar lotes sem
--   duplicar serie (retry seguro). O indice unico (estacao_id, momento)
--   tambem serve as consultas que filtram por estacao, entao NAO criamos um
--   indice separado so em estacao_id (seria redundante; o unico ja cobre o
--   prefixo estacao_id). Mantemos indice em momento para janelas temporais
--   que varrem todas as estacoes.
--
-- Idempotente: CREATE TABLE / CREATE INDEX IF NOT EXISTS.
-- Reversivel: DROP TABLE IF EXISTS leituras_pluviometricas.
-- =============================================================================

CREATE TABLE IF NOT EXISTS leituras_pluviometricas (
  id             BIGSERIAL    PRIMARY KEY,
  estacao_id     UUID         NOT NULL REFERENCES estacoes_pluviometricas (id) ON DELETE CASCADE,
  momento        TIMESTAMPTZ  NOT NULL,
  manual_mm      DOUBLE PRECISION NOT NULL DEFAULT 0,
  automatico_mm  DOUBLE PRECISION NOT NULL DEFAULT 0,
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (estacao_id, momento)
);

COMMENT ON TABLE leituras_pluviometricas IS
  'Serie temporal de chuva por estacao (origem SIBH). UNIQUE (estacao_id, momento) garante idempotencia da ingestao via ON CONFLICT.';

-- janela temporal varrendo todas as estacoes (graficos do painel).
CREATE INDEX IF NOT EXISTS idx_leituras_pluviometricas_momento
  ON leituras_pluviometricas (momento);

-- -----------------------------------------------------------------------------
-- RLS: defesa em profundidade (segue o padrao da migration 0040).
-- Deny by default: RLS habilitada, sem policy para anon nem authenticated. O
-- backend conecta via role com BYPASSRLS. Policies abertas do prototipo
-- Lovable descartadas de proposito.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS leituras_pluviometricas ENABLE ROW LEVEL SECURITY;

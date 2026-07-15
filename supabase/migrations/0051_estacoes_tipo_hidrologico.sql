-- =============================================================================
-- Migration 0051, modulo Monitor: coluna `tipo_estacao` (tipo hidrologico) nas
-- estacoes.
-- =============================================================================
-- Contexto: a tabela `estacoes_pluviometricas` (migration 0045) so guardava
-- estacoes pluviometricas. O Monitor passa a suportar os tres tipos
-- hidrologicos do SIBH: pluviometrico (chuva), fluviometrico (nivel/cota) e
-- piezometrico (agua subterranea). Trazemos esse dado do SIBH
-- (`station_type_id`) para filtrar e pintar o mapa por tipo hidrologico.
--
-- ATENCAO ao nome da tabela: `estacoes_pluviometricas` passa a guardar tambem
-- fluviometricas e piezometricas. O nome fica por divida tecnica (renomear e
-- alto risco); registrado em ADR. A coluna nova carrega a semantica correta.
--
-- Distincao de dimensoes (nao confundir):
--   tipo          => canal de medicao: manual | automatico (migration 0045).
--   tipo_estacao  => tipo hidrologico: pluviometrico | fluviometrico |
--                    piezometrico (esta migration). Espelha `station_type_id`.
--
-- Backfill: DEFAULT 'pluviometrico'. As linhas atuais sao todas pluviometricas
-- (o sync so importava esse tipo ate aqui), entao o default preenche o passado
-- corretamente, sem UPDATE explicito.
--
-- Portabilidade: ADD COLUMN com DEFAULT constante e CHECK funciona igual em
-- Postgres e SQLite. Sem sintaxe especifica de um so banco.
--
-- Idempotente: ADD COLUMN / CREATE INDEX IF NOT EXISTS.
-- Reversivel: ver bloco comentado ao final.
-- =============================================================================

ALTER TABLE IF EXISTS estacoes_pluviometricas
  ADD COLUMN IF NOT EXISTS tipo_estacao TEXT NOT NULL DEFAULT 'pluviometrico'
    CHECK (tipo_estacao IN ('pluviometrico', 'fluviometrico', 'piezometrico'));

COMMENT ON COLUMN estacoes_pluviometricas.tipo_estacao IS
  'Tipo hidrologico da estacao (SIBH station_type_id): pluviometrico | fluviometrico | piezometrico. Distinto de `tipo` (canal manual/automatico).';

-- Filtro por tipo hidrologico no painel/mapa.
CREATE INDEX IF NOT EXISTS idx_estacoes_pluviometricas_tipo_estacao
  ON estacoes_pluviometricas (tipo_estacao);

-- -----------------------------------------------------------------------------
-- Reversao (rollback manual):
--   DROP INDEX IF EXISTS idx_estacoes_pluviometricas_tipo_estacao;
--   ALTER TABLE IF EXISTS estacoes_pluviometricas DROP COLUMN IF EXISTS tipo_estacao;
-- -----------------------------------------------------------------------------

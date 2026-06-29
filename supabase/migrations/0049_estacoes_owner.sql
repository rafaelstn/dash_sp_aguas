-- =============================================================================
-- Migration 0049, modulo Monitor: coluna `owner` (entidade responsavel) nas
-- estacoes pluviometricas.
-- =============================================================================
-- Contexto: o mapa do Monitor pintava todas as estacoes da mesma cor. O SIBH
-- expoe a entidade responsavel por cada estacao no campo cru `station_owner`
-- (ex.: SP AGUAS, CEMADEN, ANA, CETESB, SABESP, SAISP, IAC, INMET). Trazemos
-- esse dado para colorir e filtrar por entidade, como no painel oficial.
--
-- Equivalencia: stations.station_owner => owner.
--
-- Nullable: estacoes antigas ficam NULL ate o proximo sync do SIBH preencher
-- (upsert por prefixo). NULL e tratado como "Outros" na exibicao.
--
-- Idempotente: ADD COLUMN / CREATE INDEX IF NOT EXISTS.
-- Reversivel: ALTER TABLE ... DROP COLUMN IF EXISTS owner.
-- =============================================================================

ALTER TABLE IF EXISTS estacoes_pluviometricas
  ADD COLUMN IF NOT EXISTS owner TEXT NULL;

COMMENT ON COLUMN estacoes_pluviometricas.owner IS
  'Entidade responsavel pela estacao (SIBH station_owner). NULL = nao informado, exibido como "Outros".';

-- Filtro por entidade no painel.
CREATE INDEX IF NOT EXISTS idx_estacoes_pluviometricas_owner
  ON estacoes_pluviometricas (owner);

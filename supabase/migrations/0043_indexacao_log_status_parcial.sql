-- =============================================================================
-- Migration 0043 — `indexacao_log.status` aceita 'parcial'
-- =============================================================================
-- Os indexers (ops/indexer/index_fs.py e indexar_posto.py) passaram a marcar
-- uma execução como 'parcial' quando algum chunk/batch deu rollback: parte dos
-- arquivos foi gravada, parte não. Antes o status virava 'ok' mesmo assim, e os
-- contadores reportavam mais linhas do que de fato persistiram. O CHECK
-- original só permitia ('em_andamento','ok','erro'); aqui adicionamos
-- 'parcial' sem perder os valores existentes.

DO $$
BEGIN
  -- Remove o CHECK antigo (nome gerado pelo Postgres na criação inline na 0007).
  IF EXISTS (
    SELECT 1
      FROM information_schema.constraint_column_usage ccu
      JOIN information_schema.check_constraints cc
        ON cc.constraint_name = ccu.constraint_name
     WHERE ccu.table_name = 'indexacao_log'
       AND ccu.column_name = 'status'
       AND cc.check_clause LIKE '%em_andamento%'
       AND cc.check_clause NOT LIKE '%parcial%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE indexacao_log DROP CONSTRAINT ' || quote_ident(cc.constraint_name)
        FROM information_schema.constraint_column_usage ccu
        JOIN information_schema.check_constraints cc
          ON cc.constraint_name = ccu.constraint_name
       WHERE ccu.table_name = 'indexacao_log'
         AND ccu.column_name = 'status'
         AND cc.check_clause LIKE '%em_andamento%'
         AND cc.check_clause NOT LIKE '%parcial%'
       LIMIT 1
    );
  END IF;

  -- (Re)cria o CHECK com 'parcial' incluído, idempotente por nome fixo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indexacao_log_status_check_v2'
  ) THEN
    ALTER TABLE indexacao_log
      ADD CONSTRAINT indexacao_log_status_check_v2
      CHECK (status IN ('em_andamento','ok','parcial','erro'));
  END IF;
END$$;

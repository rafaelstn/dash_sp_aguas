-- =============================================================================
-- Migration 0053, modulo Monitor: status de transmissao das estacoes ("online").
-- =============================================================================
-- Contexto: o Monitor precisa contar quantas estacoes estao ONLINE
-- (transmitindo). A definicao (portada do painel oficial sao-paulo-rain-map,
-- useStations.ts) depende de dois campos que o SIBH expoe por estacao mas que a
-- tabela ainda nao guardava:
--   - station.transmission_status   -> 'ok' | 'pendente' | (outros)
--   - station.date_last_measurement -> momento da ultima medicao transmitida
--
-- Regra de "online" (derivada em codigo, nao no banco):
--   - piezometrica: online se tem ultima_transmissao (status nao conta).
--   - pluviometrica/fluviometrica: online se transmission_status = 'ok' E tem
--     ultima_transmissao.
--
-- Colunas:
--   - transmission_status TEXT NULL: valores LIVRES do SIBH. SEM CHECK rigido de
--     proposito (o SIBH pode introduzir outros valores; um CHECK quebraria o sync
--     no futuro). NULL quando o SIBH nao informa.
--   - ultima_transmissao TIMESTAMPTZ NULL: momento da ultima medicao. A origem
--     (`date_last_measurement`) chega como string do Date#toString() do JS, que
--     o parser de timestamptz NAO aceita; o codigo (repo/mock/script de import)
--     normaliza para ISO 8601 UTC ANTES de gravar. NULL quando ausente ('').
--
-- Sem indice: as colunas so sao lidas junto com a linha da estacao (a contagem
-- de "online" e feita em memoria sobre a lista ja carregada), nao ha WHERE/JOIN
-- por elas que justifique indice.
--
-- Portabilidade: ADD COLUMN IF NOT EXISTS com tipos padrao. TIMESTAMPTZ no
-- Postgres; em SQLite (testes) o tipo e apenas afinidade textual, sem quebrar.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- Reversivel: ver bloco comentado ao final.
-- =============================================================================

ALTER TABLE IF EXISTS estacoes_pluviometricas
  ADD COLUMN IF NOT EXISTS transmission_status TEXT NULL;

ALTER TABLE IF EXISTS estacoes_pluviometricas
  ADD COLUMN IF NOT EXISTS ultima_transmissao TIMESTAMPTZ NULL;

COMMENT ON COLUMN estacoes_pluviometricas.transmission_status IS
  'Status de transmissao cru do SIBH (station.transmission_status): ok | pendente | outros. NULL se nao informado. Deriva "online" (por tipo) junto com ultima_transmissao. Sem CHECK: valores livres do SIBH.';

COMMENT ON COLUMN estacoes_pluviometricas.ultima_transmissao IS
  'Momento da ultima medicao transmitida (SIBH station.date_last_measurement), normalizado para timestamptz UTC. NULL se ausente. Estacao "online" exige este campo preenchido (piezo) ou ele + transmission_status = ok (pluvio/fluvio).';

-- -----------------------------------------------------------------------------
-- Reversao (rollback manual):
--   ALTER TABLE IF EXISTS estacoes_pluviometricas DROP COLUMN IF EXISTS ultima_transmissao;
--   ALTER TABLE IF EXISTS estacoes_pluviometricas DROP COLUMN IF EXISTS transmission_status;
-- -----------------------------------------------------------------------------

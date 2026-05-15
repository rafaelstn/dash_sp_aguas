-- 0039: Resposta SPÁguas para estações ANA sem match em postos.
--
-- Contexto: 56 estações ANA com divergência geo aberta não existem no
-- inventário SPÁguas (sem match em postos). 46 delas têm sugestão de
-- município pelo polígono IBGE (PostGIS), 10 estão fora de SP.
--
-- Como postos é a fonte da verdade para estações DA SPÁGUAS e essas 56
-- não são nossas, criamos campos resposta_* na própria ana_revisao_estacao
-- para guardar o que vai sair na planilha de devolução para a ANA.
--
-- Princípio mantido: a snapshot ANA (lat/lng/municipio_nome originais)
-- continua imutável. resposta_* é o "valor SPÁguas para o export".
--
-- Ordem de prioridade no export: postos (se houver match) > resposta_*
-- (se preenchida) > snapshot ANA (fallback).

ALTER TABLE ana_revisao_estacao
  ADD COLUMN IF NOT EXISTS resposta_municipio_codigo character(7),
  ADD COLUMN IF NOT EXISTS resposta_municipio_nome   text,
  ADD COLUMN IF NOT EXISTS resposta_latitude         numeric,
  ADD COLUMN IF NOT EXISTS resposta_longitude        numeric,
  ADD COLUMN IF NOT EXISTS resposta_justificativa    text,
  ADD COLUMN IF NOT EXISTS resposta_fonte            text;

COMMENT ON COLUMN ana_revisao_estacao.resposta_municipio_codigo IS
  'Código IBGE do município que será mandado para a ANA (centroide IBGE ou ajuste manual).';
COMMENT ON COLUMN ana_revisao_estacao.resposta_municipio_nome IS
  'Nome do município que será mandado para a ANA.';
COMMENT ON COLUMN ana_revisao_estacao.resposta_latitude IS
  'Latitude que será mandada para a ANA (centroide IBGE ou ajuste manual).';
COMMENT ON COLUMN ana_revisao_estacao.resposta_longitude IS
  'Longitude que será mandada para a ANA.';
COMMENT ON COLUMN ana_revisao_estacao.resposta_justificativa IS
  'Texto livre da resposta SPÁguas para a ANA (vai na coluna JUSTIFICATIVA_SPAGUAS).';
COMMENT ON COLUMN ana_revisao_estacao.resposta_fonte IS
  'Origem da resposta: postgis_ibge | manual_aprovador | sem_correcao.';

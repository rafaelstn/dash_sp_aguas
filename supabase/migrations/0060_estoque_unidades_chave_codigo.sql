-- =============================================================================
-- Migration 0060, modulo Estoque: corrige a chave natural da unidade serializada.
-- =============================================================================
-- Contexto (bug de modelagem provado com o dado real da carga inicial): a 0057
-- assumiu que `codigo_spaguas` (coluna CODIGOSPAGUAS da planilha) era o patrimonio
-- UNICO por unidade e criou `uq_estoque_unidades_codigo_spaguas`. O dado real
-- desmente: na aba GERAL PENHA a coluna CODIGOSPAGUAS vale "SPA26" em TODAS as
-- ~800 linhas (e um codigo de LOTE/projeto, nao por unidade). O identificador
-- unico POR UNIDADE e a coluna `codigo` (CODIGO / CODIGO MATERIAL): "1SPA26PENHA",
-- "2SPA26PENHA", ..., "001SPA26Arara".
--
-- Correcao:
--   1. Remove o indice unico sobre `codigo_spaguas` (invariante errado: o valor
--      e lote, repete entre unidades; manter o unico quebraria o import no 2o insert).
--   2. Cria indice unico PARCIAL sobre `codigo` (o verdadeiro identificador por
--      unidade). MODENS nao tem `codigo` (usam IMEI em numero_serie) => codigo NULL
--      fica de fora do indice parcial (WHERE codigo IS NOT NULL), sem conflito.
--   3. Mantem `codigo_spaguas` consultavel (filtro por lote) num indice NAO-unico.
--
-- Aditiva, idempotente (IF EXISTS / IF NOT EXISTS), reversivel (recriar o unique
-- antigo e dropar os novos). Aplicar ANTES de reimportar a carga inicial.
-- =============================================================================

-- 1) Invariante errado: codigo_spaguas NAO e unico (e lote/projeto).
DROP INDEX IF EXISTS uq_estoque_unidades_codigo_spaguas;

-- 2) Identificador real por unidade: codigo (unico quando preenchido).
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_unidades_codigo
  ON estoque_unidades (codigo) WHERE codigo IS NOT NULL;

-- 3) codigo_spaguas continua util para filtrar por lote/projeto, sem unicidade.
CREATE INDEX IF NOT EXISTS idx_estoque_unidades_codigo_spaguas
  ON estoque_unidades (codigo_spaguas) WHERE codigo_spaguas IS NOT NULL;

-- Documenta a semantica corrigida para o proximo mantenedor (anti-misnomer).
COMMENT ON COLUMN estoque_unidades.codigo IS
  'CODIGO / CODIGO MATERIAL da planilha. Identificador UNICO por unidade fisica (uq_estoque_unidades_codigo).';
COMMENT ON COLUMN estoque_unidades.codigo_spaguas IS
  'CODIGOSPAGUAS da planilha. NAO e unico: pode ser codigo de LOTE/projeto (ex. "SPA26" repetido em toda a GERAL PENHA). Apenas indexado para filtro.';

-- =============================================================================
-- Migration 0057, modulo Estoque, unidades serializadas (1 linha = 1 item).
-- =============================================================================
-- Contexto: itens serializados (pluviometro, PCD, modem, barco, gerador...).
-- Cada item fisico e uma linha, auto-descritiva (serie/imei/patrimonio +
-- descricao/marca/modelo denormalizados). material_id OPCIONAL (agrupamento
-- best-effort do catalogo). Design: ADR 0020 §2.2.
--
-- observacao guarda o TEXTO BRUTO original da planilha (o de-para de `estado`
-- deriva dela sem substituir). chave_import da idempotencia ao import.
--
-- Idempotente / reversivel / RLS deny-by-default (padrao 0040/0045).
-- Depende de: 0056 (estoque_materiais), 0054 (estoque_locais).
-- =============================================================================

CREATE TABLE IF NOT EXISTS estoque_unidades (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id      UUID         NULL REFERENCES estoque_materiais (id) ON DELETE SET NULL, -- agrupamento opcional
  -- identidade / patrimonio (podem faltar; 'S/N','SN','?' viram null no import)
  codigo           TEXT         NULL,   -- CODIGO / CODIGO MATERIAL
  codigo_spaguas   TEXT         NULL,   -- CODIGOSPAGUAS (chave natural preferida quando existir)
  pat_daee         TEXT         NULL,   -- PAT.DAEE
  outros_pat       TEXT         NULL,   -- OUTROS PAT.
  numero_serie     TEXT         NULL,   -- NUMERO DE SERIE / IMEI (modem)
  helice           TEXT         NULL,   -- especifico de pluviometro
  -- descricao denormalizada (a unidade se descreve mesmo sem catalogo)
  descricao        TEXT         NOT NULL,
  marca            TEXT         NULL,
  modelo           TEXT         NULL,
  -- condicao e ciclo de vida
  estado           TEXT         NULL CHECK (estado IN ('novo', 'bom', 'usado', 'defeito', 'sucata')),
  status           TEXT         NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'defeito', 'descarte')),
  local_id         UUID         NULL REFERENCES estoque_locais (id) ON DELETE SET NULL,
  data_aquisicao   DATE         NULL,
  observacao       TEXT         NULL,   -- texto original bruto da planilha (preserva o de-para do estado)
  chave_import     TEXT         NULL,   -- chave natural deterministica do import (idempotencia)
  criado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE estoque_unidades IS
  'Itens serializados do estoque (1 linha = 1 item fisico). material_id opcional (agrupamento). observacao = texto bruto da planilha; estado derivado por de-para. chave_import da idempotencia ao import.';

-- idempotencia do import: nao duplica a mesma unidade fisica ao reprocessar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_unidades_chave_import
  ON estoque_unidades (chave_import) WHERE chave_import IS NOT NULL;

-- unicidade de patrimonio quando existir (integridade real do inventario).
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_unidades_codigo_spaguas
  ON estoque_unidades (codigo_spaguas) WHERE codigo_spaguas IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_unidades_local
  ON estoque_unidades (local_id) WHERE local_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_unidades_material
  ON estoque_unidades (material_id) WHERE material_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_unidades_status
  ON estoque_unidades (status);
CREATE INDEX IF NOT EXISTS idx_estoque_unidades_serie
  ON estoque_unidades (numero_serie) WHERE numero_serie IS NOT NULL;

ALTER TABLE IF EXISTS estoque_unidades ENABLE ROW LEVEL SECURITY;

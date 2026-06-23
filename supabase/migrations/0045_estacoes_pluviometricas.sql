-- =============================================================================
-- Migration 0045, modulo Monitor Pluviometrico, tabela de estacoes.
-- =============================================================================
-- Contexto: estamos consolidando dentro do dashboard Next dois modulos antigos
-- (prototipos Lovable), num banco unico. Esta migration traz a tabela de
-- estacoes pluviometricas do antigo Monitor (origem `stations`) para o nosso
-- esquema PT-BR, ja preparada para cruzar com o catalogo interno `postos`.
--
-- Equivalencia de campos (antigo => novo):
--   stations.id          => id (passa a UUID, nao serial; chave estavel)
--   stations.name        => nome
--   stations.lat         => lat
--   stations.lng         => lng
--   stations.type        => tipo (manual | automatico)
--   stations.basin       => bacia
--   stations.created_at  => criado_em
--
-- Campos novos:
--   prefixo   codigo da estacao no SIBH (fonte oficial dos dados reais). Pode
--             chegar nulo enquanto a estacao nao esta conciliada; quando
--             preenchido deve ser unico (indice parcial unico).
--   posto_id  vinculo opcional ao catalogo `postos`. ON DELETE SET NULL: se o
--             posto sai do catalogo a estacao continua, so perde o vinculo.
--   sibh_id   identificador do registro no SIBH, para reconciliacao futura.
--
-- Decisao: NAO ha seed. O prototipo trazia 5 estacoes de exemplo, descartadas.
-- Os dados reais virao do SIBH em task posterior.
--
-- Idempotente: CREATE TABLE / CREATE INDEX IF NOT EXISTS.
-- Reversivel: DROP TABLE IF EXISTS estacoes_pluviometricas.
-- =============================================================================

CREATE TABLE IF NOT EXISTS estacoes_pluviometricas (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  prefixo     TEXT         NULL,
  nome        TEXT         NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  tipo        TEXT         NOT NULL CHECK (tipo IN ('manual', 'automatico')),
  bacia       TEXT         NULL,
  posto_id    UUID         NULL REFERENCES postos (id) ON DELETE SET NULL,
  sibh_id     TEXT         NULL,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE estacoes_pluviometricas IS
  'Estacoes do Monitor Pluviometrico (origem SIBH). prefixo unico quando preenchido, posto_id cruza com o catalogo interno.';

-- prefixo unico apenas entre valores nao nulos (varias estacoes podem estar
-- sem prefixo durante a conciliacao, mas dois prefixos iguais sao proibidos).
CREATE UNIQUE INDEX IF NOT EXISTS uq_estacoes_pluviometricas_prefixo
  ON estacoes_pluviometricas (prefixo)
  WHERE prefixo IS NOT NULL;

-- vinculo ao catalogo, indexado so onde existe.
CREATE INDEX IF NOT EXISTS idx_estacoes_pluviometricas_posto
  ON estacoes_pluviometricas (posto_id)
  WHERE posto_id IS NOT NULL;

-- filtragem por bacia no painel.
CREATE INDEX IF NOT EXISTS idx_estacoes_pluviometricas_bacia
  ON estacoes_pluviometricas (bacia);

-- -----------------------------------------------------------------------------
-- RLS: defesa em profundidade (segue o padrao da migration 0040).
-- O backend Next conecta via role com BYPASSRLS (pooler Supabase) e aplica os
-- checks de autorizacao na aplicacao. RLS aqui e a segunda barreira: deny by
-- default. NAO criamos policy para anon nem authenticated (sem policy => nega
-- tudo), exatamente como o 0040 faz nas tabelas operacionais. As policies
-- abertas do prototipo Lovable foram descartadas de proposito.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS estacoes_pluviometricas ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Migration 0071, modulo Estoque: desconformidades da carga (fila de correcao).
-- =============================================================================
-- Contexto: o importador (scripts/estoque/importar-inventario.mjs) detecta dado
-- que ele NAO tem como decidir sozinho (item com etiqueta e sem descricao, chave
-- repetida, identificador de patrimonio em mais de uma unidade, leitura de
-- etiqueta diferente do codigo, descricao suspeita, quantidade vazia, coluna sem
-- cabecalho). Ate aqui isso so saia no console; na carga de 16/09/2026 foram 27.
-- Esta tabela torna cada aviso um registro que o operador ve e trata na aba
-- "Desconformidades" do estoque.
--
-- Idempotencia: `chave` identifica o ASSUNTO do aviso (tipo + aba + linha + o
-- sujeito proprio do tipo, montado no importador). Reprocessar a planilha faz
-- ON CONFLICT (chave) DO UPDATE so de detalhe/dados/ultima_deteccao_em: nunca
-- duplica e nunca reabre o que o operador resolveu ou ignorou.
--
-- Coerencia (CHECK): aberta nao carrega decisao; resolvida/ignorada carrega nota
-- nao vazia, quem e quando. `resolvida_por` vem sempre do auth do backend.
--
-- Idempotente (IF NOT EXISTS) / RLS deny-by-default (padrao 0054 a 0059): o
-- backend conecta com BYPASSRLS e autoriza na aplicacao; sem policy nega tudo.
-- Reversao: DROP TABLE IF EXISTS estoque_desconformidades;
-- Depende de: 0057 (estoque_unidades).
-- =============================================================================

CREATE TABLE IF NOT EXISTS estoque_desconformidades (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                TEXT         NOT NULL CHECK (tipo IN (
                                     'item_sem_descricao',
                                     'chave_repetida',
                                     'identificador_repetido',
                                     'leitura_diferente_do_codigo',
                                     'descricao_suspeita',
                                     'quantidade_vazia',
                                     'coluna_sem_cabecalho'
                                   )),
  origem              TEXT         NOT NULL DEFAULT 'importacao_planilha',
  aba                 TEXT         NULL,
  linha               INTEGER      NULL CHECK (linha IS NULL OR linha >= 1),
  detalhe             TEXT         NOT NULL CHECK (btrim(detalhe) <> ''),
  dados               JSONB        NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dados) = 'object'),
  chave               TEXT         NOT NULL,
  status              TEXT         NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'resolvida', 'ignorada')),
  nota                TEXT         NULL,
  -- ligacao com o cadastro quando a correcao virou unidade serializada
  unidade_id          UUID         NULL REFERENCES estoque_unidades (id) ON DELETE SET NULL,
  resolvida_por       UUID         NULL,   -- auth do backend (nunca do corpo)
  resolvida_em        TIMESTAMPTZ  NULL,
  detectada_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ultima_deteccao_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_estoque_desconformidades_chave UNIQUE (chave),
  -- aberta: sem decisao nenhuma (reabrir limpa tudo)
  CONSTRAINT ck_estoque_desconf_aberta CHECK (
    status <> 'aberta' OR (
      nota IS NULL AND unidade_id IS NULL AND resolvida_por IS NULL AND resolvida_em IS NULL
    )
  ),
  -- resolvida/ignorada: nota nao vazia, quem e quando
  CONSTRAINT ck_estoque_desconf_decidida CHECK (
    status = 'aberta' OR (
      nota IS NOT NULL AND btrim(nota) <> ''
      AND resolvida_por IS NOT NULL AND resolvida_em IS NOT NULL
    )
  )
);

COMMENT ON TABLE estoque_desconformidades IS
  'Desconformidades detectadas na carga do estoque que exigem decisao humana. chave = assunto do aviso (idempotencia do importador). Reprocessar atualiza detalhe/dados/ultima_deteccao_em e nunca reabre. Design: docs/arquitetura/modulo-estoque.md secao 3.7.';
COMMENT ON COLUMN estoque_desconformidades.chave IS
  'Hash estavel do assunto do aviso (tipo + aba + linha + sujeito do tipo). ON CONFLICT desta coluna nao toca status/nota/resolvida_*.';
COMMENT ON COLUMN estoque_desconformidades.dados IS
  'Valores brutos da planilha que o operador precisa para decidir (objeto JSON). Sem dado pessoal.';
COMMENT ON COLUMN estoque_desconformidades.ultima_deteccao_em IS
  'Ultima carga que ainda detectou o aviso. Anterior a carga mais recente indica que a planilha deixou de apresentar o problema.';

CREATE INDEX IF NOT EXISTS idx_estoque_desconf_status_tipo
  ON estoque_desconformidades (status, tipo);

ALTER TABLE IF EXISTS estoque_desconformidades ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Migration 0031, prepara `postos` como FONTE ÚNICA da verdade da rede SPÁguas.
-- =============================================================================
-- Contexto: decisão Rafael 2026-05-14. A tabela `postos` deixa de ser
-- read-only no sistema. Toda correção (ANA Meta I.6, edição manual,
-- cadastro de posto novo) passa a escrever DIRETO aqui. Tabelas paralelas
-- (`ana_revisao_estacao.correcoes` JSONB) deixam de armazenar verdade e
-- viram somente snapshot histórico do que a ANA mandou.
--
-- Ver ADR-0012 (próxima).
--
-- O que esta migration faz:
--   1. Adiciona 12 colunas em `postos` para as datas de medição ANA (Meta I.6).
--      Sem isso, `postos` não consegue espelhar todos os 42 campos da planilha
--      ANA, e o export sairia incompleto.
--   2. Adiciona `deleted_at` (soft delete) em `postos`. DELETE real fica
--      proibido em produção, reverter erro vira UPDATE deleted_at = NULL.
--   3. Adiciona `origem` em `postos` (rastreabilidade: importacao_csv,
--      ana_promocao, edicao_manual, etc).
--   4. Cria tabela `postos_evento` (audit trail imutável de toda mudança em
--      `postos`). Equivalente ao `ana_revisao_evento` mas pra postos.
--      Atende governo.md §4 LGPD e banco.md OWASP A09 (Logging).
--   5. Cria trigger pra `postos.atualizado_em` (já existe `updated_at`;
--      garante consistência).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colunas ANA Meta I.6 em postos
-- -----------------------------------------------------------------------------
-- Pares início/fim por tipo de medição (mesmo formato da aba DÚVIDAS ANA).
-- DATE NULL: estação pode ter algumas medições e outras não.
ALTER TABLE postos
  ADD COLUMN IF NOT EXISTS ana_escala_inicio            DATE NULL,
  ADD COLUMN IF NOT EXISTS ana_escala_fim               DATE NULL,
  ADD COLUMN IF NOT EXISTS ana_descarga_liquida_inicio  DATE NULL,
  ADD COLUMN IF NOT EXISTS ana_descarga_liquida_fim     DATE NULL,
  ADD COLUMN IF NOT EXISTS ana_sedimentos_inicio        DATE NULL,
  ADD COLUMN IF NOT EXISTS ana_sedimentos_fim           DATE NULL,
  ADD COLUMN IF NOT EXISTS ana_qualidade_inicio         DATE NULL,
  ADD COLUMN IF NOT EXISTS ana_qualidade_fim            DATE NULL,
  ADD COLUMN IF NOT EXISTS ana_pluviometro_inicio       DATE NULL,
  ADD COLUMN IF NOT EXISTS ana_pluviometro_fim          DATE NULL,
  ADD COLUMN IF NOT EXISTS ana_telemetria_inicio        DATE NULL,
  ADD COLUMN IF NOT EXISTS ana_telemetria_fim           DATE NULL;

COMMENT ON COLUMN postos.ana_escala_inicio IS
  'Data de início da medição de Escala. Espelha a planilha ANA Meta I.6.';
COMMENT ON COLUMN postos.ana_escala_fim IS
  'Data de fim da medição de Escala. NULL = ativa. Espelha planilha ANA.';

-- -----------------------------------------------------------------------------
-- 2. Soft delete + origem
-- -----------------------------------------------------------------------------
ALTER TABLE postos
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS origem TEXT NULL DEFAULT 'importacao_csv';

COMMENT ON COLUMN postos.deleted_at IS
  'Soft delete. NULL = ativo. Permite reverter remoção errônea (UPDATE deleted_at = NULL).';

COMMENT ON COLUMN postos.origem IS
  'Origem do cadastro: importacao_csv (planilha SP inicial) | ana_promocao_manual | ana_promocao_bulk | ana_promocao_automatica | edicao_manual.';

-- Backfill: postos atuais vieram da importação inicial
UPDATE postos SET origem = 'importacao_csv' WHERE origem IS NULL;

-- Índice parcial para queries de "postos ativos" (excluir soft-deleted)
CREATE INDEX IF NOT EXISTS idx_postos_ativos
  ON postos (id)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Tabela `postos_evento` (audit imutável)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS postos_evento (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id               UUID         NOT NULL REFERENCES postos (id) ON DELETE CASCADE,
  evento                 TEXT         NOT NULL
                                      CHECK (evento IN (
                                        'criado',
                                        'atualizado',
                                        'removido',
                                        'restaurado',
                                        'promovido_de_ana_revisao',
                                        'corrigido_em_lote'
                                      )),
  ator_id                UUID         NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  valores_antes          JSONB        NULL,
  valores_depois         JSONB        NULL,
  origem_evento          TEXT         NULL,
  referencia_externa_id  UUID         NULL,
  observacao             TEXT         NULL,
  ip                     INET         NULL,
  user_agent             TEXT         NULL,
  ocorreu_em             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE postos_evento IS
  'Audit trail imutável de toda mudança em postos. INSERT-only (UPDATE e DELETE proibidos para non-admin). Atende governo.md §4 LGPD e banco.md OWASP A09.';

COMMENT ON COLUMN postos_evento.referencia_externa_id IS
  'Quando o evento veio de outra origem (ex: ana_revisao_estacao.id em promoção ANA), aponta para o registro de origem.';

CREATE INDEX IF NOT EXISTS idx_postos_evento_posto_data
  ON postos_evento (posto_id, ocorreu_em DESC);

CREATE INDEX IF NOT EXISTS idx_postos_evento_evento
  ON postos_evento (evento, ocorreu_em DESC);

CREATE INDEX IF NOT EXISTS idx_postos_evento_referencia
  ON postos_evento (referencia_externa_id)
  WHERE referencia_externa_id IS NOT NULL;

-- Proibe UPDATE e DELETE no nível do role PUBLIC (defesa em profundidade
-- contra mutação acidental do audit trail; service_role do Supabase
-- bypassa, mas papel `app` da aplicação respeita).
REVOKE UPDATE, DELETE ON postos_evento FROM PUBLIC;

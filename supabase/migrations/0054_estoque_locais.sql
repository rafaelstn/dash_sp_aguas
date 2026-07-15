-- =============================================================================
-- Migration 0054, modulo Estoque (almoxarifado / patrimonio), tabela de locais.
-- =============================================================================
-- Contexto: modulo de inventario fisico da SP Aguas em 2 unidades (PENHA,
-- ARARAQUARA). Design em docs/arquitetura/modulo-estoque.md e ADR 0020.
--
-- `estoque_locais` guarda ONDE o item esta (unidade + sala/prateleira/armario).
-- Serve tanto para serializados (estoque_unidades.local_id) quanto para o saldo
-- de quantificaveis (estoque_saldos.local_id). O import normaliza a localizacao
-- suja da planilha e faz get-or-create pela chave natural (nao duplica local).
--
-- Idempotente: CREATE TABLE / CREATE INDEX IF NOT EXISTS.
-- Reversivel: DROP TABLE IF EXISTS estoque_locais.
-- RLS deny-by-default (padrao da migration 0040/0045): backend conecta com
-- BYPASSRLS e aplica autorizacao na aplicacao; sem policy => nega tudo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS estoque_locais (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade     TEXT         NOT NULL CHECK (unidade IN ('PENHA', 'ARARAQUARA')),
  sala        TEXT         NULL,
  prateleira  TEXT         NULL,   -- guarda prateleira OU armario (o que a planilha trouxer)
  armario     TEXT         NULL,
  rotulo      TEXT         NOT NULL,   -- normalizado, legivel: ex. "PENHA / SALA 2 / PRAT 5B"
  observacao  TEXT         NULL,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE estoque_locais IS
  'Locais fisicos do estoque (unidade PENHA/ARARAQUARA + sala/prateleira/armario). Chave natural normalizada evita duplicata no import (get-or-create).';

-- natural key normalizada: nao duplica local no import nem entre reexecucoes.
-- COALESCE espelha a normalizacao do dominio (normalizarLocal): null vira ''.
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_locais_chave
  ON estoque_locais (unidade, COALESCE(sala, ''), COALESCE(prateleira, ''), COALESCE(armario, ''));

CREATE INDEX IF NOT EXISTS idx_estoque_locais_unidade
  ON estoque_locais (unidade);

ALTER TABLE IF EXISTS estoque_locais ENABLE ROW LEVEL SECURITY;

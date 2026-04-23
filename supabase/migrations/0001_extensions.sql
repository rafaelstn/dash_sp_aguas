-- =============================================================================
-- Migration 0001 — Extensões necessárias para FTS pt-BR e busca fuzzy
-- =============================================================================
-- Ambiente: PostgreSQL >= 14 (Supabase ou instância em território nacional).
-- Idempotente: pode ser re-executada sem erro.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- pgvector: NÃO habilitado no MVP. Previsto para Fase 3 (busca semântica).
-- CREATE EXTENSION IF NOT EXISTS "vector";

-- ---------------------------------------------------------------------------
-- Wrapper IMMUTABLE para unaccent()
-- ---------------------------------------------------------------------------
-- Motivo: colunas GENERATED ALWAYS AS ... STORED exigem que todas as funções
-- chamadas sejam IMMUTABLE. O unaccent() da extensão homônima é declarado como
-- STABLE (depende do dicionário configurado), logo o Postgres rejeita com
-- "generation expression is not immutable". O wrapper abaixo fixa o dicionário
-- ('unaccent') e se declara IMMUTABLE — solução canônica documentada pelo
-- Supabase para FTS com normalização de acentos.
--
-- Uso: f_unaccent(texto) no lugar de unaccent(texto) em colunas generated
-- e índices funcionais.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.f_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE PARALLEL SAFE
  AS $$
    SELECT unaccent('unaccent', $1);
  $$;

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

-- =============================================================================
-- Migration 0008 — Tabela `tipos_documento` (seed imutável — 7 valores oficiais)
-- =============================================================================
-- Enum de tipos de documento extraído da documentação oficial SPÁguas (22/04/2026).
-- Codigo corresponde ao segmento CodDoc do nome do arquivo PDF.
-- Alteração de seed requer nova migration; não editar diretamente em produção.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tipos_documento (
  codigo  SMALLINT PRIMARY KEY,
  rotulo  TEXT     NOT NULL UNIQUE
);

INSERT INTO tipos_documento (codigo, rotulo) VALUES
  (1, 'Ficha Descritiva'),
  (2, 'PCD'),
  (3, 'Inspeção'),
  (4, 'Nivelamento'),
  (5, 'Levantamento de Seção'),
  (6, 'Troca de Observador'),
  (7, 'Vazão')
ON CONFLICT (codigo) DO UPDATE SET rotulo = EXCLUDED.rotulo;

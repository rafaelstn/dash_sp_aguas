-- =============================================================================
-- Migration 0016 — Suporte ao Modelo B (repositório CTHDOC) em `arquivos_indexados`
-- =============================================================================
-- Contexto: além do Modelo A (arquivos nomeados pelo prefixo do posto, em
-- subpasta do TipoDado), o HD do cliente mantém um segundo repositório
-- histórico em `DOCUMENTOS-CTHDOC-RECUPERAÇÃO\REPOSITORIO\{numero}.pdf`, onde
-- o nome do arquivo é um número sequencial e o vínculo com o posto só existe
-- na planilha `relacao_doc_arquivos_cthdoc.xlsx` (ver docs/repositorio-cliente.md §3).
--
-- Esta migration adiciona:
--   - `numero_arquivo`        — o número sequencial do PDF (ex.: '138639')
--   - `origem_mapeamento`     — de onde veio a associação posto↔arquivo:
--                               'NOME' (parse do nome, Modelo A) ou
--                               'PLANILHA_XLSX' (lookup na planilha, Modelo B)
--   - índice em numero_arquivo pra lookup rápido da UI.
--
-- Idempotente via IF NOT EXISTS; CHECK em bloco DO $$ pra tolerar reexec.
-- =============================================================================

ALTER TABLE arquivos_indexados
  ADD COLUMN IF NOT EXISTS numero_arquivo    TEXT,
  ADD COLUMN IF NOT EXISTS origem_mapeamento VARCHAR(16) NOT NULL DEFAULT 'NOME';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_arquivos_origem_mapeamento'
  ) THEN
    ALTER TABLE arquivos_indexados
      ADD CONSTRAINT chk_arquivos_origem_mapeamento
        CHECK (origem_mapeamento IN ('NOME', 'PLANILHA_XLSX'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_arquivos_numero_arquivo
  ON arquivos_indexados (numero_arquivo)
  WHERE numero_arquivo IS NOT NULL;

COMMENT ON COLUMN arquivos_indexados.numero_arquivo IS
  'Número sequencial do PDF no repositório CTHDOC (ex.: ''138639''). NULL para Modelo A.';

COMMENT ON COLUMN arquivos_indexados.origem_mapeamento IS
  'Como o arquivo foi vinculado ao posto: ''NOME'' (parse do nome — Modelo A) ou ''PLANILHA_XLSX'' (lookup em relacao_doc_arquivos_cthdoc.xlsx — Modelo B).';

-- =============================================================================
-- Migration 0012 — View `v_postos_desconformes`
-- =============================================================================
-- Classifica prefixo principal e prefixo ANA por regex POSIX (operador `~`),
-- sem materialização. Volume de 2484 linhas não justifica materialização;
-- a lógica de classificação pode mudar com novas documentações do cliente
-- e a view permite ajuste via DROP/CREATE sem backfill.
-- =============================================================================

CREATE OR REPLACE VIEW v_postos_desconformes AS
WITH classificacao AS (
  SELECT
    p.id,
    p.prefixo,
    p.prefixo_ana,
    CASE
      WHEN p.prefixo ~ '^[0-9][A-Z]-[0-9]{3}$'      THEN 'conforme_fluviometria'
      WHEN p.prefixo ~ '^[A-Z][0-9]-[0-9]{3}$'      THEN 'conforme_pluviometria'
      WHEN p.prefixo ~ '^[0-9][A-Z]-[0-9]{3}[A-Z]$' THEN 'conforme_piezometria'
      WHEN p.prefixo ~ '^[A-Z]{4}[0-9]{4,5}$'       THEN 'conforme_qualiagua'
      WHEN p.prefixo ~ '^[A-Z][0-9]-[0-9]{3}[A-Z]$' THEN 'suspeita_troca_letra_digito'
      WHEN p.prefixo ~ '^[A-Z]{3}[0-9]{3}\?$'       THEN 'placeholder_interrogacao'
      ELSE                                               'outlier_prefixo'
    END AS classe_prefixo,
    CASE
      WHEN p.prefixo_ana IS NULL OR p.prefixo_ana = '' THEN 'vazio'
      WHEN p.prefixo_ana ~ '^[0-9]{8}$'                 THEN 'conforme'
      WHEN p.prefixo_ana ~ '^[0-9]{7}$'                 THEN 'faltando_zero_esquerda'
      ELSE                                                   'outlier_ana'
    END AS classe_prefixo_ana
  FROM postos p
)
SELECT
  id,
  prefixo,
  prefixo_ana,
  classe_prefixo,
  classe_prefixo_ana,
  CASE classe_prefixo
    WHEN 'suspeita_troca_letra_digito' THEN
      'Verificar inversão de posição entre letra e dígito iniciais. Ex.: "' ||
        prefixo || '" provavelmente deveria seguir o padrão "' ||
        substring(prefixo FROM 2 FOR 1) || substring(prefixo FROM 1 FOR 1) ||
        substring(prefixo FROM 3) || '".'
    WHEN 'placeholder_interrogacao' THEN
      'Placeholder sem cadastro definitivo (interrogação literal). Confirmar numeração com a equipe SPÁguas.'
    WHEN 'outlier_prefixo' THEN
      'Prefixo fora de qualquer padrão oficial. Revisar cadastro na planilha-fonte.'
    ELSE NULL
  END AS sugestao_prefixo,
  CASE classe_prefixo_ana
    WHEN 'faltando_zero_esquerda' THEN
      'Preencher com zero à esquerda até atingir 8 dígitos: "' ||
        prefixo_ana || '" -> "' || LPAD(prefixo_ana, 8, '0') || '".'
    WHEN 'outlier_ana' THEN
      'Código ANA fora do padrão oficial de 8 dígitos. Revisar cadastro na planilha-fonte.'
    ELSE NULL
  END AS sugestao_prefixo_ana
FROM classificacao
WHERE classe_prefixo NOT LIKE 'conforme_%'
   OR classe_prefixo_ana IN ('faltando_zero_esquerda', 'outlier_ana');

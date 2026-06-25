-- =============================================================================
-- Migration 0048 — Anonimização de PII de rede na trilha de auditoria (LGPD-4)
-- =============================================================================
-- A trilha de auditoria registra `ip` e `user_agent` (dado pessoal indireto)
-- para sustentar a rastreabilidade exigida pela rule de governo. A LGPD
-- (art. 15 e 16: término do tratamento e prazo de retenção; art. 6º, III e V:
-- necessidade e minimização) exige que esse dado pessoal não seja mantido por
-- prazo indefinido.
--
-- Política adotada: o EVENTO da trilha (quem, quando, o quê) é imutável e
-- permanece; apenas os metadados de rede (`ip`, `user_agent`) são anonimizados
-- (NULL) após o prazo de retenção. Assim a auditoria continua íntegra e a PII
-- de rede some quando deixa de ser necessária.
--
-- Prazo padrão: 180 dias (6 meses). Ajustável por parâmetro na chamada.
--
-- A função é SECURITY DEFINER porque as tabelas de trilha têm UPDATE/DELETE
-- revogados do PUBLIC (imutabilidade do conteúdo). A anonimização de PII após
-- retenção é a exceção legítima e controlada a essa imutabilidade — restrita,
-- por construção, às colunas `ip` e `user_agent`.
-- =============================================================================

CREATE OR REPLACE FUNCTION anonimizar_trilha_auditoria(dias_retencao INTEGER DEFAULT 180)
RETURNS TABLE (tabela TEXT, linhas_anonimizadas BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  corte TIMESTAMPTZ := NOW() - make_interval(days => dias_retencao);
  afetadas BIGINT;
BEGIN
  IF dias_retencao < 1 THEN
    RAISE EXCEPTION 'dias_retencao deve ser >= 1 (recebido %)', dias_retencao;
  END IF;

  UPDATE acesso_ficha
     SET ip = NULL, user_agent = NULL
   WHERE ocorreu_em < corte
     AND (ip IS NOT NULL OR user_agent IS NOT NULL);
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  tabela := 'acesso_ficha'; linhas_anonimizadas := afetadas; RETURN NEXT;

  UPDATE triagem_eventos
     SET ip = NULL, user_agent = NULL
   WHERE ocorreu_em < corte
     AND (ip IS NOT NULL OR user_agent IS NOT NULL);
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  tabela := 'triagem_eventos'; linhas_anonimizadas := afetadas; RETURN NEXT;

  UPDATE ana_revisao_evento
     SET ip = NULL, user_agent = NULL
   WHERE ocorreu_em < corte
     AND (ip IS NOT NULL OR user_agent IS NOT NULL);
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  tabela := 'ana_revisao_evento'; linhas_anonimizadas := afetadas; RETURN NEXT;

  UPDATE postos_evento
     SET ip = NULL, user_agent = NULL
   WHERE ocorreu_em < corte
     AND (ip IS NOT NULL OR user_agent IS NOT NULL);
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  tabela := 'postos_evento'; linhas_anonimizadas := afetadas; RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION anonimizar_trilha_auditoria(INTEGER) IS
  'LGPD-4: anonimiza ip/user_agent (NULL) na trilha de auditoria mais antiga que o prazo de retenção (padrão 180 dias), mantendo o evento. Idempotente. Rodar periodicamente via scripts/manutencao/anonimizar_trilha_lgpd.py.';

-- Só o owner executa (a anonimização é operação administrativa).
REVOKE EXECUTE ON FUNCTION anonimizar_trilha_auditoria(INTEGER) FROM PUBLIC;

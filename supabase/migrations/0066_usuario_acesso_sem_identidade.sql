-- =============================================================================
-- Migration 0066: usuario institucional da janela SEM IDENTIDADE (PRODESP).
-- =============================================================================
-- Contexto: o sistema foi entregue ao servidor do orgao, que nao tem saida para
-- a internet. A autenticacao da Fase 1 e Supabase Auth (ADR-0004 e ADR-0006),
-- um servico de internet, portanto indisponivel naquele host. Enquanto o orgao
-- nao fornece a API de login propria, a aplicacao opera com
-- ACESSO_SEM_IDENTIDADE=sim e atribui toda requisicao a UM usuario
-- institucional (src/infrastructure/auth/acesso-sem-identidade.ts).
--
-- POR QUE ISTO E UMA LINHA NO BANCO, e nao apenas uma constante no codigo:
-- quatro chaves estrangeiras NOT NULL apontam para `auth.users` e RECUSAM a
-- escrita se a linha nao existir. Sem esta migration, criar ficha de triagem ou
-- favoritar posto estoura violacao de FK no meio do fluxo, com mensagem opaca:
--
--   postos_favoritos.usuario_id   -> auth.users(id) ON DELETE CASCADE  (0020)
--   usuarios_papeis.usuario_id    -> auth.users(id) ON DELETE CASCADE  (0023)
--   fichas_triagem.tecnico_id     -> auth.users(id) ON DELETE RESTRICT (0024)
--   triagem_locks.revisor_id      -> auth.users(id) ON DELETE CASCADE  (0026)
--
-- O e-mail e deliberadamente auto-explicativo. `postos-repository.pg.ts`
-- resolve o autor do evento por `SELECT email FROM auth.users WHERE id =
-- ator_id`; com a linha ausente aquilo devolve NULL e a tela de historico
-- renderiza "Automacao (sem ator humano)", ou seja, a trilha AFIRMARIA que um
-- robo fez o que uma pessoa fez. Uma trilha que mente e pior que uma trilha
-- vazia, e e exatamente o que a rule de governo existe para impedir.
--
-- O QUE ESTA MIGRATION NAO FAZ, e a omissao e a contencao principal desta
-- janela: ela NAO cria linha em `usuarios_papeis`. Sem essa linha,
-- `papeisRepository.obterPapel` cai em PAPEL_PADRAO = 'user' (menor
-- privilegio), e as operacoes privilegiadas se recusam sozinhas, sem depender
-- de codigo novo. Medido em 02/09/2026 com a aplicacao no ar: /api/triagem
-- responde 403 e /api/admin/usuarios responde 403, enquanto a leitura
-- (/api/estoque/saldos) responde 200. Conceder papel a este usuario e decisao
-- do proprietario, e transforma "qualquer um na rede le" em "qualquer um na
-- rede aprova ficha e administra usuarios".
--
-- Idempotente. Reversivel pelo par 0066_rollback.
-- =============================================================================

DO $$
DECLARE
  eh_stub boolean;
BEGIN
  -- `auth.users` tem duas encarnacoes possiveis e escrever na errada quebra o
  -- deploy: no Supabase gerenciado ela e do GoTrue, com varias colunas NOT NULL
  -- (aud, role, encrypted_password, ...) que um INSERT de duas colunas nao
  -- satisfaz; no servidor do orgao ela e a casca de `db/auth-compat.sql`, com
  -- apenas id, email e created_at. A deteccao e por PRESENCA DE COLUNA, que e um
  -- fato do schema, e nao por variavel de ambiente, que a migration nao ve.
  SELECT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name = 'users'
      AND column_name = 'encrypted_password'
  ) INTO eh_stub;

  IF NOT eh_stub THEN
    RAISE NOTICE 'auth.users e do GoTrue (Supabase gerenciado): usuario institucional NAO inserido. A janela sem identidade nao se aplica a este ambiente.';
    RETURN;
  END IF;

  INSERT INTO auth.users (id, email)
  VALUES ('00000000-0000-4000-8000-000000000001', 'acesso-sem-identidade@dmo.local')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Usuario institucional da janela sem identidade garantido em auth.users.';
END
$$;

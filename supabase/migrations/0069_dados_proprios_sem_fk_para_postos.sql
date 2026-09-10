-- =============================================================================
-- Migration 0069: os dados proprios do sistema deixam de ter chave estrangeira
-- para o cadastro de postos, que passou a ser lido ao vivo do orgao.
-- =============================================================================
-- INCIDENTE QUE ORIGINA ESTA MIGRATION (medido em producao, 10/09/2026)
--
-- A tabela `postos` do nosso PostgreSQL esta com ZERO linha em producao, por
-- desenho: desde o ADR-0023 o cadastro de postos e lido ao vivo do `Dbfch`, o
-- SQL Server do orgao, sem copia. Ao mesmo tempo, NOVE restricoes de chave
-- estrangeira ligam as tabelas de dados proprios a `postos`. Elas foram criadas
-- quando o cadastro residia aqui e era populado; com o cadastro agora vazio,
-- passaram a RECUSAR a escrita de qualquer registro que se refira a um posto.
--
-- Efeito medido: gravar ficha de visita, ficha de triagem, favorito, foto de
-- posto, cache de indexacao ou caminho de posto falha com
--
--   insert or update on table "<tabela>" violates foreign key constraint
--   "<...>_fkey"  /  Key (prefixo)=(E3-036) is not present in table "postos".
--
-- E EXATAMENTE o mesmo acoplamento que a 0067 fechou para o Monitor (2.714
-- estacoes recusadas), tratado la para UMA tabela. O ADR-0023 (secao 2.3)
-- proibe qualquer acoplamento de integridade entre os dois armazenamentos; a
-- 0067 chamou a FK de `estacoes_pluviometricas` de "o nono ponto". Estes sao os
-- pontos restantes, medidos no catalogo de producao:
--
--   fichas_visita.prefixo               -> postos(prefixo)   NOT NULL
--   fichas_triagem.prefixo              -> postos(prefixo)   NOT NULL
--   postos_favoritos.prefixo            -> postos(prefixo)   NOT NULL
--   postos_fotos.prefixo                -> postos(prefixo)   NOT NULL
--   posto_indexacao_cache.prefixo       -> postos(prefixo)   PK
--   postos_caminhos.prefixo             -> postos(prefixo)   PK
--   postos_evento.posto_id              -> postos(id)        NOT NULL
--   ana_revisao_estacao.posto_id        -> postos(id)        NULL
--   ana_revisao_estacao.match_sugerido_posto_id -> postos(id) NULL
--
-- DECISAO
--
-- Some a RESTRICAO, ficam a COLUNA e o INDICE. Isto e diferente da 0067/0068,
-- e a diferenca importa:
--
--   As seis de `prefixo` nao carregam identidade do outro armazenamento: o
--   `prefixo` E a chave natural que os dois lados compartilham, e a navegacao
--   do produto ja e por ele (`/postos/{prefixo}`). Nao ha o que remover alem da
--   restricao. Cada uma das seis mantem indice proprio por `prefixo` (medido:
--   idx_fichas_visita_prefixo_data, idx_fichas_triagem_prefixo,
--   idx_postos_favoritos_prefixo, idx_postos_fotos_prefixo_data, e a PK nas
--   duas de indexacao), entao nao ha regressao de consulta.
--
--   As tres de `posto_id`/`match_sugerido_posto_id` carregam o `Postos.Id` do
--   orgao, e sao o caso literal da 0067. Aqui remove-se apenas a chave
--   estrangeira, e NAO a coluna: os caminhos que gravam `postos_evento` nao
--   rodam em producao hoje, e o modulo de inventario ANA le essas colunas em
--   JOIN local (que ja retorna vazio com `postos` vazia). Remover a coluna
--   exigiria refatorar aquele modulo, o que e escopo proprio e nao urgente. A
--   regua de catalogo (tests/integration/acoplamento-postos-fk-postgres.test.ts)
--   passa a recusar QUALQUER FK nova para `postos`, entao a divida nao cresce.
--
-- NENHUM DADO E ALTERADO. `DROP CONSTRAINT` nao toca linha.
--
-- ORDEM DE APLICACAO EM PRODUCAO
--
-- Esta migration pode ser aplicada ANTES do deploy da imagem nova, como a 0067:
-- sem as chaves estrangeiras, o codigo que ja esta rodando volta a gravar
-- ficha, favorito e foto imediatamente. Nao ha codigo novo que dependa dela.
--
-- ATENCAO, o que esta migration NAO resolve (e correcao de CODIGO, proximo
-- deploy): a aprovacao de triagem faz `SELECT ... FROM postos` para checar se o
-- posto esta ativo, e com `postos` vazia responde sempre "posto_inativo"; e o
-- "aceitar match" do inventario ANA escreve em `postos`, que e somente leitura
-- (ADR-0023). Estes dois ficam para o proximo deploy. A gravacao inicial da
-- ficha, que e o trabalho de campo, e o que esta migration restaura.
--
-- IDEMPOTENTE, e isso e requisito e nao cortesia: `db/migrate.sh` reaplica
-- TODOS os arquivos deste diretorio a cada subida, sem tabela de controle.
-- =============================================================================

-- As nove, pelo nome real medido no catalogo de producao em 10/09/2026.
-- Explicitas para serem auditaveis e para a guarda de texto poder confirma-las.
ALTER TABLE fichas_visita          DROP CONSTRAINT IF EXISTS fichas_visita_prefixo_fkey;
ALTER TABLE fichas_triagem         DROP CONSTRAINT IF EXISTS fichas_triagem_prefixo_fkey;
ALTER TABLE postos_favoritos       DROP CONSTRAINT IF EXISTS postos_favoritos_prefixo_fkey;
ALTER TABLE postos_fotos           DROP CONSTRAINT IF EXISTS postos_fotos_prefixo_fkey;
ALTER TABLE posto_indexacao_cache  DROP CONSTRAINT IF EXISTS posto_indexacao_cache_prefixo_fkey;
ALTER TABLE postos_caminhos        DROP CONSTRAINT IF EXISTS postos_caminhos_prefixo_fkey;
ALTER TABLE postos_evento          DROP CONSTRAINT IF EXISTS postos_evento_posto_id_fkey;
ALTER TABLE ana_revisao_estacao    DROP CONSTRAINT IF EXISTS ana_revisao_estacao_posto_id_fkey;
ALTER TABLE ana_revisao_estacao    DROP CONSTRAINT IF EXISTS ana_revisao_estacao_match_sugerido_posto_id_fkey;

-- Rede de seguranca: se alguma FK para `postos` tiver nome divergente do
-- literal acima (constraint criada com nome automatico diferente em alguma
-- base), o DROP explicito nao a alcanca e ela sobreviveria calada. Esta
-- varredura remove qualquer FK remanescente cujo alvo seja `postos`, seja qual
-- for o nome. A regua de catalogo confirma o efeito depois.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS tabela, conname
      FROM pg_constraint
     WHERE contype = 'f'
       AND confrelid = 'postos'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tabela, r.conname);
  END LOOP;
END
$$;

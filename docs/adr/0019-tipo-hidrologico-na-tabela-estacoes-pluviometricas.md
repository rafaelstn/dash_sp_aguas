# ADR 0019: tipo hidrológico (plu/flu/piezo) na tabela `estacoes_pluviometricas`

Data: 2026-07-15
Status: aceita
Contexto de decisão: Rafael (founder) aprovou a modelagem; execução por Matheus (CTO) com Lucas (backend).

## Contexto

O módulo Monitor nasceu como "mapa pluviométrico" (fase B2) e, por decisão de
arquitetura (ADR anterior da fase B), persiste o cadastro de estações do SIBH na
tabela `estacoes_pluviometricas` (migration 0045). O sync importava apenas
estações de tipo `pluviometrico` (`sincronizar-estacoes-pluviometricas.ts`).

Surgiu a necessidade de suportar os três tipos hidrológicos do SIBH no mapa:
pluviométrico, fluviométrico e piezométrico (o painel original,
`sao-paulo-rain-map`, já tinha essa navegação por tipo). O SIBH expõe o tipo em
`station_type_id` e o port `sibh-gateway` já normaliza para
`pluviometrico | fluviometrico | piezometrico | qualidade | desconhecido`.

A tabela tem uma coluna `tipo`, mas ela representa OUTRA dimensão: o canal de
medição (`manual` | `automatico`), não o tipo hidrológico.

## Decisão

1. NÃO renomear a tabela `estacoes_pluviometricas` nem o domínio/repos que a
   cercam. O nome passa a ser um misnomer (a tabela guardará também flu e
   piezo), mas a renomeação tocaria migration, domínio, ports, dois
   repositórios, API, contrato do cliente e testes, com risco alto num sistema
   de cliente governo em produção. O custo supera o benefício agora.

2. Adicionar a coluna `tipo_estacao` (migration 0051) para o tipo hidrológico:
   `TEXT NOT NULL DEFAULT 'pluviometrico' CHECK (tipo_estacao IN
   ('pluviometrico','fluviometrico','piezometrico'))`, com índice próprio. As
   linhas existentes (todas pluviométricas) são backfilladas pelo DEFAULT.

3. O sync passa a importar os três tipos hidrológicos (descartando `qualidade` e
   `desconhecido`) e grava `tipo_estacao`. A coluna `tipo` (manual/automatico)
   continua `automatico` para estação vinda do logger do SIBH.

## Consequências

- Positivas: mudança incremental, reversível (ADD COLUMN idempotente), sem
  quebrar contrato existente; portável entre Postgres (produção) e SQLite (teste).
- Débito de nome registrado: `estacoes_pluviometricas` guarda os três tipos. Uma
  renomeação para algo como `estacoes_hidrologicas` fica como refactor futuro,
  com migration dedicada e janela de deploy própria, se e quando valer o esforço.
- Deploy: coluna nova em tabela que o ORM já lê é fatal se o código subir antes
  do schema (o SELECT passa a incluir `tipo_estacao`). Ordem obrigatória:
  1) aplicar a 0051 no banco, 2) confirmar via `information_schema`, 3) push.
- Fase 2 (fora desta ADR): leitura/medição própria de cada tipo (nível em metros
  para flu e piezo) e gráficos correspondentes. Até lá, o painel de detalhe trata
  graciosamente estação não pluviométrica.

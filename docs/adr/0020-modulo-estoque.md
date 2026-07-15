# ADR 0020: modulo de Estoque (almoxarifado / patrimonio) com saldo mantido e ledger

Data: 2026-07-15
Status: aceita
Contexto de decisao: Rafael (founder) aprovou o escopo (modulo completo com movimentacao desde o
inicio). Design por Bruno (PO Engenharia); execucao por Lucas (backend) e Fernanda (frontend),
orquestrada por Matheus (CTO). Detalhamento em `docs/arquitetura/modulo-estoque.md`.

## Contexto

A SP Aguas mantem um inventario fisico em 2 unidades (PENHA, ARARAQUARA) hoje numa planilha, com
duas naturezas: itens **serializados** (1 unidade fisica por linha: pluviometros, PCDs, modems,
barcos, geradores) e itens **quantificaveis** (item + quantidade agregada: cabos, antenas, placas
solares). O Rafael decidiu que o modulo nasce completo com movimentacao (entrada, saida,
transferencia, baixa/descarte) e trilha de auditoria, com saldo consistente, aplicando a disciplina
de dado critico (transacao atomica, trilha, maquina de estados, saldo == soma das movimentacoes).
Nao e dinheiro (sem Decimal monetario), mas quantidade e inteira e vale nao-negativo.

Duas decisoes de modelagem nao triviais precisam ser fixadas antes da implementacao:
1. Para quantificaveis, o saldo deve ser **mantido** (coluna materializada) ou **derivado** (soma do
   ledger a cada leitura)?
2. Como serializado e quantificavel convivem num modelo coerente sem gambiarra?

## Decisao

1. **Saldo MANTIDO** em `estoque_saldos.quantidade`, atualizado na MESMA transacao da movimentacao.
   Nao-negativo garantido por `CHECK (quantidade >= 0)` mais UPDATE guardado atomico
   (`SET quantidade = quantidade - :q WHERE quantidade >= :q`, tratando `rows affected == 0` como
   `saldo_insuficiente`). O ledger `estoque_movimentacoes` e a verdade de auditoria (append-only); o
   saldo e projecao materializada, reconciliavel por `SUM` do ledger (`conciliar-saldos`).

2. **Modelo coerente serializado x quantificavel**:
   - `estoque_materiais` e o catalogo ("o que e") das duas naturezas, com coluna `natureza`.
   - Serializado: 1 linha por item em `estoque_unidades`, auto-descritiva (serie/imei/patrimonio +
     descricao/marca/modelo denormalizados), com `material_id` OPCIONAL (agrupamento best-effort).
   - Quantificavel: sem unidade individual; `material_id` obrigatorio e saldo por (material, local).
   - Movimentacao referencia unidade XOR material (CHECK), quantidade inteira `>= 1`.

3. **Enums e maquina de estados**: `estado` (condicao fisica: `novo|bom|usado|defeito|sucata`,
   nullable) separado de `status` (ciclo: `ativo|defeito|descarte`), com transicoes validas guardadas
   no dominio (`ativo<->defeito`, `ativo/defeito->descarte`, `descarte` terminal salvo ajuste com
   motivo). Texto sujo de condicao (OBSERVACAO) mapeado por de-para determinista, preservando sempre
   o bruto em `observacao`.

4. **Import** = carga inicial unica, script `.mjs` idempotente por chave natural
   (`codigo_spaguas`->`serie/imei`->`pat_daee`->`codigo`->hash), espelhando o import do Monitor.

5. **RBAC**: sem papel novo. Leitura com `exigirUsuario` (user consulta); escrita e movimentacao com
   `exigirAdmin` (admin/super_admin gerenciam). `usuario_id` do ledger vem sempre do auth do backend.

## Consequencias

- **Positivas**: leitura de saldo rapida (`SELECT` direto, sem `SUM` por request); nao-negativo
  garantido pelo banco sob concorrencia; trilha completa e auditavel (governo); saldo reconciliavel
  contra o ledger; modelo sem gambiarra (catalogo opcional para serializado evita normalizacao 1:1
  inutil das ~2000 linhas heterogeneas); migrations incrementais, idempotentes e reversiveis; tudo
  atras de ports com adapter mock para o MODO DEMO.
- **Custo/risco**: saldo mantido exige que TODA escrita passe pela transacao correta (nunca UPDATE
  direto na coluna fora do fluxo); mitigado concentrando a escrita no
  `estoque-movimentacoes-repository` e proibindo mutacao de saldo fora dele. O guarded UPDATE, o
  upsert e o CHECK sao features de Postgres: os testes tem que rodar contra Postgres real, nao so
  SQLite (aprendizado do projeto: teste verde em SQLite esconde bug de Postgres).
- **Deploy**: tabelas novas sao menos arriscadas que coluna nova em tabela existente, mas o codigo
  que le `estoque_*` nao pode subir antes das migrations. Ordem obrigatoria: 1) aplicar 0054-0059 no
  banco, 2) confirmar via `information_schema`, 3) push.

## Alternativas descartadas

- **Saldo derivado (SUM do ledger por leitura)**: descartado. Encareceria a leitura mais frequente do
  modulo e nao impoe nao-negativo de forma barata e atomica (precisaria bloquear/somar o ledger
  inteiro na escrita). O ledger continua sendo a fonte de verdade, mas como auditoria e reconciliacao,
  nao como calculo de saldo por request.
- **Catalogo obrigatorio para serializado (1 material por unidade)**: descartado. Geraria ~2000 linhas
  de catalogo 1:1 a partir de descricoes sujas e heterogeneas, sem beneficio; `material_id` opcional
  com dedup best-effort entrega o agrupamento util sem a explosao.
- **Uma unica tabela para serializado e quantificavel** (com `quantidade` e campos de serie na mesma
  linha): descartado. Misturaria dois modelos de identidade distintos (item unico vs saldo agregado),
  poluindo constraints e queries. Duas tabelas com um ledger comum e mais limpo e sustentavel.
- **Novo papel RBAC de "estoquista"**: descartado por ora. O RBAC atual (admin/super_admin gerenciam,
  user consulta) atende a decisao do Rafael; criar papel novo seria overengineering. Fica como
  evolucao futura se o cliente pedir separacao de responsabilidade dedicada.

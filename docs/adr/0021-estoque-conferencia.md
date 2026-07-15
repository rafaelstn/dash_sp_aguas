# ADR 0021: Conferencia fisica de estoque (inventario) reusando o ledger, reconciliacao por item

Data: 2026-07-15
Status: aceita
Contexto de decisao: sub-modulo do Estoque (ADR 0020). Design por Bruno (PO Engenharia); execucao por
Lucas (backend) e Fernanda (frontend), orquestrada por Matheus (CTO). Detalhamento em
`docs/arquitetura/estoque-conferencia.md`. Cliente GOVERNO (SP Aguas): rules `governo`, `padrao`,
`padrao-ui`.

## Contexto

O almoxarife da SP Aguas faz a contagem fisica do inventario e precisa que o sistema aponte as
DIVERGENCIAS entre o registro do sistema e o contado no fisico, e permita tratar (reconciliar) cada
divergencia com trilha de auditoria. O modulo de Estoque (ADR 0020) ja tem locais, catalogo, unidades
serializadas, saldos quantificaveis e um ledger append-only (`estoque_movimentacoes`) com saldo
mantido e maquina de estados. A conferencia precisa conversar com esse modelo, nao criar um paralelo.

Decisoes nao triviais a fixar antes da implementacao:
1. Como modelar a sessao e os itens de conferencia (uma tabela XOR ou duas por natureza)?
2. Como congelar o esperado para a divergencia ser estavel durante a contagem?
3. Como gerar o ajuste no estoque real reusando o ledger, de forma atomica e idempotente?
4. A reconciliacao e automatica ao concluir ou por item, sob decisao humana?
5. Como tratar serializado nao encontrado e itens "sobra" fora do snapshot?

## Decisao

1. **Sessao single-natureza + item unico com XOR de alvo.** `estoque_conferencias` carrega o escopo
   (unidade fisica + natureza + local opcional) e a natureza. `estoque_conferencia_itens` referencia
   unidade XOR material (CHECK `ck_estoque_conf_item_alvo`), espelhando o `ck_estoque_mov_alvo` do
   ledger. A "separacao por natureza" fica no nivel da SESSAO (cada sessao e de uma natureza so), o
   que da o modelo limpo sem duplicar tabela/port/repo de item. Um `CHECK` de natureza garante que
   serializado usa `situacao` e quantificavel usa `quantidade_sistema`.

2. **Snapshot congelado no ABRIR.** Abrir a sessao materializa o esperado do escopo numa `sql.begin`
   (INSERT da sessao + `INSERT ... SELECT` dos itens): serializado -> unidades `ativo|defeito` no
   escopo com seu `local_esperado`; quantificavel -> saldos positivos com `quantidade_sistema`
   congelada. A divergencia fica estavel mesmo com movimentacao concorrente durante a contagem.
   `diferenca` e coluna GENERATED (`quantidade_contada - quantidade_sistema`).

3. **Reconciliacao reusa o ledger, atomica e idempotente.** O ajuste e uma movimentacao existente:
   quantificavel `diferenca>0` -> `entrada`; `diferenca<0` -> `saida`; serializado
   `encontrado_em_outro_local` -> `transferencia`. Roda numa `sql.begin` com `FOR UPDATE` no item e
   guarda de idempotencia (`reconciliado_em`/`movimentacao_id` ja setados -> no-op). Para reusar o
   ledger DENTRO da transacao sem pegar outra conexao do pool, extrai-se `aplicarMovimentacaoNaTx(tx,
   cmd, conferenciaId)` do `estoque-movimentacoes-repository.pg.ts` (refactor sem mudanca de
   comportamento); `registrar()` vira um wrapper que so abre a `sql.begin`. Cada ajuste carrega
   `conferencia_id` (coluna nova, nullable, no ledger) + motivo padrao, para rastreabilidade.

4. **Reconciliacao POR ITEM, decisao humana, com opcao de lote.** NAO automatica ao concluir. Estoque
   real + governo: nao se muta saldo/status sem intencao explicita; uma divergencia pode ser erro de
   contagem; o aviso de "base alterada durante a contagem" exige decisao humana. Concluir a sessao so
   congela a contagem e lista as divergencias como pendentes; nao toca o estoque. O lote itera o mesmo
   apply transacional idempotente por item.

5. **Serializado nao encontrado sem status novo; sobra permitida.** `nao_encontrado` NAO gera baixa
   automatica (nao localizado != descartado; marcar descarte falsificaria o inventario): fica como
   divergencia reportada, e a baixa e acao manual deliberada pelo fluxo existente. Nao se cria status
   `extraviado` agora (mexeria na maquina de estados 0057). Itens "sobra" (contados fora do snapshot)
   sao permitidos quando o alvo JA existe no sistema (unidade em local errado -> transferencia;
   material sem saldo -> entrada); item fisico nao cadastrado fica para Fase 2 (mantem o XOR intacto).

6. **Sem papel RBAC novo.** Leitura `exigirUsuario`, escrita/reconciliacao `exigirAdmin` (como o resto
   do Estoque, coerente com a ADR 0020). `criada_por`/`concluida_por`/`reconciliado_por` sempre do
   auth do backend.

## Consequencias

- **Positivas**: modelo coerente com o ledger (mesmo padrao XOR, sem estrutura paralela); divergencia
  estavel (snapshot congelado) mesmo sob movimentacao concorrente; ajuste 100% reusando o ledger, com
  nao-negativo e maquina de estados herdados de graca; trilha completa e rastreavel por
  `conferencia_id` (governo); reconciliacao segura (por item, humana, idempotente, com aviso de base
  alterada); tudo atras de ports com mock para o MODO DEMO.
- **Custo/risco**: exige o refactor `aplicarMovimentacaoNaTx` para nao abrir transacao aninhada em
  outra conexao (mitiga o bug de conexao-do-pool ja visto no projeto); `conferencia_id` e coluna nova
  em tabela existente (aplicar migration e confirmar ANTES do push); snapshot de escopo grande
  (~999 serializados) tem que ser `INSERT ... SELECT` unico. O fluxo transacional (snapshot, coluna
  GENERATED, guarded update herdado) precisa ser provado em Postgres real, nao SQLite.
- **Deploy**: ordem obrigatoria: 1) aplicar 0062-0064 no banco, 2) confirmar via `information_schema`,
  3) push. A coluna `conferencia_id` so entra na lista de colunas lida pelo ledger quando o codigo da
  reconciliacao subir.

## Alternativas descartadas

- **Duas tabelas de item (uma por natureza)**: descartada. Dobraria tabela/port/repo/rota por um ganho
  marginal; o ledger ja prova que XOR-numa-tabela funciona bem aqui, e a natureza no nivel da sessao
  ja da a separacao limpa. Uma tabela com CHECK de natureza e mais DRY e sustentavel.
- **Saldo/esperado NAO congelado (comparar sempre com o atual)**: descartada. A divergencia mudaria a
  cada movimentacao durante a contagem, tornando o inventario instavel e nao auditavel. Congelar no
  snapshot e requisito.
- **Reconciliacao automatica ao concluir**: descartada. Geraria dezenas de movimentacoes de estoque em
  silencio, sem julgamento humano, contra a regra de nao mutar dado real sem intencao; e forcaria uma
  decisao ruim para `nao_encontrado` (baixa automatica falsificando o registro).
- **`ajuste` do ledger para reconciliar quantificavel**: descartada. O dominio ja BARRA `ajuste` para
  quantificavel (ADR 0020); a correcao de quantidade e feita por `entrada`/`saida`, que ja impoem
  nao-negativo atomico. Reconciliacao usa entrada/saida.
- **Novo status `extraviado` para serializado nao encontrado**: adiada para Fase 2. Ampliaria a
  maquina de estados (0057), badges e filtros sem necessidade imediata; "nao localizado" fica como
  divergencia reportada + baixa manual. Reavaliar se o cliente exigir distinguir extraviado de
  descartado em relatorio.
- **Amarrar o ajuste a conferencia so por texto no `motivo`**: descartada. Fragil (parsing, sem
  integridade). A FK `conferencia_id` e barata, nullable (nao quebra linhas existentes) e da
  rastreabilidade real de auditoria.
- **Chamar `estoqueMovimentacoesRepository.registrar()` de dentro da transacao de reconciliacao**:
  descartada. Abriria uma segunda `sql.begin` em outra conexao do pool, quebrando a atomicidade
  (mesma classe de bug do advisory lock ja visto no projeto). Por isso o nucleo transacional e
  extraido e recebe o `tx`.

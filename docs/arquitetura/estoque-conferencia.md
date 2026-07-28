# Sub-modulo Conferencia Fisica de Estoque (inventario): Arquitetura

Autor: Bruno (PO Engenharia). Data: 2026-07-15. Status: design aprovado para execucao.
Decisao de modelagem registrada na ADR 0021. Depende do modulo de Estoque (ADR 0020,
`docs/arquitetura/modulo-estoque.md`, migrations 0054-0061).
Execucao: Lucas (backend) + Fernanda (frontend), orquestrada por Matheus (CTO).

Cliente GOVERNO (SP Aguas). Aplicam-se as rules `governo`, `padrao`, `padrao-ui` e a disciplina de
dado critico (transacao atomica, trilha de auditoria, maquina de estados, idempotencia). Nao e
dinheiro (sem Decimal monetario), mas quantidade e inteira e a regra de nao-negativo herdada do
saldo vale. Nao ha codigo de producao aqui: DDL e assinaturas sao esboco para o Lucas finalizar e a
Fernanda consumir, espelhando as convencoes ja existentes no modulo de Estoque.

---

## 1. Objetivo e principio

O almoxarife faz a contagem fisica do estoque; o sistema aponta as DIVERGENCIAS entre o que o
sistema registra e o que foi contado, e permite tratar (reconciliar) cada divergencia com trilha de
auditoria. A reconciliacao **reusa o ledger existente** (`estoque_movimentacoes`): nao inventa uma
segunda forma de mexer no estoque real. O ajuste de inventario e uma movimentacao como qualquer
outra, com a diferenca de vir carimbada com a conferencia que a originou.

Principios herdados (nao renegociaveis):
- Dominio puro em `src/domain/estoque/*`; ports em `src/application/ports/*`; adapters `.pg`
  (postgres-js) e `.mock` (MODO DEMO) atras deles; toggle em `src/infrastructure/repositories.ts`.
- Rotas em `src/app/api/estoque/*`: `exigirUsuario` para leitura, `exigirAdmin` para escrita; rate
  limit por politica; validacao zod com `safeParse`; erro via `respostaDeErro`; log estruturado.
- Migrations idempotentes (`IF NOT EXISTS`), reversiveis, CHECK para enum, RLS deny-by-default.
- Toda mutacao que toca o estoque real roda numa `sql.begin` (atomica), e a reconciliacao e
  **idempotente** (nunca aplica o mesmo ajuste duas vezes).

---

## 2. Decisoes centrais (resumo; justificativa completa na ADR 0021)

1. **Sessao single-natureza.** Uma conferencia cobre UMA natureza (serializado OU quantificavel),
   escopada por unidade fisica (PENHA/ARARAQUARA) e, opcionalmente, um local. Isso da a "separacao
   por natureza" limpa **no nivel da sessao**, sem precisar de duas tabelas de item paralelas.
2. **Um item, XOR de alvo (espelha o ledger).** `estoque_conferencia_itens` referencia unidade XOR
   material, exatamente como `estoque_movimentacoes` faz com `ck_estoque_mov_alvo`. Reusa o padrao
   ja provado do modulo em vez de criar estrutura paralela.
3. **Snapshot congelado no ABRIR.** Ao abrir, o sistema materializa o esperado do escopo: serializado
   -> as unidades ativas esperadas (com seu local); quantificavel -> os saldos (material+local+
   tamanho) com a `quantidade_sistema` **congelada naquele instante**. A divergencia fica estavel
   mesmo com movimentacao concorrente durante a contagem.
4. **Reconciliacao POR ITEM, decisao humana** (com opcao de lote), nunca automatica ao concluir.
   Estoque real e governo: nao se mexe em saldo/status sem intencao explicita.
5. **Reusa o ledger.** O ajuste e `entrada`/`saida` (quantificavel) ou `transferencia` (serializado
   fora do lugar); `nao_encontrado` NAO vira baixa automatica (falsificaria o registro). Toda
   movimentacao gerada carrega `conferencia_id` (FK nova, rastreavel) + motivo padrao.
6. **Sem papel RBAC novo, sem status de unidade novo.** Escrita=admin, leitura=usuario (como o resto
   do Estoque). `extraviado` para serializado nao encontrado fica como possivel Fase 2.

---

## 3. Modelo de dados

Duas tabelas novas + uma coluna nova no ledger. Nomes pt-br snake_case.

| Tabela | Papel |
| --- | --- |
| `estoque_conferencias` | a SESSAO: escopo (unidade + natureza + local opcional), status, quem abriu/concluiu |
| `estoque_conferencia_itens` | 1 linha por item conferido (snapshot ou sobra), contagem, divergencia e carimbo de reconciliacao |
| `estoque_movimentacoes` (+coluna) | ganha `conferencia_id` para amarrar o ajuste a conferencia que o gerou |

### 3.1 Situacao do item (serializado): enum + maquina simples

`situacao` (dimensao de contagem do serializado, dominio `src/domain/estoque/conferencia.ts`):

```
pendente                    -> ainda nao contado (default do snapshot)
conferido                   -> encontrado no local esperado (sem divergencia)
nao_encontrado              -> esperado mas nao localizado (divergencia; acao manual)
encontrado_em_outro_local   -> encontrado em local diferente do esperado (divergencia; transferencia)
```

Transicoes validas a partir de `pendente`: para qualquer das outras tres. Reclassificar (ex.:
`nao_encontrado` -> `conferido` apos achar) so e permitido enquanto a sessao estiver `aberta`. Depois
de `concluida`, a contagem e final (auditavel).

As guardas efetivas sao duas, e nao uma funcao de transicao: o enum do schema zod (que nao aceita
volta para `pendente`) e a exigencia de sessao `aberta` no repositorio. Recontar a MESMA situacao e
idempotente de proposito (o almoxarife reclica sem penalidade). Ate 27/07/2026 esta secao descrevia
um `situacaoContagemValida(de, para)` que nenhum adapter chamava; a funcao foi removida na revisao
pos-auditoria para o codigo e o documento contarem a mesma historia.

### 3.2 Status da sessao: maquina de estados

```
aberta    -> concluida   (contagem finalizada; a partir daqui, reconciliar)
aberta    -> cancelada   (descartada; sem efeito no estoque)
concluida -> (terminal no fluxo; reconciliacao acontece por item apos concluir)
cancelada -> (terminal)
```

Contagem so pode ser editada com a sessao `aberta`. Reconciliacao so com a sessao `concluida`
(a contagem tem que estar fechada antes de gerar ajuste). "Totalmente reconciliada" NAO e um status
armazenado: e derivado (todos os itens divergentes tratados), reportado como "pendencias de
reconciliacao: N". Evita ampliar a superficie da maquina de estados sem necessidade.

### 3.3 Calculo da divergencia

- **Quantificavel**: `diferenca = quantidade_contada - quantidade_sistema` (coluna GENERATED STORED;
  null enquanto nao contado). Divergente quando `diferenca <> 0`. `> 0` = sobra fisica (o fisico tem
  mais que o sistema); `< 0` = falta.
- **Serializado**: divergencia e categorica, dada por `situacao`. `conferido` = sem divergencia;
  `nao_encontrado` e `encontrado_em_outro_local` = divergencias.

### 3.4 Sobras (item contado que nao estava no snapshot)

Decisao: **permitir adicionar item "sobra"** a conferencia (`origem = 'sobra'`), nao so registrar as
divergencias do snapshot. Justificativa: um inventario de governo precisa expor o que existe fisicamente
e o sistema desconhece, nao apenas o que falta.

- **Quantificavel sobra**: `(material, local, tamanho)` contado sem saldo no snapshot ->
  `quantidade_sistema` = **saldo REAL do alvo lido na hora** (0 quando nao ha saldo),
  `quantidade_contada = N`, reconciliacao = `entrada`/`saida` da diferenca. Permitido na Fase 1 (o
  material precisa existir no catalogo; se nao existir, cadastra antes via CRUD do modulo).
  O local da sobra tem que estar **dentro do escopo da sessao** (mesma unidade fisica e, quando a
  sessao for escopada por local, o mesmo local). Fora do escopo o snapshot nao cobre aquele local, e
  a reconciliacao somaria a contagem inteira a um saldo que ninguem conferiu.
- **Serializado sobra**: uma unidade JA cadastrada, encontrada num local fora do escopo do seu
  snapshot -> item `origem='sobra'`, `unidade_id` setado, `situacao='encontrado_em_outro_local'`,
  `local_encontrado_id = local atual`; reconciliacao = `transferencia`. Permitido na Fase 1.
  Duas recusas explicitas: unidade **sem local** no sistema (a transferencia nasceria sem origem) e
  local encontrado **igual** ao local atual (transferencia de A para A). As duas viravam 500 opaco
  pelo CHECK do ledger, com o item travado sem poder reconciliar.

> **Revisao pos-auditoria (27/07/2026).** A auditoria de QA e seguranca do submodulo apontou que a
> sobra quantificavel gravava `quantidade_sistema = 0` fixo e aceitava qualquer local, o que inflava
> o saldo de um local fora do escopo com aparencia de ajuste auditado. Corrigido junto com: recusa de
> reconciliar item sem divergencia (`ItemSemDivergencia`, 409), `validarComandoEstrutural` no caminho
> de reconciliacao, teto de quantidade na contagem e `LocalNaoEncontrado` (404) no lugar de 500.
- **Item fisico NAO cadastrado** (nao existe unidade/material no sistema): fica **Fase 2**. Capturar
  exigiria uma linha com alvo nulo (quebra o XOR) + fluxo de cadastro inline. Na Fase 1 o almoxarife
  cadastra a unidade/material primeiro (CRUD ja existe) e depois adiciona como sobra. Mantem o modelo
  limpo (XOR intacto, sem linha orfa).

### 3.5 DDL (esboco, Lucas finaliza)

Proximo numero de migration livre apos 0061. Cada uma idempotente, reversivel, com RLS
deny-by-default e COMMENT, no estilo da 0059.

```sql
-- 0062_estoque_conferencias.sql  (a sessao de conferencia)
CREATE TABLE IF NOT EXISTS estoque_conferencias (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade        TEXT         NOT NULL CHECK (unidade IN ('PENHA', 'ARARAQUARA')),
  natureza       TEXT         NOT NULL CHECK (natureza IN ('serializado', 'quantificavel')),
  local_id       UUID         NULL REFERENCES estoque_locais (id) ON DELETE RESTRICT,  -- escopo opcional
  status         TEXT         NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'concluida', 'cancelada')),
  observacao     TEXT         NULL,
  criada_por     UUID         NOT NULL,   -- auth do backend (nunca do corpo)
  criada_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  concluida_por  UUID         NULL,
  concluida_em   TIMESTAMPTZ  NULL,
  atualizada_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- coerencia: sessao concluida tem quem/quando
  CONSTRAINT ck_estoque_conf_concluida CHECK (
    status <> 'concluida' OR (concluida_por IS NOT NULL AND concluida_em IS NOT NULL)
  )
);
COMMENT ON TABLE estoque_conferencias IS
  'Sessao de conferencia fisica (inventario). Escopo = unidade + natureza + local opcional. Snapshot congelado nos itens. Design: ADR 0021.';
-- no maximo 1 conferencia ABERTA por escopo (evita contagens concorrentes no mesmo local/natureza).
-- COALESCE do local_id para o UUID zero permite indexar o caso "sem local" (escopo = unidade inteira).
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_conf_aberta_escopo
  ON estoque_conferencias (unidade, natureza, COALESCE(local_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'aberta';
CREATE INDEX IF NOT EXISTS idx_estoque_conf_status ON estoque_conferencias (status, criada_em DESC);
ALTER TABLE IF EXISTS estoque_conferencias ENABLE ROW LEVEL SECURITY;

-- 0063_estoque_conferencia_itens.sql  (1 linha por item conferido)
CREATE TABLE IF NOT EXISTS estoque_conferencia_itens (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conferencia_id       UUID         NOT NULL REFERENCES estoque_conferencias (id) ON DELETE CASCADE,
  -- XOR de alvo, espelha ck_estoque_mov_alvo do ledger.
  unidade_id           UUID         NULL REFERENCES estoque_unidades (id) ON DELETE RESTRICT,
  material_id          UUID         NULL REFERENCES estoque_materiais (id) ON DELETE RESTRICT,
  -- contexto CONGELADO no snapshot
  local_esperado_id    UUID         NULL REFERENCES estoque_locais (id) ON DELETE SET NULL,
  tamanho              TEXT         NULL,   -- bucket do quantificavel (bitola etc.)
  origem               TEXT         NOT NULL DEFAULT 'snapshot' CHECK (origem IN ('snapshot', 'sobra')),
  -- serializado: contagem categorica
  situacao             TEXT         NULL CHECK (situacao IN ('pendente', 'conferido', 'nao_encontrado', 'encontrado_em_outro_local')),
  local_encontrado_id  UUID         NULL REFERENCES estoque_locais (id) ON DELETE SET NULL,
  -- quantificavel: quantidade_sistema CONGELADA no snapshot; contada preenchida pelo almoxarife
  quantidade_sistema   INTEGER      NULL CHECK (quantidade_sistema IS NULL OR quantidade_sistema >= 0),
  quantidade_contada   INTEGER      NULL CHECK (quantidade_contada IS NULL OR quantidade_contada >= 0),
  diferenca            INTEGER      GENERATED ALWAYS AS (quantidade_contada - quantidade_sistema) STORED,
  observacao           TEXT         NULL,
  -- reconciliacao (trilha)
  movimentacao_id      UUID         NULL REFERENCES estoque_movimentacoes (id) ON DELETE SET NULL,
  reconciliado_por     UUID         NULL,
  reconciliado_em      TIMESTAMPTZ  NULL,
  criado_em            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- exatamente um alvo (serializado XOR quantificavel)
  CONSTRAINT ck_estoque_conf_item_alvo CHECK (
    (unidade_id IS NOT NULL AND material_id IS NULL) OR
    (unidade_id IS NULL AND material_id IS NOT NULL)
  ),
  -- serializado usa situacao; quantificavel usa quantidade_sistema. Mantem o modelo coerente
  -- (mesma tabela, dois formatos, guardados como no ledger).
  CONSTRAINT ck_estoque_conf_item_natureza CHECK (
    (unidade_id  IS NOT NULL AND situacao IS NOT NULL AND quantidade_sistema IS NULL) OR
    (material_id IS NOT NULL AND quantidade_sistema IS NOT NULL AND situacao IS NULL)
  ),
  -- carimbo de reconciliacao coerente
  CONSTRAINT ck_estoque_conf_item_recon CHECK (
    reconciliado_em IS NULL OR reconciliado_por IS NOT NULL
  )
);
COMMENT ON TABLE estoque_conferencia_itens IS
  'Item conferido: snapshot congelado (quantidade_sistema / local_esperado) x contagem fisica. Divergencia derivada. Reconciliacao carimba movimentacao_id (idempotencia). ADR 0021.';
-- nao duplica o mesmo alvo dentro da conferencia (snapshot nem sobra repetida).
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_conf_item_unidade
  ON estoque_conferencia_itens (conferencia_id, unidade_id) WHERE unidade_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_conf_item_material
  ON estoque_conferencia_itens (conferencia_id, material_id,
       COALESCE(local_esperado_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(tamanho, ''))
  WHERE material_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_conf_item_conf ON estoque_conferencia_itens (conferencia_id);
-- pendencias de reconciliacao (parcial): acelera "quantos itens faltam tratar".
CREATE INDEX IF NOT EXISTS idx_estoque_conf_item_pendentes
  ON estoque_conferencia_itens (conferencia_id) WHERE reconciliado_em IS NULL;
ALTER TABLE IF EXISTS estoque_conferencia_itens ENABLE ROW LEVEL SECURITY;

-- 0064_estoque_movimentacoes_conferencia_id.sql  (amarra o ajuste a conferencia)
ALTER TABLE IF EXISTS estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS conferencia_id UUID NULL REFERENCES estoque_conferencias (id) ON DELETE SET NULL;
COMMENT ON COLUMN estoque_movimentacoes.conferencia_id IS
  'Preenchido quando a movimentacao foi gerada por reconciliacao de conferencia (rastreabilidade de auditoria).';
CREATE INDEX IF NOT EXISTS idx_estoque_mov_conferencia
  ON estoque_movimentacoes (conferencia_id) WHERE conferencia_id IS NOT NULL;
```

Nota de ordem (aprendizado do projeto): a 0064 e **coluna nova em tabela existente**. Aplicar as
tres no banco e confirmar via `information_schema` ANTES de qualquer push de codigo que leia
`conferencia_id`. Como o `.pg` do ledger usa lista EXPLICITA de colunas (`COLUNAS_MOV`), a coluna so
passa a ser lida quando for adicionada a essa lista; ainda assim, migration aplicada != commitada:
aplicar primeiro.

### 3.6 Snapshot transacional (ABRIR a conferencia)

Tudo numa `sql.begin`: INSERT da sessao (`status='aberta'`) + bulk-INSERT dos itens via
`INSERT ... SELECT` (uma query, nao N round-trips). Congela `quantidade_sistema` / `local_esperado`.

```sql
-- serializado: unidades fisicamente presentes (ativo|defeito) no escopo. descarte fica de fora.
INSERT INTO estoque_conferencia_itens (conferencia_id, unidade_id, local_esperado_id, situacao, origem)
SELECT ${confId}::uuid, u.id, u.local_id, 'pendente', 'snapshot'
  FROM estoque_unidades u
  JOIN estoque_locais l ON l.id = u.local_id
 WHERE u.status IN ('ativo', 'defeito')
   AND l.unidade = ${unidade}
   AND (${localId}::uuid IS NULL OR u.local_id = ${localId}::uuid);

-- quantificavel: saldos positivos no escopo, com quantidade CONGELADA.
INSERT INTO estoque_conferencia_itens (conferencia_id, material_id, local_esperado_id, tamanho, quantidade_sistema, origem)
SELECT ${confId}::uuid, s.material_id, s.local_id, s.tamanho, s.quantidade, 'snapshot'
  FROM estoque_saldos s
  JOIN estoque_locais l ON l.id = s.local_id
 WHERE l.unidade = ${unidade}
   AND (${localId}::uuid IS NULL OR s.local_id = ${localId}::uuid)
   AND s.quantidade > 0;
```

Nota: unidades serializadas com `local_id` nulo NAO entram num snapshot escopado por local/unidade
fisica (nao ha localizacao para comparar). Cobrir "itens sem local" fica como Fase 2. Documentar no
resumo da tela ("N unidades sem local nao entram na conferencia por localizacao").

---

## 4. Reconciliacao (tratar a divergencia) com trilha

### 4.1 Mapeamento divergencia -> movimentacao (dominio, funcao pura `resolverReconciliacao(item)`)

| Caso | Movimentacao gerada | Detalhe |
| --- | --- | --- |
| Quantificavel `diferenca > 0` (sobra) | `entrada` de `diferenca`, `localDestino = local_esperado` | almoxarife achou mais que o sistema |
| Quantificavel `diferenca < 0` (falta) | `saida` de `abs(diferenca)`, `localOrigem = local_esperado` | motivo obrigatorio (ja e conferencia) |
| Quantificavel `diferenca = 0` | nenhuma | so carimba reconciliado (sem movimentacao) |
| Serializado `conferido` | nenhuma | sem divergencia |
| Serializado `encontrado_em_outro_local` | `transferencia` `local_esperado -> local_encontrado` | reusa transferencia serializada existente |
| Serializado `nao_encontrado` | **nenhuma automatica** | reportado; baixa e acao MANUAL explicita (ver 4.4) |

Motivo padrao da movimentacao: `Conferencia fisica #<id-curto> (ajuste de inventario)`, alem do
`conferencia_id` (FK). `saida`/`entrada` de quantificavel ja exigem local; `saida` e `transferencia`
herdam a garantia de nao-negativo e a maquina de estados do ledger sem nenhuma logica nova.

Por que `saida` (nao `baixa`) na falta de quantificavel: `baixa` semanticamente e descarte/defeito;
uma falta de inventario e correcao/quebra, melhor representada por `saida` com motivo. E o dominio ja
BARRA `ajuste` para quantificavel (por isso a reconciliacao usa entrada/saida, nunca ajuste).

### 4.2 Atomicidade + idempotencia (reconciliar 1 item)

Roda numa unica `sql.begin`:

1. `SELECT ... FROM estoque_conferencia_itens WHERE id = :itemId FOR UPDATE` (trava o item).
2. Se `reconciliado_em IS NOT NULL`: **no-op idempotente**, retorna o resultado ja existente
   (`movimentacao_id`), sem gerar segunda movimentacao. E a guarda contra aplicar o ajuste no estoque
   real duas vezes (aprendizado do projeto: botao que mexe em dado real nao dispara em dobro).
3. Se a sessao nao esta `concluida`: `ConferenciaNaoConcluida` (409).
4. `resolverReconciliacao(item)` -> comando de movimentacao (ou "sem movimentacao").
5. Se ha movimentacao: aplica-la **na MESMA transacao** via `aplicarMovimentacaoNaTx(tx, comando)`
   (helper extraido do ledger, ver 4.3), com `conferencia_id` setado. Devolve `movimentacao_id`.
6. `UPDATE estoque_conferencia_itens SET movimentacao_id = :mov, reconciliado_por = :user,
   reconciliado_em = NOW(), atualizado_em = NOW() WHERE id = :itemId`.

O carimbo `reconciliado_em` + `movimentacao_id` no item E a chave de idempotencia (nao precisa de
tabela de idempotency-key). Uma segunda chamada cai no passo 2.

### 4.3 Reuso do ledger sem bug de conexao (refactor obrigatorio)

A reconciliacao NAO pode chamar `estoqueMovimentacoesRepository.registrar(cmd)` de dentro da sua
transacao: aquele metodo abre a PROPRIA `sql.begin` numa conexao diferente do pool, quebrando a
atomicidade (aprendizado do projeto: advisory lock/efeito colateral pegando outra conexao do pool).
Solucao: **extrair o nucleo transacional** do `estoque-movimentacoes-repository.pg.ts` numa funcao
que recebe o `tx`:

```ts
// novo export interno em estoque-movimentacoes-repository.pg.ts (sem mudanca de comportamento)
export async function aplicarMovimentacaoNaTx(
  tx: Sql,
  cmd: ComandoMovimentacao,
  conferenciaId?: string | null,   // carimbo opcional; NULL nas movimentacoes normais
): Promise<ResultadoMovimentacao> { /* corpo atual de registrarSerializado/registrarQuantificavel */ }

// registrar() passa a ser um wrapper fino:
async registrar(cmd) { return sql.begin((tx) => aplicarMovimentacaoNaTx(tx as Sql, cmd, null)); }
```

O repo de conferencia chama `aplicarMovimentacaoNaTx(tx, comando, confId)` dentro da SUA `sql.begin`.
Mesmo refactor no `.mock` (extrair a logica sincrona para uma funcao reutilizada). Refactor sem
mudanca de comportamento: os testes de movimentacao existentes devem continuar verdes (contra
Postgres real, nao SQLite).

### 4.4 Serializado nao encontrado: decisao minima coerente

`nao_encontrado` NAO gera baixa automatica: "nao localizado" nao e "descartado", e marcar descarte
falsificaria o inventario (governo). O item fica registrado como divergencia reportada. Reconciliar um
`nao_encontrado` apenas o CARIMBA como tratado (`reconciliado_em` setado, `movimentacao_id` NULL,
observacao "nao localizado: requer apuracao"), tirando-o das pendencias sem tocar o estoque. Se, apos
apuracao, a perda for confirmada, o almoxarife executa uma `baixa` DELIBERADA pelo fluxo de
movimentacao existente (motivo "Conferencia fisica #N: nao localizado"), acao humana explicita. NAO
criar status `extraviado` agora (mexeria na maquina de estados 0057, badges, filtros): fica como Fase
2 se o cliente pedir para distinguir "extraviado" de "descartado" em relatorio.

### 4.5 Concorrencia durante a contagem (base do sistema mudou)

O snapshot congela `quantidade_sistema`, entao a divergencia e estavel. Mas o AJUSTE aplica um DELTA
(`diferenca`) sobre o saldo ATUAL (via entrada/saida do ledger), nao um "set absoluto". Se houve
movimentacao legitima durante a contagem, o saldo atual difere do congelado. Antes de aplicar um
ajuste de quantificavel, o repo re-le o saldo atual; se `saldo_atual <> quantidade_sistema`
(congelado), **inclui um aviso na resposta** ("houve movimentacao durante a contagem: base X, atual Y")
e registra os dois numeros no motivo da movimentacao. Aplica o delta assim mesmo (o delta e a
discrepancia fisica observada; movimentacoes concorrentes sao linhas independentes no ledger), mas o
humano ve o aviso e pode cancelar/recontar aquele item. Governo-grade: nunca reconciliar em silencio
sobre uma base que mudou.

> **Revisao pos-auditoria (27/07/2026).** Este texto descrevia metade do que existia. O aviso so
> vinha na RESPOSTA do POST, ou seja, depois do estoque ja alterado: o almoxarife era informado de
> algo que nao teve chance de decidir, o oposto da decisao humana prometida. E o serializado nao
> tinha verificacao nenhuma, entao uma unidade movida por outro caminho durante a contagem gerava
> transferencia com uma origem que nunca foi verdadeira. Agora:
>
> - `listarItens` traz o estado ATUAL do alvo junto do congelado (`saldoAtual`, `localAtualId`,
>   `statusAtual`), e o dialog de reconciliar mostra o alerta com os dois valores ANTES de habilitar
>   a confirmacao. A funcao pura `mudancasDesdeContagem` decide o que mudou.
> - Serializado passa a reler a unidade dentro da transacao: se o local mudou, a origem da
>   transferencia vira o local ATUAL (e o motivo registra os dois); se a unidade saiu de operacao
>   (baixa/descarte), a reconciliacao e RECUSADA, porque transferir ressuscitaria a unidade num
>   local e falsificaria o inventario.
> - O resumo ganhou o card "Nao contados" e a confirmacao de concluir diz quantos itens ficarao de
>   fora. Item nao contado nao e divergencia nem pendencia, entao sumia do resumo e o inventario
>   podia ser declarado completo com parte do escopo nao verificada.

### 4.6 Automatica vs por item: decisao e justificativa

**Por item, decisao humana, com opcao de aplicar em lote.** Nao automatica ao concluir. Razoes:
- Estoque real + governo: nao se muta saldo/status sem intencao explicita (mesma regra do "botao que
  mexe em dado real: revisar antes de disparar").
- Divergencia exige julgamento: uma falta pode ser erro de contagem, nao perda real. O almoxarife
  decide por item: aceitar (gera ajuste), recontar ou apurar.
- `nao_encontrado` jamais pode virar baixa automatica.
- O aviso de concorrencia (4.5) precisa de decisao humana por item.

O "aplicar em lote" e conveniencia: itera o mesmo apply transacional+idempotente por item (cada um
individualmente atomico e trilhado); nao e um caminho paralelo. Concluir a sessao apenas congela a
contagem e lista as divergencias como "pendentes de tratamento"; nao mexe no estoque.

---

## 5. API (rotas REST em `src/app/api/estoque/conferencias/*`)

Padrao de toda rota: `runtime='nodejs'`, `dynamic='force-dynamic'`; leitura -> `exigirUsuario`,
escrita -> `exigirAdmin`; rate limit; zod `safeParse` -> 400 com `motivos`; erro via `respostaDeErro`;
log estruturado. `criada_por`/`concluida_por`/`reconciliado_por` vem SEMPRE do `auth` do backend.

Nova politica de rate limit em `src/infrastructure/security/rate-limit.ts`:
- `conferenciaEstoque` (limite ~120 / 60s): edicoes de contagem (muitas escritas pequenas durante a
  contagem). A reconciliacao (que toca o estoque real) usa a politica existente `movimentacaoEstoque`.

| Metodo + rota | Auth | Uso | Payload / query principal |
| --- | --- | --- | --- |
| GET `/api/estoque/conferencias` | usuario | listar sessoes | `unidade`, `natureza`, `status`, `pagina`, `porPagina` |
| POST `/api/estoque/conferencias` | admin | abrir sessao + snapshot (transacional) | `abrirConferenciaSchema` |
| GET `/api/estoque/conferencias/[id]` | usuario | detalhe + resumo de divergencias | n/a |
| PATCH `/api/estoque/conferencias/[id]` | admin | concluir ou cancelar | `acaoConferenciaSchema` |
| GET `/api/estoque/conferencias/[id]/itens` | usuario | listar itens | `situacao`, `apenasDivergentes`, `apenasPendentesRecon`, `pagina` |
| POST `/api/estoque/conferencias/[id]/itens` | admin | adicionar item sobra (so `aberta`) | `sobraItemSchema` |
| PATCH `/api/estoque/conferencias/[id]/itens/[itemId]` | admin | registrar contagem (so `aberta`) | `contagemItemSchema` |
| POST `/api/estoque/conferencias/[id]/itens/[itemId]/reconciliar` | admin | reconciliar 1 item (so `concluida`; idempotente) | n/a |
| POST `/api/estoque/conferencias/[id]/reconciliar` | admin | reconciliar em lote (itens revisados) | `reconciliarLoteSchema` |

Erros de negocio (mapeados em `respostaDeErro`): 404 `ConferenciaNaoEncontrada`/
`ItemConferenciaNaoEncontrado`; 409 `ConferenciaFechada` (editar contagem fora de `aberta`), 409
`ConferenciaNaoConcluida` (reconciliar antes de concluir), 409 `EscopoConferenciaEmAberto` (ja existe
sessao aberta no escopo); reusa 404 `UnidadeNaoEncontrada`/`MaterialNaoEncontrado`/`LocalNaoEncontrado`,
409 `SaldoInsuficiente`/`TransicaoStatusInvalida`/`NaturezaIncompativel` da reconciliacao. Item ja
reconciliado NAO e erro: retorna 200 idempotente com o resultado existente.

Schemas zod principais (esboco, em `conferencias/_schemas.ts`):

```ts
export const abrirConferenciaSchema = z.object({
  unidade: unidadeFisicaEnum,                 // reusa o enum de estoque/_schemas
  natureza: naturezaEnum,                      // 'serializado' | 'quantificavel'
  localId: z.string().uuid().optional(),       // escopo opcional
  observacao: z.string().trim().max(2000).optional(),
});

// contagem: a forma depende da natureza da SESSAO (validada no use-case contra a sessao).
export const contagemItemSchema = z.union([
  z.object({ situacao: z.enum(['conferido', 'nao_encontrado', 'encontrado_em_outro_local']),
             localEncontradoId: z.string().uuid().optional(),   // exigido se encontrado_em_outro_local
             observacao: z.string().trim().max(2000).optional() }),
  z.object({ quantidadeContada: z.number().int().min(0),
             observacao: z.string().trim().max(2000).optional() }),
]);

export const sobraItemSchema = z.union([
  z.object({ unidadeId: z.string().uuid(), localEncontradoId: z.string().uuid() }),          // serializado
  z.object({ materialId: z.string().uuid(), localId: z.string().uuid(),
             tamanho: z.string().trim().min(1).max(60).optional(),
             quantidadeContada: z.number().int().min(1) }),                                    // quantificavel
]);

export const acaoConferenciaSchema = z.object({
  acao: z.enum(['concluir', 'cancelar']),
  observacao: z.string().trim().max(2000).optional(),
});

export const reconciliarLoteSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(500),   // itens que o almoxarife revisou
});
```

Resposta de reconciliar: 200/201 com `{ item, movimentacao | null, aviso?: 'base_alterada' }`.

---

## 6. RBAC

Mecanismo existente (`src/app/api/_helpers/auth.ts` + `src/domain/auth/papel.ts`), SEM papel novo
(coerente com a ADR 0020):

- **Leitura** (GET listar/detalhe/itens): `exigirUsuario`. `user`, `admin`, `super_admin` consultam.
- **Escrita** (abrir, preencher contagem, adicionar sobra, concluir/cancelar, reconciliar,
  reconciliar em lote): `exigirAdmin`. `user` recebe 403.
- `criada_por` / `concluida_por` / `reconciliado_por` sempre do `auth` do backend, nunca do corpo:
  trilha fiel (governo).
- Frontend esconde acao de escrita para `user` (UX); a autorizacao real e sempre no backend (defesa
  em profundidade). Guarda de IDOR: em `[id]/itens/[itemId]`, validar que o item pertence a
  conferencia do path (`WHERE id = :itemId AND conferencia_id = :id`), nunca so o `itemId` isolado.

---

## 7. Estrutura de arquivos

Espelha a arvore do modulo de Estoque. Dominio puro, ports, use-cases, repos `.pg`+`.mock`, rotas,
componentes.

```
src/domain/estoque/
  conferencia.ts          # Conferencia, StatusConferencia, NaturezaConferida, ConferenciaItem,
                          #   SituacaoItem enum, statusConferenciaValido(de,para),
                          #   calcularDivergencia(item) (puro),
                          #   resolverReconciliacao(item) -> ComandoMovimentacao | null (puro)

src/application/ports/
  estoque-conferencias-repository.ts   # abrir(snapshot), listar, detalhe, registrarContagem,
                                       #   adicionarSobra, concluir/cancelar, reconciliarItem

src/application/use-cases/estoque/
  abrir-conferencia.ts        # valida escopo, monta o comando de snapshot
  registrar-contagem.ts       # valida (sessao aberta, forma bate com a natureza) e delega
  reconciliar-item.ts         # resolverReconciliacao + delega a transacao ao repo (idempotente)
  concluir-conferencia.ts     # transicao aberta->concluida|cancelada

src/infrastructure/db/
  estoque-conferencias-repository.pg.ts   # abrir = sql.begin (INSERT sessao + INSERT..SELECT itens);
                                          #   reconciliarItem = sql.begin (FOR UPDATE + guarda
                                          #   idempotencia + aplicarMovimentacaoNaTx + carimbo)
  estoque-movimentacoes-repository.pg.ts  # REFACTOR: extrair aplicarMovimentacaoNaTx(tx, cmd, confId)
src/infrastructure/mock/
  estoque-conferencias-repository.mock.ts # replica logica e erros in-memory (MODO DEMO + teste)
  estoque-movimentacoes-repository.mock.ts# REFACTOR: extrair nucleo reutilizavel
src/infrastructure/repositories.ts        # + wiring do toggle demo/pg da conferencia

src/app/api/estoque/conferencias/
  route.ts                          [id]/route.ts
  [id]/itens/route.ts               [id]/itens/[itemId]/route.ts
  [id]/itens/[itemId]/reconciliar/route.ts
  [id]/reconciliar/route.ts
  _schemas.ts

src/domain/errors.ts        # + ConferenciaNaoEncontrada, ItemConferenciaNaoEncontrado,
                            #   ConferenciaFechada, ConferenciaNaoConcluida, EscopoConferenciaEmAberto
src/app/api/_helpers/erros.ts   # + mapeamento HTTP dos erros acima (404/409)

src/app/(dashboard)/estoque/conferencias/   # paginas (Fernanda)
```

Componentes de frontend previstos (lista para a Fernanda; ela define o desenho fino):

```
src/components/features/estoque/conferencia/
  ConferenciaLista.tsx          # sessoes (abrir nova, filtrar por unidade/natureza/status)
  AbrirConferenciaDialog.tsx    # escolhe unidade + natureza + local opcional; confirma snapshot
  ConferenciaDetalhe.tsx        # cabecalho (escopo/status), resumo de divergencias, acoes
  ContagemSerializados.tsx      # checklist: por unidade, marcar conferido/nao_encontrado/outro local
  ContagemQuantificaveis.tsx    # grid com quantidade_sistema (read-only) + InputQuantidade contada
  PainelDivergencias.tsx        # so os divergentes; badge por tipo; acao "reconciliar"
  ReconciliarDialog.tsx         # mostra o ajuste que sera gerado + aviso de base alterada; confirma
  AdicionarSobraDialog.tsx      # adiciona item nao previsto (unidade OU material+local+tamanho+qtd)
  BadgeSituacao.tsx             # SVG/monograma, SEM emoji (padrao-ui)
```

Requisitos de UI (rules `padrao-ui` + `governo`): acento PT-BR correto em todo texto visivel; sem
emoji decorativo; sem `window.confirm/prompt/alert` (usar ConfirmDialog/PromptDialog do projeto);
CRUD/acoes completas; estados vazio/carregando/erro/sucesso/borda; responsivo real (a contagem e
feita no galpao, provavelmente no CELULAR: priorizar mobile); acessibilidade WCAG 2.1 AA / e-MAG.
A tela de reconciliacao SEMPRE mostra o ajuste que sera aplicado e pede confirmacao (nunca dispara
mutacao de estoque no clique sem revisao).

---

## 8. Plano de fases

### Fase 1 (MVP util): o ciclo completo de valor
Criar sessao + snapshot congelado + preencher contagem + ver divergencias + reconciliar por item
(com trilha), incluindo:
- 2 tabelas + coluna `conferencia_id` no ledger.
- Dominio (`conferencia.ts`) com enums, maquinas de estado e as funcoes puras de divergencia e de
  resolucao de reconciliacao.
- Refactor `aplicarMovimentacaoNaTx` (pg + mock).
- Ports + repos pg+mock + wiring.
- Rotas: abrir, listar, detalhe, contagem, sobra (itens JA cadastrados), concluir/cancelar,
  reconciliar por item + lote.
- Frontend: lista, detalhe com painel de divergencias, contagem (serializado e quantificavel),
  reconciliar com confirmacao, adicionar sobra.

### Fase 2 (evolucao)
- **Relatorio de conferencia** (PDF/export) reusando os ports de leitura/export/storage do modulo
  (ADR 0018): divergencias, ajustes gerados, quem/quando.
- **Conferencia por leitura de QR/etiqueta** reusando `src/domain/estoque/etiqueta.ts`: escanear a
  etiqueta marca o item conferido; acelera a contagem em campo.
- **Conferencia cega / dupla contagem**: duas contagens independentes do mesmo escopo, comparadas
  antes de reconciliar (reduz erro do contador). Exige guardar contagens paralelas.
- **Captura de achado NAO cadastrado**: item fisico sem unidade/material no sistema -> cadastro
  inline + reconciliacao (linha com alvo a materializar).
- **Status `extraviado`** para serializado nao localizado, se o cliente quiser distingui-lo de
  descarte em relatorio (mexe na maquina de estados 0057).
- **Snapshot de itens sem local** e agendamento/recorrencia de conferencias.

---

## 9. Ordem de implementacao e riscos

Ordem que destrava o resto (Lucas; Fernanda entra em paralelo a partir do passo 3):

1. **Migrations 0062-0064 + dominio.** Aplicar as tres no banco, confirmar via `information_schema`,
   SO ENTAO push (a 0064 e coluna nova em tabela existente: fatal se o codigo sobe antes). Dominio
   `conferencia.ts` com testes unitarios: divergencia (quantificavel e serializado), maquina de
   estados da sessao e da situacao, `resolverReconciliacao` (cada caso da tabela 4.1).
2. **Refactor `aplicarMovimentacaoNaTx`** (pg + mock). Sem mudanca de comportamento; rodar os testes
   de movimentacao existentes verdes CONTRA POSTGRES REAL (nao SQLite: guarded UPDATE, upsert e
   CHECK sao features de Postgres).
3. **Ports + repos (abrir/listar/detalhe/contagem/sobra) + rotas GET/PATCH de contagem.** Destrava o
   front. Snapshot via `INSERT ... SELECT` na `sql.begin`. Testes: snapshot congela quantidade;
   escopo por local e por unidade fisica; unicidade do alvo por conferencia.
4. **Reconciliacao (por item + lote).** `reconciliar-item` + repo transacional. Testes contra
   Postgres real: idempotencia (reconciliar 2x = 1 movimentacao), atomicidade (falha no meio faz
   rollback do item e da movimentacao juntos), aviso de base alterada, cada caso da tabela 4.1,
   nao-negativo herdado na `saida`.
5. **Concluir/cancelar + resumo de divergencias** (contagens por situacao, pendencias de
   reconciliacao).
6. **Frontend (Fernanda)**, a partir do passo 3: lista, contagem mobile-first, painel de
   divergencias, reconciliar com confirmacao, sobra.
7. **QA (Thiago) + Seguranca (Andre).** IDOR nos `[id]/[itemId]` (item pertence a conferencia?),
   idempotencia provada, `exigirAdmin` em toda mutacao, LGPD (`*_por` no trail e dado pessoal: log
   sem PII), acessibilidade governo, regressao do modulo de Estoque (o refactor do passo 2 nao
   quebrou movimentacao).

Riscos e mitigacoes:
- **Reconciliacao dupla (mexer no estoque 2x)**: idempotencia por `movimentacao_id` no item +
  `FOR UPDATE` na transacao.
- **Nesting de transacao / conexao errada do pool**: `aplicarMovimentacaoNaTx` recebe o MESMO `tx`;
  nunca chamar `registrar()` (que abre outra `sql.begin`/conexao) de dentro da transacao.
- **Concorrencia durante a contagem**: `quantidade_sistema` congelada + ajuste por delta + AVISO
  quando a base atual difere da congelada (decisao humana). Nunca reconciliar em silencio.
- **Coluna nova (`conferencia_id`) x deploy**: aplicar migration e confirmar antes do push.
- **`nao_encontrado` tratado como descarte falsificaria o inventario**: nao ha baixa automatica; e
  divergencia reportada + baixa manual explicita.
- **Snapshot grande (unidade fisica inteira ~999 serializados)**: `INSERT ... SELECT` unico (nao N
  round-trips) + indice em `conferencia_id`.
- **Teste verde em SQLite esconde bug de Postgres**: snapshot (INSERT..SELECT), coluna GENERATED e o
  fluxo transacional de reconciliacao provados em Postgres real.
- **Contagens concorrentes no mesmo escopo**: indice unico parcial `uq_estoque_conf_aberta_escopo`
  barra duas sessoes abertas na mesma unidade+natureza+local.
```
# Modulo Estoque (almoxarifado / patrimonio) — Arquitetura

Autor: Bruno (PO Engenharia). Data: 2026-07-15. Status: design aprovado para execucao.
Decisao de negocio: Rafael (founder). Execucao: Lucas (backend) + Fernanda (frontend), orquestrada por Matheus (CTO).
Decisao de modelagem registrada na ADR 0020.

Cliente GOVERNO (SP Aguas). Aplicam-se as rules `governo`, `padrao`, `padrao-ui` e a
disciplina de dado critico (transacao atomica, trilha de auditoria, maquina de estados,
saldo == soma das movimentacoes). Nao e dinheiro: nada de Decimal monetario, mas quantidade
e inteira e a regra de nao-negativo vale.

Este documento define o QUE construir. Nao ha codigo de producao aqui: DDL e assinaturas sao
esboco para o Lucas finalizar e a Fernanda consumir. Espelha as convencoes ja existentes no
projeto (dominio puro, ports, repos `.pg`/`.mock`, rotas com auth+rate limit+zod, migrations
PT-BR snake_case com CHECK e RLS deny-by-default, transacao via `sql.begin`).

---

## 1. Visao geral e principios

O modulo cobre inventario fisico em 2 unidades (PENHA, ARARAQUARA) de duas naturezas:

- **Serializado**: 1 unidade fisica = 1 registro (pluviometro, PCD, modem, barco, gerador...).
  Tem identidade propria (numero de serie, IMEI, patrimonio). Movimentacao muda local/status
  da unidade individual.
- **Quantificavel**: item + quantidade agregada por local (cabos, antenas, placa solar...).
  Nao tem identidade individual; o que importa e o saldo por (material, local).

O modulo nasce COMPLETO com movimentacao: entrada, saida, transferencia, baixa/descarte e
ajuste, todas com trilha de auditoria (quem, quando, quantidade, de/para, motivo) e saldo
consistente. Toda movimentacao e atomica (uma `sql.begin`) e idempotente onde faz sentido.

Principios herdados do projeto:
- Dominio puro em `src/domain/estoque/*` (tipos, enums, maquina de estados, sem I/O).
- Ports em `src/application/ports/*`; adapters `.pg` (postgres-js) e `.mock` (demo) atras deles.
- Toggle demo/pg centralizado em `src/infrastructure/repositories.ts`.
- Rotas em `src/app/api/estoque/*`: `exigirUsuario` para leitura, `exigirAdmin` para escrita;
  rate limit por politica; validacao zod; erro via `respostaDeErro`; log estruturado.
- Migrations idempotentes (`IF NOT EXISTS`), reversiveis, CHECK para enum, RLS habilitada
  deny-by-default (backend conecta com BYPASSRLS e aplica autorizacao na aplicacao).

---

## 2. Modelo de dados

Seis tabelas. Nomes de tabela e coluna em pt-br snake_case, como o resto do banco.

Resumo:

| Tabela | Papel | Natureza |
| --- | --- | --- |
| `estoque_locais` | onde o item esta (unidade + sala/prateleira/armario) | ambas |
| `estoque_categorias` | classificacao opcional do catalogo | ambas |
| `estoque_materiais` | catalogo ("o que e"): descricao, marca, modelo, natureza | ambas |
| `estoque_unidades` | 1 linha por item fisico serializado | serializado |
| `estoque_saldos` | quantidade por (material, local) | quantificavel |
| `estoque_movimentacoes` | ledger/trilha de toda movimentacao | ambas |

### 2.1 Decisao central: saldo MANTIDO (nao derivado)

Para quantificaveis, o saldo fica **materializado** em `estoque_saldos.quantidade` e e atualizado
na MESMA transacao da movimentacao, com garantia dura de nao-negativo. Justificativa completa e
alternativa descartada na ADR 0020. Resumo:

- **Leitura**: listar/consultar saldo e a operacao mais frequente (telas de estoque). Saldo mantido
  e `SELECT` direto; saldo derivado exigiria `SUM(quantidade)` sobre o ledger a cada leitura.
- **Nao-negativo sob concorrencia**: a saida faz um UPDATE guardado atomico
  `SET quantidade = quantidade - :q WHERE quantidade >= :q`, e trata `rows affected == 0` como
  "saldo insuficiente". Somado ao `CHECK (quantidade >= 0)`, o banco garante o invariante sem
  janela de corrida. O caminho derivado nao consegue impor nao-negativo de forma barata e atomica.
- **Ledger continua sendo a verdade de auditoria**: `estoque_movimentacoes` registra tudo. O saldo
  e uma projecao materializada, **reconciliavel** por `SUM` do ledger. Um script/endpoint de
  conciliacao (`estoque:conciliar-saldos`) valida periodicamente `saldo == soma das movimentacoes`
  (o invariante do `financeiro.md`, aqui como checagem de integridade, nao como calculo por leitura).

Melhor dos dois mundos: leitura rapida + trilha auditavel + reconciliavel.

### 2.2 Coexistencia serializado x quantificavel (sem gambiarra)

- `estoque_materiais` e o catalogo ("o que e") das duas naturezas, com coluna `natureza`.
- **Serializado**: cada item fisico e uma linha em `estoque_unidades`. A unidade **carrega seus
  proprios atributos identificadores** (serie, imei, patrimonio, descricao/marca/modelo denormalizados)
  e tem `material_id` **opcional** (agrupamento no catalogo). Motivo: as ~2000 linhas serializadas da
  planilha sao heterogeneas; forcar 1 catalogo por linha seria normalizacao inutil (explosao ~1:1). O
  import faz best-effort de agrupar por catalogo (dedup por descricao+marca+modelo normalizados); quando
  a descricao e suja demais, `material_id` fica nulo e a unidade se descreve sozinha.
- **Quantificavel**: nao existe unidade individual. `material_id` e obrigatorio (e a identidade) e o
  estoque real vive em `estoque_saldos` por (material, local).
- **Movimentacao** referencia OU uma `unidade_id` (serializado) OU um `material_id` (quantificavel),
  nunca os dois, garantido por CHECK XOR na tabela do ledger.

### 2.3 Enums, maquina de estados

**`estado`** (condicao fisica observada, atributo da unidade serializada):
`novo | bom | usado | defeito | sucata`. Pode ser `null` quando a planilha nao informou.

**`status`** (situacao no inventario, ciclo de vida): `ativo | defeito | descarte`.

Maquina de estados de `status` (transicoes validas, no dominio `src/domain/estoque/status-unidade.ts`):

```
ativo     -> defeito     (item apresentou defeito)
ativo     -> descarte    (baixa direta)
defeito   -> ativo       (consertado / reavaliado)
defeito   -> descarte    (baixa por defeito irreversivel)
descarte  -> (terminal)  (so volta via ajuste admin explicito com motivo)
```

Transicao invalida rejeitada no use-case antes de qualquer escrita. `descarte` e terminal no fluxo
normal; reversao so por `tipo=ajuste` com motivo obrigatorio (auditavel). Quantificavel nao tem
`status`/`estado` de unidade: o "descarte" de quantificavel e uma movimentacao `baixa` que reduz saldo.

### 2.4 DDL (esboco — Lucas finaliza)

Migrations 0054 a 0059 (proximo numero livre apos 0053). Cada uma idempotente, reversivel, com RLS
deny-by-default e COMMENT, no estilo da 0045.

```sql
-- 0054_estoque_locais.sql
CREATE TABLE IF NOT EXISTS estoque_locais (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade     TEXT NOT NULL CHECK (unidade IN ('PENHA', 'ARARAQUARA')),
  sala        TEXT NULL,
  prateleira  TEXT NULL,   -- guarda prateleira OU armario (o que a planilha trouxer)
  armario     TEXT NULL,
  rotulo      TEXT NOT NULL,  -- normalizado, legivel: ex. "PENHA / SALA 2 / PRAT 5B"
  observacao  TEXT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- natural key normalizada: nao duplica local no import (get-or-create).
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_locais_chave
  ON estoque_locais (unidade, COALESCE(sala,''), COALESCE(prateleira,''), COALESCE(armario,''));
CREATE INDEX IF NOT EXISTS idx_estoque_locais_unidade ON estoque_locais (unidade);
ALTER TABLE IF EXISTS estoque_locais ENABLE ROW LEVEL SECURITY;

-- 0055_estoque_categorias.sql
CREATE TABLE IF NOT EXISTS estoque_categorias (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_categorias_nome ON estoque_categorias (lower(nome));
ALTER TABLE IF EXISTS estoque_categorias ENABLE ROW LEVEL SECURITY;

-- 0056_estoque_materiais.sql
CREATE TABLE IF NOT EXISTS estoque_materiais (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao      TEXT NOT NULL,
  marca          TEXT NULL,
  modelo         TEXT NULL,
  natureza       TEXT NOT NULL CHECK (natureza IN ('serializado', 'quantificavel')),
  unidade_medida TEXT NULL,   -- ex. 'un', 'm', 'par'; relevante para quantificavel
  categoria_id   UUID NULL REFERENCES estoque_categorias (id) ON DELETE SET NULL,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,  -- soft-inativar em vez de apagar (governo/auditoria)
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- dedup do import (best-effort): mesmo material logico nao duplica.
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_materiais_dedup
  ON estoque_materiais (natureza, lower(descricao), lower(COALESCE(marca,'')), lower(COALESCE(modelo,'')));
CREATE INDEX IF NOT EXISTS idx_estoque_materiais_categoria ON estoque_materiais (categoria_id) WHERE categoria_id IS NOT NULL;
ALTER TABLE IF EXISTS estoque_materiais ENABLE ROW LEVEL SECURITY;

-- 0057_estoque_unidades.sql  (serializados: 1 linha = 1 item fisico)
CREATE TABLE IF NOT EXISTS estoque_unidades (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id      UUID NULL REFERENCES estoque_materiais (id) ON DELETE SET NULL, -- agrupamento opcional
  -- identidade / patrimonio (podem faltar; 'S/N','SN','?' viram null no import)
  codigo           TEXT NULL,   -- CODIGO / CODIGO MATERIAL
  codigo_spaguas   TEXT NULL,   -- CODIGOSPAGUAS (chave natural preferida quando existir)
  pat_daee         TEXT NULL,   -- PAT.DAEE
  outros_pat       TEXT NULL,   -- OUTROS PAT.
  numero_serie     TEXT NULL,   -- NUMERO DE SERIE / IMEI (modem)
  helice           TEXT NULL,   -- especifico de pluviometro
  -- descricao denormalizada (a unidade se descreve mesmo sem catalogo)
  descricao        TEXT NOT NULL,
  marca            TEXT NULL,
  modelo           TEXT NULL,
  -- condicao e ciclo de vida
  estado           TEXT NULL CHECK (estado IN ('novo','bom','usado','defeito','sucata')),
  status           TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','defeito','descarte')),
  local_id         UUID NULL REFERENCES estoque_locais (id) ON DELETE SET NULL,
  data_aquisicao   DATE NULL,
  observacao       TEXT NULL,   -- texto original bruto da planilha (preserva o de-para do estado)
  chave_import     TEXT NULL,   -- chave natural deterministica do import (idempotencia)
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- idempotencia do import: nao duplica a mesma unidade fisica ao reprocessar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_unidades_chave_import
  ON estoque_unidades (chave_import) WHERE chave_import IS NOT NULL;
-- unicidade de patrimonio/serie quando existirem (integridade real do inventario).
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_unidades_codigo_spaguas
  ON estoque_unidades (codigo_spaguas) WHERE codigo_spaguas IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_unidades_local ON estoque_unidades (local_id) WHERE local_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_unidades_material ON estoque_unidades (material_id) WHERE material_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_unidades_status ON estoque_unidades (status);
CREATE INDEX IF NOT EXISTS idx_estoque_unidades_serie ON estoque_unidades (numero_serie) WHERE numero_serie IS NOT NULL;
ALTER TABLE IF EXISTS estoque_unidades ENABLE ROW LEVEL SECURITY;

-- 0058_estoque_saldos.sql  (quantificaveis: saldo mantido por material+local)
CREATE TABLE IF NOT EXISTS estoque_saldos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id   UUID NOT NULL REFERENCES estoque_materiais (id) ON DELETE RESTRICT,
  local_id      UUID NOT NULL REFERENCES estoque_locais (id) ON DELETE RESTRICT,
  quantidade    INTEGER NOT NULL DEFAULT 0 CHECK (quantidade >= 0),  -- nao-negativo garantido pelo banco
  tamanho       TEXT NULL,   -- TAMANHO da planilha quantificavel (ex. bitola de cabo)
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 1 saldo por (material, local): chave do upsert transacional.
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_saldos_material_local
  ON estoque_saldos (material_id, local_id, COALESCE(tamanho,''));
CREATE INDEX IF NOT EXISTS idx_estoque_saldos_local ON estoque_saldos (local_id);
ALTER TABLE IF EXISTS estoque_saldos ENABLE ROW LEVEL SECURITY;

-- 0059_estoque_movimentacoes.sql  (ledger / trilha de auditoria)
CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           TEXT NOT NULL CHECK (tipo IN ('entrada','saida','transferencia','baixa','ajuste')),
  -- XOR: serializado referencia unidade; quantificavel referencia material. Nunca os dois.
  unidade_id     UUID NULL REFERENCES estoque_unidades (id) ON DELETE RESTRICT,
  material_id    UUID NULL REFERENCES estoque_materiais (id) ON DELETE RESTRICT,
  quantidade     INTEGER NOT NULL DEFAULT 1 CHECK (quantidade >= 1),  -- serializado sempre 1
  local_origem   UUID NULL REFERENCES estoque_locais (id) ON DELETE SET NULL,
  local_destino  UUID NULL REFERENCES estoque_locais (id) ON DELETE SET NULL,
  estado_anterior TEXT NULL,   -- snapshot para auditoria (serializado)
  estado_novo     TEXT NULL,
  status_anterior TEXT NULL,
  status_novo     TEXT NULL,
  motivo         TEXT NULL,    -- obrigatorio para baixa e ajuste (validado na aplicacao)
  usuario_id     UUID NOT NULL,  -- quem fez (auth.users / usuarios_papeis)
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- exatamente um alvo (serializado XOR quantificavel)
  CONSTRAINT ck_estoque_mov_alvo CHECK (
    (unidade_id IS NOT NULL AND material_id IS NULL) OR
    (unidade_id IS NULL AND material_id IS NOT NULL)
  ),
  -- transferencia exige origem e destino distintos
  CONSTRAINT ck_estoque_mov_transf CHECK (
    tipo <> 'transferencia' OR (local_origem IS NOT NULL AND local_destino IS NOT NULL AND local_origem <> local_destino)
  )
);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_unidade ON estoque_movimentacoes (unidade_id, criado_em DESC) WHERE unidade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_mov_material ON estoque_movimentacoes (material_id, criado_em DESC) WHERE material_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_mov_tipo ON estoque_movimentacoes (tipo, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_usuario ON estoque_movimentacoes (usuario_id, criado_em DESC);
ALTER TABLE IF EXISTS estoque_movimentacoes ENABLE ROW LEVEL SECURITY;
```

Nota de auditoria (governo): o ledger e append-only na pratica. Correcao nunca sobrescreve linha:
gera nova movimentacao `ajuste` com motivo. Nao ha UPDATE/DELETE em `estoque_movimentacoes` pelo app.

### 2.5 Fluxo transacional da movimentacao (padrao do repo)

Toda movimentacao roda numa `sql.begin` (mesmo padrao de `triagem-repository.pg.ts` /
`favoritos-repository.pg.ts`):

- **Quantificavel entrada**: upsert em `estoque_saldos` (`ON CONFLICT (material,local,tamanho)
  DO UPDATE SET quantidade = quantidade + :q`) + insert no ledger.
- **Quantificavel saida/baixa**: `UPDATE estoque_saldos SET quantidade = quantidade - :q WHERE
  material_id=.. AND local_id=.. AND quantidade >= :q`; se `count == 0` -> erro `saldo_insuficiente`
  (rollback) + insert no ledger.
- **Quantificavel transferencia**: saida guardada no local origem + entrada (upsert) no destino +
  1 ledger com origem/destino, tudo na mesma `tx`.
- **Serializado transferencia**: `UPDATE estoque_unidades SET local_id=:destino` + ledger com
  origem (local atual) e destino.
- **Serializado baixa**: valida transicao de status no dominio -> `UPDATE ... SET status='descarte'`
  + ledger (status_anterior/novo, motivo obrigatorio).
- **Serializado ajuste**: corrige estado/status/local com motivo; ledger registra o snapshot.

---

## 3. Mapa de importacao (carga inicial unica)

Fonte: `ops/estoque/planilha-inicial.xlsx` (nao versionada). Script standalone `.mjs` com
postgres-js, rodado com `node --env-file=.env.local scripts/estoque/importar-inventario.mjs`,
espelhando `scripts/monitor/importar-estacoes-flu-piezo.mjs`. Idempotente: reprocessar nao duplica
(ON CONFLICT em chave natural). Le a planilha com uma lib de xlsx (ex. `xlsx`/`exceljs`) ou converte
para CSV/JSON antes; parsing fora do banco, upsert em lote como no import do Monitor.

### 3.1 Normalizacao de ESTADO (de-para texto -> enum)

Vive no dominio (`src/domain/estoque/estado.ts`, `mapearEstado(textoObservacao)`), reutilizada pelo
import e por qualquer edicao. Case-insensitive, trim, sem acento. **Preserva sempre o texto original
em `observacao`**; o enum e derivado, nao substitui.

| Texto na planilha (OBSERVACAO) | estado |
| --- | --- |
| NOVO, NOVA, NA CAIXA, LACRADO, VEDADO | `novo` |
| BOA, BOM, OK, PERFEITO, OTIMO | `bom` |
| USADO, USADA, REGULAR, DUVIDOSO | `usado` |
| COM DEFEITO, DEFEITO, COM PROBLEMA, QUEIMADO, NAO FUNCIONA | `defeito` |
| SUCATA, INSERVIVEL, IMPRESTAVEL | `sucata` |
| VAZIO, "?", "", sem correspondencia | `null` (nao classificado; observacao preserva o bruto) |

`status` no import: default `ativo`; aba DESCARTE -> `descarte`; `estado == defeito` -> `status defeito`.

### 3.2 Localizacao suja (sala / prateleira / armario)

`normalizarLocal({ unidade, local, sala, prateleira, armario })` -> get-or-create em `estoque_locais`:
- `unidade` vem da aba (PENHA ou ARARAQUARA).
- trim + uppercase + colapsa espaco; `"?"`, `"-"`, `""` viram `null`.
- valores tipo `"5B"`, `"12 CORREDOR"` ficam como texto no campo correspondente (nao inventa estrutura).
- `rotulo` legivel montado a partir dos campos preenchidos.
- get-or-create pela natural key (unidade + sala + prateleira + armario normalizados): mesmo local
  nao duplica entre linhas nem entre reexecucoes.

### 3.3 Chave natural / idempotencia por aba

`chave_import` deterministica por unidade serializada, na ordem de preferencia:
`codigo_spaguas` -> `numero_serie`/`imei` -> `pat_daee` -> `codigo` -> hash estavel de
(descricao+marca+modelo+serie+unidade+linha). `S/N`, `SN`, `?` nao contam como identificador
(viram null). ON CONFLICT (`chave_import`) DO UPDATE nas colunas de atributo. Para quantificaveis,
a chave e (material_id, local_id, tamanho) no upsert de `estoque_saldos`.

### 3.4 De-para por aba

| Aba | Natureza | Destino | Observacoes |
| --- | --- | --- | --- |
| GERAL PENHA (~999) | serializado | `estoque_unidades` (unidade=PENHA) + ledger `entrada` | catalogo best-effort |
| GERAL ARARAQUARA (~999) | serializado | `estoque_unidades` (unidade=ARARAQUARA) + ledger `entrada` | idem |
| MODENS (173) | serializado | `estoque_unidades` | chave_import = IMEI (numero_serie); descricao "Modem" |
| QUANTIFICAVEIS PENHA (120) | quantificavel | `estoque_materiais` + `estoque_saldos` (PENHA) + ledger `entrada` | saldo = QUANTIDADE; TAMANHO -> saldo.tamanho |
| QUANTIFICAVEIS ARARAQUARA (vazia) | quantificavel | — | pular (0 linhas) |
| DESCARTE PENHA (16) | serializado | `estoque_unidades` com `status='descarte'` + ledger `baixa` (motivo "carga inicial: descarte") | |

Mapa de colunas (serializado): CODIGO/CODIGO MATERIAL->`codigo`; CODIGOSPAGUAS->`codigo_spaguas`;
PAT.DAEE->`pat_daee`; OUTROS PAT.->`outros_pat`; NUMERO DE SERIE/IMEI->`numero_serie`;
DESCRICAO DE MATERIAL->`descricao`; MARCA->`marca`; MODELO->`modelo`; HELICE->`helice`;
LOCAL/SALA/PRATELEIRA/ARMARIO->`estoque_locais` (via normalizarLocal); DATA->`data_aquisicao`
(parse tolerante, invalido->null); OBSERVACAO->`observacao` (bruto) + deriva `estado`.

Mapa (quantificavel): LOCAL/PRATELEIRA->`estoque_locais`; ITEM->`estoque_materiais.descricao`;
MODELO->`estoque_materiais.modelo`; TAMANHO->`estoque_saldos.tamanho`; QUANTIDADE->`estoque_saldos.quantidade`.

Linhas invalidas/vazias: sem descricao E sem nenhum identificador -> pular e contabilizar (como o
import do Monitor faz com `semId`/`semPrefixo`/`semCoord`). Relatorio final por aba: inseridas,
atualizadas, puladas e motivo. Cada linha de carga inicial gera sua movimentacao `entrada` (ou `baixa`
para DESCARTE) com `usuario_id` = usuario de sistema/import, para o saldo bater com o ledger desde o dia 1.

---

## 4. API (rotas REST em `src/app/api/estoque/*`)

Padrao de toda rota: `runtime='nodejs'`, `dynamic='force-dynamic'`; leitura -> `exigirUsuario`,
escrita -> `exigirAdmin` (retorna 401/403 no formato padrao); rate limit via `POLITICAS.*`; body/query
por zod com `safeParse` -> 400 com `motivos`; erro via `respostaDeErro(contexto, {usuarioId}, e)`;
log estruturado `logger.info`.

Novas politicas de rate limit em `src/infrastructure/security/rate-limit.ts`:
- `leituraEstoque` (limite 200 / 60s) — todas as leituras.
- `movimentacaoEstoque` (limite 60 / 60s) — mutacoes de dado.

| Metodo + rota | Auth | Uso | Payload / query principal |
| --- | --- | --- | --- |
| GET `/api/estoque/materiais` | usuario | listar/filtrar catalogo | `natureza`, `categoria`, `busca`, `pagina`, `porPagina` |
| POST `/api/estoque/materiais` | admin | criar material | corpo `materialSchema` |
| GET `/api/estoque/materiais/[id]` | usuario | detalhe | — |
| PATCH `/api/estoque/materiais/[id]` | admin | editar | corpo parcial `materialSchema` |
| DELETE `/api/estoque/materiais/[id]` | admin | inativar (soft) | bloqueia hard-delete se houver unidade/saldo/mov |
| GET `/api/estoque/unidades` | usuario | listar/filtrar serializados | `local`, `unidade`, `estado`, `status`, `materialId`, `busca` (serie/pat/descricao), `pagina` |
| POST `/api/estoque/unidades` | admin | criar unidade | corpo `unidadeSchema` |
| GET `/api/estoque/unidades/[id]` | usuario | detalhe + historico | — |
| PATCH `/api/estoque/unidades/[id]` | admin | editar atributos | corpo parcial |
| DELETE `/api/estoque/unidades/[id]` | admin | excluir se sem movimentacao; senao usar baixa | — |
| GET `/api/estoque/locais` | usuario | listar locais | `unidade` |
| POST/PATCH/DELETE `/api/estoque/locais[/[id]]` | admin | CRUD local | corpo `localSchema` |
| GET `/api/estoque/categorias` | usuario | listar | — |
| POST/PATCH/DELETE `/api/estoque/categorias[/[id]]` | admin | CRUD categoria | corpo `categoriaSchema` |
| GET `/api/estoque/saldos` | usuario | consultar saldo quantificavel | `materialId`, `local`, `unidade` |
| POST `/api/estoque/movimentacoes` | admin | registrar movimentacao (nucleo) | corpo `movimentacaoSchema` |
| GET `/api/estoque/movimentacoes` | usuario | trilha/auditoria paginada | `tipo`, `unidadeId`, `materialId`, `local`, `usuarioId`, `de`, `ate`, `pagina` |

Schema zod principal (esboco, `movimentacaoSchema` — discriminated union por `tipo` com refinamentos):

```ts
// serializado: exige unidadeId. quantificavel: exige materialId + quantidade>=1 + locais.
const movimentacaoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('entrada'),
    alvo: alvoSchema, localDestino: z.string().uuid(), quantidade: z.number().int().min(1).default(1) }),
  z.object({ tipo: z.literal('saida'),
    alvo: alvoSchema, localOrigem: z.string().uuid(), quantidade: z.number().int().min(1).default(1) }),
  z.object({ tipo: z.literal('transferencia'),
    alvo: alvoSchema, localOrigem: z.string().uuid(), localDestino: z.string().uuid(),
    quantidade: z.number().int().min(1).default(1) })
    .refine((v) => v.localOrigem !== v.localDestino, 'origem e destino devem diferir'),
  z.object({ tipo: z.literal('baixa'),
    alvo: alvoSchema, motivo: z.string().trim().min(3), quantidade: z.number().int().min(1).default(1) }),
  z.object({ tipo: z.literal('ajuste'),
    alvo: alvoSchema, motivo: z.string().trim().min(3),
    estado: estadoEnum.optional(), status: statusEnum.optional(),
    localDestino: z.string().uuid().optional(), quantidade: z.number().int().min(1).default(1) }),
]);
// alvoSchema = XOR unidadeId | materialId (refine: exatamente um).
```

Resposta de `POST /api/estoque/movimentacoes`: 201 com a movimentacao criada + saldo/unidade
resultante. Erros de negocio: 409 `saldo_insuficiente`, 409 `transicao_invalida`, 404 alvo/local
inexistente, 400 payload.

---

## 5. Estrutura de arquivos

Espelha a arvore do projeto. Dominio puro, ports, use-cases, repos `.pg`+`.mock`, rotas, componentes.

```
src/domain/estoque/
  material.ts            # Material, Natureza, FiltrosMaterial, UpsertMaterial
  unidade.ts             # Unidade, FiltrosUnidade, UpsertUnidade
  local.ts               # Local, normalizarLocal (pura), rotulo
  saldo.ts               # Saldo
  movimentacao.ts        # Movimentacao, TipoMovimentacao, entrada dto
  estado.ts              # Estado enum + mapearEstado(texto) (de-para)
  status-unidade.ts      # Status enum + transicaoValida(de,para) (maquina de estados)
  categoria.ts           # Categoria
  errors.ts?             # reaproveitar src/domain/errors.ts (FalhaRepositorio etc.)

src/application/ports/
  estoque-materiais-repository.ts
  estoque-unidades-repository.ts
  estoque-locais-repository.ts
  estoque-saldos-repository.ts
  estoque-movimentacoes-repository.ts   # registrar() faz a transacao completa

src/application/use-cases/estoque/
  registrar-movimentacao.ts   # valida dominio (transicao, nao-negativo, XOR) e chama o repo
  conciliar-saldos.ts         # invariante saldo == soma do ledger (usado por script/endpoint)

src/infrastructure/db/
  estoque-materiais-repository.pg.ts
  estoque-unidades-repository.pg.ts
  estoque-locais-repository.pg.ts
  estoque-saldos-repository.pg.ts
  estoque-movimentacoes-repository.pg.ts   # sql.begin: ledger + saldo/unidade atomico
src/infrastructure/mock/
  estoque-*-repository.mock.ts             # in-memory para MODO DEMO
src/infrastructure/repositories.ts         # + wiring dos toggles demo/pg

src/app/api/estoque/
  materiais/route.ts               materiais/[id]/route.ts
  unidades/route.ts                unidades/[id]/route.ts
  locais/route.ts                  locais/[id]/route.ts
  categorias/route.ts              categorias/[id]/route.ts
  saldos/route.ts
  movimentacoes/route.ts

src/app/(dashboard)/estoque/       # paginas (Fernanda)
scripts/estoque/importar-inventario.mjs    # carga inicial idempotente
```

Componentes de frontend previstos (lista para a Fernanda; ela define o desenho fino):

```
src/components/features/estoque/
  EstoqueLista.tsx            # lista unificada com abas Serializados | Quantificaveis
  FiltrosEstoque.tsx          # unidade, local, natureza, estado, status, categoria, busca
  UnidadeCard.tsx / UnidadeDetalhe.tsx   # detalhe + historico de movimentacao
  MaterialForm.tsx / UnidadeForm.tsx     # CRUD (Adicionar/Editar/Salvar/Cancelar/Excluir)
  SaldoTabela.tsx             # quantificaveis por local
  MovimentacaoDialog.tsx      # registrar entrada/saida/transferencia/baixa/ajuste
  TrilhaMovimentacoes.tsx     # auditoria paginada (quem/quando/de-para/motivo)
  BadgeEstado.tsx / BadgeStatus.tsx      # SVG/monograma, SEM emoji (padrao-ui)
```

Requisitos de UI (rules `padrao-ui` + `governo`): acento PT-BR correto em todo texto visivel; sem
emoji decorativo; sem `window.confirm/prompt/alert` (usar ConfirmDialog/PromptDialog do projeto);
CRUD completo em toda lista (Adicionar/Editar/Salvar/Cancelar/Excluir); estados vazio/carregando/
erro/sucesso/borda; responsivo real (mobile/tablet); acessibilidade WCAG 2.1 AA / e-MAG (governo).

---

## 6. RBAC

Mecanismo existente (`src/app/api/_helpers/auth.ts` + `src/domain/auth/papel.ts`):

- Leitura (todos os GET): `const auth = await exigirUsuario(); if (auth instanceof NextResponse) return auth;`
  Papeis `user`, `admin`, `super_admin` leem (user = consulta read-only).
- Escrita (POST/PATCH/DELETE e `movimentacoes`): `const auth = await exigirAdmin();` (admin ou
  super_admin). `user` recebe 403 `sem_papel_admin`. Nao criar papel novo: o RBAC atual ja cobre
  ("admin/super_admin gerenciam; user consulta").
- Frontend esconde acao de escrita para `user`: o papel ja chega no cliente (mesmo mecanismo das
  telas admin/triagem). Botoes Adicionar/Editar/Excluir/Movimentar so renderizam para `ehAdmin(papel)`.
  Esconder no front e UX; a autorizacao real e sempre no backend (defesa em profundidade, nunca
  confiar so no client).
- `usuario_id` de toda movimentacao vem do `auth` do backend (nunca do corpo): garante trilha fiel.

---

## 7. Plano de fases e riscos

Ordem que destrava o resto (para Lucas e Fernanda):

1. **Fase 1 — Fundacao de dados (Lucas).** Migrations 0054-0059. Aplicar no banco ANTES de qualquer
   push de codigo que leia as tabelas (aprendizado do projeto: coluna/tabela nova que o ORM le e
   fatal se o codigo sobe antes do schema). Confirmar via `information_schema`. Dominio puro
   (`estado.ts`, `status-unidade.ts`, tipos) com testes unitarios do de-para e da maquina de estados.
2. **Fase 2 — Ports + repos + leitura (Lucas).** Ports, repos `.pg`+`.mock`, wiring no
   `repositories.ts`. Rotas GET (materiais, unidades, locais, saldos, movimentacoes) com auth+rate
   limit+zod. Destrava o front para listar.
3. **Fase 3 — Movimentacao transacional (Lucas).** `estoque-movimentacoes-repository.pg.ts` com
   `sql.begin` (ledger + saldo guardado/unidade), use-case `registrar-movimentacao`, rota POST.
   Testes: saldo nao-negativo sob concorrencia, transferencia atomica, transicao de status invalida,
   XOR alvo. Provar contra Postgres real (nao so SQLite): o guarded UPDATE, o upsert e o CHECK sao
   features de Postgres (aprendizado do projeto: teste verde em SQLite esconde bug de Postgres).
4. **Fase 4 — CRUD de escrita (Lucas).** POST/PATCH/DELETE de material/unidade/local/categoria com
   `exigirAdmin`. DELETE com guarda (soft-inativar material; unidade so exclui sem movimentacao).
5. **Fase 5 — Frontend (Fernanda), em paralelo a partir da fase 2.** Lista com abas, filtros,
   detalhe+historico, dialog de movimentacao, trilha, CRUD completo. Esconder escrita para `user`.
   Padrao-ui + acessibilidade governo.
6. **Fase 6 — Import (Lucas).** `scripts/estoque/importar-inventario.mjs` idempotente. Rodar UMA vez
   apos as fases 1-3 estarem estaveis (o import gera movimentacoes de `entrada`, entao depende do
   ledger). Relatorio por aba. Conciliacao `saldo == soma do ledger` ao final.
7. **Fase 7 — QA + Seguranca (Thiago + Andre).** Regressao, validacao de completude, OWASP/IDOR nas
   rotas (parametro `id` sempre com `exigirAdmin`/`exigirUsuario`, nunca IDOR), LGPD (dado de
   inventario nao e dado pessoal, mas `usuario_id` no ledger e; log sem PII).

Riscos:
- **Dado sujo na planilha** (estado no texto livre, local inconsistente, patrimonio "S/N"). Mitigado
  por de-para determinista + preservacao do bruto em `observacao` + `chave_import` tolerante. Risco
  residual: agrupamento de catalogo best-effort pode errar dedup; aceitavel porque `material_id` e
  opcional e a unidade se descreve sozinha.
- **Concorrencia no saldo**. Mitigado pelo guarded UPDATE + CHECK (>=0) na mesma transacao.
- **Ordem migration x deploy**. Mitigado pela regra "aplica no banco, confirma, depois push".
- **Nome/misnomer futuro**. Sem risco aqui: nomes `estoque_*` sao proprios do dominio, nada de
  reaproveitar tabela existente.
- **Reexecucao do import**. Mitigado por idempotencia (ON CONFLICT em `chave_import` e em
  saldo por material+local); mas import repetido gera movimentacoes `entrada` duplicadas se nao
  guardado. Mitigacao: o import so registra `entrada` no ledger para linha efetivamente INSERIDA
  (nao para update), mantendo saldo == ledger. Documentar no script.
```

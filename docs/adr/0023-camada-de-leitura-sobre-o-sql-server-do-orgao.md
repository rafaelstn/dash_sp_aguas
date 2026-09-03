# ADR 0023: Camada de leitura sobre o SQL Server do órgão

| Campo | Valor |
|-------|-------|
| Status | Proposto |
| Data | 2026-08-27 |
| Decisor | Rafael Damasceno (proprietário), com homologação do órgão |
| Autoria técnica | Bruno (Engenharia), sob orquestração de Matheus (CTO) |
| Escopo | Camada de leitura do domínio cadastral, identidade, agendamento, busca textual, geoespacial |
| Cliente | GOVERNO (SP Águas / DAEE). Rules `governo`, `padrao`, `padrao-ui` |
| Resolve | ADR 0015 §3 (pendência de identidade) |
| Revisa | ADR 0002 (driver), ADR 0004 e 0006 (auth), ADR 0013 (PostGIS) |

---

## 0. O que este ADR decide, e o que ele explicitamente não decide

A instrução do proprietário define o eixo, e ela é citada aqui porque muda a
natureza do trabalho:

> "A ideia não é refazer o banco, é começar a transmitir o banco deles, então o
> nosso nem mexe, só adapta o sistema para aceitar a tabela nova."

**Portanto, e isto vale contra qualquer leitura em contrário deste documento:**

- **Não há migração de dados.** Nada é copiado, espelhado, importado, populado ou
  descartado. O banco do órgão permanece como está. O nosso permanece como está.
- **O trabalho é adaptar a camada de leitura** para consumir o schema do órgão
  **como ele é**, sem pedir que ele mude.
- **As portas em `src/application/ports/` são o contrato que não muda.** É isso, e
  só isso, que permite trocar a origem do dado sem reescrever o domínio.

**Fora de escopo, por determinação explícita:** as funcionalidades que não têm
tabela correspondente no banco do órgão. São elas, e apenas listá-las já é a
entrega desta seção:

arquivos indexados, fichas de triagem e o fluxo de aprovação, fichas de visita,
desconformidades e revisões, favoritos por usuário, módulo de estoque, inventário
ANA, trilha de auditoria de acesso, diagramas, fotos de posto.

Essas continuam exatamente onde estão, no nosso PostgreSQL, sem alteração de
schema. Tabela nova para elas, se houver, é assunto de ADR futuro, em banco ou
schema separado, e **não agora**.

Este ADR também não autoriza execução: nenhuma migração foi rodada, nenhum deploy
foi feito, e nada foi escrito no banco do órgão.

---

## Metodologia

Cada afirmação está marcada como **MEDIDO** ou **HIPÓTESE**.

- **MEDIDO**: leitura direta do catálogo do SQL Server em `10.20.40.62`, com o
  objeto nomeado, ou leitura de arquivo do repositório, com caminho e linha. Todas
  as consultas foram somente leitura, sobre catálogo e agregados. Nenhuma escrita.
  Nenhum dado pessoal extraído.
- **HIPÓTESE**: inferência não confirmada. Toda hipótese relevante reaparece na
  seção 12, com a consulta exata que a resolveria.

---

## 1. Contexto

### 1.1 O ambiente, medido

| Fato | Valor | Medição |
|------|-------|---------|
| Servidor | SQL Server 2022, 16.0.1180.1, Standard Edition, RTM | `SERVERPROPERTY('ProductVersion')`, `('Edition')` |
| Banco | `Dbfch` em `10.20.40.62`, 157 tabelas, **nenhuma view, nenhuma procedure** | `Dbfch.sys.tables`, `sys.objects` |
| Collation do servidor | `Latin1_General_CI_AS` | `SERVERPROPERTY('Collation')` |
| **Collation de `Dbfch`** | **`SQL_Latin1_General_CP1_CI_AS`** | `DATABASEPROPERTYEX('Dbfch','Collation')` |
| Bancos na instância | 14, entre eles `Dblogs`, `dbDaeeWeb` e `outsystems` | `sys.databases` |
| Postos ativos | **5.790** (`Excluido = 0`), contra 2.483 no nosso CSV | `COUNT(*)` |

A collation do banco **não é a do servidor**, e a diferença importa: as duas
terminam em `CI_AS`, o que significa **insensível a maiúsculas e sensível a
acento**. Ver seção 9.

O servidor de aplicação (Ubuntu, `10.199.43.27`) **não tem saída para a
internet**: DNS externo não resolve e a saída TCP 443 está bloqueada. **MEDIDO**
pelo Rafael. Nenhum componente que dependa de serviço em nuvem sobrevive ali.

### 1.2 A restrição que governa tudo: somente leitura

Medido de forma direta, não presumida:

```
HAS_PERMS_BY_NAME('Dbfch','DATABASE','CREATE TABLE')    = 0
HAS_PERMS_BY_NAME('Dbfch.dbo.Postos','OBJECT','INSERT') = 0
HAS_PERMS_BY_NAME('Dbfch.dbo.Postos','OBJECT','SELECT') = 1
HAS_PERMS_BY_NAME(NULL,NULL,'CREATE ANY DATABASE')      = 0
```

O login **não pertence a nenhum papel de banco** em `Dbfch`
(`sys.database_role_members` cruzado com `USER_NAME()` retornou vazio): a leitura
foi concedida diretamente. **MEDIDO.**

Isto decide sozinho seis questões deste documento: não criamos tabela, não criamos
índice, não criamos catálogo de busca textual, não gravamos contador de tentativa
de login, não enfileiramos tarefa no agendador deles, e não criamos chave
estrangeira apontando para as tabelas deles.

O Rafael avalia com o órgão uma **API HTTP** para o CRUD. Enquanto ela não
existir, o sistema é de consulta sobre a base institucional.

### 1.3 O que existe do nosso lado, medido

- **28 portas** em `src/application/ports/`.
- **25 adaptadores `.pg.ts`** em `src/infrastructure/db/`, mais
  `usuarios-admin-repository.supabase.ts`, mais `client.ts` e um mapper.
  **6.625 linhas** somadas nos 28 arquivos do diretório.
- **165 blocos de SQL cru** (`sql\`` como template tag), contados por
  `grep -o` sobre `*.pg.ts`. A contagem de 171 do CTO usa método ligeiramente
  diferente; a ordem de grandeza é a mesma e nenhuma decisão depende da diferença.
- Cliente único em `src/infrastructure/db/client.ts`, singleton preguiçoso sobre
  `postgres.js` 3.4.9.
- **65 migrations** em `supabase/migrations/`, que **permanecem válidas e
  aplicadas**, porque o nosso schema não muda.

---

## 2. Decisão 1: a fronteira. O que muda de origem e o que não muda

Esta é a seção mais importante do documento, porque ela dimensiona o trabalho, e o
dimensionamento contraria a intuição.

### 2.1 A medição que define o escopo

Varredura em `src/infrastructure/db/*.pg.ts` procurando referência à tabela
`postos` em posição de `FROM`, `JOIN`, `UPDATE` ou `INTO`. **MEDIDO:**

| Adaptador | Referências a `postos` | Linhas do arquivo |
|---|---|---|
| `postos-repository.pg.ts` | 15 | 742 |
| `ana-revisao-repository.pg.ts` | 9 | 878 |
| `painel-repository.pg.ts` | 7 | 363 |
| `facetas-repository.pg.ts` | 6 | 104 |
| `triagem-repository.pg.ts` | 1 | 763 |
| `inventario-ana-export-repository.pg.ts` | 1 | 110 |
| **Os outros 19 adaptadores** | **0** | 3.665 |

**Dezenove dos vinte e cinco adaptadores nunca tocam em `postos`.** Estoque
inteiro, arquivos, fichas de visita, revisões, favoritos, auditoria, diagramas,
fotos, papéis, leituras e estações pluviométricas continuam lendo o nosso
PostgreSQL, sem uma linha alterada.

> **CORREÇÃO de 03/09/2026: `desconformidades` estava nesta lista e não podia
> estar.** `desconformidades-repository.pg.ts` lê a view `v_postos_desconformes`,
> que é `FROM postos`. A contagem acima procurou `postos` em posição de `FROM` e
> `JOIN` dentro dos adaptadores, e **uma view esconde a dependência de qualquer
> varredura que olhe só o texto do adaptador**: o nome da tabela está na
> definição da view, não na consulta que a lê.
>
> A consequência estava invisível e é concreta: com o cadastro vindo do órgão e
> a nossa tabela `postos` em 0 linhas, **a tela `/desconformidades` também está
> zerada em produção**, e este documento afirmava que ela não estaria.
>
> Ao medir dependência de tabela, incluir as VIEWS:
> `information_schema.view_table_usage` responde o que o `grep` no adaptador não
> alcança. Aqui, a diferença entre dezenove e dezoito é uma tela inteira.
>
> **O que fazer com o módulo é decisão de produto, e não tradução técnica.** A
> régua atual de desconformidade, traduzida para o `Dbfch` e medida contra os
> 5.790 postos, classificaria **3.084 como `outlier_prefixo` e 61 como
> `suspeita_troca_letra_digito`, ou seja 54% da rede como cadastro irregular**. A
> maior família recusada são os códigos numéricos de oito dígitos (`01947000`,
> `02043005`), que no cadastro do órgão são prefixo legítimo de posto
> pluviométrico. A régua descrevia a planilha de origem, e não o banco oficial:
> portá-la mecanicamente publicaria alarme falso em mais da metade da rede.

Isto é consequência direta da instrução do proprietário, e confirma que ela é
tecnicamente sólida: o que muda de origem é **o domínio cadastral de posto**, e
mais nada.

### 2.2 As referências não são todas iguais

Classificação **MEDIDA**, lendo cada uma das 39 referências:

**Grupo 1, consulta isolada a `postos` (30 referências, 4 arquivos).** Exemplos
medidos: `postos-repository.pg.ts:172` (`SELECT ... FROM postos WHERE prefixo =
...`), `facetas-repository.pg.ts:31,38,45,52`, `painel-repository.pg.ts:71,139,187`.
Estas migram para um adaptador `.mssql.ts`. É trabalho mecânico e previsível.

**Correção que desfaz a leitura fácil: nenhum arquivo migra inteiro.**
`postos-repository.pg.ts` **não é só sobre `postos`**. O método `listarEventos`
(**MEDIDO**, linhas 611 a 640) lê `postos_evento`, tabela **nossa**, com
subconsulta correlacionada a `auth.users`, também **nossa**, e não referencia
`postos` em lugar nenhum:

```sql
SELECT e.id, e.evento,
       (SELECT email FROM auth.users WHERE id = e.ator_id) AS ator_email, ...
  FROM postos_evento e WHERE e.posto_id = ...
```

O repositório **se divide por método**, não migra por arquivo: as consultas a
`postos` vão para o SQL Server e `listarEventos` permanece no PostgreSQL, sem
alteração. **A unidade de migração é o método da porta, não o arquivo do
adaptador.** Contar referências por arquivo dimensiona o trabalho, mas não define
o recorte, e os outros cinco precisam da mesma conferência antes de qualquer
movimento.

**Grupo 2, junção verdadeira entre os dois armazenamentos (8 referências, 2
arquivos).** Todas medidas:

```
ana-revisao-repository.pg.ts:317,452,489,511,568   LEFT JOIN postos p ON p.id = e.posto_id
ana-revisao-repository.pg.ts:716,767               JOIN postos p ON p.id = e.match_sugerido_posto_id
inventario-ana-export-repository.pg.ts:99          LEFT JOIN postos p ON p.id = e.posto_id
```

Estas **deixam de ser possíveis em SQL**, porque um lado passa a estar em outro
servidor. Exigem composição na camada de aplicação. São **oito pontos, em dois
arquivos**, e é aqui que mora o risco real do trabalho.

**Grupo 3, verificação pontual (1 referência).**
`triagem-repository.pg.ts:480` (`SELECT deleted_at FROM postos WHERE prefixo =
...`) vira uma chamada à porta de postos. Trivial.

**Conclusão de escopo, que é o que o Rafael precisa ouvir:** o trabalho não é
portar 6.625 linhas nem 165 blocos de SQL. É migrar um domínio, com **oito pontos
de junção cruzada** que exigem cuidado e o resto sendo tradução direta.

### 2.3 Decisão

**Decisão: um adaptador novo por repositório afetado, com sufixo `.mssql.ts`,
convivendo com os `.pg.ts` existentes. As portas não mudam.**

```
src/application/ports/postos-repository.ts       (contrato, INALTERADO)
                    ^
                    |
        postos-repository.mssql.ts               (novo, lê Dbfch)
        postos-repository.pg.ts                  (existente, some quando o novo passar)
```

A convenção de sufixo por tecnologia já existe no projeto (`.pg.ts`,
`.supabase.ts`) e é o ativo que torna isso barato: o nome do arquivo já declara a
origem, e os dois podem coexistir durante a transição, com a escolha feita na
composição.

**Regra arquitetural, inegociável: nenhum adaptador executa junção entre os dois
armazenamentos.** Vale mesmo que o nosso PostgreSQL e o SQL Server deles venham a
ficar na mesma sala de máquinas. As oito junções do grupo 2 são resolvidas
buscando os identificadores de um lado e resolvendo o lote no outro, em **uma**
consulta por lote, nunca uma por linha.

Nota de desempenho, para que a regra não seja lida como cara: são 5.790 postos.
Resolver um lote inteiro de identificadores contra essa tabela é trabalho
desprezível. O padrão N mais 1 é que seria caro, e é justamente o que a regra
proíbe.

### 2.4 Alternativa avaliada e descartada: `tds_fdw`

Existe um atalho real, e ele merece registro porque é sedutor: instalar `tds_fdw`
no nosso PostgreSQL, expor `Dbfch.dbo.Postos` como tabela estrangeira, e substituir
a nossa tabela `postos` por uma **view** que faz as junções e a conversão de
coordenada. **As 39 referências continuariam funcionando sem alteração, inclusive
as oito junções cruzadas.**

**Descartado**, por três razões em ordem de peso:

1. **Esconde uma chamada de rede dentro do que parece uma junção local.** Este
   projeto já tem um incidente exatamente dessa forma, registrado em
   `src/infrastructure/db/client.ts`: em 19/08/2026 um pool nascia por consulta e
   ninguém via, porque o custo estava escondido atrás de uma abstração. Repetir o
   padrão, agora com latência de rede entre servidores, é convidar o mesmo tipo de
   incidente com diagnóstico ainda mais difícil.
2. **Acopla a disponibilidade dos dois bancos no nível do SQL.** Com a tabela
   estrangeira, o servidor do órgão fora do ar faz a consulta pendurar, em vez de
   falhar de forma legível e degradar a tela.
3. **Acrescenta uma extensão C ao PostgreSQL de uma entrega de governo,
   on-premises e sem internet.** É mais um componente para a PRODESP instalar,
   atualizar e suportar no handoff (ADR 0015).

O atalho fica registrado porque, se o prazo apertar, ele é uma ponte legítima e
temporária. Mas ponte temporária precisa ser decidida como tal, com data, e não
descoberta depois como arquitetura.

---

## 3. Decisão 2: driver de acesso ao SQL Server

**Decisão: `mssql` (node-mssql) sobre `tedious`.**

A justificativa que pesa mais não é comparação de recursos: `tedious` implementa o
protocolo TDS **em JavaScript puro**, sem módulo nativo e sem `node-gyp`. O
servidor de aplicação não tem saída para a internet (**MEDIDO**), portanto
dependência que compile no destino ou baixe binário na instalação transforma o
deploy em problema. A alternativa `msnodesqlv8` exigiria o ODBC Driver instalado no
sistema operacional do contêiner, acrescentando pacote de sistema a gerir em
ambiente sem rede.

**Configuração obrigatória, herdada de incidente conhecido:** o cliente novo nasce
como **singleton em `globalThis`, com pool explícito**, e o comentário de causa do
incidente de 19/08/2026 é transportado para o arquivo novo. Aquele defeito produziu
cinco clientes por requisição simulada contra um pooler que aceitava quinze
sessões. Repeti-lo seria regressão conhecida.

**Convivência com a hipótese da API do órgão.** A porta é a costura, e ela não
muda. Se a escrita passar a ser por HTTP, entra um segundo adaptador
(`.api.ts`) implementando o mesmo contrato, e o caso de uso não fica sabendo. Até
lá, **os métodos de escrita lançam um erro tipado de domínio,
`EscritaIndisponivel`**, traduzido pela camada HTTP no padrão já centralizado pela
ADR 0017. O que não se faz é deixar o método sem efeito e sem aviso: escrita que
não acontece e não avisa é a pior categoria de defeito deste projeto.

Isso tem consequência funcional imediata e visível: hoje `postos-repository.pg.ts`
escreve em `postos` (**MEDIDO**: `postos-repository.pg.ts:437`, dentro de fluxo de
inserção, e a migration `0031_postos_fonte_unica.sql` com `postos_evento`). **Essas
funcionalidades de edição de cadastro ficam indisponíveis** até a API existir, e
isso precisa ser comunicado antes de acontecer.

**HIPÓTESE a validar na implementação:** o `tedious` decodifica `varchar` usando a
code page da collation da coluna, o que dispensaria tratamento manual de `cp1252`.
A sondagem em Python precisou de `setdecoding(SQL_CHAR, 'cp1252')` explícito, mas
isso é comportamento do `pyodbc`, não do TDS. O teste que decide: ler os **62**
registros de `Postos.Nome` que contêm acento (**MEDIDO**) e conferir integridade no
Node.

---

## 4. Decisão 3: identidade

Esta seção resolve a pendência declarada em **ADR 0015 §3**, que deixou em aberto a
escolha entre GoTrue self-hosted e autenticação própria. As duas opções foram
formuladas antes de sabermos que o órgão já possui base de identidade. **As duas
ficam superadas.**

### 4.1 O que o schema deles oferece, medido coluna a coluna

`Dbfch.dbo.UsuariosIdentity`, **23 colunas**, **29 linhas**, PK
`PK_UsuariosIdentity` sobre `Id uniqueidentifier`. **MEDIDO** via
`Dbfch.sys.columns` e `sys.indexes`.

| Coluna | Tipo | Papel |
|--------|------|-------|
| `Id` | `uniqueidentifier` NOT NULL | chave primária |
| `Nome` | `nvarchar(max)` NOT NULL | nome curto |
| `NomeCompleto` | `nvarchar(max)` NOT NULL | nome completo |
| `CPF` | `nvarchar(max)` **NOT NULL** | **dado pessoal, ver 4.4** |
| `SenhaProvisoria` | `bit` NOT NULL | marca troca obrigatória |
| `DataCadastro` | `datetime2` NOT NULL | criação |
| `Localidade` | `nvarchar(max)` NULL | lotação |
| `Divisao` | `nvarchar(max)` NULL | divisão administrativa |
| `NomeUsuario` | `nvarchar(max)` NULL | login |
| `NomeUsuarioNormalizado` | `nvarchar(450)` NULL | login normalizado |
| `Email` | `nvarchar(max)` NULL | **dado pessoal** |
| `EmailNormalizado` | `nvarchar(450)` NULL | e-mail normalizado |
| `EmailConfirmado` | `bit` NOT NULL | confirmação |
| `SenhaHash` | `nvarchar(max)` NULL | **credencial, ver 4.2** |
| `SecurityStamp` | `nvarchar(max)` NULL | invalidação de sessão |
| `ConcurrencyStamp` | `nvarchar(max)` NULL | concorrência |
| `NumeroTelefone` | `nvarchar(max)` NULL | **dado pessoal** |
| `NumeroTelefoneConfirmado` | `bit` NOT NULL | |
| `AutenticacaoEmDoisFatores` | `bit` NOT NULL | |
| `LockoutEnd` | `datetimeoffset` NULL | fim do bloqueio |
| `LockoutEnabled` | `bit` NOT NULL | bloqueio habilitado |
| `QuantidadeFalhasLogin` | `int` NOT NULL | contador de falhas |
| `Excluido` | `bit` NOT NULL | exclusão lógica |

É **ASP.NET Core Identity com colunas traduzidas** (`SenhaHash` corresponde a
`PasswordHash`, `EmailConfirmado` a `EmailConfirmed`), acrescido de extensões do
órgão (`Nome`, `NomeCompleto`, `CPF`, `SenhaProvisoria`, `Localidade`, `Divisao`,
`Excluido`). Confirmado pelo item de Flyway
`V1_001__Tabelas_Identity_Iniciar_Projeto_flyWay.sql` (**MEDIDO**, seção 8).

**Estado da base, MEDIDO por agregado:**

```
total=29  excluidos=0  com_hash=29  email_confirmado=0
2fa=0     senha_provisoria=1  sem_email=0  lockout_habilitado=0
```

Três leituras que decorrem disso e que importam: **nenhum usuário tem e-mail
confirmado**, **nenhum tem segundo fator**, e **`LockoutEnabled = 0` para todos os
29**, ou seja, hoje não existe bloqueio por tentativa de senha em lugar nenhum,
nem do lado deles.

Estruturas de autorização, **MEDIDAS**:

- `PerfisIdentity`: **2 perfis**, `GestorUsuarios` e `AcessoTotal`.
- `PerfisUsuariosIdentity`: **4 atribuições** para 29 usuários.
- `UsuariosPermissoesIdentity`: **1.007 linhas**, modelo de claims (`Tipo` é o
  recurso, `Valor` é a ação), com **35 tipos distintos**, todos do domínio deles:
  `Postos`, `Aparelhos`, `MedicaoPluviometricas`, `CotaEscalas`,
  `CurvaChaveFluviometricas`, `Digitacao_FCHD`, `ArquivosCSVFCHF` e afins. Verbos:
  `Cadastrar`, `Editar`, `Excluir`, `Recuperar`, `ImportarArquivo`, `LiberarLote`,
  `ConferirLote`. Existe ao menos um `Valor` vazio, que é defeito de dado do lado
  deles.
- `UsuariosLoginIdentity` e `UsuarioTokensIdentity`: **vazias**. Não há SSO externo
  em uso.

Duas ausências estruturais, **MEDIDAS**, que mudam como devemos ler a tabela:

1. **Não existe uma única chave estrangeira entre as tabelas de identidade.** A
   consulta a `Dbfch.sys.foreign_keys` filtrando por nome contendo `Identity`
   retornou vazio. `PerfisUsuariosIdentity.UsuarioId` não referencia
   `UsuariosIdentity.Id` no banco. A integridade é mantida pela aplicação .NET
   deles. Consequência para nós: a leitura precisa tolerar referência órfã.
2. **O vocabulário de permissão deles não cobre nada do nosso domínio.** Nenhum dos
   35 tipos menciona triagem, ficha de visita, desconformidade, revisão, favorito,
   estoque, inventário ANA, arquivo indexado, diagrama ou trilha de auditoria.

### 4.2 O formato da credencial, medido sem expor valor

```
SELECT LEFT(SenhaHash,4), LEN(SenhaHash), COUNT(*) FROM Dbfch.dbo.UsuariosIdentity
 WHERE SenhaHash IS NOT NULL GROUP BY LEFT(SenhaHash,4), LEN(SenhaHash)
 -->  prefixo base64 = 'AQAA'   comprimento = 84   usuarios = 29
```

Os 29 estão no mesmo formato. O prefixo `AQAA` decodifica para primeiro byte
`0x01`, e 84 caracteres base64 correspondem a 61 bytes, que é exatamente a
estrutura do **`PasswordHasher` versão 3 do ASP.NET Core**: 1 byte de marca, 4 de
função pseudoaleatória, 4 de contagem de iterações, 4 de tamanho de sal, 16 de sal
e 32 de subchave, com PBKDF2 HMAC SHA256.

Ponto que reduz o risco de reimplementação: **a contagem de iterações vem embutida
no próprio hash**, portanto não precisa ser adivinhada nem combinada com o órgão, e
não quebra se eles mudarem a política. A verificação é reimplementável em Node com
`crypto.pbkdf2` e `crypto.timingSafeEqual`, de forma determinística.

### 4.3 O que quebra por sermos somente leitura

| Operação | Situação |
|----------|----------|
| Verificar senha | Possível |
| Criar usuário | **Impossível** |
| Redefinir senha | **Impossível** |
| Trocar a própria senha | **Impossível** |
| Gravar `QuantidadeFalhasLogin` | **Impossível**, e está desligado para todos |
| Invalidar sessão por `SecurityStamp` | **Impossível** |
| Confirmar e-mail | **Impossível** |
| Guardar o nosso papel | **Impossível** e inadequado (4.5) |

Isso colide de frente com a **ADR 0022**, que criou `super_admin` para "criar e
editar Admins, definir papéis" e `admin` para "gerenciar usuários comuns, criar,
editar, resetar senha". Metade dessas atribuições deixa de ser executável por nós.

### 4.4 Decisão, e a resposta às quatro perguntas do CTO

**Decisão: separar autenticação de autorização. A autenticação é do órgão. A
autorização é nossa, e permanece exatamente onde está.**

Isto mapeia sobre as portas que já existem, com uma ressalva medida que corrige a
leitura pelo nome:

| Porta | O que ela realmente faz | Destino |
|---|---|---|
| (nova) | **autenticação**, verifica credencial | novo adaptador, lê `Dbfch` ou chama a API do órgão |
| `usuarios-identidade-repository.ts` | **exibição**, resolve id para nome e e-mail em lote | PostgreSQL, com a correção abaixo |
| `usuarios-admin-repository.ts` | **autorização e papéis** | PostgreSQL, inalterado |

**O nome da porta engana, e conferir custou um `cat`.** `usuarios-identidade-repository.ts`
**não é o caminho de autenticação**. Lido na íntegra (**MEDIDO**), o único método é
`resolver(ids)`, que traduz uma lista de identificadores em nome e e-mail, em uma
consulta, para rotular quem foi o ator de um evento. É exibição, não credencial. A
autenticação **não tem porta hoje** e precisa de uma nova.

**E há um defeito latente que esta migração desenterra, não cria.** Aquela consulta
lê `u.raw_user_meta_data->>'nome'` (**MEDIDO**, linha 25), e
`raw_user_meta_data` é **coluna do GoTrue, do Supabase**. O stub de
`db/auth-compat.sql` cria `auth.users` com apenas `id`, `email` e `created_at`
(**MEDIDO**). Portanto, **num PostgreSQL auto-hospedado essa consulta quebra hoje**,
com ou sem SQL Server, e o mesmo vale para a leitura equivalente em
`usuarios-admin-repository.supabase.ts:48`, que declara usar a mesma fonte.

A correção decorre da decisão de `auth.users` como costura: ao provisionar a linha
local no primeiro login, gravar o nome em coluna própria e trocar
`raw_user_meta_data->>'nome'` por ela, **nos dois arquivos**. É pequeno, e precisa
entrar no mesmo passo em que o `auth.users` deixa de ser do Supabase, senão a tela
de eventos e o export de estoque perdem o nome do operador em silêncio, que é o
modo como esse tipo de defeito costuma viajar até produção.

> **Este defeito está registrado fora deste ADR, de propósito:**
> `docs/runbooks/auth-users-raw-user-meta-data-pendencia.md`.
> Ele **não depende desta decisão**: quebra hoje, no caminho conteinerizado que a
> ADR 0015 já entregou, e continua valendo se a migração para o SQL Server for
> cancelada. Um ADR descreve uma decisão e pode ser superado; um defeito aberto
> precisa sobreviver a isso.

**Resposta 1, sobre o CPF.** `CPF` é `NOT NULL` naquela tabela (**MEDIDO**). Se
lermos a linha inteira, o CPF de 29 servidores entra no nosso perímetro de
tratamento, com tudo que a LGPD exige de finalidade, minimização e retenção, **para
um dado que a nossa aplicação não usa em lugar nenhum**. Regra de código que passa
a valer:

> A consulta a `UsuariosIdentity` seleciona **exatamente seis colunas**: `Id`,
> `NomeUsuarioNormalizado`, `EmailNormalizado`, `SenhaHash`, `Excluido`, `Nome`.
> Nunca `SELECT *`. `CPF`, `NumeroTelefone`, `Localidade` e `Divisao` não têm
> finalidade no nosso sistema e não atravessam a fronteira.

Isto é minimização por construção (art. 6, III), e não por disciplina. Merece
guarda automatizada, porque `SELECT *` é o que alguém escreve com pressa.

**Resposta 2, sobre o hash.** Duas formas, com ordem de preferência declarada:

- **Preferida: delegar o login à aplicação ou API do órgão.** O sistema recebe a
  identidade já autenticada e **nunca lê `SenhaHash`**. É estritamente superior por
  um motivo que não depende de implementação: o hash da senha de 29 servidores
  públicos deixa de trafegar na nossa rede e de existir na memória do nosso
  processo. Depende da resposta que o Rafael levou ao Diego e que ainda não voltou.
- **Contingência: verificar o hash localmente.** Tecnicamente resolvido (4.2), com
  quatro condições: as seis colunas da regra acima; o hash não sai da função de
  verificação nem entra em log; **o controle de tentativa é nosso**, no nosso
  PostgreSQL, por conta e por endereço, já que não podemos gravar o contador deles
  e ele está desligado de qualquer forma; e `Excluido = 1` nega acesso na hora.

**Resposta 3, sobre o encontro dos dois modelos de papel.** **Os nossos três papéis
permanecem em tabela nossa. Não viram claims deles.** Três razões, e a primeira
basta:

1. Não podemos escrever em `UsuariosPermissoesIdentity` (**MEDIDO**).
2. **Ainda que pudéssemos, não deveríamos.** O vocabulário deles não tem uma única
   entrada para nenhum dos nossos módulos (**MEDIDO**, 35 tipos verificados).
   Escrever `Triagem.Aprovar` na tabela de permissões do sistema deles seria poluir
   o modelo de autorização de um sistema de terceiro com o vocabulário do nosso.
3. Os dois perfis deles (`GestorUsuarios`, `AcessoTotal`) não são os nossos três e
   não são traduzíveis: `AcessoTotal` no sistema deles não diz nada sobre quem pode
   aprovar uma ficha de triagem no nosso.

**E o ponto que torna isso barato: a costura já existe e não precisa ser
construída.** A nossa tabela `usuarios_papeis` tem `usuario_id UUID PRIMARY KEY
REFERENCES auth.users (id) ON DELETE CASCADE` (**MEDIDO**,
`supabase/migrations/0023_usuarios_papeis.sql:22`), e `auth.users` continua
existindo no nosso PostgreSQL. O identificador do órgão é `uniqueidentifier`, que é
um UUID. Portanto:

> `auth.users.id` passa a receber o valor de `UsuariosIdentity.Id`. Nenhuma coluna
> muda, nenhuma migration nova, nenhuma chave estrangeira é refeita.

A linha local é criada na primeira autenticação bem sucedida. Isso **não é
migração de dados nem sincronização**: é provisionamento de sessão, acontece por
usuário, no momento em que ele entra, e não copia atributo nenhum além do
identificador e do que a tela precisa exibir.

**Resposta 4, sobre quem administra usuário.** A divisão fica explícita:

| Responsabilidade | Quem |
|---|---|
| Criar conta, definir e redefinir senha, desativar | **O órgão**, no sistema deles |
| Definir papel no nosso sistema (`super_admin`, `admin`, `user`) | **Nós**, em `usuarios_papeis` |

Consequência concreta sobre a porta `UsuariosAdminRepository`, cujos sete métodos
foram lidos (**MEDIDO**): `criar`, `resetarSenha` e `remover` **perdem
destino** e passam a lançar `EscritaIndisponivel`, com a tela de gestão de usuários
deixando de oferecer essas ações e apontando o processo do órgão. `listar`,
`existe`, `definirPapel` e `contarSuperAdmins` continuam nossos e inalterados.

O adaptador `usuarios-admin-repository.supabase.ts` é híbrido hoje (**MEDIDO**:
`listar`, `existe`, `definirPapel` e `contarSuperAdmins` em SQL; `criar`,
`resetarSenha` e `remover` na API Admin do Supabase, com compensação manual por
não haver transação entre os dois). Ele é o único `.supabase.ts` do projeto e
**desaparece**: a metade SQL vira `.pg.ts` comum, e a metade de API vira
indisponível.

### 4.5 Alternativa descartada: manter autenticação própria

Descartada por três razões, em ordem de peso:

1. **Desligamento.** Com identidade própria, quem sai do órgão continua com acesso
   ao nosso sistema até alguém lembrar de removê-lo. Com delegação, `Excluido = 1`
   encerra o acesso no mesmo instante, sem processo humano paralelo.
2. **Segunda senha para a mesma pessoa no mesmo órgão** é incentivo direto à
   reutilização e à anotação. É piora de segurança disfarçada de autonomia técnica.
3. **Rastreabilidade.** Em sistema de governo, o autor de uma ação precisa ser o
   mesmo sujeito nos dois sistemas.

Risco real da delegação, que é item de escalonamento: **são 29 usuários lá
(MEDIDO). Quem precisar do nosso sistema e não tiver linha em `UsuariosIdentity`
fica de fora, e não podemos criar a linha.**

---

## 5. Decisão 4: as 12 chaves estrangeiras para `auth.users`

### 5.1 O inventário exato

**MEDIDO** por varredura de `REFERENCES auth.users` em `supabase/migrations/`:
**12 colunas, em 11 tabelas, distribuídas por 9 arquivos.**

| Tabela | Coluna | Ação | Origem |
|---|---|---|---|
| `postos_favoritos` | `usuario_id` | `CASCADE` | 0020:24 |
| `usuarios_papeis` | `usuario_id` | `CASCADE` | 0023:22 |
| `fichas_triagem` | `tecnico_id` | `RESTRICT` | 0024:37 |
| `fichas_triagem` | `decidida_por` | `SET NULL` | 0024:53 |
| `triagem_eventos` | `ator_id` | `SET NULL` | 0025:19 |
| `triagem_locks` | `revisor_id` | `CASCADE` | 0026:39 |
| `ana_revisao_lote` | `criado_por` | `SET NULL` | 0029:35 |
| `ana_revisao_estacao` | `revisado_por` | `SET NULL` | 0029:119 |
| `ana_revisao_evento` | `ator_id` | `SET NULL` | 0029:192 |
| `postos_evento` | `ator_id` | `SET NULL` | 0031:87 |
| `postos_fotos` | `tirada_por` | `SET NULL` | 0042:28 |
| `diagramas` | `criado_por` | `SET NULL` | 0047:28 |

Existe ainda `fichas_visita.tecnico_id`, UUID sem chave estrangeira declarada, com
o comentário no arquivo dizendo "FK pra auth.users quando app de campo tiver auth"
(**MEDIDO**, 0022:38).

**E há uma ausência de chave que é deliberada, não esquecimento**, e precisa
constar para que ninguém a "conserte": o `usuario_id` do ledger de estoque **não
tem** chave estrangeira para `auth.users` (**MEDIDO**, migration 0059, com o motivo
escrito em `src/domain/estoque/export.ts:25`). A carga inicial do inventário grava
o UUID de sistema `00000000-0000-0000-0000-000000000000`, que não é usuário nenhum,
e a exportação o resolve como "Importação". Criar a chave ali quebraria a carga
inicial. Fica registrado como exceção documentada.

### 5.2 Decisão: elas ficam

**Decisão: as 12 chaves estrangeiras permanecem como estão. Nenhuma é removida,
nenhuma é reapontada.**

Este é o resultado direto de "o nosso banco nem mexe", e ele é tecnicamente
correto, não apenas obediente. `auth.users` continua existindo no nosso PostgreSQL,
e passa a ser preenchida com o identificador do órgão (4.4). Todas as semânticas
sobrevivem intactas:

- **`CASCADE` em `postos_favoritos` continua sendo o mecanismo de LGPD.** O
  comentário da migration 0020:12 diz literalmente: "FK para auth.users com ON
  DELETE CASCADE: LGPD, apagar usuário apaga [os favoritos]". Se tivéssemos
  removido a chave, **a garantia de eliminação desapareceria sem nada quebrar**,
  que é o tipo de perda que só aparece no dia em que um titular exerce o direito do
  art. 18, VI. Mantendo, ela continua garantida pelo banco.
- **`RESTRICT` em `fichas_triagem.tecnico_id`** continua protegendo a cadeia de
  responsabilidade.
- **`SET NULL` nas oito colunas de autoria** continua anonimizando na exclusão.

**Ponto de atenção que passa a valer:** `auth.users` deixa de ser gerida pelo
Supabase e passa a ser uma tabela comum do nosso schema. A ADR 0015 já preparou
exatamente isso: `db/auth-compat.sql` recria `auth`, `auth.users`, `auth.uid()` e
os papéis, e o comentário do próprio arquivo diz que "na entrega PRODESP, este é o
ponto único a substituir pela camada de identidade real" (**MEDIDO**). Este ADR é a
substituição: o stub deixa de ser stub e passa a ser a projeção local da identidade
do órgão.

**Consequência que precisa ser dita:** entre a autenticação e a leitura da tela, o
`Excluido` do órgão pode mudar. Por isso **a validade da conta é verificada contra
`UsuariosIdentity` no momento do login**, e nunca inferida da existência da linha
local. A linha local serve para integridade referencial e exibição, jamais como
autoridade sobre o acesso.

---

## 6. Decisão 5: agendamento das tarefas periódicas

### 6.1 As três tarefas, medidas

Leitura integral dos três arquivos em `src/app/api/cron/` (401 linhas somadas):

| | `sincronizar-monitor` | `liberar-locks-expirados` | `anonimizar-trilha` |
|---|---|---|---|
| Linhas | 138 | 139 | 124 |
| Autenticação | `Bearer CRON_SECRET` ou `x-cron-secret`, comparado com `timingSafeEqual`, mínimo de 32 caracteres, com limite de taxa por IP antes | idem | idem |
| Idempotente | Sim, upsert por `sibh_id` e por `(estacao_id, momento)` | Sim, `DELETE WHERE expira_em < NOW()` em transação | Sim, só alcança linha com PII vencida. **Irreversível** |
| Escreve em | `estacoes_pluviometricas`, `leituras_pluviometricas` | `triagem_locks`, `fichas_triagem`, `triagem_eventos`, `cron_heartbeats` | `acesso_ficha`, `triagem_eventos`, `ana_revisao_evento`, `postos_evento` |
| Rede externa | **Sim**, SIBH | Não | Não |
| Limite de tempo | **Nenhuma rota do projeto declara `maxDuration`** (MEDIDO) | idem | idem |

**Todas escrevem apenas no nosso PostgreSQL.** Nenhuma toca `Dbfch`. Portanto o
agendamento é assunto de plataforma, não de migração de dados.

**Divergência MEDIDA entre comentário e configuração, e é dívida a fechar:**
`vercel.json` declara **um único cron**, `/api/cron/sincronizar-monitor` às 9h. Os
comentários de `liberar-locks-expirados:28` ("a cada 5min, vercel.json") e de
`anonimizar-trilha:27` ("dispara mensalmente") **não têm respaldo no arquivo**. Ou
seja, **duas das três tarefas não têm gatijo automático**, e uma delas é rotina de
retenção de LGPD. Rotina de retenção declarada e não agendada é afirmação falsa de
conformidade. A troca de plataforma é a oportunidade de fechar isso.

### 6.2 Avaliação e decisão

**Hangfire do órgão. Descartado.** Está vivo e **MEDIDO**: schema `HangFire` em
`Dbfch`, com `Job` (8 linhas), `State` (24), `Server` (1), `JobParameter` (16),
criado pelo Flyway `V1_004__Tabelas_HangFire_flyWay.sql`. Três impedimentos
independentes, e qualquer um bastaria: é biblioteca .NET e tarefa Hangfire é método
.NET, enquanto as nossas são rotas HTTP em Node; enfileirar é **INSERT** nas
tabelas dele, e não temos escrita (**MEDIDO**); e acoplaria as nossas rotinas de
conformidade à disponibilidade de um servidor operado por outra equipe.

**Cron do host Ubuntu. Descartado como padrão.** Funciona e não acrescenta
dependência, mas a entrega é on-premises com handoff para a PRODESP (ADR 0015). Um
agendamento no crontab de um host não é versionado, não passa por revisão de
código, não aparece no repositório e desaparece se o host for reconstruído. É
exatamente a categoria de estado não documentado que quebra handoff de governo.

**Decisão: contêiner secundário no mesmo `docker-compose`, compartilhando a imagem
da aplicação, executando um agendador Node que chama as três rotas HTTP internas
com `CRON_SECRET`.**

As rotas **não são reescritas**: muda o gatilho, não a lógica, e a execução manual
por chamada HTTP continua disponível para operação e diagnóstico, que é como se
investiga tarefa que falhou. O agendamento fica versionado, viaja na imagem e é
revisável. Réplica fixa em 1, com a idempotência permanecendo como defesa primária,
porque réplica única é configuração e configuração muda.

### 6.3 Alerta que precede a implementação

`sincronizar-monitor` é a única das três que sai da rede, consumindo o SIBH
(**MEDIDO**, porta `src/application/ports/sibh-gateway.ts` e chamadas
`sibh.listarEstacoes()` e `sibh.medicoesPorPrefixo(...)`). O servidor de aplicação
**não tem saída para a internet** (**MEDIDO**).

**HIPÓTESE cara: se o SIBH só for alcançável pela internet, essa tarefa não pode
rodar em `10.199.43.27`, e nenhuma escolha de agendador resolve.** É item de
escalonamento, não de implementação.

---

## 7. Decisão 6: migrations

Como o nosso schema não muda, esta seção é curta, e é curta por um bom motivo.

**MEDIDO:** `Dbfch.dbo.schema_version` é a tabela de histórico do **Flyway**, e não
por semelhança de nome: as dez colunas são exatamente as do Flyway
(`installed_rank`, `version`, `description`, `type`, `script`, `checksum`,
`installed_by`, `installed_on`, `execution_time`, `success`). Conteúdo: 22 linhas,
baseline em **14/07/2023**, última versão **1.019**
(`AdicionandoUnidadeAquiferaEmPostos`) em **18/07/2025**. Convenção
`V1_0NN__Descricao_flyWay.sql`, mais um repetível `R__DML.sql`. E `installed_by` em
**todas as 22 linhas** é `usujenkins_pdbfch`, prefixo que identifica execução por
**Jenkins**.

**Decisão, em três linhas:**

1. **As nossas 65 migrations permanecem válidas, aplicadas e inalteradas.** Elas
   descrevem o nosso schema, que não muda.
2. **Nenhuma migration nossa é aplicada em `Dbfch`, nem agora nem nunca.** Não
   temos permissão (**MEDIDO**, `CREATE TABLE = 0`), e o caminho legítimo de
   qualquer mudança lá é um pedido formal ao órgão, que entra na esteira Flyway e
   Jenkins deles, com o prazo deles.
3. **A evolução do schema de `Dbfch` é responsabilidade do órgão.** Saber que a
   esteira existe e como ela se chama é o que nos permite fazer pedidos no formato
   certo, e é por isso que a medição está registrada aqui.

Observação que vale para o futuro: se algum dia precisarmos de schema próprio
dentro da infraestrutura do órgão, **adotar Flyway com a convenção de nome deles**
é decisão de handoff, não de gosto técnico: eles já operam a ferramenta e já têm
quem saiba. Fica anotado, e não é decidido agora porque não é preciso agora.

---

## 8. Decisão 7: busca textual

### 8.1 Os fatos que decidem

Hoje a busca é `busca_tsv TSVECTOR`, coluna gerada com
`to_tsvector('portuguese', f_unaccent(...))` sobre nove campos, com índice GIN, mais
um índice GIN de trigrama sobre `prefixo` (**MEDIDO**,
`supabase/migrations/0002_postos.sql`). O uso está **concentrado em um único
arquivo**: `postos-repository.pg.ts:208` é a única referência a `busca_tsv` em todo
o diretório de adaptadores, e `f_unaccent` aparece 7 vezes, todas no mesmo arquivo
(**MEDIDO**). Isso é excelente notícia de escopo.

Do lado deles, **MEDIDO**:

| Medição | Resultado |
|---|---|
| `SERVERPROPERTY('IsFullTextInstalled')` | **1**, instalado |
| Idioma `Portuguese` em `sys.fulltext_languages` | **presente**, lcid 2070 |
| `DATABASEPROPERTYEX('Dbfch','IsFulltextEnabled')` | **0** |
| Catálogos em `Dbfch.sys.fulltext_catalogs` | **0** |
| Colunas em `Dbfch.sys.fulltext_index_columns` | **0** |
| Nossa permissão de criar catálogo | **0** |

**O recurso existe no servidor, não existe no banco, e nós não podemos criá-lo.** Só
o órgão pode, por Flyway.

### 8.2 A armadilha da collation, medida

A collation de `Dbfch` é `SQL_Latin1_General_CP1_CI_AS`, e o sufixo `AS` significa
**sensível a acento**:

```sql
SELECT CASE WHEN 'VARZEA' = 'VÁRZEA' THEN 'CASA' ELSE 'NAO CASA' END,
       CASE WHEN 'VARZEA' = 'VÁRZEA' COLLATE Latin1_General_CI_AI
            THEN 'CASA' ELSE 'NAO CASA' END
-->  collation do banco: NAO CASA     com CI_AI explícito: CASA
```

E o dado está no pior estado possível: **62 dos 5.790 nomes de posto têm acento**
(**MEDIDO**). Não é base uniformemente sem acento, na qual a sensibilidade seria
inofensiva. É base 99% sem acento, o que faz a busca falhar de forma inconsistente
em 62 registros que ninguém consegue prever.

### 8.3 Decisão

**Decisão: `LIKE` com `COLLATE Latin1_General_CI_AI` explícito. Sem índice, sem
catálogo, sem pedido ao órgão.**

A justificativa é a medição do volume, e dispensa argumento de arquitetura: **são
5.790 postos ativos**. Varredura completa dessa tabela é trabalho desprezível para
o SQL Server. Construir infraestrutura de indexação textual para esse volume é
otimizar antes de medir, e a medida já está feita.

**Regra de código:** toda comparação de texto contra `Dbfch` carrega `COLLATE
Latin1_General_CI_AI` **explícito**. Deixar implícito não produz erro: produz
resultado errado em 62 registros.

**Ressalva que impede o excesso oposto:** aplicar `COLLATE` a coluna em predicado
torna a expressão não pesquisável por índice. Em `Postos`, irrelevante. **Nas
tabelas de medição não é**: `MedicaoPluviometricas` tem 27,3 milhões de linhas e
`MedicaoLoggerFluviograficas` 17,7 milhões (**MEDIDO**). A regra vale para busca
textual de cadastro e **nunca** para chave de junção sobre tabela de medição.

Se o órgão quiser ordenação por relevância no futuro, o caminho é pedir o catálogo
full-text por Flyway. Não é necessário agora, e não deve ser pedido por precaução:
é mudança no banco de produção deles.

### 8.4 A acentuação na exibição

Os nomes deles são majoritariamente sem acento (`VARZEA DO PARAIBA`). A rule
`governo.md` e a `padrao-ui.md` exigem acentuação correta em todo texto visível, e
"VARZEA DO PARAIBA" numa tela de órgão público é regressão visível de qualidade.

Nota **MEDIDA** que qualifica o problema e impede a conclusão preguiçosa: **nem
tudo lá é sem acento.** `TipoMedicoes.Descricao` traz `PLUVIOMÉTRICO`,
`FLUVIOMÉTRICO`, `METEOROLÓGICO` e `PIEZOMÉTRICO` corretamente acentuados. A
ausência de acento é característica de `Postos.Nome`, não do banco.

Item de escalonamento (10.5), porque é decisão de produto e não de engenharia.

---

## 9. Decisão 8: geoespacial

### 9.1 Os fatos

O que o PostGIS faz hoje (ADR 0013, migrations 0030, 0033 e 0035 a 0037): ponto em
polígono contra os multipolígonos municipais do IBGE, distância até o limite do
município declarado com faixa de borda em 1 km, distância haversine para o escore
de correspondência com estações da ANA, e a função de sugestão de coordenada.

**MEDIDO, e é o fato central:** varredura de `Dbfch.sys.columns` cruzada com
`sys.types` procurando `geography` e `geometry` retornou **zero colunas espaciais
em `Dbfch`**. A coluna `geography` que existe na instância está em outro banco.

**MEDIDO também, e é surpreendente:** `ST_` aparece **uma única vez** em todos os
adaptadores, e **em comentário** (`postos-repository.pg.ts:270`, "faltaria PostGIS
mais ST_DWithin"). **Nenhum adaptador chama PostGIS.** O uso está inteiro dentro de
funções SQL das migrations, disparadas por gatilho, exatamente como a ADR 0013
descreveu.

### 9.2 Decisão

**Decisão: fazer o cálculo na aplicação. Não adotar o tipo espacial do SQL Server.**

A justificativa central é que **a premissa que reprovou esta opção expirou**. A ADR
0013 registrou, com todas as letras, que calcular em TypeScript com turf.js era
"viável mas exige carregar GeoJSON IBGE em memória do server (~30 MB) em cold
start. Pior para Vercel". **A Vercel sai.** Um contêiner de vida longa carrega 30
MB uma vez no início, e a partida fria deixa de existir como categoria de problema.
Reverter decisão anterior exige nomear a premissa que caducou, e é esta.

Três razões somam:

1. **O cálculo não está no caminho quente.** A própria ADR 0013 diz que o recálculo
   é disparado por gatilho em mudança de coordenada, não na listagem. São 5.790
   pontos contra os municípios de São Paulo, com pré-filtro por caixa envolvente.
2. **Remover dependência vale mais que substituí-la, neste projeto.** Entrega
   on-premises, sem internet, com handoff PRODESP: cada motor a menos é um
   componente a menos que outra equipe precisa instalar e suportar.
3. **O tipo espacial do SQL Server traria atrito próprio.** `geography` exige
   orientação de anel pela regra da mão esquerda, e malhas do IBGE violam isso com
   frequência, exigindo `MakeValid()` e `ReorientObject()`. E o índice espacial do
   SQL Server exige ajuste de tesselação, contra o índice GiST do PostGIS que
   funciona sem configuração. Trocaríamos problema resolvido por problema novo,
   para ganhar nada em 5.790 pontos.

Custo a declarar: o arquivo de polígonos do IBGE passa a ser **artefato de build,
embarcado na imagem**, porque não há rede para buscá-lo em execução.

### 9.3 Observação de produto, e é a mais importante desta seção

**MEDIDO pelo Rafael:** a coordenada do nosso CSV está deslocada em **mediana de
10,17 km**, com **apenas 1,6% dos postos batendo**. A latitude do órgão reproduz a
nossa com erro mediano de 0,0 m, e **é a longitude do nosso CSV que está errada**
(posto 1D-008, município Cruzeiro, 18 km fora). A conversão sexagesimal da base
deles produz a coordenada correta.

Disso decorre uma pergunta que vale antes de qualquer linha de código: **a
funcionalidade de divergência geográfica existia, em boa parte, para detectar erros
da nossa própria importação**, e a importação deixa de existir. A recomendação
sênior é **avaliar desligá-la em vez de migrá-la**. Migrar funcionalidade que
perdeu a finalidade é o desperdício mais caro de uma troca de plataforma. Item
10.6.

---

## 10. Mapeamento campo a campo

Origem do nosso lado: `supabase/migrations/0002_postos.sql`, lido na íntegra
(**MEDIDO**). Origem do lado deles: `Dbfch.sys.columns` sobre `Dbfch.dbo.Postos`,
**37 colunas** (**MEDIDO**), mais as tabelas de apoio.

Chaves estrangeiras de `Postos` confirmadas em `Dbfch.sys.foreign_keys`
(**MEDIDO**, 9 chaves): `ZonaHidrograficaId`, `SubZonaHidrograficaId`,
`TipoMedicoesID`, `ProprietariaEntidadeId`, `OperadoraEntidadeId`, `UGRHIId`,
`MunicipioDistritoId`, `UnidadeFederacaoId`, `CursoAguaId`.

Legenda: **DIRETO** (coluna equivalente), **JUNÇÃO** (exige tabela de apoio),
**CONVERSÃO** (exige transformação de valor), **VAZIO** (não existe lá, e o campo
fica vazio, declaradamente).

Percentuais **MEDIDOS** sobre os 5.790 postos com `Excluido = 0`.

### 10.1 Campos que casam direto

| Nosso campo | Origem | Situação | Preenchimento | Nota |
|---|---|---|---|---|
| `id` UUID | `Postos.Id` `uniqueidentifier` | DIRETO | 100% | GUID sai maiúsculo do SQL Server. Normalizar para minúsculo na fronteira |
| `prefixo` VARCHAR(32) | `Postos.Prefixo` `varchar(8)` | DIRETO | 100% | Sem índice único lá, único de fato entre ativos. **É a chave natural do nosso domínio e continua sendo** |
| `nome_estacao` TEXT | `Postos.Nome` `varchar(50)` | DIRETO | 100%, 0 vazios | 3.762 nomes distintos para 5.790 postos: **o nome não identifica** |
| `prefixo_ana` VARCHAR(64) | `Postos.PrefixoDNAEE` `varchar(8)` | DIRETO | 4.697 (81%) | DNAEE é o antecessor da ANA. Equivalência semântica é **HIPÓTESE** |
| `area_km2` NUMERIC(12,3) | `Postos.AreaDrenagem` `decimal(9,2)` | DIRETO | 1.050 (18%) | Perde uma casa decimal |
| `altimetria` NUMERIC(10,3) | `Postos.Altitude` `decimal(7,3)` | DIRETO | 4.221 (73%) | Escala idêntica |
| `aquifero` TEXT | `Postos.UnidadeAquifera` `varchar(100)` | DIRETO | **101 (1,7%)** | Coluna recente, Flyway V1.019 de 18/07/2025. Praticamente vazia |
| `deleted_at` | `Postos.Excluido` `bit` | CONVERSÃO | 13 excluídos | Ver 10.5 |

### 10.2 Campos que exigem conversão

| Nosso campo | Origem | Regra | Preenchimento |
|---|---|---|---|
| `latitude` NUMERIC(10,7) | `Postos.CoordenadaGrausLatitudade` `int` | sexagesimal, ver abaixo | 5.784 (99,9%) |
| `longitude` NUMERIC(10,7) | `Postos.CoordenadaGrausLongitude` `int` | idem. **A deles é a correta** | 5.784 (99,9%) |
| `operacao_inicio_ano` INTEGER | `YEAR(Postos.DataInstalacao)` | extrai o ano | 5.636 (97%) |
| `operacao_fim_ano` INTEGER | `YEAR(Postos.DataExtincao)` | extrai o ano | 1.376 (24%) |

**A conversão de coordenada, MEDIDA e provada pelo Rafael** (`coordenadas4.py`,
função `sexa`), com erro mediano de 0,0 m na latitude:

```
6 dígitos, GGMMSS:    GG + MM/60 + SS/3600
8 dígitos, GGMMSSCC:  GG + MM/60 + (SS + CC/100)/3600
```

Distribuição **MEDIDA**: 5.430 postos com 6 dígitos, 354 com 8.

Três cuidados que a fórmula não mostra, e que são responsabilidade da camada de
leitura nova:

1. **Sinal.** Os inteiros são magnitudes sem sinal. São Paulo está a sul e a oeste:
   os dois valores recebem sinal negativo.
2. **A longitude do nosso CSV está errada** e não serve para conferência nem
   desempate. Deslocamento mediano de 10,17 km, com 1,6% de acerto.
3. **6 postos não têm coordenada** (**MEDIDO**). O mapa precisa tratar ausência e
   não presumir zero, que cairia no golfo da Guiné.

UTM existe (`CoordenadaUTMLatitude`, `CoordenadaUTMLongitude`,
`CoordenadaUTMMeridiano`) mas só em 1.216 dos 5.790 (**MEDIDO**), e portanto não
serve como fonte primária nem como conferência sistemática.

### 10.3 Campos que exigem junção

| Nosso campo | Caminho | Preenchimento | Risco |
|---|---|---|---|
| `tipo_posto` | `TipoMedicoesID` → `TipoMedicoes.Descricao` | **100%**, coluna NOT NULL | Nenhum. Valores medidos: PLUVIOMÉTRICO 3.943, FLUVIOMÉTRICO 1.588, METEOROLÓGICO 156, PIEZOMÉTRICO 103 |
| `proprietario` | `ProprietariaEntidadeId` → `Entidades.Nome`/`.Sigla` | **5.760 (99,5%)** | Baixo. `Entidades` tem 47 linhas |
| `bacia_hidrografica` | `CursoAguaId` → `CursoAguas.Nome` | **3.547 (61,3%)** | Baixo. Caminho corrigido, ver 10.4 |
| `mantenedor` | `OperadoraEntidadeId` → `Entidades.Nome` | **1.581 (27%)** | **Alto.** 4.209 postos sem mantenedor |
| `municipio` | `MunicipioDistritoId` → `MunicipioDistritos.Nome` | **4.157 (72%)** | **Alto.** 1.633 postos sem município |
| `ugrhi_nome` / `ugrhi_numero` e `sub_ugrhi_nome` / `sub_ugrhi_numero` | `UGRHIId` → `UGRHIs`, com desdobramento pelo código, ver 10.4 | **4.070 (70,3%)** somando o caminho pelo município | Médio. 1.720 (29,7%) sem caminho nenhum |

### 10.4 As três junções de risco semântico, agora resolvidas por medição

Esta seção registrava três riscos que exigiriam resposta do órgão. **A medição das
tabelas de vocabulário resolveu os três**, e o resultado corrige o mapeamento em
duas frentes. Fica registrado o caminho, e não só a conclusão, porque a hipótese
que eu tinha levantado estava certa pelo avesso, e é isso que ensina.

**UGRHI e sub UGRHI: uma tabela, dois níveis, e o código diz qual.** A pergunta
era por que `UGRHIs` tem 126 linhas para 22 unidades reais. A resposta é que ela
guarda os dois níveis juntos (**MEDIDO**):

| Faixa de `Codigo` | Significado | Exemplos medidos |
|---|---|---|
| 1 a 22 | as 22 UGRHIs oficiais | 1 MANTIQUEIRA, 2 PARAIBA DO SUL, 6 ALTO TIETE, 22 PONTAL DO PARANAPANEMA |
| 100 ou maior | **sub UGRHI**, no padrão `UGRHI * 100 + sequencial` | 202 SUB-UGRHI-BAIXO VALE (UGRHI 2), 605 SUB-UGRHI-RIO TIETE (UGRHI 6) |

Isso casa **direto** com os nossos quatro campos, e a regra de derivação é
aritmética, não heurística. Uma única chave estrangeira, `Postos.UGRHIId`,
alimenta os dois pares:

```
Se Codigo <= 22:   ugrhi_numero = Codigo          sub_ugrhi_* = vazio
Se Codigo >= 100:  ugrhi_numero = Codigo / 100    sub_ugrhi_numero = Codigo
                   (o nome da UGRHI pai vem de uma segunda leitura por Codigo)
```

**Atenção ao formato, que difere e é onde isto quebraria em silêncio:** o nosso CSV
escreve a sub UGRHI como `2_4` (`N_UGRHI=2`, `N_SUBUGRHI=2_4`), e eles escrevem
`204`. A conversão é `FLOOR(Codigo / 100) || '_' || (Codigo % 100)`, e sem ela os
dois lados parecem discordar sendo idênticos.

**E a suspeita anterior estava certa pelo avesso: `SubZonaHidrograficas` NÃO é sub
UGRHI.** Eu havia registrado que os dois eram eixos diferentes de classificação, e
recomendado não mapear um no outro. A medição confirma a separação e acrescenta o
que faltava: a sub UGRHI existe, e mora na própria `UGRHIs`. Os 99,8% de
preenchimento de `SubZonaHidrograficaId` eram justamente a armadilha, porque a
cobertura alta convida ao mapeamento errado.

**Bacia hidrográfica: a tabela com esse nome não é o nosso campo.**
`BaciaHidrograficas` tem **9 linhas** e é a bacia **administrativa** do DAEE, com
nomes como `BPG - PARDO / GRANDE - RIBEIRAO PRETO`, `BBT - BAIXO TIETE - BIRIGUI` e
um código 99 `FORA DO ESTADO` (**MEDIDO**). O nosso `bacia_hidrografica` traz
`R. PARAIBA DO SUL` e `RIB. DO PINHAO`, que é **curso d'água**, não bacia
administrativa.

A junção correta é `Postos.CursoAguaId` → `CursoAguas.Nome`, preenchida em **3.547
postos (61,3%)**. **O caminho pelo município fica descartado**, e com ele a
objeção semântica que eu havia levantado: ela era válida contra o caminho errado, e
some junto com ele. Registro também que a medição de cobertura pelo município
(4.066 de 5.790) ficou sem uso, porque o caminho estava errado independentemente da
cobertura. Cobertura boa por caminho errado é o argumento mais perigoso deste
mapeamento inteiro.

**O que sobra de recomendação.** Nenhuma das três junções precisa ficar vazia.
Sobra apenas a regra geral que as originou, e ela continua valendo para o resto do
mapeamento: **campo preenchido por junção que ninguém conferiu transforma incerteza
em número na tela**, e depois ninguém distingue o que foi medido do que foi
inferido. As três foram conferidas. As que não forem, ficam vazias.

### 10.5 Campos que ficam vazios

Varredura **MEDIDA** sobre todas as colunas das 157 tabelas de `Dbfch`, procurando
nomes contendo `Telemetr`, `PCD`, `Transmis`, `Cobacia`, `Rede`, `Mantenedor`,
`BTL`, `Ambient`, `Inspec`, `Descritiv`, `Ficha`, `Aquifer`, `Altimetr`, `Foto`,
`Arquivo`, `Anexo` e `Documento`. Nenhum resultado pertinente além de
`Postos.UnidadeAquifera`.

| Campo | Destino |
|---|---|
| `municipio_alt` | VAZIO. Grafia alternativa do nosso CSV |
| `rede` | VAZIO. Ver 10.6: `Grupos` avaliado e **rejeitado** |
| `btl` | VAZIO |
| `cia_ambiental` | VAZIO |
| `cobacia` | VAZIO. Código Otto Pfafstetter |
| `observacoes` | VAZIO. Ver 10.6: `Historicos` avaliado e **rejeitado** |
| `tempo_transmissao`, `status_pcd`, `ultima_transmissao` | VAZIO. O **estado** da telemetria não existe lá, embora o **equipamento** exista, ver 10.6 |
| `ficha_inspecao`, `ultima_data_fi`, `ficha_descritiva`, `ultima_atualizacao_fd` | VAZIO. Indexação documental é nossa, e está fora de escopo (seção 0) |
| ~~`convencional`, `logger_eqp`, `telemetrico`, `nivel`, `vazao`~~ | **SAEM DESTA LISTA. São deriváveis**, ver 10.6 |
| `created_at` / `updated_at` | **Não existem lá.** Ver 10.7 |
| `busca_tsv` | Não existe e **não pode ser criada**. Substituída pela seção 8 |

**`Excluido` merece regra de código:** existem 13 registros com `Excluido = 1`
(**MEDIDO**). Um `WHERE` esquecido não produz erro: produz 13 postos fantasmas na
tela. Toda leitura de `Postos` filtra `Excluido = 0`, e isso é candidato natural a
guarda automatizada sobre os adaptadores, porque é o tipo de omissão que passa em
revisão de código.

### 10.6 Três correspondências avaliadas, com a medição

**`rede` não é `Grupos`. Rejeitado.** Existe `Grupos` com `GruposPostos` (23.257
vínculos), e a hipótese natural seria a taxonomia de redes. **A medição do
vocabulário reprova**: os valores são grupos de trabalho ad hoc, como `TRABALHO -
CLAUDIO - NAO APAGAR`, `UNESP4`, `DAEE2024_8/17 GR.:ANT895-PROX897-NAO_APAGAR_NELSON`
e `FLU EXTINTOS (NAO APAGAR)`. É ferramenta operacional de seleção, com nome de
pessoa e aviso de não apagar embutidos no rótulo. Não é classificação de domínio.

**`observacoes` não é `Historicos`. Rejeitado.** `Historicos` tem `PostoId`,
`Data`, `Descricao varchar(2000)` e 230 linhas (**MEDIDO**). É **histórico datado de
eventos**, não atributo de cadastro. Podem coexistir, e um não substitui o outro.

**Instrumentação é derivável. APROVADO, e recupera cinco campos que eu havia dado
como inexistentes.** Os campos `convencional`, `logger_eqp`, `telemetrico`, `nivel`
e `vazao` são texto livre no nosso cadastro. A varredura por nome de coluna não os
achou, e a conclusão preguiçosa seria declará-los perdidos. Eles existem, **não
como coluna e sim como vínculo**, o que é estrutura melhor: `AparelhoPostos`
(**9.109 vínculos**, com `DataInicioMedicao` e `DataDesativacao`) contra
`Aparelhos` (**45 tipos**, coluna `Designacao`).

Regra de derivação, sobre **aparelho ativo** (`Excluido = 0` e `DataDesativacao IS
NULL`), com o vocabulário **MEDIDO**:

| Nosso campo | Designações em `Aparelhos` |
|---|---|
| `telemetrico` | `PLUVIOMETRO TELEMETRICO`, `LIMNIGRAFO TELEMETRICO` |
| `logger_eqp` | `PLUVIOMETRO COM GRAVACAO LOCAL`, `LIMNIGRAFO COM GRAVACAO LOCAL`, `PIEZOMETRO COM GRAVACAO LOCAL` |
| `nivel` | `ESCALA LIMNIMETRICA`, `LIMNIGRAFO` |
| `vazao` | `CURVA-CHAVE`, `MEDICAO DE VAZAO` (parshall, vertedor, molinete, colorimétrico) |
| `convencional` | `PLUVIOMETRO`, `PLUVIOGRAFO`, `PLUVIOMETRO TOTALIZADOR` |

Isto **melhora a qualidade do dado**, porque troca texto livre por vínculo
estruturado com data de início e de desativação, e porque passa a distinguir
equipamento ativo de histórico, coisa que o texto livre nunca fez.

**Cobertura medida, e ela não é o que o percentual sugere.** Postos distintos sobre
os 5.790 ativos (**MEDIDO**), ao lado do que o nosso CSV traz nas colunas
equivalentes (**MEDIDO**,
`data/Postos_PLU_FLU_PIEZO_CIAS_BAT_MUNIC_UGRHI_SUB_OTTO-18-03-26a-csv.csv`, 2.483
linhas):

| Campo | `Dbfch` | Nosso CSV | Em absoluto |
|---|---|---|---|
| `convencional` | **3.846** (66,4%) | 582 (23,4%) | eles, por 6,6 vezes |
| `nivel` | **1.272** (22,0%) | 32 (1,3%) | eles, por 40 vezes |
| `vazao` | **595** (10,3%) | **0** (0,0%) | eles. **A nossa coluna está inteiramente vazia** |
| `logger_eqp` | **413** (7,1%) | 225 (9,1%) | eles, por 1,8 vez |
| `telemetrico` | **150** (2,6%) | 111 (4,5%) | eles, por 1,35 vez |

Detalhe por designação (**MEDIDO**): `PLUVIOMETRO TELEMETRICO` 67, `LIMNIGRAFO
TELEMETRICO` 83, `PLUVIOMETRO COM GRAVACAO LOCAL` 196, `LIMNIGRAFO COM GRAVACAO
LOCAL` 133, `PIEZOMETRO COM GRAVACAO LOCAL` 86, `LIMNIGRAFO` 247, `PLUVIOGRAFO`
318, `PIEZOMETRO` 302.

**Isto corrige a leitura fácil de que "2,6% é pouco": em contagem absoluta a base
deles ganha nos cinco campos.** O percentual favorece o nosso lado em `telemetrico`
e `logger_eqp` apenas porque o nosso CSV é recorte curado de 2.483 postos e o deles
é o universo de 5.790. Apresentar 2,6% como regressão seria comparar denominadores
diferentes.

**E um achado que vale por si: `vazao` está preenchido em zero dos 2.483 postos do
nosso CSV.** É campo fantasma, carregado no schema, no tipo e na tela sem nunca ter
tido valor. A migração não o perde: ela o preenche pela primeira vez, em 595
postos.

Nota de vocabulário que reforça o ganho: os valores do nosso CSV são códigos de uma
letra sem legenda no próprio dado (`O` 460, `C` 101 e `-` 21 em `CONVENCION`; `L`
em `LOGGER`; `TF` 70, `T` 39, `TF + T` e `TF + TG` em `TELEMETRIC`; `Q` 29 e `V` 3
em `NIVEL`). O lado deles é relação com nome por extenso e data. Além de mais
completo, é legível sem alguém para traduzir.

**Três ressalvas que sobrevivem à aprovação, e as duas primeiras limitam a tabela
acima.**

**Ressalva A, e ela é teto contra cobertura: a contagem NÃO filtrou
`DataDesativacao`.** São todos os vínculos já registrados, ativos ou não, portanto
os cinco números são **teto, não cobertura real**. Quem implementar precisa decidir
se o campo significa "já teve" ou "tem hoje", e **a segunda leitura é a que o
usuário espera** ao ver "telemétrico" numa ficha. A regra escrita acima já exige
`DataDesativacao IS NULL`; falta medir quanto isso derruba. Pendência 12.4.

**Ressalva B: comparação agregada não prova ausência de perda individual.** Os
totais mostram que a base deles é mais completa **no conjunto**, e não que nenhum
posto específico perde o valor que tinha. Um posto pode trazer `TELEMETRIC = 'TF'`
no nosso CSV e não ter aparelho telemétrico do lado deles. A medição que decide é
por posto, sobre os 2.413 que cruzam, campo a campo. Pendência 12.7.

**Ressalva C, em duas partes.** A derivação continua sendo **regra nossa**, e regra
errada aplicada a 5.790 postos é pior que texto livre: ela vai por escrito ao órgão
antes de virar código (item 11.8). E, o que evita a conclusão apressada,
**equipamento não é estado**: saber que o posto tem um `PLUVIOMETRO TELEMETRICO`
instalado **não** diz `tempo_transmissao`, `status_pcd` nem `ultima_transmissao`,
que continuam sem origem em `Dbfch`. Os cinco campos que voltam são sobre **o que
está instalado**; os três que ficam vazios são sobre **se está transmitindo**.

### 10.7 A ausência de coluna de atualização, e por que ela deixou de importar

**MEDIDO:** as únicas colunas de data em `Dbfch.dbo.Postos` são `DataInstalacao` e
`DataExtincao`. Não existe `DataAtualizacao`, `rowversion` nem coluna de auditoria
de linha.

Numa arquitetura de cópia, isso seria problema sério: perguntar "o que mudou desde
ontem" não teria resposta barata. **Na arquitetura decidida aqui, é irrelevante**,
e é bom registrar por quê: **não copiamos nada, lemos ao vivo.** A tela sempre
mostra o estado atual da base do órgão, sem janela de defasagem.

Fica registrado apenas para impedir o erro futuro de supor que existe um gancho de
mudança e construir cache em cima dele.

### 10.8 O que eles têm e nós não temos

Não é lacuna, é oportunidade, e merece registro:

- **`BaciaHidrograficas`**, a bacia **administrativa** do DAEE, 9 linhas
  (**MEDIDO**). Não é o nosso `bacia_hidrografica` (10.4), e é um eixo de
  agrupamento que o nosso cadastro não tem: 9 valores cobrindo o Estado servem bem
  como filtro de tela, coisa que um campo de curso d'água com centenas de valores
  distintos não faz.
- **`ZonaHidrograficas` e `SubZonaHidrograficas`**, o zoneamento do DNAEE,
  preenchido em 99,8% dos postos (**MEDIDO**). Não é sub UGRHI, e é a classificação
  mais completa da base deles.
- **`AparelhoPostos`** com datas de início e desativação: histórico de
  instrumentação por posto, estruturado, além dos cinco campos que ele já alimenta
  (10.6).
- **O acervo de medições**, com 27,3 milhões de registros pluviométricos e 17,7
  milhões fluviográficos, que hoje o nosso sistema não alcança.

---

## 11. Decisões que dependem do Rafael ou do órgão

Cada item traz recomendação e motivo. Nenhuma é decidível por nós.

### 11.1 Onde o nosso PostgreSQL passa a rodar

**A pergunta mais urgente, e ela não é sobre schema.** Existe uma tensão real entre
duas instruções: "o Supabase morre" e "o nosso banco nem mexe". Ela se resolve
distinguindo **schema** de **hospedagem**, e a resolução é medida: o servidor de
aplicação **não tem saída para a internet**, portanto **o Supabase em nuvem é
inalcançável de `10.199.43.27`**. O schema pode permanecer idêntico; a hospedagem
não pode permanecer onde está.

**Recomendação: PostgreSQL auto-hospedado em contêiner, com o schema inalterado.**
A ADR 0015 já construiu esse caminho: o `docker-compose.yml` tem o serviço `db` em
`postgis/postgis:16-3.4-alpine`, um `migrate` one-shot e o
`db/auth-compat.sql` que recria `auth`, `auth.users`, `auth.uid()` e os papéis
(**MEDIDO**). As 65 migrations sobem sem alteração. Como a seção 9 remove a
dependência de PostGIS, a imagem pode ser simplificada depois, e isso é ganho, não
requisito.

**Isto não é migração de dados no sentido que o Rafael descartou**: é troca de
hospedagem com schema idêntico. Precisa da confirmação dele, porque a frase "o
nosso nem mexe" admite as duas leituras e a diferença é material.

### 11.2 A API de escrita do órgão vai existir?

Muda a seção 3 de contingência para caminho principal, e devolve as funcionalidades
de edição de cadastro. **Recomendação: obter o contrato antes de escrever o
adaptador.** Contrato desenhado sobre suposição mente exatamente nos campos que o
órgão preencheu de outro jeito.

### 11.3 Login pela aplicação do órgão ou por leitura do hash?

**Recomendação: pela aplicação ou API deles**, com a leitura do hash como
contingência (4.4). Motivo: elimina o trânsito da credencial de 29 servidores
públicos pela nossa rede. É a decisão que mais reduz superfície de risco por
unidade de esforço. Depende da resposta ainda pendente do Diego.

### 11.4 Quem usa o sistema e não está em `UsuariosIdentity`?

São 29 usuários lá (**MEDIDO**). Se a operação envolver pessoas fora desse
conjunto, a delegação as exclui e **não temos como cadastrá-las**. **Recomendação:
levantar a lista de usuários pretendidos antes de implementar**, porque a resposta
pode invalidar a decisão da seção 4.

### 11.5 O nome exibido: o deles ou o nosso acentuado?

**Recomendação: rótulo de exibição nosso sobre o registro oficial deles**, para os
2.413 postos que cruzam (**MEDIDO**: 2.413 de 2.483, 97%). Atende `governo.md` e
`padrao-ui.md` sem alterar a base do órgão e sem copiar dado. É decisão de produto,
não de engenharia.

### 11.6 A divergência geográfica ainda tem finalidade?

**Recomendação: avaliar desligar em vez de migrar** (9.3). Ela detectava, em boa
parte, erros da nossa importação, e a importação deixa de existir.

### 11.7 Os 29,7% de postos sem UGRHI, e os 38,7% sem curso d'água

**As três junções de risco semântico deixaram de ser escalonamento**: foram
resolvidas por medição (10.4). O que sobra para o órgão é factual, e é menor.

Depois de esgotar os dois caminhos, **1.720 postos (29,7%) não têm UGRHI por
nenhuma via** e **2.243 (38,7%) não têm curso d'água**. **Recomendação: perguntar
ao órgão se isso é lacuna de cadastro conhecida ou se existe uma terceira origem
que não achamos.** A pergunta agora é objetiva e responde em uma conversa, porque
não depende mais de interpretar o modelo de dados deles.

**Decisão nossa, que não depende de resposta:** aceitar o caminho pelo município
como fallback da UGRHI, e **marcar na resposta da consulta qual origem foi usada**
(direta ou por município). O número na tela fica igual; a procedência fica
auditável, que é o que distingue dado medido de dado inferido.

### 11.8 A regra de derivação de instrumentação

**Recomendação: propor a regra por escrito ao órgão e obter validação antes de
codificar** (10.6).

### 11.9 O SIBH é alcançável de `10.199.43.27`?

Se não for, `sincronizar-monitor` não roda naquele servidor, e nenhuma escolha de
agendador resolve (6.3). **Recomendação: verificar antes de implementar o
agendador.**

### 11.10 Os 70 postos que são só nossos

**MEDIDO** pelo Rafael: 70 dos 2.483 postos do nosso CSV não existem em `Dbfch`
(postos do IAG e do monitoramento do Tietê). Se a leitura passa a ser da base
deles e não podemos escrever nela, **esses 70 saem da tela**. **Recomendação:
decidir explicitamente entre pedir a inclusão ao órgão ou tratá-los como cadastro
complementar nosso.** Deixar sem decisão é perdê-los em silêncio na virada.

### 11.11 O universo dobra: 2.483 para 5.790 postos

Inclui postos de Minas Gerais com prefixo numérico de 8 dígitos. É mudança de
escopo funcional visível ao usuário, não detalhe técnico. **Recomendação: confirmar
com o órgão o recorte esperado** (todos, só São Paulo, só ativos, e assim por
diante).

---

## 12. Pendências de medição

A VPN do órgão caiu durante parte da redação e voltou depois. **As pendências 12.1
a 12.3 foram medidas e estão resolvidas**, e os resultados corrigiram a seção 10 em
dois pontos. Ficam registradas com o resultado, e não apagadas, porque o que elas
ensinaram sobre o modelo de dados do órgão vale mais que a conclusão isolada.

**12.1 A UGRHI ausente pode ser recuperada pelo município? RESOLVIDA: sim,
parcialmente.**

```
direto no posto ....... 2.814 (48,6%)
só via município ...... 1.256 (21,7%)
sem nenhum caminho .... 1.720 (29,7%)
```

Cobertura combinada de **70,3%**. O campo sobe de 49% para 70,3% aceitando o
caminho pelo município como fallback, e **29,7% permanecem sem origem**.

**12.2 Vocabulário de `UGRHIs`, `SubZonaHidrograficas` e `BaciaHidrograficas`.
RESOLVIDA, e foi a medição mais produtiva do documento.** Ver os nomes reais
respondeu, numa leitura, as duas perguntas semânticas que eu não conseguiria
decidir por raciocínio: `UGRHIs` guarda dois níveis distinguidos pelo código, e
`BaciaHidrograficas` é a bacia administrativa do DAEE, que não é o nosso campo.
Detalhe completo em 10.4.

**12.3 Cobertura de bacia pelo caminho do município. RESOLVIDA e DESCARTADA:**
4.066 de 5.790. O número é bom e **não serve para nada**, porque 12.2 mostrou que o
caminho estava errado. Fica como registro do quase erro: cobertura alta por junção
errada é o argumento mais perigoso deste mapeamento.

**12.4 Contagem de postos por tipo de aparelho. MEDIDA como TETO, refino
pendente.** Os cinco números estão em 10.6 (`convencional` 3.846, `nivel` 1.272,
`vazao` 595, `logger_eqp` 413, `telemetrico` 150), e a comparação com o nosso CSV
mostrou que a base deles ganha nos cinco em contagem absoluta.

**O que falta, e sem isto o número engana:** a contagem não filtrou
`DataDesativacao`, portanto conta vínculo já desativado. **Refino pendente: repetir
com `ap.DataDesativacao IS NULL` e medir quanto cada campo cai.** É a diferença
entre "o posto já teve" e "o posto tem", e a segunda é a que o usuário lê na ficha.

```sql
SELECT COUNT(DISTINCT CASE WHEN a.Designacao LIKE '%TELEMETRIC%' THEN ap.PostoId END) AS telemetrico,
       COUNT(DISTINCT CASE WHEN a.Designacao LIKE '%GRAVACAO LOCAL%' THEN ap.PostoId END) AS logger,
       COUNT(DISTINCT CASE WHEN ap.DataDesativacao IS NULL THEN ap.PostoId END) AS com_aparelho_ativo
  FROM Dbfch.dbo.AparelhoPostos ap
  JOIN Dbfch.dbo.Aparelhos a ON a.Id = ap.AparelhoId
 WHERE ap.Excluido = 0;
```

**12.5 Confirmação de que o `tedious` decodifica `varchar` corretamente.
PENDENTE.** Não é consulta de catálogo: é teste do driver, roda no Node, e decide
se é preciso tratamento de `cp1252` na fronteira (seção 3). Ler os 62 postos com
acento em `Nome` e conferir integridade.

**12.6 Formato da sub UGRHI no nosso CSV contra o código deles. PENDENTE, e é
armadilha silenciosa.** O nosso CSV escreve `2_4` e eles escrevem `204` (10.4). A
conversão está definida, e falta conferir contra o CSV inteiro que ela reproduz o
nosso valor em todos os postos que cruzam, e não só no exemplo conferido.

**12.7 Comparação campo a campo POR POSTO, nos 2.413 que cruzam. PENDENTE, e é a
única que responde "algum posto perde dado".** Todas as comparações deste ADR são
agregadas, e agregado responde sobre o conjunto, nunca sobre o indivíduo. A
consulta que decide cruza o nosso CSV com `Dbfch` por prefixo e conta, para cada
campo, quantos postos tinham valor do nosso lado e passam a não ter do lado deles.

Vale para os cinco campos de instrumentação, e também para `mantenedor`,
`municipio`, `ugrhi_nome` e `bacia_hidrografica`, que são os que apresentam as
maiores quedas agregadas (13.2). **É esta medição, e não a tabela de percentuais,
que deve embasar a conversa com o cliente sobre regressão**, porque é a única que
distingue "o conjunto ficou mais completo" de "o posto que o cliente abre perdeu um
campo".

---

## 13. Consequências

### 13.1 Positivas

- **A fonte de verdade do cadastro passa a ser a base institucional**, ao vivo, sem
  cópia e sem janela de defasagem. O universo cresce de 2.483 para 5.790 postos.
- **A coordenada deixa de estar errada.** A nossa está deslocada em mediana de
  10,17 km, com 1,6% de acerto (**MEDIDO**). A conversão da base deles produz a
  correta.
- **O escopo é muito menor do que parece.** Dezenove dos vinte e cinco adaptadores
  não mudam. O trabalho concentra-se em um domínio, com **oito pontos** de junção
  cruzada exigindo cuidado.
- **O nosso schema não muda.** As 65 migrations continuam válidas, as 12 chaves
  estrangeiras continuam de pé, e a garantia de eliminação por LGPD continua sendo
  do banco, e não de rotina de aplicação.
- **A arquitetura hexagonal se paga.** As 28 portas não mudam.
- **Duas dependências desaparecem**: PostGIS e Supabase Auth. Em entrega
  on-premises sem internet, cada componente a menos é um problema a menos no
  handoff PRODESP.
- **A identidade deixa de ser pendência.** A ADR 0015 §3 está resolvida, com opção
  melhor que as duas que ela previa, e o desligamento de servidor passa a ser
  efetivo.
- **A instrumentação melhora nos cinco campos**, em contagem absoluta, e `vazao`
  sai de **zero** postos preenchidos para 595 (10.6). Um campo que existia no
  schema e na tela sem nunca ter tido valor passa a ter.

### 13.2 Negativas e a acompanhar

> **Leia esta lista com a ressalva B de 10.6.** Os números abaixo são **agregados**,
> e agregado descreve o conjunto, não o posto que o cliente abre. Nenhum deles prova
> que um posto específico perde um campo que tinha. A medição que responde isso é a
> pendência **12.7**, por posto, sobre os 2.413 que cruzam, e **ela deve vir antes
> de qualquer conversa com o cliente sobre regressão**.

- **Perda de preenchimento em campos hoje completos:** `mantenedor` cai para 27%,
  `municipio` para 72%, `ugrhi_nome` e `sub_ugrhi_nome` para **70,3%**,
  `bacia_hidrografica` para **61,3%** e `aquifero` para 1,7%. É regressão visível ao
  usuário, e precisa ser comunicada **antes** de acontecer.
- **Seis campos ficam vazios** (10.5): `municipio_alt`, `rede`, `btl`,
  `cia_ambiental`, `cobacia` e `observacoes`, mais os quatro de ficha (fora de
  escopo) e os três de estado de telemetria. **Cinco campos de instrumentação
  saíram desta lista** e passam a ser deriváveis (10.6).
- **Edição de cadastro fica indisponível** até a API existir (seção 3).
- **Oito junções cruzadas** precisam de composição na aplicação, e são o ponto de
  maior risco de regressão de desempenho e de correção.
- **13 registros com `Excluido = 1`** viram postos fantasmas em qualquer consulta
  que esqueça o filtro, sem produzir erro.
- **Dependemos da disponibilidade do servidor do órgão** para a tela principal
  funcionar. Antes o dado era nosso. A degradação precisa ser legível.
- **Os 70 postos só nossos** e o crescimento para 5.790 são mudanças funcionais
  visíveis, pendentes de decisão (11.10 e 11.11).

---

## 14. Alternativas descartadas no conjunto

**Migrar os dados do órgão para o nosso banco.** Descartada por determinação do
proprietário, e ela está tecnicamente certa: criaria uma segunda fonte de verdade
do cadastro público, que é o problema que a mudança veio resolver, e sem coluna de
atualização (10.7) a atualização seria integral e periódica, com defasagem
permanente.

**Manter o Supabase em paralelo numa transição gradual.** Inviável por medição: o
servidor de aplicação não tem saída para a internet, portanto o Supabase é
inalcançável de lá.

**`tds_fdw` com view sobre tabela estrangeira.** Avaliada em detalhe e descartada
na seção 2.4, com o registro de que continua sendo ponte legítima se o prazo
apertar, desde que decidida como ponte e com data.

**Pedir escrita em `Dbfch`.** Descartada como caminho arquitetural. Escrita direta
de aplicação de terceiro no banco institucional contorna a esteira Flyway e Jenkins
do órgão (**MEDIDO**, seção 7) e as regras de negócio da aplicação .NET deles. O
caminho correto para escrita é a API, já em avaliação.

**Adotar o vocabulário de permissões deles como nossa autorização.** Descartada por
medição: os 35 tipos de `UsuariosPermissoesIdentity` não cobrem nenhum dos nossos
módulos, os dois perfis não são os nossos três, e a tabela é somente leitura para
nós (4.4).

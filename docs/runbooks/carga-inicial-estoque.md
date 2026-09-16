# Runbook: carga inicial do estoque no servidor do órgão (sem internet)

**Sistema:** SP Águas, DMO (módulo de estoque, migrations 0054 a 0065, 0070 e 0071)
**Servidor:** `10.199.43.27`, `dmo.spaguas.sp.gov.br`
**Escrito em:** 16/09/2026
**Estado:** preparado e ensaiado localmente. **Nenhum passo deste runbook foi executado no servidor.**

Cada afirmação está marcada como **MEDIDO** (existe comando e saída por trás) ou
**HIPÓTESE** (raciocínio ainda não confirmado no ambiente real).

Pré-leitura obrigatória: `docs/runbooks/entrega-imagem-sem-internet.md`, seções
2 a 6 (construção, transporte, arquivos de ambiente e subida da pilha). Este
runbook parte do princípio de que a pilha `spaguas-dmo` já está no ar, com o
serviço `migrate` encerrado com código 0.

Na subida de estoque preparada em 16/09/2026, esta carga é o passo 14 do
checklist da seção 0 do runbook de entrega, e roda **depois** da 0071. O script
confere a tabela `estoque_desconformidades` antes de gravar qualquer linha e,
sem ela, termina com `ERRO: tabela estoque_desconformidades ausente: aplique a
migration 0071 antes da carga` e código 1, sem gravar nada (lido no código,
`exigirTabelaDesconformidades`).

---

## 1. O que é esta carga e o que ela não é

A carga inicial é o script `scripts/estoque/importar-inventario.mjs`. Ele lê a
planilha de inventário da SP Águas e grava locais, materiais, unidades, saldos e
o registro de movimentações (ledger) nas tabelas `estoque_*`.

Ela roda por uma imagem própria, `spaguas/carga-estoque:sha-<commit>`, construída
a partir de `ops/producao/Dockerfile.carga-estoque`. A imagem contém somente o
script e as dependências dele (`postgres` e `exceljs`, nas versões do
`package-lock.json`). **A planilha não está na imagem e não está no Git**: ela
viaja separada e é montada somente leitura na hora de rodar.

Três propriedades do script que determinam a forma deste procedimento, lidas no
código e confirmadas no ensaio:

1. **É idempotente.** Rodar de novo não duplica nada: a segunda execução informa
   `inseridas 0` em todas as abas (MEDIDO, seção 9).
2. **Não roda em transação única.** Uma falha no meio deixa parte do dado
   gravado. Por isso o backup vem antes, sem exceção.
3. **`--estrito` não é simulação.** A opção faz a carga inteira e, ao final, sai
   com código 2 se houver avisos. Ela não impede a gravação; ela só torna os
   avisos visíveis no código de saída.

> **Nota sobre o cabeçalho do `docker-compose.prod.yml`.** O comentário diz que
> "o banco nasce vazio" e que "não há importação". Isso continua verdadeiro para
> posto e medição (que vêm do SQL Server do órgão). A carga do estoque é a
> exceção pontual, feita uma vez, por este runbook.

---

## 2. Construir a imagem (máquina com internet)

A imagem de carga **leva a mesma tag de commit** da aplicação e das migrations
que estão no ar. O script depende do esquema das migrations 0054 a 0065 e da
tabela da 0071; tag igual garante que ele encontra as colunas que espera. Na
subida preparada em 16/09/2026 ela é construída junto das outras duas (seção 3
do runbook de entrega) e viaja no mesmo pacote.

```bash
# Árvore exportada pelo Git, como na seção 2 do runbook de entrega
cd /c/tmp/dmo-build
SHA=$(git -C "<repositorio>" rev-parse --short HEAD)

DOCKER_BUILDKIT=1 docker build \
  -f ops/producao/Dockerfile.carga-estoque \
  -t spaguas/carga-estoque:sha-$SHA .
```

O contexto de build é controlado por `ops/producao/Dockerfile.carga-estoque.dockerignore`,
que funciona por **permissão**: entram somente `package-lock.json` e o script.

**MEDIDO em 16/09/2026:** com uma imagem de sonda usando o mesmo arquivo de
ignore (resumo SHA-256 idêntico), o contexto transferido tinha 2 arquivos
(`package-lock.json` e `scripts/estoque/importar-inventario.mjs`). No controle,
com o `.dockerignore` da raiz, tinha 796 arquivos, entre eles
`ops/estoque/planilha-inicial.xlsx`; essa linha foi acrescentada ao
`.dockerignore` da raiz no mesmo dia, e a contagem caiu para 795, sem a planilha.
Depois disso a regra da raiz foi ampliada para a pasta `ops/estoque` inteira,
mais `**/*.xlsx`, `**/*.xls` e `.env` em qualquer pasta (HIPÓTESE até o próximo
build: a contagem de contexto não foi medida de novo).

### 2.1 Conferir antes de transportar

```bash
IMG=spaguas/carga-estoque:sha-$SHA

# 1. Não roda como root. Espera: node
docker image inspect $IMG --format '{{.Config.User}}'

# 2. Nenhuma planilha e nenhum arquivo de ambiente na imagem. Espera: 0 e 0
docker run --rm --entrypoint sh $IMG -c \
  'find / -xdev -iname "*.xlsx" 2>/dev/null | wc -l; find / -xdev \( -name ".env" -o -name ".env.*" -o -name "*.env" \) 2>/dev/null | wc -l'

# 3. Fora das dependências, a imagem só tem o script e o ponto de montagem.
docker run --rm --entrypoint sh $IMG -c \
  'find /carga -path /carga/node_modules -prune -o -type f -print'
#    espera: /carga/scripts/estoque/importar-inventario.mjs
```

**MEDIDO em 16/09/2026** (imagem de ensaio): usuário `node` (uid 1000), 0 arquivo
`.xlsx`, 0 arquivo de ambiente, 105 pacotes instalados e todos com a versão
idêntica à do `package-lock.json` (0 divergente, 0 fora do lock). A sonda de
contagem de `.xlsx` foi validada com controle positivo: com a planilha montada,
ela conta 1.

### 2.2 Tamanhos (MEDIDO em 16/09/2026)

| Grandeza | Valor |
|---|---|
| `docker images` | 282 MB |
| Parte compartilhada com a base `node:24-alpine` | 235,3 MB |
| Parte exclusiva da imagem (`docker system df -v`) | 47,0 MB |
| `docker save` da imagem sozinha, com `gzip -6` | 65.272.420 bytes (62,2 MiB) |

A base é a mesma do runner da aplicação, então no disco do servidor o custo real
fica perto dos 47 MB, **desde que as duas imagens tenham sido construídas sobre o
mesmo resumo da base** (HIPÓTESE para cada entrega: construir as duas no mesmo
dia e conferir com `docker system df -v` no servidor). O arquivo transportado
carrega a base inteira de qualquer forma, pelo motivo descrito na seção 4 do
runbook de entrega.

---

## 3. Empacotar e transportar

```bash
docker save spaguas/carga-estoque:sha-$SHA | gzip -6 -c > dmo-carga-estoque-sha-$SHA.tar.gz
sha256sum dmo-carga-estoque-sha-$SHA.tar.gz
```

Na subida de 16/09/2026 a imagem vai **no mesmo arquivo da entrega**: a seção 4
do runbook de entrega já inclui a referência, e o comando acima só serve para
carga feita em outra ocasião. Nesse caso, os passos 4.1 abaixo usam o arquivo
próprio; no caso normal, a imagem já foi carregada no passo 6 do checklist e o
4.1 se resume ao `docker images`.

**A planilha viaja separada da imagem**, pelo canal definido pelo órgão (seção
10.5 do runbook de entrega), e a integridade se confere nas duas pontas:

```bash
sha256sum planilha-inicial.xlsx
```

**MEDIDO:** a cópia usada no ensaio de 16/09/2026 tem 193.908 bytes e resumo
`88299ad2411c715cf0986a80313f3ae18f023cd21d0727e5928449edc9ed4874`. As contagens
esperadas da seção 7 valem para esta cópia. Planilha com outro resumo exige novo
ensaio antes de ir ao servidor, porque as contagens deixam de valer.

A planilha é dado do órgão. Não fica em pasta de usuário, não vai para o Git e é
removida do servidor depois do aceite (seção 8.3), salvo instrução do órgão.

---

## 4. Preparar no servidor

```bash
cd /opt/spaguas-dmo
SHA=<a tag que está no ar, sem o prefixo sha->

# 4.1 Carregar a imagem e conferir a integridade antes
sha256sum dmo-carga-estoque-sha-$SHA.tar.gz   # igual ao valor da origem
docker load -i dmo-carga-estoque-sha-$SHA.tar.gz
docker images spaguas/carga-estoque

# 4.2 A tag da carga tem que ser a mesma que está no ar
grep '^IMAGEM_TAG=' /opt/spaguas-dmo/.env      # espera: IMAGEM_TAG=sha-$SHA

# 4.3 Guardar a planilha
sudo install -d -m 0750 -o root -g docker /var/lib/spaguas-dmo/carga-estoque
sudo install -m 0644 -o root -g root planilha-inicial.xlsx /var/lib/spaguas-dmo/carga-estoque/planilha-inicial.xlsx
sudo sha256sum /var/lib/spaguas-dmo/carga-estoque/planilha-inicial.xlsx
rm planilha-inicial.xlsx
```

**Permissão da planilha (HIPÓTESE, não exercitada em Linux):** o processo da
carga roda como uid 1000 dentro do container e lê o arquivo pela montagem. O
diretório com 0750 impede que usuário fora do grupo `docker` leia a planilha no
host, e o arquivo com 0644 deixa o uid 1000 do container ler. Se a carga
terminar com `ERRO: EACCES`, o problema é esta permissão, e não o script.

### 4.4 A pilha está no ar e as migrations do estoque foram aplicadas

```bash
docker compose -f docker-compose.prod.yml ps -a
#    espera: db healthy, migrate Exited (0), app healthy

docker compose -f docker-compose.prod.yml exec -T db psql -U spaguas -d spaguas -tAc \
  "select count(*) from information_schema.columns where table_name='estoque_movimentacoes' and column_name='conferencia_id'"
#    espera: 1   (coluna da migration 0064; 0 significa migrations atrasadas)

docker compose -f docker-compose.prod.yml exec -T db psql -U spaguas -d spaguas -tAc \
  "select count(*) from pg_proc where proname='f_unaccent' and prosrc like '%.unaccent(%'"
#    espera: 1   (migration 0070; sem ela o dump da seção 5 não restaura, ver 8.2)

docker compose -f docker-compose.prod.yml exec -T db psql -U spaguas -d spaguas -tAc \
  "select count(*) from pg_class where oid = to_regclass('public.estoque_desconformidades')"
#    espera: 1   (migration 0071; com 0 a carga sai com código 1 antes de gravar)

docker compose -f docker-compose.prod.yml logs migrate | grep -cE -- '-> 007[012]_'
#    espera: 3   (0070, 0071 e 0072 passaram pelo migrate desta tag)
```

### 4.5 As tabelas do estoque estão vazias

Esta é uma carga **inicial**. Se alguma tabela já tiver linha, parar aqui e
reportar: o procedimento deixa de ser este.

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U spaguas -d spaguas -tA <<'SQL'
select 'estoque_locais', count(*) from estoque_locais
union all select 'estoque_categorias', count(*) from estoque_categorias
union all select 'estoque_materiais', count(*) from estoque_materiais
union all select 'estoque_unidades', count(*) from estoque_unidades
union all select 'estoque_saldos', count(*) from estoque_saldos
union all select 'estoque_movimentacoes', count(*) from estoque_movimentacoes
union all select 'estoque_conferencias', count(*) from estoque_conferencias
union all select 'estoque_desconformidades', count(*) from estoque_desconformidades;
SQL
#    espera: 0 em todas as oito linhas
```

### 4.6 A DATABASE_URL está num formato que o `docker run` entende

**MEDIDO em 16/09/2026:** o `docker run --env-file` **não remove aspas**, ao
contrário do `env_file` do Compose. Com `DATABASE_URL="postgresql://..."` no
arquivo, o valor chega ao processo começando com aspas, e a conexão falha. A
conferência abaixo imprime só contagem, nunca o valor:

```bash
sudo grep -cE '^DATABASE_URL=postgresql://[^"'"'"' ]+@db:5432/[A-Za-z0-9_]+$' /etc/spaguas-dmo/app.env
#    espera: 1
```

A carga recebe **só** a `DATABASE_URL`, e não o `app.env` inteiro: o arquivo
também tem `CRON_SECRET` e as chaves de identidade, que o script não usa e que
ficariam visíveis no inspect do container durante a execução. O arquivo
reduzido é criado com a permissão do `app.env` antes de receber o conteúdo, e
nada é impresso:

```bash
ENV_CARGA=/etc/spaguas-dmo/carga-estoque.env
sudo install -m 0640 -o root -g docker /dev/null "$ENV_CARGA"
sudo sh -c "grep '^DATABASE_URL=' /etc/spaguas-dmo/app.env > $ENV_CARGA"
sudo grep -c '' "$ENV_CARGA"                 # espera: 1 (uma linha só)
sudo grep -c '^DATABASE_URL=' "$ENV_CARGA"   # espera: 1
```

O host `db` é o nome do serviço no Compose. **MEDIDO em 16/09/2026:** um
container avulso ligado por `docker run --network <rede do compose>` resolve o
nome do serviço; na rede padrão `bridge`, não resolve (controle). A rede do
projeto se chama **`spaguas-dmo`**, definida com `name:` explícito na seção
`networks` do `docker-compose.prod.yml`:

```bash
docker network ls --filter name=^spaguas-dmo$ --format '{{.Name}}'
#    espera: spaguas-dmo
```

---

## 5. Backup ANTES da carga

Este é o **segundo** dump da subida, e não substitui o primeiro. O primeiro foi
tirado antes da migração (passo 10 do checklist do runbook de entrega), sem a
0070, e é o que desfaz o esquema. Este é tirado com 0070 a 0072 aplicadas e o
estoque vazio, e é o que desfaz só a carga, restaurando direto (seção 8.2).

```bash
sudo install -d -m 0700 -o root -g root /var/backups/spaguas-dmo
CARIMBO=$(date -u +%Y%m%dT%H%M%SZ)
DUMP=/var/backups/spaguas-dmo/antes-da-carga-estoque-sha-$SHA-$CARIMBO.dump

docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U spaguas -d spaguas --format=custom | sudo tee "$DUMP" > /dev/null
echo "codigos: ${PIPESTATUS[*]}"
#    espera: 0 0   (o primeiro é o pg_dump; o código do tee sozinho não prova nada)
sudo chmod 0600 "$DUMP"

# O arquivo existe, tem tamanho e é um dump legível. Espera: número maior que zero.
sudo ls -l "$DUMP"
sudo cat "$DUMP" | docker compose -f docker-compose.prod.yml exec -T db pg_restore --list | grep -c 'TABLE DATA'
```

O dump contém dado pessoal (fichas de visita, trilha de auditoria), por isso a
permissão 0600 de root. Ele está no mesmo disco da VM e não substitui o backup
da infraestrutura do órgão (seção 10.8 do runbook de entrega).

### 5.1 Fotografia de linhas por tabela, para comparar numa eventual reversão

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U spaguas -d spaguas -tA <<'SQL' \
  | sudo tee /var/backups/spaguas-dmo/linhas-antes-da-carga-$CARIMBO.txt
select table_name, (xpath('/row/c/text()', query_to_xml(
         'select count(*) as c from public.' || quote_ident(table_name), false, true, '')))[1]::text
  from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE'
 order by table_name;
SQL
```

---

## 6. Rodar a carga

Os limites e o endurecimento abaixo são os mesmos do serviço `migrate` no
compose, e foram os usados no ensaio.

```bash
PLANILHA=/var/lib/spaguas-dmo/carga-estoque/planilha-inicial.xlsx
LOG1=/var/backups/spaguas-dmo/carga-estoque-estrito-$CARIMBO.log

docker run --rm --name spaguas-dmo-carga-estoque \
  --network spaguas-dmo \
  --env-file "$ENV_CARGA" \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --cpus 1.0 --memory 512m --pids-limit 128 \
  -v "$PLANILHA":/carga/ops/estoque/planilha-inicial.xlsx:ro \
  spaguas/carga-estoque:sha-$SHA --estrito \
  > "$LOG1" 2>&1
echo "codigo de saida: $?"
```

O `echo` vem **na linha seguinte** ao comando e sem pipe no meio, para que o
código lido seja o da carga. Depois, ler o log:

```bash
grep -v '^    aba' "$LOG1"     # resumo
grep '^    aba' "$LOG1"        # detalhe de cada aviso, para registro
```

**Resultado esperado desta primeira execução**, que é a carga propriamente dita:

1. código de saída **2**;
2. linhas `aba "..."` com `inseridas` maior que zero;
3. `AVISOS: 27`, distribuídos em `coluna_sem_cabecalho: 4`,
   `descricao_suspeita: 1`, `quantidade_vazia: 1`, `chave_repetida: 1`,
   `item_sem_descricao: 7` e `identificador_repetido: 13` (MEDIDO no ensaio);
4. `desconformidades gravadas: 27 (novas 27 | ja registradas 0; status e nota preservados)`
   (HIPÓTESE: a linha foi lida no código, e a contagem de 27 registros por tipo
   foi MEDIDA na tabela do banco de ensaio; a primeira execução sobre tabela
   vazia com esta imagem não foi exercitada);
5. `conciliacao OK: 89 par(es) material/local, saldo == soma do ledger.`;
6. a última linha é `modo estrito: ha avisos, saindo com codigo 2.`

Como interpretar o código de saída:

| Código | Significado | Ação |
|---|---|---|
| 2 | carga feita, conciliação correta, há avisos | conferir se são os 27 conhecidos e seguir para a seção 7 |
| 0 | carga feita sem aviso nenhum | não é o esperado para esta planilha: conferir o resumo SHA-256 dela antes de seguir |
| 1 | erro (planilha não encontrada, banco inalcançável) ou divergência de conciliação | ler a linha `ERRO:` do log; havendo gravação parcial, decidir entre corrigir a causa e rodar de novo (o script é idempotente) ou reverter (seção 8) |

A avaliação dos avisos é do negócio e não bloqueia tecnicamente a carga: ela já
foi feita quando o código 2 aparece.

---

## 7. Critérios de aceite, por contagem

O código de saída sozinho não aceita a carga. Aceita a contagem.

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U spaguas -d spaguas -tA <<'SQL'
\echo '1. unidades por unidade fisica e status'
select coalesce(l.unidade, '(sem local)'), u.status, count(*)
  from estoque_unidades u left join estoque_locais l on l.id = u.local_id
 group by 1, 2 order by 1, 2;
\echo '2. total de unidades e unidades com codigo'
select count(*), count(u.codigo) from estoque_unidades u;
\echo '3. saldos: quantidade de linhas e soma'
select count(*), sum(quantidade) from estoque_saldos;
\echo '4. ledger por tipo'
select tipo, count(*) from estoque_movimentacoes group by tipo order by tipo;
\echo '5. desconformidades por tipo e status'
select tipo, status, count(*) from estoque_desconformidades group by 1, 2 order by 1, 2;
\echo '6. desconformidades: total e com dados em objeto jsonb'
select count(*), count(*) filter (where jsonb_typeof(dados) = 'object') from estoque_desconformidades;
SQL
```

Valores esperados para a planilha de 16/09/2026 (MEDIDO no ensaio, com estas
mesmas consultas):

| Consulta | Esperado |
|---|---|
| 1 | `ARARAQUARA|ativo|105`, `PENHA|ativo|667`, `PENHA|defeito|26`, `PENHA|descarte|16` (e nenhuma linha `(sem local)`) |
| 2 | `814|626` (814 unidades, 626 com código) |
| 3 | `119|1664` (119 saldos somando 1.664) |
| 4 | `baixa|16` e `entrada|916` (nenhum outro tipo) |
| 5 | `chave_repetida|aberta|1`, `coluna_sem_cabecalho|aberta|4`, `descricao_suspeita|aberta|1`, `identificador_repetido|aberta|13`, `item_sem_descricao|aberta|7`, `quantidade_vazia|aberta|1` (seis linhas, nenhuma `resolvida` nem `ignorada`) |
| 6 | `27|27` (27 registros, todos com `dados` em objeto) |

**Sobre as consultas 5 e 6, MEDIDO em 16/09/2026 no banco de ensaio** (que já
tinha a carga e uso de tela): os mesmos 27 registros com a mesma distribuição
por tipo, e 27 com `dados` em objeto. No ensaio um `item_sem_descricao` estava
resolvido pela tela e havia 815 unidades, uma a mais que a carga pura; numa carga
limpa o esperado é 814 unidades e os 27 abertos (`aberta` é o default da coluna
na 0071). A consulta 6 repete, pelo lado do dado, o `CHECK` da 0071 sobre
`dados`; ela existe para denunciar a conversão da 0072 se algum dia regredir.

Qualquer número diferente reprova o aceite, e a decisão entre investigar e
reverter é tomada antes de liberar o módulo para uso.

### 7.1 Segunda execução: prova de idempotência

```bash
LOG2=/var/backups/spaguas-dmo/carga-estoque-reexecucao-$CARIMBO.log

docker run --rm --name spaguas-dmo-carga-estoque \
  --network spaguas-dmo \
  --env-file "$ENV_CARGA" \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --cpus 1.0 --memory 512m --pids-limit 128 \
  -v "$PLANILHA":/carga/ops/estoque/planilha-inicial.xlsx:ro \
  spaguas/carga-estoque:sha-$SHA \
  > "$LOG2" 2>&1
echo "codigo de saida: $?"

grep -E '^aba |^TOTAL|^desconformidades|^conciliacao' "$LOG2"
```

Resultado esperado (MEDIDO no ensaio, exceto o item 3):

1. código de saída **0**;
2. `inseridas 0` em todas as abas com dado, e `TOTAL: inseridas 0 | atualizadas 934 | puladas 1372`;
3. `desconformidades gravadas: 27 (novas 0 | ja registradas 27; status e nota preservados)`
   (HIPÓTESE, lida no código: o `ON CONFLICT (chave)` não reabre nem duplica);
4. `conciliacao OK: 89 par(es) material/local, saldo == soma do ledger.`;
5. as consultas da seção 7, rodadas de novo, devolvem **exatamente** os mesmos
   números.

`atualizadas` maior que zero é esperado: o script regrava as linhas que
reconhece pela chave natural. O que prova a idempotência é `inseridas 0` junto
das contagens inalteradas.

---

## 8. Reverter

### 8.1 Quando

Contagem da seção 7 fora do esperado sem explicação, ou código 1 com gravação
parcial que não se resolve rodando de novo.

### 8.2 Como

A reversão restaura o dump da seção 5 num banco novo, confere, e troca os nomes.
O banco com a carga não é apagado: fica renomeado para análise.

**Por que a migration 0070 é pré-requisito, MEDIDO em 16/09/2026:** o
`pg_restore` zera o `search_path` no início. Até a 0069, a função
`public.f_unaccent` chamava `unaccent` sem o esquema, e ao recriar a tabela
`postos`, que usa a função, a restauração morria com
`function unaccent(unknown, text) does not exist`. A 0070 qualifica a chamada.
No ensaio, o dump tirado antes dela falhou com esse erro (controle), e o dump
tirado depois restaurou com `pg_restore --single-transaction` direto, código 0,
com a contagem de linhas das 36 tabelas idêntica à origem. A seção 4.4 confere
que a 0070 está aplicada antes do backup.

Se o dump tiver sido tirado de um banco **sem** a 0070, o passo 2 abaixo falha
com aquele erro. Nesse caso, e só nele, trocar o passo 2 por:

```bash
sudo cat "$DUMP" \
  | docker compose -f docker-compose.prod.yml exec -T db pg_restore -f - \
  | sed "/^SELECT pg_catalog.set_config('search_path', '', false);\$/d" \
  | docker compose -f docker-compose.prod.yml exec -T db \
      psql -U spaguas -d spaguas_revertido -q -v ON_ERROR_STOP=1 --single-transaction > /dev/null
echo "codigos: ${PIPESTATUS[*]}"
#    espera: 0 0 0 0 (os quatro; o psql confirma SQL truncado com 0)
```

```bash
cd /opt/spaguas-dmo

# 1. Parar a aplicação (o banco continua de pé)
docker compose -f docker-compose.prod.yml stop app

# 2. Restaurar o dump num banco novo
docker compose -f docker-compose.prod.yml exec -T db createdb -U spaguas spaguas_revertido
sudo cat "$DUMP" \
  | docker compose -f docker-compose.prod.yml exec -T db \
      pg_restore -U spaguas -d spaguas_revertido --single-transaction --exit-on-error
echo "codigos: ${PIPESTATUS[*]}"
#    espera: 0 0

# 3. Conferir: o estoque volta a zero e as demais tabelas voltam à fotografia da seção 5.1
docker compose -f docker-compose.prod.yml exec -T db psql -U spaguas -d spaguas_revertido -tA <<'SQL' \
  > /tmp/linhas-revertido.txt
select table_name, (xpath('/row/c/text()', query_to_xml(
         'select count(*) as c from public.' || quote_ident(table_name), false, true, '')))[1]::text
  from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE'
 order by table_name;
SQL
sudo diff /var/backups/spaguas-dmo/linhas-antes-da-carga-$CARIMBO.txt /tmp/linhas-revertido.txt \
  && echo "identico ao estado anterior a carga"

# 4. Trocar os nomes (exige zero conexões nos dois bancos)
docker compose -f docker-compose.prod.yml exec -T db psql -U spaguas -d postgres -tAc \
  "select datname, count(*) from pg_stat_activity where datname in ('spaguas','spaguas_revertido') group by 1"
#    espera: nenhuma linha
docker compose -f docker-compose.prod.yml exec -T db psql -U spaguas -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER DATABASE spaguas RENAME TO spaguas_carga_revertida_$CARIMBO" \
  -c "ALTER DATABASE spaguas_revertido RENAME TO spaguas"

# 5. Subir a aplicação e conferir a saúde
docker compose -f docker-compose.prod.yml up -d app
curl -sS http://127.0.0.1:3000/api/health
#    espera: {"status":"ok","db":"ok"}
```

Sobre o passo 2: os dois códigos precisam ser zero, e o `diff` do passo 3
confirma o conteúdo. Os códigos se leem na linha imediatamente seguinte. Se
qualquer passo
falhar antes do 4, o banco `spaguas` não foi tocado: basta `docker compose up -d
app` e apagar `spaguas_revertido`.

Dado gravado pelos usuários entre o backup e a reversão se perde com ela. Por
isso a carga é feita com o módulo ainda não liberado, e o aceite da seção 7
acontece antes da liberação.

### 8.3 Depois do aceite

1. Remover a planilha do servidor, salvo instrução do órgão:
   `sudo rm /var/lib/spaguas-dmo/carga-estoque/planilha-inicial.xlsx`.
   Remover também o arquivo reduzido de ambiente: `sudo rm /etc/spaguas-dmo/carga-estoque.env`.
2. Manter o dump da seção 5 até a primeira rotina de backup do órgão cobrir o
   banco já com a carga; então removê-lo.
3. Registrar data, tag, código de saída das duas execuções e a tabela da seção 7
   em `docs/runbooks/registro-de-entregas.md`.
4. A imagem `spaguas/carga-estoque` pode ser removida por nome
   (`docker image rm spaguas/carga-estoque:sha-$SHA`). Nunca por varredura.

---

## 9. Evidência do ensaio local (16/09/2026)

Ambiente: Docker Desktop 29.6.2 (Windows), banco de ensaio
`postgis/postgis:16-3.4-alpine` na rede `estoque-ensaio`, **com a carga já
feita**, alcançado pelo container da carga como `estoque-ensaio-db:5432`.
Imagem construída a partir da árvore de trabalho sobre o commit `7f8d6a6`, com
alterações ainda não commitadas no script; por isso a tag de ensaio foi
`sha-7f8d6a6-wip`, e **não serve para produção**.

| Verificação | Resultado |
|---|---|
| `docker build` | código 0; recorte do lock com 105 pacotes, raízes `postgres 3.4.9` e `exceljs 4.4.0` |
| Contexto de build | 443,17 kB (lock de 417.994 bytes mais script de 24.925 bytes) |
| Execução sem `--estrito`, com `--read-only` e `--cap-drop ALL` | código 0, `inseridas 0` nas cinco abas com dado, `AVISOS: 27`, `conciliacao OK: 89 par(es)` |
| Execução com `--estrito` | código 2, mesma saída mais `modo estrito: ha avisos, saindo com codigo 2.` |
| Contagens da seção 7 antes e depois das duas execuções | idênticas: 814 unidades (PENHA 667 ativo, 26 defeito, 16 descarte; ARARAQUARA 105), 626 com código, 119 saldos somando 1.664, ledger 916 entradas e 16 baixas |
| Execução sem a planilha montada (controle) | código 1, `ERRO: File not found: /carga/ops/estoque/planilha-inicial.xlsx` |
| Restauração com `pg_restore --single-transaction` de dump tirado **antes** da 0070 (controle) | código 1, `function unaccent(unknown, text) does not exist` |
| Migration 0070 aplicada duas vezes | código 0 nas duas; `f_unaccent('Ação São Joaquim')` devolve `Acao Sao Joaquim` antes e depois |
| Restauração com `pg_restore --single-transaction` de dump tirado **depois** da 0070 | código 0, nenhuma linha de erro, 36 tabelas, hash da contagem de linhas por tabela idêntico à origem, 814 unidades e 119 saldos somando 1.664 |
| Contorno com `sed` para dump anterior à 0070 | código 0, 36 tabelas idênticas à origem |

O que **não** foi exercitado: nenhum passo no servidor do órgão; a permissão da
planilha montada num host Linux (seção 4.3); o formato real da `DATABASE_URL` no
`app.env` de produção (seção 4.6); a primeira carga sobre tabelas vazias com esta
imagem (o ensaio partiu de um banco que já tinha a carga); a troca de nomes da
seção 8.2 com a aplicação conectada até o momento anterior; as linhas
`desconformidades gravadas` das duas execuções com a versão atual do script
(seções 6 e 7.1, lidas no código); a carga depois da 0072, que ainda não existia
em 16/09/2026.

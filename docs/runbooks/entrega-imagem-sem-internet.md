# Runbook: entrega no servidor do órgão (sem internet)

**Sistema:** SP Águas - DMO (dashboard Next.js + PostgreSQL próprio)
**Servidor:** `10.199.43.27`, `dmo.spaguas.sp.gov.br`, Ubuntu 24.04.1 em VM VMware
**Escrito em:** 27/08/2026
**Estado:** preparação. **Nenhum passo deste runbook foi executado no servidor.**
Ordem do Rafael em 27/08: preparar o container, não fazer o deploy.

Cada afirmação está marcada como **MEDIDO** (existe comando e saída por trás) ou
**HIPÓTESE** (raciocínio ainda não confirmado no ambiente real).

---

## 1. Por que este runbook é diferente do normal

**MEDIDO:** o servidor não tem saída **direta** para a internet. O DNS não
resolve nome externo nenhum (`github.com`, `registry-1.docker.io`, nem o próprio
`apps.spaguas.sp.gov.br`) e a saída TCP direta para `1.1.1.1:443` está
bloqueada.

> **Corrigido em 02/09/2026.** A frase original terminava com "não há proxy
> corporativo configurado", e ela era verdadeira sobre a MÁQUINA e falsa sobre a
> REDE. O desenvolvedor do órgão informou que **existe um proxy corporativo**, e
> que é por ele que tudo sai: o firewall autoriza pelo IP do proxy, que é fixo,
> e não pelo IP de quem chama. O que medimos foi a ausência de rota direta e a
> ausência de proxy configurado naquele host, e disso concluímos que não havia
> proxy, o que não se seguia.
>
> Configuração da aplicação: seção 5.1 de `ops/producao/ambiente-producao.exemplo`.
> Não basta definir `HTTP_PROXY`: o `fetch` nativo do Node não lê essa variável,
> e foi por isso que a imagem passou para `node:24-alpine` com
> `NODE_USE_ENV_PROXY=1`. A medição está no topo do `Dockerfile`.
>
> **Isto reabre uma pergunta desta seção, e ela ainda não está respondida:** se o
> proxy libera acesso aos registros de imagem (`ghcr.io`, `docker.io`) e ao
> registro do npm, parte do caminho de entrega por arquivo abaixo deixa de ser
> obrigatória. Enquanto o órgão não responder, **o caminho por arquivo continua
> valendo**, porque ele funciona nos dois cenários.

Isso elimina, de uma vez, todo o caminho normal de entrega:

| Caminho usual | Por que não serve aqui |
|---|---|
| `docker build` no servidor | `npm ci` baixa 698 pacotes do registro público |
| `docker pull` de um registro | não alcança `ghcr.io` nem `docker.io` |
| Runner do GitHub publicando a imagem | o servidor não busca o que foi publicado |
| ~~Renovação automática do certificado~~ | **fora da lista desde 04/09/2026:** o órgão renova por conta dele (seção 10.2) |

Sobra um caminho: **construir aqui, transportar o arquivo, carregar lá.** E
isso vale inclusive para a imagem do PostgreSQL: ela também não pode ser baixada
no servidor, então viaja no mesmo pacote.

### O que sobe no servidor

Decisão do Rafael em **27/08/2026**: o PostgreSQL da aplicação roda como
**container na própria máquina do órgão**, e o Supabase sai de cena por completo.
São três serviços, definidos em `docker-compose.prod.yml`:

| Serviço | Imagem | Papel |
|---|---|---|
| `db` | `postgis/postgis:16-3.4-alpine` | banco da aplicação. PostGIS é requisito (ADR-0013) |
| `migrate` | `spaguas/migrate:sha-<commit>` | aplica o shim e as migrations, e encerra |
| `app` | `spaguas/dashboard:sha-<commit>` | o dashboard |

**O banco nasce vazio.** Não há importação, cópia nem espelho de dado nenhum. O
cadastro de postos e as medições passam a vir do SQL Server do órgão por leitura
ao vivo (ADR-0023); este banco guarda só o que é **só nosso**: fichas de visita,
triagem e aprovação, desconformidades, revisões, estoque, arquivos indexados,
trilha de auditoria, favoritos, diagramas e fotos.

---

## 2. Pré-requisitos antes de construir

1. Estar na revisão exata que vai para produção, com a árvore limpa:

   ```bash
   git status --porcelain     # tem que sair vazio
   git rev-parse --short HEAD # anote: esta é a TAG das duas imagens
   ```

2. Ter as variáveis de build decididas. Três delas são embutidas no pacote do
   navegador e **não** podem ser trocadas depois sem reconstruir a imagem:

   - `NEXT_PUBLIC_APP_URL` = `https://dmo.spaguas.sp.gov.br`
   - as duas variáveis da camada de identidade (ver bloqueio 9.2)

3. Construir num computador com internet. **Nunca** construir a partir do disco
   de rede: a instalação de dependências em SMB não conclui. Exportar a árvore
   versionada para disco local primeiro:

   ```bash
   mkdir -p /c/tmp/dmo-build && git archive HEAD | tar -x -C /c/tmp/dmo-build
   ```

   Usar `git archive` em vez de copiar a pasta tem uma razão de segurança: ele
   entrega só o que está versionado, então `.env.local` e afins não têm como
   entrar no contexto de build nem por acidente.

---

## 3. Construir as duas imagens

As duas levam **a mesma tag de commit**, e isso não é estética: é o que impede a
aplicação de um commit rodar com as migrations de outro.

```bash
cd /c/tmp/dmo-build
SHA=$(git -C "<repositorio>" rev-parse --short HEAD)

# 1. Aplicação
DOCKER_BUILDKIT=1 docker build \
  --build-arg NEXT_PUBLIC_APP_URL=https://dmo.spaguas.sp.gov.br \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="<valor decidido>" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="<valor decidido>" \
  -t spaguas/dashboard:sha-$SHA .

# 2. Migrations (o SQL viaja junto do código)
DOCKER_BUILDKIT=1 docker build \
  -f ops/producao/Dockerfile.migrate \
  -t spaguas/migrate:sha-$SHA .

# 3. Garantir que a imagem do banco está no disco local para viajar junto
docker pull postgis/postgis:16-3.4-alpine
```

**A tag é sempre `sha-<commit>`.** `latest` é proibido em produção, e o motivo é
prático antes de ser doutrinário: com `latest`, o rollback não tem para onde
apontar e ninguém consegue dizer qual código está no ar.

### Conferir antes de transportar

Três verificações que custam segundos e evitam levar defeito para dentro do
órgão. Todas **MEDIDAS** em 27/08/2026:

```bash
# 1. Nenhum segredo e nenhuma variável de build sobrou na imagem final.
#    Tem que sair VAZIO.
docker image inspect spaguas/dashboard:sha-$SHA \
  --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E 'DATABASE_URL|SERVICE_ROLE|CRON_SECRET'

# 2. O processo não roda como root.
docker image inspect spaguas/dashboard:sha-$SHA --format '{{.Config.User}}'
#    espera: nextjs

# 3. Nenhum arquivo de ambiente entrou na imagem.
docker run --rm --entrypoint sh spaguas/dashboard:sha-$SHA -c 'ls -a /app | grep -c "^\.env" || true'
#    espera: 0
```

---

## 4. Empacotar e medir o que trafega

```bash
docker save \
  spaguas/dashboard:sha-$SHA \
  spaguas/migrate:sha-$SHA \
  postgis/postgis:16-3.4-alpine \
  | gzip -6 -c > dmo-sha-$SHA.tar.gz

ls -l dmo-sha-$SHA.tar.gz
```

**MEDIDO em 27/08/2026**, a partir de `34417b7`:

| Grandeza | Valor |
|---|---|
| `spaguas/dashboard` descompactada (`docker images`) | 315 MB |
| `spaguas/migrate` descompactada (`docker images`) | 627 MB |
| `postgis/postgis:16-3.4-alpine` descompactada | 627 MB |
| **Pacote compactado com as três, que é o que viaja** | **235.892.386 bytes, ou 225 MiB** |
| Só a aplicação, para comparação | 74.778.495 bytes, ou 71,3 MiB |

### Três números diferentes que respondem três perguntas diferentes

Esta é a parte do runbook que mais engana, então vai escrita com os números ao
lado.

**1. O que o `docker images` mostra não é o que ocupa.** As três referências
somam 1.569 MB nos rótulos, e não ocupam isso. `docker system df -v` mostra por
quê:

```
REPOSITORY          TAG            SIZE     SHARED SIZE   UNIQUE SIZE
spaguas/dashboard   sha-34417b7    315MB    0B            314.7MB
spaguas/migrate     sha-34417b7    627MB    626.7MB       416.2kB
```

A imagem de migrations é construída **sobre a mesma base do banco**, então no
disco do servidor ela custa **416 kB**, e não 627 MB. Foi por isso que ela foi
feita assim.

**2. O que ocupa no disco não é o que trafega.** `docker save` **não** deduplica
contra o que já existe no destino: ele empacota a cadeia inteira de camadas de
cada imagem citada. Medido: o pacote com as três referências e o pacote com
apenas `dashboard` mais `migrate` dão praticamente o mesmo tamanho
(235.892.386 contra 235.886.243 bytes), porque a base do PostGIS vai junto de
qualquer jeito, esteja ela no destino ou não.

**Consequência prática, e ela é boa:** não adianta tentar economizar deixando a
imagem do PostGIS de fora nas entregas seguintes. O pacote de toda entrega fica
em torno de **225 MiB**, o que é irrelevante para um arquivo transferido dentro
da rede do órgão, e o preço disso é a impossibilidade de rodar as migrations de
um commit contra o código de outro. Barato pelo que compra.

**3. O único jeito de saber o incremento real é medir na hora.** **HIPÓTESE até
a segunda entrega:** a partir dela, duas tags consecutivas da aplicação
compartilham a base, as dependências e o usuário do sistema, e só a camada com o
resultado do build muda. Medir com `docker system df -v` no dia e registrar aqui.

### Consumo em disco no servidor, contra os 22 GB livres

**MEDIDO** no servidor: disco de 26 GB, **22 GB livres**, uma imagem
(`portainer/portainer-ce:lts`, 188 MB), um volume, um container.

| Item | Espaço |
|---|---|
| Arquivo `.tar.gz` transportado (apagável depois do `load`) | 225 MiB |
| Imagens da primeira versão, já deduplicadas | cerca de 940 MB |
| Volume do banco, recém-migrado e **vazio de dado** | **110,3 MB** (MEDIDO) |
| Cada versão adicional da aplicação, mantida para rollback | ver nota 3 acima |

Os 110 MB do volume vazio são quase todos o catálogo do PostgreSQL e as
extensões do PostGIS, não dado nosso. Como o cadastro de postos e as medições
não moram aqui, o crescimento esperado é lento. **HIPÓTESE:** acompanhar por
`docker system df -v` no primeiro mês e registrar a curva real.

Mesmo pela conta pessimista, a política de manter **3 versões** cabe com folga
nos 22 GB.

---

## 5. Transportar

**PENDENTE DE DEFINIÇÃO PELO ÓRGÃO.** Está no pedido formal (seção 10.5). As
opções, em ordem de preferência:

1. Compartilhamento de arquivos interno alcançável pelo servidor (`scp` a partir
   de uma máquina da rede do órgão que tenha o arquivo).
2. Mídia removível, se a política do órgão permitir, com registro de quem levou.

Qualquer que seja, a integridade se confere pelo resumo criptográfico nas duas
pontas, **antes** de carregar:

```bash
# na origem
sha256sum dmo-sha-$SHA.tar.gz
# no destino
sha256sum dmo-sha-$SHA.tar.gz
# os dois valores têm que ser idênticos
```

---

## 6. Instalar e subir no servidor

### 6.1 São três arquivos de ambiente, e a divisão não é organização

**MEDIDO em 27/08/2026**, tentando fazer com um só: o Compose resolve as
variáveis de dentro do `docker-compose.prod.yml` a partir do `.env` do diretório
do projeto e do ambiente do terminal. Variável declarada em `env_file` vai para o
**container**, e não para o **Compose**. Com a tag da imagem no `env_file`, o
comando morre com `required variable IMAGEM_TAG is missing a value`.

| Arquivo | Quem lê | O que tem | Permissão |
|---|---|---|---|
| `/opt/spaguas-dmo/.env` | o Compose, para montar os serviços | `IMAGEM_TAG`, `IMAGEM_NOME`, `MIGRATE_NOME`, `APP_PORT` | 0644 root:root |
| `/etc/spaguas-dmo/db.env` | os serviços `db` e `migrate` | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | 0640 root:docker |
| `/etc/spaguas-dmo/app.env` | o serviço `app` | `DATABASE_URL`, identidade, `CRON_SECRET` | 0640 root:docker |

O ganho de tabela: o arquivo que muda a cada entrega e a cada rollback é
justamente o que **não** tem segredo nenhum. Modelos em `ops/producao/`.

Preparar uma única vez, no servidor:

```bash
sudo install -d -m 0755 /opt/spaguas-dmo
sudo install -d -m 0750 -o root -g docker /etc/spaguas-dmo
sudo install -m 0640 -o root -g docker /dev/null /etc/spaguas-dmo/db.env
sudo install -m 0640 -o root -g docker /dev/null /etc/spaguas-dmo/app.env
sudo stat -c '%a %U:%G %n' /etc/spaguas-dmo/*.env   # espera: 640 root:docker
```

**A senha do Postgres nasce aqui e é nossa.** Ela não vem do órgão nem de
fornecedor nenhum. Gerar no servidor, no momento da instalação:

```bash
openssl rand -base64 32 | tr -d '=+/' | cut -c1-32
```

O `tr` existe por um motivo prático: a mesma senha viaja **dentro** da
`DATABASE_URL` do `app.env`, e caractere reservado de URL (arroba, dois-pontos,
barra, mais) quebra a leitura da string de conexão de um jeito que aparece como
"senha errada" e manda procurar no lugar errado.

Essa duplicação é a única do desenho, e se confere **sem imprimir valor nenhum**,
comparando resumo criptográfico:

```bash
a=$(sudo sed -n 's/^POSTGRES_PASSWORD=//p' /etc/spaguas-dmo/db.env | sha256sum)
b=$(sudo sed -n 's#^DATABASE_URL=postgresql://[^:]*:\([^@]*\)@.*#\1#p' /etc/spaguas-dmo/app.env | sha256sum)
[ "$a" = "$b" ] && echo "conferem" || echo "DIVERGEM"
```

O sintoma de divergência é o container da aplicação subir bem por fora e o
`/api/health` responder `degraded`, o que parece problema de rede.

> **Trocar a senha depois da primeira subida não é editar o arquivo.** As
> variáveis `POSTGRES_*` só têm efeito com o volume **vazio**: é o entrypoint da
> imagem que as usa para inicializar o cluster. Com o volume já criado, editar o
> arquivo não muda nada no banco e passa a mentir sobre a senha real. Rotação se
> faz por `ALTER ROLE` dentro do banco, e só depois se acertam os dois arquivos.

### 6.2 Carregar e subir

```bash
# 1. Carregar as imagens (as três de uma vez, do mesmo arquivo)
docker load -i dmo-sha-$SHA.tar.gz
docker images | grep -E 'spaguas/(dashboard|migrate)|postgis'

# 2. Apontar a versão. Esta é a única linha que muda entre uma entrega e outra.
sudo sed -i "s/^IMAGEM_TAG=.*/IMAGEM_TAG=sha-$SHA/" /opt/spaguas-dmo/.env
sudo grep '^IMAGEM_TAG=' /opt/spaguas-dmo/.env

# 3. Subir. A ordem está no compose, não em script:
#    banco saudável -> migrations com sucesso -> aplicação.
cd /opt/spaguas-dmo
docker compose -f docker-compose.prod.yml up -d
```

> **Depois de reiniciar o host, rodar `up -d` de novo.** A ordem entre serviços
> vale no `up`, e não na política de reinício do Docker: num reboot o Docker
> levanta os containers sem reavaliar as condições, e a aplicação pode subir
> antes de o banco aceitar conexão.

### 6.3 Conferir que subiu de verdade

Exit code de `up -d` diz que o Docker aceitou o pedido, e não que o sistema está
no ar. O que responde é o efeito:

```bash
# a. Estado dos três. Esperar db e app "healthy", e migrate "Exited (0)".
docker compose -f docker-compose.prod.yml ps -a

# b. As migrations aplicaram, e aplicaram TODAS.
docker compose -f docker-compose.prod.yml logs migrate | tail -5
#    a última linha tem que ser "[migrate] concluído."
docker inspect spaguas-dmo-migrate --format '{{.State.ExitCode}}'
#    espera: 0

# c. O banco tem o esquema, e o PostGIS está instalado.
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U spaguas -d spaguas -tAc \
  "select count(*) from information_schema.tables where table_schema='public'"
#    espera: 40   (medido em 27/08/2026, a partir de 34417b7)
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U spaguas -d spaguas -tAc "select extversion from pg_extension where extname='postgis'"
#    espera: 3.4.3

# d. O banco NÃO publica porta nenhuma no host, e a aplicação só em loopback.
docker inspect spaguas-dmo-db  --format '{{.NetworkSettings.Ports}}'
#    espera: map[5432/tcp:[]]        <- lista vazia = nada publicado
docker inspect spaguas-dmo-app --format '{{.NetworkSettings.Ports}}'
#    espera: map[3000/tcp:[{127.0.0.1 3000}]]
ss -ltnp | grep -E ':(3000|5432)'
#    a 5432 NÃO pode aparecer

# e. A aplicação responde, e o healthcheck também mede o banco.
curl -sS http://127.0.0.1:3000/api/health
#    {"status":"ok","db":"ok"}         -> aplicação e banco de pé
#    {"status":"degraded","db":"erro"} -> aplicação de pé, banco inalcançável
#                                         (senha divergente ou rede, não código)

# f. Os limites foram aplicados de fato, nos dois containers.
docker inspect spaguas-dmo-db --format \
  'db  mem={{.HostConfig.Memory}} cpu={{.HostConfig.NanoCpus}} pids={{.HostConfig.PidsLimit}} shm={{.HostConfig.ShmSize}}'
#    db  mem=2147483648 cpu=2000000000 pids=256 shm=268435456
docker inspect spaguas-dmo-app --format \
  'app mem={{.HostConfig.Memory}} cpu={{.HostConfig.NanoCpus}} ro={{.HostConfig.ReadonlyRootfs}} pids={{.HostConfig.PidsLimit}}'
#    app mem=1610612736 cpu=2000000000 ro=true pids=256
#    mem=0 significa SEM LIMITE: o compose não aplicou, e isso precisa ser
#    resolvido antes de considerar entregue.

# g. A rotação de log está valendo nos dois.
docker inspect spaguas-dmo-db spaguas-dmo-app --format '{{.Name}} {{.HostConfig.LogConfig}}'

# h. Pela borda, já com o Nginx configurado.
curl -sSI https://dmo.spaguas.sp.gov.br/ | head -20
```

---

## 7. Rollback

### 7.1 Sem mudança de esquema: trivial

O rollback deste sistema **não reconstrói nada e não baixa nada**, que é
exatamente o que se quer num servidor sem internet: ele aponta para uma tag que
já está no disco.

```bash
# 1. Ver quais versões existem no servidor
docker images spaguas/dashboard --format '{{.Tag}}\t{{.CreatedAt}}'

# 2. Apontar a anterior
sudo sed -i "s/^IMAGEM_TAG=.*/IMAGEM_TAG=sha-<anterior>/" /opt/spaguas-dmo/.env

# 3. Recriar com ela
cd /opt/spaguas-dmo
docker compose -f docker-compose.prod.yml up -d --force-recreate

# 4. Conferir pelo efeito (mesma lista da seção 6.3)
```

**Tempo esperado: menos de um minuto**, porque nada é transferido. **HIPÓTESE
até ser cronometrado no servidor.**

Note que o passo 2 troca a tag das **duas** imagens de uma vez, então o serviço
`migrate` volta a rodar com o SQL daquele commit. Como as migrations são
idempotentes, reaplicá-las é seguro. O que elas **não** fazem é desfazer.

### 7.2 Com mudança de esquema: não é trivial, e precisa estar escrito antes

**Voltar a imagem volta o código. Não volta o banco.** Se a versão que está
saindo aplicou alteração de esquema, apontar a tag anterior deixa código antigo
falando com esquema novo, e o resultado depende inteiramente do tipo da
alteração:

| Tipo de alteração | O que acontece no rollback |
|---|---|
| Coluna nova anulável, tabela nova, índice novo | código antigo ignora e funciona |
| Coluna renomeada ou removida | código antigo quebra em toda consulta que a cita |
| Coluna com restrição nova (`NOT NULL`, `CHECK`) | código antigo grava valor recusado |
| Tipo de coluna alterado | comportamento imprevisível, inclusive corrupção silenciosa |

**A regra, e ela vale antes do primeiro deploy:**

> **Toda entrega que mexer no banco só sobe com a frase de volta escrita.** Antes
> do `up -d`, tem que existir, no registro da entrega, a resposta a duas
> perguntas: *o código anterior funciona com este esquema novo?* e, se não
> funcionar, *qual é o SQL que desfaz, e ele foi executado num banco de teste?*
> Sem essas duas respostas por escrito, a entrega não sobe.

O caminho que evita o problema quase sempre, e que já é o padrão da casa, é
alteração em duas etapas: primeiro adicionar coluna anulável e passar a
preencher, depois, numa entrega seguinte, impor a restrição e remover o antigo.
Entre as duas, as duas versões do código convivem com o mesmo esquema, e o
rollback volta a ser trivial.

**Quando não houver saída,** o rollback deixa de ser "trocar a tag" e passa a
ser: parar a aplicação, restaurar o banco do backup mais recente anterior à
migração, apontar a tag anterior, subir. Isso **perde** o que foi gravado entre o
backup e a parada, e por isso precisa ser decisão consciente com o órgão, e não
improviso de plantão.

### 7.3 Backup: o que torna tudo isso possível

O rollback de código é barato porque a imagem antiga está no disco. **O rollback
de dado só existe se houver backup, e backup só conta como backup depois de uma
restauração testada.** Sem um restore que funcionou, o que existe é um arquivo
com nome de backup.

Gerar um dump antes de qualquer entrega que mexa no banco:

```bash
cd /opt/spaguas-dmo
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U spaguas -d spaguas --format=custom \
  > /var/backups/spaguas-dmo/antes-de-sha-$SHA.dump
```

**E o aviso que não pode faltar:** este arquivo está no **mesmo disco da VM**.
Se a VM se perder, ele se perde junto, e ele não é backup de nada. O backup de
verdade é o da infraestrutura do órgão, sobre o volume `spaguas-dmo-pg-data`, e
**isso está no pedido formal, seção 10.8**, porque não depende de nós.

Restauração, que é o que valida o backup:

```bash
# Contra um banco de teste, NUNCA contra o de produção como primeiro exercício.
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U spaguas -d spaguas_restore_teste --clean --if-exists \
  < /var/backups/spaguas-dmo/antes-de-sha-$SHA.dump
```

**Registrar a data do último restore testado neste runbook.** Backup cuja
restauração nunca foi exercitada é a forma mais cara de falsa segurança que
existe em operação.

### 7.4 Política de retenção de imagem

Manter as **3 últimas** tags de cada imagem. Ao remover, remover **pelo nome**:

```bash
docker image rm spaguas/dashboard:sha-<antiga> spaguas/migrate:sha-<antiga>
```

> **`docker system prune -a` é PROIBIDO neste servidor.**
>
> Ele apaga toda imagem que não esteja sendo usada por um container em execução.
> Nesse conjunto entram as versões anteriores do sistema, que são justamente o
> rollback, e entra qualquer imagem do órgão parada no momento. O Portainer
> (`portainer/portainer-ce:lts`, 188 MB) é do órgão, e num servidor sem internet
> **nada disso pode ser baixado de novo**: apagar é definitivo. Num servidor
> compartilhado, apagar imagem é decisão, nunca rotina.
>
> Pior ainda: `docker volume prune` e `docker system prune --volumes` alcançam o
> volume do banco. **O volume `spaguas-dmo-pg-data` é o sistema.** A imagem se
> reconstrói em minutos; o que está no volume, não.
>
> Quando faltar espaço, a limpeza é por nome, e a medição vem antes:
> `docker system df -v` diz onde o espaço está antes de qualquer remoção.

---

## 8. Nginx

O bloco definitivo, as linhas a remover do arquivo atual e a justificativa de
cada diretiva estão em
[`ops/producao/nginx-dmo.spaguas.sp.gov.br.conf`](../../ops/producao/nginx-dmo.spaguas.sp.gov.br.conf).

Resumo do que muda: sai `try_files $uri $uri/ =404` (que hoje faria toda
requisição terminar em 404 antes de chegar ao `proxy_pass`), saem as quatro
linhas de cache compartilhado, e entra o `proxy_pass` com os cabeçalhos de
origem, `proxy_cache off`, `client_max_body_size 12m` e os tempos.

---

## 9. Bloqueios: o que ainda impede o deploy

### 9.1 Banco: **RESOLVIDO em 27/08/2026**

Decisão do Rafael: PostgreSQL como container na própria máquina, Supabase fora.
Está implementado no `docker-compose.prod.yml` e **exercitado de ponta a ponta**
nesta máquina (seção 11.4). Este item deixa de ser bloqueio.

Fica registrado por que apontar `DATABASE_URL` para o SQL Server nunca foi
opção, porque a pergunta volta:

- A aplicação fala com o banco pelo pacote `postgres` (postgres.js), fixado em
  `3.4.9`. Esse cliente implementa o protocolo de rede do PostgreSQL, e só ele.
- São **25** repositórios `.pg.ts` em SQL do PostgreSQL. Construções que o SQL
  Server não aceita na mesma forma: `RETURNING` em 15 arquivos, conversão por
  `::` em 22, `ON CONFLICT` em 7, `jsonb` em 5, `ILIKE` em 4, `ST_` em 1.
- São **65** migrações, das quais **27** usam recurso exclusivo do PostgreSQL.

O SQL Server entra como **origem de leitura** (ADR-0023), com conexão separada.
Quando essa camada for implementada, entram aqui: uma segunda variável de
conexão, a liberação de rede a partir da ponte do Docker até `10.20.40.62:1433`
(seção 10.3), e uma **dependência nova** no `package.json`, que obriga a
reconstruir a imagem aqui, com internet.

### 9.2 Identidade: **destravado em 02/09/2026 pela janela sem identidade**

> **Este bloqueio caiu.** A aplicação sobe no servidor do órgão com
> `ACESSO_SEM_IDENTIDADE=sim`, mais motivo e data de revisão, declarados em
> `/etc/spaguas-dmo/app.env` (modelo: `ops/producao/ambiente-producao.exemplo`,
> seção 3.1). Decisão e consequências no **ADR-0024**.
>
> Enquanto a janela vale, o sistema roda **sem autenticação**: toda requisição é
> atribuída a um usuário institucional único, com papel `user` (menor
> privilégio), e ninguém se identifica. O que isso expõe está no ADR-0024 §4 e
> precisa ser aceito por escrito pelo órgão.
>
> **As três variáveis são lidas em tempo de execução**, medido com o mesmo
> `BUILD_ID`: sem elas a rota privada responde 503, com elas responde 200. Ou
> seja, **religar a autenticação não exige reconstruir a imagem**, que era a
> parte cara deste problema numa máquina sem internet.
>
> Nesta mesma mudança foi fechado um **fail-open que já existia**: o middleware
> liberava tudo quando as variáveis do Supabase estavam ausentes, e o comentário
> prometia que `env.ts` bloquearia, o que era falso (`env.ts` não é importado
> pelo middleware). Como `NEXT_PUBLIC_*` é gravada em tempo de build, uma imagem
> construída sem os `--build-arg` servia o sistema inteiro sem autenticação, de
> dentro da imagem, sem correção possível por variável de ambiente. Hoje isso
> responde **503**.

O Supabase saiu por ordem do Rafael, e pelo ADR-0023 a autenticação passa a ser
contra o `UsuariosIdentity` do órgão, com o `auth.users` local recebendo o mesmo
identificador. O diagnóstico abaixo é o original e **a tabela de trabalho
continua valendo para a identidade definitiva**, que é o que substitui a janela.

**MEDIDO no código de então. Os dois primeiros itens mudaram em 02/09/2026:**

- `env.ts`, linhas 55-59: **recusa subir em produção** sem
  `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `src/middleware.ts`, linhas 125-126: chama `supabase.auth.getUser()` **a cada
  requisição** que passa pelo gate.
- `src/middleware.ts`, linha 35: a política de segurança ainda libera
  `connect-src ... https://*.supabase.co`.

**MEDIDO no servidor:** `*.supabase.co` não resolve e não é alcançável.

Preencher as duas com valor de faz de conta não contorna: a chamada continua
sendo feita e nunca completa, então **toda navegação** fica presa até o tempo
limite. E há um agravante que só aparece depois: por serem lidas por nome
literal no middleware, o Next **grava** o valor no pacote em tempo de build. Um
valor errado embutido não se corrige por variável de ambiente, só reconstruindo
a imagem.

O que precisa mudar (**apontado, não alterado**, conforme o limite desta tarefa):

| Arquivo e linha | O que muda |
|---|---|
| `env.ts` 16-17 | trocar as duas variáveis do Supabase pelas da nova identidade |
| `env.ts` 19 | `SUPABASE_SERVICE_ROLE_KEY` sai: o armazenamento de foto também deixa de ser Supabase |
| `env.ts` 46-48 | `isAuthEnabled` passa a derivar da nova camada |
| `env.ts` 55-59 | **manter o fail-fast**, apontando para as novas. A regra é boa: sistema de governo não pode subir com o portão aberto |
| `middleware.ts` 35 | retirar `https://*.supabase.co` da política |
| `middleware.ts` 125-126 | trocar a verificação de sessão |
| `auth/supabase-server.ts`, `auth/supabase-admin.ts`, `storage/foto-posto-storage.ts` | os três adaptadores que importam `@supabase/*` |

**Consequência de infraestrutura que precisa ser dita:** o armazenamento da foto
de capa hoje é o Supabase Storage. Sem ele, a foto precisa de destino, e o
destino natural aqui é um volume do Docker, o que significa **um segundo volume
para entrar no backup**. Isso entra no pedido da seção 10.8 quando a decisão for
tomada.

### 9.3 Duas funcionalidades que o container não entrega

**MEDIDOS no código.** Não impedem o deploy, mas não podem ser descobertos pelo
usuário:

- **Ficha de posto com indexação sob demanda.** `lazy-indexer.ts` executa
  `python -m ops.indexer.indexar_posto` como subprocesso. A imagem da aplicação
  é `node:24-alpine` (era `node:20-alpine` até 02/09/2026, ver ADR-0025):
  **não tem Python e não tem a pasta `ops/`**, e a troca de versão não muda
  isso. A chamada
  falha dentro do container. Decidir se o indexador vira um quarto serviço, se
  roda como tarefa do host, ou se sai do escopo desta entrega.
- **Relatório em PDF.** `pdf-relatorio.ts` procura um navegador sem interface
  (`CHROME_BIN`, `/usr/bin/chromium`). A imagem não tem nenhum. A rota devolve
  `RenderizadorPdfIndisponivel`. Acrescentar Chromium custa em torno de 150 MB e
  precisa ser decisão consciente, não efeito colateral.

### 9.4 As rotinas não têm quem as chame

**MEDIDO:** existem três rotas em `/api/cron/*`, entre elas
`anonimizar-trilha`, que cumpre o prazo de retenção da trilha de auditoria
(LGPD). Hoje elas eram chamadas por agendador externo. **Sem internet, ninguém
as chama.** Se subir assim, a anonimização não acontece, em silêncio, e a
documentação de entrega afirma uma retenção que não ocorre.

Definir o chamador antes de subir. Tarefa agendada no próprio host, com `curl`
para `127.0.0.1:3000` e o cabeçalho de `CRON_SECRET`, é o caminho mais simples e
não depende de nada externo.

> **RESOLVIDO em 03/09/2026.** As três rotinas rodam como timers do `systemd`,
> instalados e verificados no servidor. Configuração e comandos de conferência
> em `ops/producao/systemd-rotinas.md`; o chamador é
> `ops/producao/spaguas-cron.sh`, em `/usr/local/bin/`.
>
> | rotina | cadência | estado na instalação |
> |---|---|---|
> | `spaguas-anonimizar-trilha` | diária, 03:10 | executada, HTTP 200 |
> | `spaguas-liberar-locks` | a cada 5 min | executada |
> | `spaguas-sincronizar-monitor` | de hora em hora | executada, 378 s |
>
> **`systemd` e não `cron`, por um motivo prático:** rotina que passa a falhar
> aparece em `systemctl --failed` e a saída fica no `journalctl`. Com `cron`,
> um erro diário seria invisível, que é a mesma família do problema que esta
> seção descreve. O chamador trata código diferente de 2xx como falha da
> unidade, de propósito.
>
> **Duas coisas medidas na instalação, e as duas custam se forem esquecidas:**
>
> 1. **O `CRON_SECRET` parecia preenchido e estava vazio.** Os arquivos de
>    ambiente foram para o servidor com CRLF, e o valor do segredo era só o
>    `\r`. O Docker remove o `\r` ao ler o `env_file`, então a aplicação nunca
>    reclamou; quem lê o arquivo direto no host, como o chamador, via 1
>    caractere. Ver a nota no topo de `ops/producao/ambiente-producao.exemplo`.
> 2. **A sincronização do Monitor leva 378 s** (5.415 estações, 540 mil
>    medições), e falhava com o limite inicial de 300 s mesmo funcionando.
>
> **PENDÊNCIA ABERTA, e ela é do módulo Monitor:** a sincronização responde
> HTTP 200 com **2.714 erros no corpo**. Metade das estações não é gravada
> (5.415 recebidas, 2.701 gravadas, e a conta fecha exatamente). A rotina
> "funciona" para o systemd e entrega metade do efeito, que é a definição de
> sinal positivo falso.
>
> **RETRATAÇÃO DE 04/09/2026: a causa escrita aqui estava errada, e mandava
> procurar no lugar errado.** O texto anterior atribuía os erros à chave
> estrangeira de `estacoes_pluviometricas` para `postos`, que está vazia desde o
> ADR-0023. Isso é impossível, e o próprio parágrafo trazia a prova sem que
> ninguém a lesse: **`vinculadasAposto` é ZERO**, ou seja toda estação grava
> `posto_id` nulo, e a coluna é `NULL REFERENCES postos (id)`. Nulo não viola
> chave estrangeira. Foram duas afirmações verdadeiras (a tabela está vazia, e
> há 2.714 erros) coladas numa relação causal que não existe.
>
> **O que a leitura do código diz, e é HIPÓTESE, não causa:** o upsert conflita
> em `sibh_id`, e a migration 0045 criava índice ÚNICO em `prefixo`, que a 0052
> derruba justamente porque o SIBH repete prefixo entre tipos hidrológicos. Se a
> sincronização de produção rodou num banco onde a 0052 ainda não estava
> aplicada, cada prefixo repetido falharia. Bate com a ordem de grandeza e com o
> incidente de 03/09, em que a criação daquele índice único foi recusada por
> prefixo duplicado. **Não está medido.** O código atual trata o caso: há teste
> afirmando que o mesmo prefixo em tipos diferentes vira dois upserts com
> `sibhId` distinto.
>
> **Como medir, quando houver VPN**, em três passos e sem escrever nada:
>
> 1. `SELECT * FROM _prisma_migrations` (ou a tabela de controle equivalente)
>    conferindo se **0052 consta como aplicada** no banco de produção.
> 2. `SELECT indexname, indexdef FROM pg_indexes WHERE tablename =
>    'estacoes_pluviometricas'` — se `uq_estacoes_pluviometricas_prefixo` ainda
>    existir, a hipótese está confirmada e a correção é aplicar a 0052.
> 3. Rodar a sincronização e **ler o `motivo` dos primeiros erros do corpo**. É a
>    resposta direta, e é o passo que não foi dado da primeira vez: o corpo já
>    carregava a mensagem, e ela foi substituída por uma dedução.

---

## 10. Pedido formal ao órgão

Enviado pela Paula, em tom institucional. Nove itens.

### 10.1 Reinicialização pendente e atualizações

**MEDIDO:** o servidor está com 8 dias de atividade e **com reinicialização
pendente**, sinalizada pelo próprio sistema.

Reinicialização pendente costuma indicar atualização de biblioteca de sistema ou
de núcleo já instalada e ainda não em uso: os processos em execução continuam com
a versão antiga carregada em memória. Enquanto não reiniciar, o servidor
**parece** atualizado e não está.

Solicitar: janela para `sudo apt update && sudo apt upgrade` e reinicialização,
**antes** de o sistema entrar no ar. Depois que houver usuário, a mesma
reinicialização vira indisponibilidade anunciada, com custo muito maior. Fazer
agora custa minutos e não afeta ninguém.

### 10.2 Certificado: previsão SUPERADA, a renovação é automática no órgão

> **CORREÇÃO DE 04/09/2026.** O proprietário informou que **o certificado renova
> automaticamente** no ambiente da PRODESP. A projeção abaixo (falha em 23/10,
> queda em 22/11) **não se aplica** e não deve gerar ação nem alerta ao cliente.
>
> O raciocínio fica registrado porque a medição que o originou era verdadeira e
> continua útil se o cenário mudar: o servidor não tinha saída para a internet
> quando ele foi escrito, e o proxy corporativo só foi descoberto em 03/09/2026.
> O erro não foi medir: foi concluir sobre a OPERAÇÃO do órgão a partir de uma
> medição feita de fora dela. Quem renova o certificado é o órgão, e isso não
> estava ao alcance de nenhum comando desta bancada.

Este era o achado mais silencioso da preparação, porque **nada quebrava hoje** e o
monitoramento do órgão não teria como perceber.

**MEDIDO:** certificado Let's Encrypt válido até **22/11/2026**; renovador
configurado com `authenticator = nginx`; `snap.certbot.renew.timer` **ativo**; e
o servidor **sem saída para a internet**.

**O raciocínio, passo a passo:**

1. Renovar um certificado ACME exige que o servidor **fale** com
   `acme-v02.api.letsencrypt.org` pela porta 443 para abrir o pedido. Isso é
   saída para a internet, e ela está bloqueada.
2. O desafio `HTTP-01` exige, **além disso**, que o Let's Encrypt alcance
   `dmo.spaguas.sp.gov.br` pela porta 80, vindo de fora. Se o site não é
   acessível pela internet, esse segundo requisito também não se cumpre.
   (**HIPÓTESE:** não medimos se o site responde de fora da rede do órgão. Vale
   perguntar, porque muda o leque de opções.)
3. O renovador tenta quando faltam **30 dias ou menos**. A partir de
   **23/10/2026**, portanto, ele passa a tentar **duas vezes por dia** e a
   **falhar duas vezes por dia**, no primeiro passo, sem chegar ao desafio.
4. Em **22/11/2026** o certificado vence.

**Por que isso não é "o navegador mostra um aviso":** a aplicação envia
`Strict-Transport-Security: max-age=63072000; includeSubDomains`
(`next.config.ts`, linhas 104-107), ou seja, dois anos. Todo navegador que já
visitou o endereço guardou essa instrução e, com o certificado vencido, **recusa
a conexão sem oferecer a opção de prosseguir**. O sistema fica inacessível
justamente para quem mais o usa. Não é degradação: é queda.

**HIPÓTESE que vale perguntar:** o certificado atual foi emitido em algum
momento, o que significa que ou a máquina já teve saída para a internet, ou a
emissão foi feita em outro contexto. Saber qual dos dois muda a solução.

**Solicitar a definição de um destes caminhos, com prazo de decisão até
30/09/2026** (para deixar três semanas de folga antes da primeira falha):

1. **Certificado da autoridade certificadora do próprio órgão, ou ICP-Brasil.**
   É a resposta natural para sistema de governo em rede fechada, tem validade
   maior e não depende de saída para a internet. **Recomendação nossa.**
2. **Emissão fora do servidor e instalação manual.** Funciona, e obriga alguém a
   repetir o procedimento a cada 90 dias, com data marcada em calendário. Serve
   como ponte, não como solução.
3. **Liberar a saída para a API do Let's Encrypt.** Resolve o passo 1, mas não
   resolve o passo 2 se o site não for acessível de fora; e a API responde em
   muitos endereços diferentes, o que torna frágil qualquer liberação por IP.

Enquanto não houver decisão, deixar o cronômetro de renovação ligado só produz
falha silenciosa duas vezes ao dia. Escolhido o caminho 1 ou 2, o cronômetro
deve ser desligado no mesmo movimento, para não gerar ruído.

### 10.3 Liberação de rede até o SQL Server

**MEDIDO:** a porta 1433 de `10.20.40.62` responde a partir do servidor.

Confirmar que a liberação vale também para tráfego **originado de dentro de um
container Docker**, que sai por outra interface e outra faixa de endereços,
diferentes das do host. Regra de firewall escrita para o endereço do host não
cobre a ponte do Docker automaticamente, e o sintoma disso é a leitura do
cadastro falhar sem explicação legível, o que manda procurar defeito em código.

### 10.4 Portainer publicado em todas as interfaces

**MEDIDO:** `portainer/portainer-ce:lts` publica as portas 8000 e 9443 em
`0.0.0.0`, ou seja, em toda a rede alcançável.

Publicação por Docker é escrita direto no filtro de pacotes e **passa por cima**
das regras do firewall do host: quem confere só o firewall conclui que está
fechado. O painel dá controle total sobre os containers da máquina.

Solicitar avaliação da equipe de segurança do órgão, com duas opções: restringir
o acesso na borda, ou publicar em `127.0.0.1` e alcançar por túnel. **Este ponto
é do órgão, não nosso: apontamos porque medimos.** Vale registrar que os nossos
containers publicam em `127.0.0.1`, e o banco não publica nada, justamente para
não repetir isso.

### 10.5 Canal de transporte da imagem

Sem internet, cada nova versão do sistema é um arquivo de cerca de 225 MiB que
precisa chegar ao servidor. Definir o canal oficial, quem tem acesso e como se
registra a passagem. Sem isso definido, cada entrega vira improviso, e improviso
em servidor de governo é o que produz o acesso não rastreado.

### 10.6 Quem enxerga as variáveis de ambiente

Os arquivos em `/etc/spaguas-dmo/` ficam com dono `root` e permissão restrita.
Isso protege o disco. **Não protege o painel:** qualquer conta com acesso ao
Portainer lê o ambiente dos containers pela interface, inclusive a string de
conexão do banco.

Solicitar a lista de contas com acesso ao Portainer e confirmar que ela é
compatível com quem pode ver credencial de banco de sistema de governo.

### 10.7 Registro de log com dado pessoal

O log da aplicação carrega endereço de e-mail de usuário, por exigência da
trilha de auditoria. O log dos containers é legível por quem tem Portainer. A
rotação está limitada a 50 MB por container no `docker-compose.prod.yml`.

Informar ao órgão, e confirmar se existe exigência de coleta desse log por
ferramenta institucional. Sem internet, o envio para coletor externo está
desligado (`LOG_DRAIN_URL` vazia), e essa é a configuração correta aqui.

### 10.8 Backup dos volumes: a pergunta que decide se o dado sobrevive

**Este item nasce da decisão de 27/08/2026** de hospedar o banco na máquina do
órgão, e é a contrapartida dela.

O sistema passa a ter estado nessa VM, no volume Docker
**`spaguas-dmo-pg-data`**. Nele ficam fichas de visita, triagem e aprovação,
desconformidades, revisões, estoque, arquivos indexados, favoritos, diagramas e
a **trilha de auditoria**. Nada disso existe em outro lugar: não é cópia do SQL
Server do órgão nem de sistema nenhum. **Se esse volume se perder, o dado se
perdeu.**

E, sem saída para a internet, **dump gravado no próprio disco não é backup**: se
a VM se perder, o dump vai junto. Ele serve para desfazer uma migração, e não
para sobreviver a um desastre. As duas coisas costumam ser confundidas, e é a
segunda que exige o órgão.

**Perguntas, e são exatamente estas três:**

1. Os **volumes Docker** dessa máquina entram na rotina de backup da PRODESP, ou
   a rotina cobre apenas a imagem da VM? (São coisas diferentes: cópia de VM
   pega o volume junto, mas o ponto de restauração é a máquina inteira.)
2. Qual a **periodicidade** e qual a **retenção**?
3. Qual o procedimento de **restauração**, e podemos exercitá-lo uma vez, em
   ambiente de teste, antes de o sistema entrar em produção?

A terceira não é zelo excessivo: **backup só conta como backup depois de um
restore testado.** Enquanto ninguém restaurou, o que existe é um arquivo com
nome de backup, e a hora de descobrir que ele não presta não pode ser a hora do
incidente.

Se a resposta for que os volumes **não** entram na rotina, isso precisa voltar
como decisão para o Rafael, porque muda o desenho: seria preciso um destino de
cópia fora daquela VM, e isso o órgão tem que fornecer.

### 10.9 Aval por escrito para hospedar dado de cidadão na máquina do órgão

Com o banco na infraestrutura do órgão, o dado pessoal tratado pelo sistema passa
a residir em equipamento **deles**, sob administração **nossa**. Essa divisão
precisa estar **acordada por escrito**, e não presumida: ela define quem responde
pelo quê perante a LGPD, e é requisito de projeto de governo, não formalidade.

Confirmar por escrito, antes do primeiro deploy:

- **Ciência e aval** de que o sistema hospeda banco com dado pessoal naquela VM.
- **Quem é o controlador e quem é o operador** do tratamento, nos termos da LGPD.
  (Nossa leitura, a confirmar com o órgão: o órgão é o controlador, e a DamaTech
  opera. Isso muda quem responde ao titular e quem responde por incidente.)
- **Classificação dos dados** segundo a política do órgão (público, restrito,
  confidencial), que é o que define exigência de cifragem e de retenção.
- **Prazo de retenção da trilha de auditoria**, que hoje está configurável e sem
  valor decidido (seção 9.4). O art. 16, I da LGPD sustenta a guarda para
  cumprimento de obrigação legal, mas o prazo é decisão do órgão.
- **A quem comunicar** em caso de incidente de segurança, com nome e canal.

---

## 11. Evidência da preparação (27/08/2026)

Nada disto foi executado no servidor do órgão. Tudo foi medido na máquina de
desenvolvimento, com Docker Engine 29.6.2 e Compose v5.3.1 locais, contra as
imagens construídas a partir de `34417b7`.

### 11.1 O `docker build` estava quebrado por dois motivos, e os dois foram corrigidos

**Primeira reprovação, que não era a esperada:**

```
./src/application/use-cases/inventario-ana/exportar.ts
Module not found: Can't resolve '../../../../data/colunas-ana.json'
```

O `.dockerignore` excluía `data/` inteiro. Só que `data/colunas-ana.json` não é
dado de carga: é **fonte**, importada por caminho relativo por um caso de uso, e
o empacotador precisa dela para compilar. Corrigido com uma exceção nomeada
(`!data/colunas-ana.json`), mantendo o resto de `data/` fora da imagem.

**Segunda reprovação, exatamente onde a hipótese apontava:**

```
Collecting page data ...
Error: DATABASE_URL é obrigatória em produção. Modo demo só funciona em development/test.
> Build error occurred
[Error: Failed to collect page data for /api/cron/anonimizar-trilha]
```

Mecanismo confirmado: `next build` roda com `NODE_ENV=production` e, na etapa de
coleta de metadados, carrega cada rota de servidor; isso avalia
`src/infrastructure/repositories.ts` na **linha 66**, que chama `getEnv()` em
escopo de módulo. Sem `DATABASE_URL`, o `env.ts` (linhas 50-54) joga e o build
inteiro cai. **A hipótese estava certa quanto ao arquivo, à linha e à causa.**

Corrigido no `Dockerfile`, e só ali, com um valor de fachada válido apenas no
estágio de build, mais a declaração dos dois `ARG` de identidade que o
`docker-compose.yml` já enviava e que eram **descartados em silêncio** por não
existir `ARG` correspondente. Justificativa completa nos comentários do próprio
`Dockerfile`.

### 11.2 A imagem final não carrega segredo nem roda como root

```
$ docker image inspect ... --format '{{range .Config.Env}}{{println .}}{{end}}'
PATH=...
NODE_VERSION=20.20.2
YARN_VERSION=1.22.22
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
HOSTNAME=0.0.0.0
PORT=3000

$ docker image inspect ... --format '{{.Config.User}}'
nextjs

$ docker run --rm --entrypoint sh ... -c 'ls -a /app | grep -c "^\.env"'
0
```

O `DATABASE_URL` de fachada do estágio de build **não** aparece na imagem final,
que é o que prova que ele não vaza para produção.

### 11.3 O compose foi exercitado, e o exercício achou dois defeitos meus

Os dois só apareceram porque o arquivo foi executado, e não apenas escrito:

1. `IMAGEM_TAG` estava no `env_file`, e o Compose não interpola a partir dele.
   Corrigido pela divisão em arquivos separados (seção 6.1).
2. `pids_limit` no topo do serviço, junto de `deploy.resources.limits`, faz esta
   versão do Compose recusar o projeto inteiro, reclamando de valor distinto
   entre as duas formas de dizer a mesma coisa. Corrigido movendo o teto para
   dentro de `deploy.resources.limits.pids`.

### 11.4 A pilha completa subiu, na ordem certa, com o banco vazio

Este é o exercício que vale mais que todos os anteriores, porque mede o sistema
e não uma peça dele. Volume criado do zero, exatamente como acontecerá no
servidor:

```
$ docker compose -f docker-compose.prod.yml up -d
 Volume spaguas-dmo-pg-data Created
 Container spaguas-dmo-db Started
 Container spaguas-dmo-db Waiting
 Container spaguas-dmo-db Healthy          <- a ordem é do compose, não de script
 Container spaguas-dmo-migrate Started
 Container spaguas-dmo-migrate Waiting
 Container spaguas-dmo-migrate Exited      <- encerrou antes de a aplicação nascer
 Container spaguas-dmo-app Started

$ docker compose -f docker-compose.prod.yml ps -a
app      Up 19 seconds (healthy)
db       Up 36 seconds (healthy)
migrate  Exited (0) 19 seconds ago

$ docker compose logs migrate | tail -2
[migrate]   -> 0065_estoque_conferencia_itens_contado_por.sql
[migrate] concluído.

$ docker compose logs migrate | grep -ciE "error|erro|fatal|falha"
0
```

As **65 migrações** e o shim de compatibilidade aplicaram num PostGIS recém
criado, sem um único erro. O resultado no banco:

```
tabelas em public = 40
tabelas em auth   = 1        (o shim, que é a casca que as chaves estrangeiras exigem)
extensão postgis  = 3.4.3
```

E a aplicação conversa com ele de verdade, o que só se prova pelo endpoint que
executa consulta:

```
$ curl -sS http://127.0.0.1:39300/api/health
{"status":"ok","db":"ok"}
```

Isolamento e limites, conferidos no efeito e não no arquivo:

```
$ docker inspect spaguas-dmo-db  --format '{{.NetworkSettings.Ports}}'
map[5432/tcp:[]]                     <- lista vazia: o banco NÃO publica porta
$ docker inspect spaguas-dmo-app --format '{{.NetworkSettings.Ports}}'
map[3000/tcp:[{127.0.0.1 39300}]]    <- só loopback

db   mem=2147483648 cpu=2000000000 pids=256 shm=268435456 nnp=[no-new-privileges:true]
app  mem=1610612736 cpu=2000000000 pids=256 ro=true capdrop=[ALL] init=true
     log=json-file max-size 10m max-file 5
```

A aplicação sobe com a raiz somente leitura, o que prova que os dois pontos de
escrita mapeados em memória bastam (`✓ Ready in 265ms`).

Ao fim, `docker compose down -v` removeu os containers, a rede e o volume de
teste. As imagens construídas com valores de identidade de fachada foram
removidas de propósito, para que ninguém as embarque por engano.

---

## 12. Ficha rápida

| | |
|---|---|
| Imagens | `spaguas/dashboard:sha-<commit>` e `spaguas/migrate:sha-<commit>`, mesma tag |
| Banco | `postgis/postgis:16-3.4-alpine`, container na própria máquina |
| Compose de produção | `docker-compose.prod.yml` (db, migrate, app) |
| Versão no ar | `/opt/spaguas-dmo/.env`, modelo em `ops/producao/versao-no-ar.exemplo` |
| Credencial do banco | `/etc/spaguas-dmo/db.env`, modelo em `ops/producao/banco.exemplo` |
| Ambiente da aplicação | `/etc/spaguas-dmo/app.env`, modelo em `ops/producao/ambiente-producao.exemplo` |
| Ordem de subida | banco saudável, migrations com sucesso, aplicação |
| Portas | app em `127.0.0.1:3000`; **banco não publica nada** |
| Nginx | `ops/producao/nginx-dmo.spaguas.sp.gov.br.conf` |
| Saúde | `curl http://127.0.0.1:3000/api/health` |
| Rollback de código | trocar `IMAGEM_TAG` e `up -d --force-recreate` |
| Rollback com esquema | só sobe com a frase de volta escrita (seção 7.2) |
| Estado a preservar | volume `spaguas-dmo-pg-data` |
| Pacote por entrega | cerca de 225 MiB |
| Retenção de imagem | 3 versões, removidas **por nome** |
| Proibido | `docker system prune -a`, `docker volume prune`, tag `latest`, publicar em `0.0.0.0` |

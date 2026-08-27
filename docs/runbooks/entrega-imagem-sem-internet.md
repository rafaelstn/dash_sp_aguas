# Runbook: entrega da imagem no servidor do órgão (sem internet)

**Sistema:** SP Águas - DMO (dashboard Next.js)
**Servidor:** `10.199.43.27`, `dmo.spaguas.sp.gov.br`, Ubuntu 24.04.1 em VM VMware
**Escrito em:** 27/08/2026
**Estado:** preparação. **Nenhum passo deste runbook foi executado no servidor.**
Ordem do Rafael em 27/08: preparar o container, não fazer o deploy.

Cada afirmação abaixo está marcada como **MEDIDO** (existe comando e saída por
trás) ou **HIPÓTESE** (raciocínio ainda não confirmado no ambiente real).

---

## 1. Por que existe um runbook diferente do normal

**MEDIDO:** o servidor não tem saída para a internet. O DNS não resolve nome
externo nenhum (`github.com`, `registry-1.docker.io`, nem o próprio
`apps.spaguas.sp.gov.br`) e a saída TCP direta para `1.1.1.1:443` está
bloqueada. Não há proxy corporativo configurado.

Isso elimina, de uma vez, todo o caminho normal de entrega:

| Caminho usual | Por que não serve aqui |
|---|---|
| `docker build` no servidor | `npm ci` baixa 698 pacotes do registro público |
| `docker pull` de um registro | não alcança `ghcr.io` nem `docker.io` |
| Runner do GitHub publicando a imagem | o servidor não busca o que foi publicado |
| Renovação automática do certificado | não alcança a API do Let's Encrypt (seção 8) |

Sobra um caminho: **construir aqui, transportar o arquivo, carregar lá.**

**MEDIDO:** a imagem base `node:20-alpine` também não pode ser baixada no
servidor. Por isso o que viaja é a imagem final inteira (`docker save`), e não um
Dockerfile: o `save` carrega todas as camadas, inclusive a base.

---

## 2. Pré-requisitos antes de construir

1. Estar na revisão exata que vai para produção, com a árvore limpa:

   ```bash
   git status --porcelain     # tem que sair vazio
   git rev-parse --short HEAD # anote: esta é a TAG
   ```

2. Ter as variáveis de build decididas. Três delas são embutidas no pacote do
   navegador e **não** podem ser trocadas depois sem reconstruir a imagem:

   - `NEXT_PUBLIC_APP_URL` = `https://dmo.spaguas.sp.gov.br`
   - `NEXT_PUBLIC_SUPABASE_URL` (ver bloqueio 9.2)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ver bloqueio 9.2)

3. Construir num computador com internet. **Nunca** construir a partir do disco
   de rede: a instalação de dependências em SMB não conclui. Exportar a árvore
   versionada para disco local primeiro:

   ```bash
   mkdir -p /c/tmp/dmo-build && git archive HEAD | tar -x -C /c/tmp/dmo-build
   ```

   Usar `git archive` e não copiar a pasta tem uma razão de segurança: ele
   entrega só o que está versionado, então `.env.local` e afins não têm como
   entrar no contexto de build nem por acidente.

---

## 3. Construir a imagem

```bash
cd /c/tmp/dmo-build
SHA=$(git -C "<repositorio>" rev-parse --short HEAD)

DOCKER_BUILDKIT=1 docker build \
  --build-arg NEXT_PUBLIC_APP_URL=https://dmo.spaguas.sp.gov.br \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="<valor decidido>" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="<valor decidido>" \
  -t spaguas/dashboard:sha-$SHA .
```

**A tag é sempre `sha-<commit>`.** `latest` é proibido em produção, e o motivo é
prático antes de ser doutrinário: com `latest`, o rollback não tem para onde
apontar e ninguém consegue dizer qual código está no ar.

### Conferir a imagem antes de transportar

Três verificações que custam segundos e evitam levar defeito para dentro do
órgão. Todas **MEDIDAS** em 27/08/2026 na imagem de teste:

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
docker save spaguas/dashboard:sha-$SHA | gzip -6 -c > dmo-sha-$SHA.tar.gz
ls -l dmo-sha-$SHA.tar.gz
```

**MEDIDO em 27/08/2026**, na imagem construída a partir de `34417b7`:

| Grandeza | Valor |
|---|---|
| Tamanho descompactado (`docker images`) | **315 MB** |
| `docker save ... \| gzip -6 -c \| wc -c` (o que viaja) | **74.778.495 bytes, ou 71,3 MiB** |

O primeiro número é o que o `docker images` mostra, e ele **não** mede o que
trafega: é a soma das camadas já expandidas. Aqui a diferença entre os dois é um
fator de **4,2**. Usar o número errado infla a estimativa e leva a decisão errada
sobre o meio de transporte, que é a única coisa em jogo neste ponto. O número que
vale para combinar o transporte com o órgão é o segundo: **cerca de 71 MiB por
versão**, que cabe em qualquer canal, inclusive anexo de sistema interno.

### Consumo em disco no servidor, contra os 22 GB livres

**MEDIDO** no servidor: disco de 26 GB, **22 GB livres**, uma imagem
(`portainer/portainer-ce:lts`, 188 MB), um volume, um container.

Durante o `docker load` convivem no disco, ao mesmo tempo:

| Item | Espaço |
|---|---|
| Arquivo `.tar.gz` transportado | 71 MiB |
| Camadas expandidas da versão nova | 315 MB |
| Camadas da versão anterior (mantida para rollback) | ver nota abaixo |

**Nota que muda a conta, e para melhor:** a partir da segunda entrega, duas tags
consecutivas compartilham quase todas as camadas. Só a camada com o resultado do
build muda; a base `node:20-alpine`, a instalação de dependências e o usuário do
sistema são reaproveitados por identidade de conteúdo. O acréscimo real da
segunda versão no disco é a diferença, não o total. **HIPÓTESE até a segunda
entrega ser feita:** medir na hora com `docker system df -v` e registrar aqui.

Mesmo pela conta pessimista (todas as versões somando o total), a política de
manter **3 versões** cabe com folga nos 22 GB.

---

## 5. Transportar

**PENDENTE DE DEFINIÇÃO PELO ÓRGÃO.** Está no pedido formal (seção 10, item 5).
As opções, em ordem de preferência:

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

## 6. Carregar e subir no servidor

### 6.1 São dois arquivos de ambiente, e a divisão não é organização

**MEDIDO em 27/08/2026**, tentando fazer com um só: o Compose resolve `${...}` de
dentro do `docker-compose.prod.yml` a partir do `.env` do diretório do projeto e
do ambiente do terminal. Variável declarada em `env_file` vai para o
**container**, e não para o **Compose**. Com a tag da imagem no `env_file`, o
comando morre com `required variable IMAGEM_TAG is missing a value`.

| Arquivo | Quem lê | O que tem | Permissão |
|---|---|---|---|
| `/opt/spaguas-dmo/.env` | o Compose, para montar o serviço | `IMAGEM_TAG`, `IMAGEM_NOME`, `APP_PORT` | 0644 root:root |
| `/etc/spaguas-dmo/app.env` | o container, em execução | banco, identidade, `CRON_SECRET` | 0640 root:docker |

O ganho de tabela: o arquivo que muda a cada entrega e a cada rollback é
justamente o que **não** tem segredo nenhum. Modelos em
`ops/producao/versao-no-ar.exemplo` e `ops/producao/ambiente-producao.exemplo`.

Preparar uma única vez, no servidor:

```bash
sudo install -d -m 0755 /opt/spaguas-dmo
sudo install -d -m 0750 -o root -g docker /etc/spaguas-dmo
sudo install -m 0640 -o root -g docker /dev/null /etc/spaguas-dmo/app.env
sudo stat -c '%a %U:%G %n' /etc/spaguas-dmo/app.env   # espera: 640 root:docker
```

### 6.2 Carregar e subir

```bash
# 1. Carregar a imagem
docker load -i dmo-sha-$SHA.tar.gz
docker images spaguas/dashboard   # confirmar que a tag sha-$SHA apareceu

# 2. Apontar a versão. Esta é a única linha que muda entre uma entrega e outra,
#    e ela mora no arquivo SEM segredo (ver seção 6.1).
sudo sed -i "s/^IMAGEM_TAG=.*/IMAGEM_TAG=sha-$SHA/" /opt/spaguas-dmo/.env
sudo grep '^IMAGEM_TAG=' /opt/spaguas-dmo/.env

# 3. Subir
cd /opt/spaguas-dmo
docker compose -f docker-compose.prod.yml up -d
```

### Conferir que subiu de verdade

Exit code de `up -d` diz que o Docker aceitou o pedido, e não que o sistema está
no ar. O que responde é o efeito:

```bash
# a. Estado e saúde. Esperar "healthy", não "running".
docker compose -f docker-compose.prod.yml ps

# b. A porta está publicada SÓ em loopback. A saída tem que começar com
#    127.0.0.1 e NUNCA com 0.0.0.0.
docker compose -f docker-compose.prod.yml port app 3000
ss -ltnp | grep ':3000'

# c. A aplicação responde, e o healthcheck também mede o banco do órgão.
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/health
curl -sS http://127.0.0.1:3000/api/health
#    {"status":"ok","db":"ok"}       -> aplicação e banco de pé
#    {"status":"degraded","db":"erro"} -> aplicação de pé, banco inalcançável
#                                         (rede ou credencial, não código)

# d. Os limites de recurso foram aplicados de fato.
docker inspect spaguas-dmo-app --format \
  'mem={{.HostConfig.Memory}} cpu={{.HostConfig.NanoCpus}} ro={{.HostConfig.ReadonlyRootfs}} pids={{.HostConfig.PidsLimit}}'
#    mem=1610612736  cpu=2000000000  ro=true  pids=256
#    mem=0 significa SEM LIMITE: o compose não aplicou, e isso precisa ser
#    resolvido antes de considerar entregue.

# e. A rotação de log está valendo.
docker inspect spaguas-dmo-app --format '{{.HostConfig.LogConfig}}'
#    espera: json-file com max-size 10m e max-file 5

# f. Pela borda, já com o Nginx configurado.
curl -sSI https://dmo.spaguas.sp.gov.br/ | head -20
```

---

## 7. Rollback

O rollback deste sistema **não reconstrói nada e não baixa nada**, que é
exatamente o que se quer num servidor sem internet: ele aponta para uma tag que
já está no disco.

```bash
# 1. Ver quais versões existem no servidor
docker images spaguas/dashboard --format '{{.Tag}}\t{{.CreatedAt}}'

# 2. Apontar a anterior
sudo sed -i "s/^IMAGEM_TAG=.*/IMAGEM_TAG=sha-<anterior>/" /opt/spaguas-dmo/.env

# 3. Recriar o container com ela
cd /opt/spaguas-dmo
docker compose -f docker-compose.prod.yml up -d --force-recreate

# 4. Conferir pelo efeito (mesma lista da seção 6)
docker compose -f docker-compose.prod.yml ps
curl -sS http://127.0.0.1:3000/api/health
```

**Tempo esperado: menos de um minuto**, porque nada é transferido. **HIPÓTESE
até ser cronometrado no servidor.**

### O que o rollback NÃO desfaz

Ele volta o **código**. Ele não volta o **banco**. Se a versão que está saindo
aplicou alteração de esquema, voltar a imagem deixa código antigo falando com
esquema novo. Toda entrega que mexer no banco precisa dizer, por escrito e antes
de subir, como se desfaz a parte do banco. Sem essa frase escrita, a entrega não
sobe.

### Política de retenção de imagem

Manter as **3 últimas** tags. Ao remover, remover **pelo nome**:

```bash
docker image rm spaguas/dashboard:sha-<antiga>
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

## 9. Bloqueios: o que impede o deploy hoje

Estes itens não são detalhe de configuração. **Nenhum deles se resolve neste
runbook**, e enquanto qualquer um estiver de pé o sistema não sobe no servidor,
por mais correto que o container esteja.

### 9.1 O banco: onde roda o PostgreSQL da aplicação

> **Atualizado no mesmo dia, e a atualização muda o problema.** Enquanto esta
> preparação era feita, o ADR-0023 (*Camada de leitura sobre o SQL Server do
> órgão*, status **Proposto**, autoria do Bruno) foi escrito em paralelo neste
> repositório. Ele registra a instrução do proprietário: *"a ideia não é refazer
> o banco, é começar a transmitir o banco deles, então o nosso nem mexe, só
> adapta o sistema para aceitar a tabela nova."*
>
> Ou seja, o SQL Server de `10.20.40.62` entra como **origem de leitura**, e o
> **PostgreSQL continua sendo o banco da aplicação**. `DATABASE_URL` segue sendo
> uma string de conexão PostgreSQL, e a preocupação abaixo deixa de ser
> "reescrever a camada de dados" e vira outra, menor e ainda em aberto:
>
> **onde roda esse PostgreSQL, do ponto de vista deste servidor?** O
> `docker-compose.prod.yml` sobe só a aplicação, por ordem do Rafael. Se o
> PostgreSQL tiver de morar no mesmo servidor, ele precisa de decisão própria
> (serviço no compose ou pilha separada), com volume, backup e **restauração
> testada**, porque backup só conta como backup depois de um restore que
> funcionou. Se for fornecido pelo órgão, entra no pedido da seção 10.3 junto do
> SQL Server. Enquanto isso não for respondido, a aplicação não tem para onde
> apontar `DATABASE_URL`, e é isso que a impede de subir.
>
> Consequências de infraestrutura que o ADR-0023 traz e que precisam entrar aqui
> quando ele for aceito: uma **segunda** variável de conexão, para o SQL Server;
> a liberação de rede a partir da ponte do Docker até `10.20.40.62:1433` (seção
> 10.3); e uma **dependência nova** no `package.json` para falar com o SQL
> Server, o que obriga a reconstruir a imagem aqui, com internet, já que o
> servidor não instala pacote nenhum.
>
> O restante desta seção fica registrado porque continua sendo verdade sobre o
> código, e é o que explica por que apontar `DATABASE_URL` para a porta 1433
> nunca foi opção.

**MEDIDO no código:**

- A aplicação fala com o banco pelo pacote `postgres` (postgres.js), fixado em
  `3.4.9` no `package.json`. Esse cliente implementa o protocolo de rede do
  PostgreSQL, e só ele.
- Existem **25** repositórios `.pg.ts` escritos em SQL do PostgreSQL. Contagem
  de construções que o SQL Server não aceita na mesma forma: `RETURNING` em 15
  arquivos, conversão por `::` em 22, `ON CONFLICT` em 7, `jsonb` em 5, `ILIKE`
  em 4, função `ST_` do PostGIS em 1.
- São **65** migrações em `supabase/migrations/`, das quais **27** usam recurso
  exclusivo do PostgreSQL (PostGIS, `jsonb`, RLS, `gen_random_uuid`).

**Conclusão:** `DATABASE_URL` apontada para `10.20.40.62:1433` não conecta, e não
é questão de porta nem de string: é outro protocolo de rede e outro dialeto de
SQL. O caminho do ADR-0023 (SQL Server como origem de leitura, PostgreSQL
mantido) evita exatamente esse custo.

**A pergunta que sobra, e que é de infraestrutura:** de onde vem o PostgreSQL da
aplicação neste servidor. As duas respostas possíveis são o órgão fornecer, o que
está alinhado com a pilha institucional que a `rules/governo` registra
(PostgreSQL/PostGIS) e com o que o ADR-0015 assumiu, ou subirmos um em container
no próprio servidor, com volume, backup e restauração testada. **Decisão do
Rafael com o órgão, não escolha nossa.** Ela precisa vir antes de o container ir
para o servidor, porque é ela que dá valor a `DATABASE_URL`.

### 9.2 A identidade: autenticação depende de um endereço inalcançável

> O ADR-0023, escrito em paralelo, se propõe a resolver a pendência de identidade
> do ADR-0015 §3 e a revisar os ADR-0004 e 0006. **Enquanto ele estiver como
> *Proposto*, o que vale para a preparação é o que está no código hoje**, e é
> isso que esta seção descreve. Quando a identidade for decidida, o efeito sobre
> a infraestrutura é o da tabela abaixo, mais uma reconstrução da imagem, porque
> duas destas variáveis ficam gravadas no pacote em tempo de build.

**MEDIDO no código:** o `env.ts` (linhas 55-59) **recusa subir em produção** sem
`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. O
`src/middleware.ts` chama `supabase.auth.getUser()` **a cada requisição** que
passa pelo gate, contra `*.supabase.co`. A política de segurança da própria
aplicação libera `connect-src ... https://*.supabase.co` (linha 35).

**MEDIDO no servidor:** `*.supabase.co` não resolve e não é alcançável.

Preencher as duas variáveis com valor de faz de conta não contorna: a chamada de
rede continua sendo feita e nunca completa, então **toda navegação** fica presa
até o tempo limite. E há um agravante que só aparece depois: por serem lidas por
nome literal no middleware, o Next **grava** o valor no pacote em tempo de build.
Um valor errado embutido não se corrige por variável de ambiente, só
reconstruindo a imagem.

O que precisa mudar no `src/infrastructure/config/env.ts` quando a identidade for
decidida (**apontado, não alterado**, conforme o limite desta tarefa):

| Hoje | O que muda |
|---|---|
| Linhas 16-17: `NEXT_PUBLIC_SUPABASE_URL` e `..._ANON_KEY` no esquema | trocar pelas variáveis da nova camada de identidade |
| Linhas 46-48: `isAuthEnabled` derivado das duas | derivar da nova camada |
| Linhas 55-59: fail-fast exigindo as duas em produção | manter o fail-fast, apontando para as novas. A regra é boa e precisa continuar valendo: sistema de governo não pode subir com o portão aberto |
| Linha 19: `SUPABASE_SERVICE_ROLE_KEY` (upload da foto) | o armazenamento de arquivo também sai do Supabase, e vira disco do servidor ou serviço do órgão |

Fora do `env.ts`, no mesmo movimento: `src/middleware.ts` linha 35 (retirar
`https://*.supabase.co` da política) e os três adaptadores que importam
`@supabase/*` (`auth/supabase-server.ts`, `auth/supabase-admin.ts`,
`storage/foto-posto-storage.ts`).

### 9.3 Duas funcionalidades que o container não entrega

Achados durante a preparação, **MEDIDOS no código**, que não impedem o deploy mas
não podem ser descobertos pelo usuário:

- **Ficha de posto com indexação sob demanda.** `lazy-indexer.ts` executa
  `python -m ops.indexer.indexar_posto` como subprocesso. A imagem final é
  `node:20-alpine`: **não tem Python e não tem a pasta `ops/`**. A chamada falha
  dentro do container. Decidir se o indexador vira um segundo container, se roda
  como tarefa do host, ou se a funcionalidade sai do escopo desta entrega.
- **Relatório em PDF.** `pdf-relatorio.ts` procura um navegador sem interface
  (`CHROME_BIN`, `/usr/bin/chromium`). A imagem não tem nenhum. A rota devolve
  `RenderizadorPdfIndisponivel`. Acrescentar Chromium à imagem custa em torno de
  150 MB e precisa ser decisão consciente, não efeito colateral.

### 9.4 As rotinas não têm quem as chame

**MEDIDO:** existem três rotas em `/api/cron/*`, entre elas
`anonimizar-trilha`, que é o que cumpre o prazo de retenção da trilha de
auditoria (LGPD). Hoje elas eram chamadas por agendador externo. **Sem internet,
ninguém as chama.** Se subir assim, a anonimização simplesmente não acontece, em
silêncio, e a documentação de entrega afirma uma retenção que não ocorre.

Definir o chamador antes de subir: tarefa agendada no próprio host, com `curl`
para `127.0.0.1:3000` e o cabeçalho de `CRON_SECRET`, é o caminho mais simples e
não depende de nada externo.

---

## 10. Pedido formal ao órgão

Enviado pela Paula, em tom institucional. Sete itens.

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

### 10.2 Certificado: a renovação vai falhar em 23/10, e o site cai em 22/11

Este é o achado mais silencioso da preparação, porque **nada quebra hoje** e o
sistema de monitoramento do órgão não tem como perceber.

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
   **falhar duas vezes por dia**, no primeiro passo, sem nunca chegar ao desafio.
4. Em **22/11/2026** o certificado vence.

**Por que isso não é "o navegador mostra um aviso":** a aplicação envia
`Strict-Transport-Security: max-age=63072000; includeSubDomains`
(`next.config.ts`, linhas 104-107), ou seja, dois anos. Todo navegador que já
visitou o endereço guardou essa instrução e, com o certificado vencido, **recusa
a conexão sem oferecer a opção de prosseguir**. O sistema fica inacessível para
quem mais o usa, que é justamente quem já visitou. Não é degradação: é queda.

**HIPÓTESE que vale perguntar:** o certificado atual foi emitido em algum momento,
o que significa que ou a máquina já teve saída para a internet, ou a emissão foi
feita em outro contexto. Saber qual dos dois muda a solução.

**Solicitar a definição de um destes caminhos, com prazo de decisão até
30/09/2026** (para deixar três semanas de folga antes da primeira falha):

1. **Certificado da autoridade certificadora do próprio órgão, ou ICP-Brasil.**
   É a resposta natural para sistema de governo em rede fechada, tem validade
   maior e não depende de saída para a internet. **Recomendação nossa.**
2. **Emissão fora do servidor e instalação manual.** Funciona, e obriga alguém a
   repetir o procedimento a cada 90 dias, com data marcada em calendário. Serve
   como ponte, não como solução.
3. **Liberar a saída para a API do Let's Encrypt.** Resolve o passo 1 acima, mas
   não resolve o passo 2 se o site não for acessível de fora; e a API responde em
   muitos endereços diferentes, o que torna frágil qualquer liberação por IP.

Enquanto não houver decisão, deixar o cronômetro de renovação ligado só produz
falha silenciosa duas vezes ao dia. Se o caminho 1 ou 2 for escolhido, o
cronômetro deve ser desligado no mesmo movimento, para não gerar ruído.

### 10.3 Banco: liberação de rede e origem do PostgreSQL

**MEDIDO:** a porta 1433 de `10.20.40.62` responde a partir do servidor.

Dois pedidos, e o segundo é o que trava a entrega:

1. **Confirmar que a liberação vale também para tráfego originado de dentro de um
   container Docker**, que sai por outra interface e outra faixa de endereços,
   diferentes das do host. Regra de firewall escrita para o endereço do host não
   cobre a ponte do Docker automaticamente, e o sintoma disso é a aplicação subir
   normalmente e o `/api/health` responder `degraded` sem nenhuma explicação
   legível, o que manda procurar defeito em código.
2. **Definir de onde vem o PostgreSQL da aplicação** (seção 9.1): fornecido pelo
   órgão, com endereço, porta e credencial, ou hospedado por nós no mesmo
   servidor. Se for a segunda, precisa vir junto a definição de onde ficam os
   dados, quem faz o backup e onde a restauração é testada.

### 10.4 Portainer publicado em todas as interfaces

**MEDIDO:** `portainer/portainer-ce:lts` publica as portas 8000 e 9443 em
`0.0.0.0`, ou seja, em toda a rede alcançável.

Publicação por Docker é escrita direto no filtro de pacotes e **passa por cima**
das regras do firewall do host: quem confere só o firewall conclui que está
fechado. O painel dá controle total sobre os containers da máquina.

Solicitar avaliação da equipe de segurança do órgão, com duas opções: restringir
o acesso na borda, ou publicar em `127.0.0.1` e alcançar por túnel. **Este ponto
é do órgão, não nosso: apontamos porque medimos.** Vale registrar que o nosso
container publica em `127.0.0.1` justamente para não repetir isso.

### 10.5 Canal de transporte da imagem

Sem internet, cada nova versão do sistema é um arquivo que precisa chegar ao
servidor. Definir o canal oficial, quem tem acesso e como se registra a
passagem. Sem isso definido, cada entrega vira improviso, e improviso em servidor
de governo é o que produz o acesso não rastreado.

### 10.6 Quem enxerga as variáveis de ambiente

O arquivo `/etc/spaguas-dmo/app.env` fica com dono `root` e permissão restrita.
Isso protege o disco. **Não protege o painel:** qualquer conta com acesso ao
Portainer lê o ambiente do container pela interface, inclusive a string de
conexão do banco.

Solicitar a lista de contas com acesso ao Portainer e confirmar que ela é
compatível com quem pode ver credencial de banco de sistema de governo.

### 10.7 Registro de log com dado pessoal

O log da aplicação carrega endereço de e-mail de usuário, por exigência da
trilha de auditoria. O log do container é legível por quem tem Portainer. A
rotação está limitada a 50 MB por container no `docker-compose.prod.yml`.

Informar ao órgão, e confirmar se existe exigência de coleta desse log por
ferramenta institucional. Sem internet, o envio para coletor externo está
desligado (`LOG_DRAIN_URL` vazia), e essa é a configuração correta aqui.

---

## 11. Evidência da preparação (27/08/2026)

Nada disto foi executado no servidor do órgão. Tudo foi medido na máquina de
desenvolvimento, com o Docker Engine 29.6.2 e o Compose v5.3.1 locais, contra a
imagem construída a partir de `34417b7`.

### 11.1 O `docker build` estava quebrado por dois motivos, e os dois foram corrigidos

**Primeira reprovação, que não era a esperada:**

```
./src/application/use-cases/inventario-ana/exportar.ts
Module not found: Can't resolve '../../../../data/colunas-ana.json'
```

O `.dockerignore` excluía `data/` inteiro. Só que `data/colunas-ana.json` não é
dado de carga: é **fonte**, importada por caminho relativo por um caso de uso, e
o empacotador precisa dela para compilar. Corrigido com uma exceção nomeada
(`!data/colunas-ana.json`), mantendo o resto de `data/` fora da imagem, que é
onde estão os CSV de carga e as amostras.

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

Resultado depois das duas correções: **build verde**, imagem
`spaguas/dashboard:sha-34417b7` gerada.

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

$ docker run --rm --entrypoint sh ... -c 'ls -a /app | grep -c "^\.env" || true'
0
```

O `DATABASE_URL` de fachada do estágio de build **não** aparece na imagem final,
que é o que prova que ele não vaza para produção. Nenhum arquivo de ambiente
entrou.

### 11.3 O compose foi exercitado, e o exercício achou dois defeitos meus

Os dois só apareceram porque o arquivo foi executado, e não apenas escrito:

1. `IMAGEM_TAG` estava no `env_file`, e o Compose não interpola a partir dele.
   Corrigido pela divisão em dois arquivos (seção 6.1).
2. `pids_limit` no topo do serviço, junto de `deploy.resources.limits`, faz esta
   versão do Compose recusar o projeto inteiro:
   `can't set distinct values on 'pids_limit' and 'deploy.resources.limits.pids'`.
   Corrigido movendo o teto para dentro de `deploy.resources.limits.pids`.

Com o arquivo corrigido, subindo o container de teste com um banco inexistente
só para medir a forma:

```
$ docker inspect spaguas-dmo-app --format 'mem={{.HostConfig.Memory}} cpu={{.HostConfig.NanoCpus}} ro={{.HostConfig.ReadonlyRootfs}} pids={{.HostConfig.PidsLimit}} ...'
mem=1610612736 cpu=2000000000 ro=true pids=256
nnp=[no-new-privileges:true] capdrop=[ALL]
log=map[Config:map[max-file:5 max-size:10m] Type:json-file] init=true

$ docker compose -f docker-compose.prod.yml port app 3000
127.0.0.1:39300
```

Ou seja: limite de memória, limite de CPU, raiz somente leitura, teto de
processos, sem elevação de privilégio, sem capacidade de núcleo, rotação de log
e publicação restrita a loopback **estão valendo de fato**, e não apenas
escritos. Os dois `docker compose config` (com e sem interpolação) passam.

E a aplicação sobe com a raiz somente leitura, o que prova que os dois pontos de
escrita mapeados em memória bastam:

```
spaguas-dmo-app  |  ✓ Ready in 265ms
spaguas-dmo-app  | {"ts":"...","severidade":"error","evento":"health.db.falha",
                    "motivo":"connect ECONNREFUSED 127.0.0.1:5432","codigo":"ECONNREFUSED"}
```

O erro de banco é o esperado: o teste não tinha banco. O que importa é que ele
sai como **log estruturado em JSON**, com evento nomeado, que é o formato que o
órgão consegue coletar.

O container e a rede de teste foram removidos ao fim (`docker compose down`).

---

## 12. Ficha rápida

| | |
|---|---|
| Imagem | `spaguas/dashboard:sha-<commit>` |
| Compose de produção | `docker-compose.prod.yml` (só a aplicação) |
| Versão no ar | `/opt/spaguas-dmo/.env`, modelo em `ops/producao/versao-no-ar.exemplo` |
| Ambiente (segredos) | `/etc/spaguas-dmo/app.env`, modelo em `ops/producao/ambiente-producao.exemplo` |
| Porta | `127.0.0.1:3000`, nunca `0.0.0.0` |
| Nginx | `ops/producao/nginx-dmo.spaguas.sp.gov.br.conf` |
| Saúde | `curl http://127.0.0.1:3000/api/health` |
| Rollback | trocar `IMAGEM_TAG` e `up -d --force-recreate` |
| Retenção de imagem | 3 versões, removidas **por nome** |
| Proibido | `docker system prune -a`, tag `latest`, publicar em `0.0.0.0` |

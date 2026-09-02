# ADR-0025: saída para a internet pelo proxy corporativo do órgão

| | |
|---|---|
| Data | 2026-09-02 |
| Situação | Aceita |
| Escopo | Rede, runtime da imagem, integração com o SIBH |
| Cliente | GOVERNO (SP Águas / DAEE). Rules `governo`, `padrao` |
| Resolve | Chamadas ao SIBH que ficavam penduradas sem erro legível no servidor da PRODESP |
| Revisa | ADR-0015 (conteinerização), runbook `entrega-imagem-sem-internet.md` §1 e §10.3 |

---

## 1. O que mudou no entendimento da rede

O runbook afirmava, na seção 1, que o servidor **não tem saída para a internet** e
que **"não há proxy corporativo configurado"**. A primeira metade continua
medida e verdadeira: o DNS não resolve nome externo e a saída TCP direta está
bloqueada. A segunda metade era verdadeira sobre a **máquina** e falsa sobre a
**rede**.

O desenvolvedor do órgão informou que existe um proxy corporativo, e que o
firewall autoriza **pelo IP do proxy**, que é fixo, e não pelo IP de quem chama.
O IP variável de um container, portanto, deixa de ser o problema: o requisito é
que a saída passe pelo proxy.

Ele descreveu o sintoma com precisão: *"a informação entra num limbo que você
não sabe se deu erro ou se chegou"*. É o comportamento de um pacote que o
firewall descarta em silêncio, e a requisição fica pendurada até o tempo limite.

**Nós já tínhamos apontado esse mecanismo, para outro destino.** A seção 10.3 do
runbook pedia confirmação de que a liberação do SQL Server valeria para tráfego
originado de dentro de um container, dizendo que o sintoma seria "falhar sem
explicação legível, o que manda procurar defeito em código".

## 2. O problema que não se resolve com variável de ambiente

O órgão enviou um exemplo em `axios`, que configura `HttpsProxyAgent` e marca
`axios.defaults.proxy = false`. O exemplo está correto, inclusive nessa última
linha, que é a parte sutil: o mecanismo interno de proxy do axios conflita com o
agent no túnel HTTPS.

**Ele não se aplica a este sistema, e a diferença não é de estilo.** Medido: o
projeto não usa axios (nenhum dos pacotes declarado, zero importações). Usa o
`fetch` nativo do Node. E:

> **O axios lê `HTTP_PROXY` do ambiente por conta própria. O `fetch` nativo não lê.**

Medido em 02/09/2026 com um servidor local que conta conexões recebidas,
apontando `HTTP_PROXY`/`HTTPS_PROXY` para ele e disparando um `fetch` a um host
externo:

| Runtime | Conexões que chegaram ao proxy | Resultado |
|---|---|---|
| `node:20-alpine` (v20.20.2), o da imagem até aqui | **0** | foi direto ao host |
| `node:24-alpine` (v24.20.0) sem a opção | 0 | foi direto ao host |
| `node:24-alpine` + `NODE_USE_ENV_PROXY=1` | **1** | usou o proxy |

Consequência: **configurar `HTTP_PROXY` no `app.env` do órgão, sozinho, não
mudaria nada.** A chamada continuaria saindo direto e caindo no limbo.

## 3. Decisão

**A imagem passa de `node:20-alpine` para `node:24-alpine`, com
`NODE_USE_ENV_PROXY=1` declarado na própria imagem.** O proxy em si vem por
`HTTP_PROXY`/`HTTPS_PROXY` no `/etc/spaguas-dmo/app.env`.

Três motivos para preferir isto a instalar `undici` e aplicar `ProxyAgent` no
código:

1. **Nenhuma dependência nova**, o que importa numa entrega que viaja por
   arquivo para uma máquina sem internet.
2. **Vale para toda chamada, inclusive as que ainda não existem.** A alternativa
   cobriria apenas onde alguém lembrasse de aplicar, e a falha por esquecimento
   é silenciosa.
3. **`NO_PROXY` passa a funcionar de graça**, e ele não é detalhe: é o que
   impede o tráfego interno de sair da máquina para pedir um endereço que só
   existe dentro dela.

`NODE_USE_ENV_PROXY=1` fica **na imagem**, e não no arquivo de ambiente, porque
o esquecimento dela não produziria erro nenhum, apenas requisições que somem.
Sem `HTTP_PROXY` definido ela não tem efeito, então é inofensiva fora do órgão.

### 3.1 O custo, medido

Medido: `node:24-alpine` ocupa **235 MB** contra **194 MB** do `node:20-alpine`,
ou seja, a base cresceu 41 MB. A imagem final ficou em **357 MB** descompactada
e **80,9 MiB compactada**, que é o que de fato trafega.

**Não medi a imagem anterior**, então não afirmo de quanto foi o crescimento
total: o que está medido é a diferença entre as bases e o tamanho da imagem de
hoje. Registrado também porque o runbook trabalha com a ordem de 225 MiB para o
transporte, e 80,9 MiB compactada está bem abaixo disso: o número de lá merece
ser reconferido junto com o método de medição usado.

### 3.2 O que precisa passar pelo proxy, e o que não pode

Varridos todos os destinos externos citados no código:

| Destino | Quem chama | Passa pelo proxy? |
|---|---|---|
| `apps.spaguas.sp.gov.br` (SIBH) | **servidor** | **sim**, é o único |
| `tile.openstreetmap.org`, `geodados.daee.sp.gov.br` | navegador do usuário | não é nosso: depende da rede da estação de trabalho |
| `10.20.40.62:1433` (SQL Server, ADR-0023) | servidor | **não**, é interno, entra no `NO_PROXY` |
| `db`, `localhost`, `127.0.0.1` | servidor | **não**, entram no `NO_PROXY` |

O ponto do navegador tem consequência visível e precisa ser dito ao órgão: se as
estações não alcançarem as camadas de mapa, o mapa do módulo Monitor aparece em
branco, **sem mensagem de erro**.

## 4. Um defeito que esta mudança desenterrou, e que já bloqueava a entrega

Ao construir a imagem de verdade, e não apenas rodar o build local, ela falhou:

```
Error: Variáveis de ambiente inválidas:
  - NEXT_PUBLIC_SUPABASE_URL: Invalid url
```

`ENV X=$ARG` no Dockerfile, com o argumento não informado, define a variável como
**string vazia**, e não a deixa ausente. O `.optional()` do zod cobre `undefined`
e não cobre `''`, então o valor vazio ia ao validador de URL e reprovava,
derrubando o build em "Collecting page data" com uma mensagem que aponta para uma
rota de cron e não diz nada sobre a variável.

**Como o Supabase saiu da entrega, ninguém mais passa esses `--build-arg`: o
caminho quebrado virou o caminho normal.** Não aparecia no build local porque ali
a variável de fato não existe.

Corrigido na fronteira, com `vazioComoAusente`, aplicado também a
`NEXT_PUBLIC_APP_URL`, que valida formato pelo mesmo mecanismo. A guarda
reproduz a falha em milissegundos, contra os dois minutos de uma construção de
imagem.

## 5. Guardas

- `tests/unit/infrastructure/proxy-saida-internet.test.ts` reprova se algum
  estágio do Dockerfile voltar para Node < 24, se `NODE_USE_ENV_PROXY` sumir da
  imagem, ou se `NO_PROXY` deixar de excluir `localhost`, `db` ou o SQL Server.
  Provada voltando o estágio para `node:20-alpine`: reprovou nomeando o estágio
  e o motivo.
- `tests/unit/infrastructure/env-variavel-vazia.test.ts` reproduz o defeito da
  seção 4 e afirma que valor **inválido de verdade** continua derrubando o boot,
  para a correção não ter virado "aceita qualquer coisa".

## 6. O que continua em aberto com o órgão

1. Endereço, porta e autenticação do proxy.
2. Se o proxy faz `CONNECT` ou intercepta o TLS. Se interceptar, precisamos do
   certificado da CA interna na imagem (`NODE_EXTRA_CA_CERTS`), senão toda
   chamada falha por certificado.
3. Se a liberação de firewall do SQL Server cobre tráfego vindo da ponte do
   Docker (pergunta que já era da seção 10.3 do runbook).
4. Se o proxy libera `ghcr.io`, `registry-1.docker.io` e o registro do npm. Se
   liberar, parte da entrega por arquivo deixa de ser obrigatória. **Enquanto
   não houver resposta, o caminho por arquivo continua valendo**, porque
   funciona nos dois cenários.
5. Se as estações de trabalho alcançam as camadas de mapa.

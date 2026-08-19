# Incidente de 19/08/2026: relato de lentidão generalizada

Relato do Rafael, por volta das 09h20 (BRT), com reunião de gestores marcada:
"o sistema está mega lento, todas as telas estão demorando para abrir", e em
seguida "só tem eu abrindo o sistema", "minutos para acessar as coisas",
"ninguém mais usa ele" e "só esse sistema está lento" (o restante da internet
respondia normalmente na mesma máquina).

Este documento registra o que foi **medido**, o que foi **refutado** e o que
**segue em aberto**. Nada aqui é conclusão por leitura de código: onde não houve
medição, está escrito que não houve.

## O que foi medido, e o resultado

Todas as medições abaixo saíram da **própria máquina do Rafael, na rede dele**,
que é onde o relato aconteceu.

### Camada pública (Vercel)

| Alvo | Resultado |
|---|---|
| `/login` | HTTP 200, TTFB 0,25 s (três medições: 0,248 / 0,252 / 0,268) |
| `/monitor` sem sessão | HTTP 307, TTFB 0,07 a 0,12 s |
| `/api/health` | HTTP 200, TTFB 0,90 a 1,07 s |
| `/api/health`, 10 acessos simultâneos | 0,88 s a 1,69 s |

Degradação sob concorrência existe, mas é modesta, e a reunião tinha um único
usuário. Nada aqui reproduz "minutos".

### Banco de produção (somente leitura)

| Medição | Resultado |
|---|---|
| Conexões | 12 a 18, contra `max_connections` = 60 |
| Sessões da aplicação (Supavisor) | 4, todas `idle` em `ClientRead` |
| Queries acima de 5 s | zero |
| Locks / esperas anormais | nenhuma |
| Queries da aplicação (`pg_stat_statements`) | 16 ms a 116 ms de média |
| `INSERT` da sincronização | 2.430 chamadas somando 913 ms totais |

O Postgres não apanhou em momento algum.

### Serviços do Supabase

`auth/v1/health` e `rest/v1/` responderam entre 70 ms e 95 ms.

### Conclusão da camada de servidor

O `curl` respondia em 0,25 s **no mesmo endereço, na mesma máquina e na mesma
rede** em que o navegador levava minutos. O servidor não era a causa.

## O que foi refutado

1. **Saturação do pooler por concorrência.** Medida: 12 a 18 conexões de 60, com
   um único usuário. Descartada.
2. **Banco lento ou query pesada.** Medida: nenhuma query acima de 5 s, médias de
   dezenas de milissegundos. Descartada.
3. **Supabase degradado.** Medida: 70 a 95 ms. Descartada.
4. **Cron empilhado ou reexecutando.** Medido no efeito do banco: gravações
   concentradas numa única janela (09:10 a 09:15 UTC), sem segundo pico, e o cron
   da Vercel é diário e não faz retry. Descartada.
5. **Domínio institucional com proxy lento.** `apps.spaguas.sp.gov.br` responde em
   45 ms e **não é este sistema**: é o SIBH do Estado (nginx, `/sibh/chuva_agora`).
   O acesso do Rafael é pelo endereço da Vercel. Descartada.
6. **Service worker preso segurando as telas.** Esta era a hipótese mais forte,
   pelo escopo `/` do `sw.js`, e caiu ao ser testada: o script inline que o
   registra é **bloqueado pela Content Security Policy**, então o service worker
   nunca chega a ser registrado. Ver a seção de achados abaixo.

## O que NÃO foi reproduzido

**A lentidão relatada não foi reproduzida em nenhuma medição.** Faltou o dado que
só existe do lado do navegador durante o episódio: o painel Network do DevTools
mostrando qual requisição consumia os minutos. As telas autenticadas em produção
não puderam ser medidas porque não havia sessão disponível (não existe credencial
do SP Águas em `F:\Credenciais\`).

Quando o sintoma voltar, a medição que fecha o diagnóstico é: F12, aba Network,
recarregar a tela, e olhar qual linha domina o tempo, se é o documento HTML, uma
chamada de API, um asset ou uma requisição pendurada.

## Achados reais, encontrados durante a investigação

### 1. O pool de conexões nascia um por query em produção (corrigido)

Em `src/infrastructure/db/client.ts`, `obter()` guardava o singleton apenas
quando `NODE_ENV !== 'production'`. Como o `sql` exportado é um Proxy cujos traps
`get` e `apply` chamam `obter()`, cada acesso de propriedade e cada execução
instanciava um cliente `postgres()` novo.

Medição com o pacote instrumentado por contador, importando o módulo real:

| Cenário | 1 requisição | 3 requisições |
|---|---|---|
| `NODE_ENV=production` | 5 clientes | 15 clientes |
| `NODE_ENV=development` | 1 cliente | 1 cliente |

Cada cliente abria conexão própria, sem `.end()`, saindo apenas por
`idle_timeout` de 20 s, contra um pooler que aceita 15 sessões. O `max: 5` nunca
teve efeito, porque o pool morria a cada uso.

Corrigido no commit `f1ccfdb`, na branch `fix/pool-conexoes-producao`, com teste
que reprova se alguém desfizer. **Não publicado em produção**: aguarda ordem do
Rafael.

Risco residual, que não é desta correção e fica pautado: em serverless cada
instância tem o seu `globalThis`, então N instâncias podem pedir até 5N sessões
contra o teto de 15. Se a `DATABASE_URL` de produção apontar para a porta 5432
(modo sessão) em vez de 6543 (modo transação), este é o próximo gargalo.

### 2. O service worker nunca é registrado, e o PWA offline não funciona

O `<script>` inline de `src/app/app/layout.tsx` que chama
`navigator.serviceWorker.register('/sw.js', { scope: '/' })` **não recebe o
nonce** que o middleware gera. Como a CSP usa `'strict-dynamic'` com nonce, o
navegador bloqueia a execução. Medido no navegador, com a mensagem de violação
de CSP apontando o script, e confirmado por `getRegistrations()` devolvendo lista
vazia e `caches.keys()` vazio.

Consequência: o PWA não tem service worker, portanto **não há suporte offline**,
apesar de o produto ter `SyncFichasPendentes` e do submódulo de conferência
física ter sido desenhado para uso em campo.

**Não corrigido de propósito**, e a decisão é do Rafael com o André:

- O escopo do registro é `/`, ou seja, ligar o service worker faz com que ele
  passe a controlar **todas as telas do sistema**, não apenas o PWA.
- O middleware aplica `no-store` em tudo que passa por ele por causa do incidente
  de 18/05/2026, cache compartilhado exibindo dado de um usuário para outro.
  Ligar cache de navegação num sistema de governo, com dado de cidadão, reabre
  exatamente essa porta.
- O impacto de hoje é zero: o banco de produção não tem nenhuma sessão de
  conferência gravada, ou seja, ninguém depende do offline ainda.

Ligar exige decidir o escopo, a estratégia de cache por rota e o que nunca pode
ser cacheado. É trabalho de segurança, não conserto de uma linha.

### 3. A sincronização de hoje parou no meio, e o dado do monitor está parcial

Primeira execução automática real do cron criado em 18/08 (`vercel.json`,
`0 9 * * *`, isto é, 06:00 BRT).

| Fato | UTC | BRT |
|---|---|---|
| Primeira gravação de estação | 19/08 09:11:40 | 06:11:40 |
| Última gravação de qualquer natureza | 19/08 09:14:47 | 06:14:47 |
| Leituras pluviométricas gravadas hoje | **zero** | |
| Leitura mais recente no sistema (`MAX(momento)`) | **17/08 00:00** | |

A etapa de estações trabalhou e parou; a etapa de leituras não gravou uma linha.
Na execução manual de 18/08 essa mesma etapa gravou 30 linhas normalmente, então
zero hoje não é "nada mudou": é a etapa não tendo chegado ao fim. A assinatura é
de corte por tempo da função, o que o commit 85230f9 já registrava como risco
("não há garantia de caber nos 300 s"). O status HTTP exato não foi lido, então
o 504 fica como suspeita, não como fato: o que está medido é que parou sem
terminar.

Registro que corrige documento anterior: a `CRON_SECRET` **foi criada em 18/08 às
22:05 UTC**, em Production e Preview. O commit 6574efe, que afirma que ela nunca
existiu em produção, está desatualizado.

Efeito prático: o mapa do monitor mostra catálogo parcialmente atualizado e
**leituras de 17/08**. Não citar números absolutos de estações online, como o
roteiro da demo já orienta.

Próxima execução automática: 20/08, 06:00 BRT. O cron pode ser desligado em
segundos pelo painel (Settings, Cron Jobs, "Disable cron jobs"), sem build e sem
deploy, e religado do mesmo jeito. Remover o bloco do `vercel.json` é a via
lenta, porque exige commit e build nos dois sentidos.

## Contingência montada durante o episódio

Servidor local em `http://localhost:3000`, com o bypass de autenticação de
desenvolvimento que já estava configurado no `.env.local`, portanto sem exigir
senha, lendo o banco de produção **somente leitura**. Todas as telas foram
pré-compiladas antes da reunião:

| Tela | Tempo após aquecimento |
|---|---|
| `/monitor` | 0,27 s |
| `/desconformidades`, `/diagramas`, `/favoritos`, `/painel`, `/perfil`, `/triagem` | 1,4 s a 1,8 s |
| `/estoque` | 3,1 s |

## Pendências que este incidente deixa

1. Publicar (ou não) a correção do pool. Depende do Rafael.
2. Conferir a porta da `DATABASE_URL` de produção, 5432 contra 6543, e decidir o
   `max` do cliente à luz do teto de 15 sessões.
3. Decidir, com o André, o que fazer com o service worker: ligar com escopo e
   política de cache definidos, ou remover o registro e assumir que não há PWA
   offline. O estado atual, registrado mas bloqueado, é o pior dos três, porque
   promete no código o que não entrega.
4. Fazer a sincronização caber na janela, ou tirá-la da função serverless. Sem
   isso, o dado do monitor continuará parcial a cada execução.
5. Recuperar, enquanto houver retenção, a linha `cron.monitor_sync.sucesso` ou
   `.falha` no painel da Vercel (aba Logs, 19/08 entre 09:00 e 09:20 UTC). O
   plano Hobby não tem Log Drains, então esse registro só existe lá.
6. Não há credencial do SP Águas em `F:\Credenciais\`. Criar o arquivo do projeto,
   no formato do cofre, para não repetir a situação de o responsável não
   conseguir entrar no próprio sistema.

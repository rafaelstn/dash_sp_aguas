# Registro de entregas em produção

Cada subida de versão no servidor do órgão deixa uma linha aqui, com data, versão,
quem autorizou, o que foi conferido e o que deu errado. Existe por dois motivos.

O primeiro é operacional: quando algo quebrar, a primeira pergunta é "o que mudou
e quando", e ela precisa de resposta escrita, não de memória.

O segundo é de coerência. O item **IN-05** do relatório de pendências pede ao órgão
que defina o canal oficial de transporte de versão, **quem tem acesso a ele e como
se registra cada passagem**, e diz que sem isso "cada publicação vira procedimento
improvisado". Enquanto o canal não estiver definido, ao menos o registro existe do
nosso lado, para não cobrarmos do órgão o que nós mesmos não fazemos.

**O canal continua pendente.** Este arquivo não o substitui: ele registra as
passagens feitas pelo caminho disponível hoje (SSH com VPN, imagem por arquivo).

---

## 23/09/2026, `sha-e452f11`

| Campo | Valor |
|---|---|
| Versão que entrou | `sha-e452f11` (branch `chore/preparar-container-prodesp-offline`) |
| Versão anterior | `sha-90655b9` |
| Autorizado por | Rafael Damasceno, nesta data ("se tiver algo pra subir pro servidor pode subir") |
| Executado por | Matheus (DamaTech), via SSH com VPN |
| Transporte | imagem por arquivo, 235.305.435 bytes, `scp` (dashboard e migrate) |
| Integridade | `sha256` conferido nas duas pontas: `800a7dcc8fc6982d89910adeb09e0859620e540468542d25191abc02213e7e16` |

**Por que esta subida existiu.** Para desfazer o bloqueio deixado em 22/09: o
`migrate` no servidor abortava na 0057 e qualquer `up -d` derrubava o site. O
conteúdo da aplicação é o mesmo de `sha-90655b9` mais a guarda da migration, a
régua nova no CI e a documentação do incidente.

**O que entrou.** A guarda por catálogo na 0057, que só recria
`uq_estoque_unidades_codigo_spaguas` se a marca da 0060
(`idx_estoque_unidades_codigo_spaguas`) não estiver no catálogo; dois passos no
job de integração do CI, que semeiam o estado real de produção entre a aplicação
do zero e a reaplicação e conferem o resultado; e o registro do incidente nos
dois runbooks. **Nenhuma migration nova**: seguem 73.

**Só o postgis não viajou, e isso foi medido antes.** O pacote levou apenas as
duas imagens que o `IMAGEM_TAG` nomeia, porque `postgis/postgis:16-3.4-alpine`
já estava no servidor com o `db` rodando sobre ela. Conferido antes do
empacotamento, não presumido.

**O que foi conferido no servidor (todas as saídas vistas).**

| Conferência | Medido |
|---|---|
| `sha256` nas duas pontas | idêntico |
| `docker load` | as duas imagens com a tag do commit, exit 0 |
| Guarda de catálogo dentro da imagem de `migrate` | presente na 0057 carregada no servidor |
| Dump antes da migração | 2.529.868 bytes, 44 `TABLE DATA` (16/09: 2.085.051 e 43) |
| Guarda de parada do dump | passou; o roteiro só trocou a tag depois dela |
| `migrate` | código de saída **0**, 73 migrations distintas no log, **zero** `ERROR:` |
| `app` | `Up (healthy)` com `spaguas/dashboard:sha-e452f11`, `RestartCount=0` |
| `/api/health` | `{"status":"ok","db":"ok"}` |
| Pela borda | **200** com `--resolve`, e sem `-k`: `ssl_verify_result=0` |
| Banco | 41 tabelas, PostGIS 3.4.3 |
| Índice transitório da 0057 | **ausente**, como a 0060 manda |
| Substituto da 0060 | `idx_estoque_unidades_codigo_spaguas` presente |
| Dado que a migration errada matava | 521 linhas com `SPA26`, intactas |
| Portas publicadas | só `127.0.0.1:3000`; o `db` sem porta no host |

**Duas coisas feitas diferente de 22/09, de propósito.**

1. **Nenhum `sudo` no roteiro.** A sessão é `root`, então o vetor que gravou a
   senha dentro do dump em 22/09 deixou de existir em vez de ser contornado.
2. **O roteiro reverte sozinho.** A parte que troca o `IMAGEM_TAG` guarda o
   `.env` anterior e, se o `migrate` sair com código diferente de zero, restaura
   o arquivo e sobe o `app` com a tag antiga por `up -d --no-deps app`. O dano de
   22/09 não foi a migration falhar: foi o site esperar em 502.

**Pendências que esta subida não resolveu.**

- **Rotação da senha do sudo do servidor**, aberta desde 22/09. Decisão do
  Rafael com o órgão.
- **Retenção de imagem:** são **11** tags de `spaguas/dashboard` no servidor,
  contra a política de 3. **Não podei**, por dois motivos medidos: o disco tem
  18 GB livres (33% de uso), e sem internet no servidor uma imagem apagada só
  volta por transporte novo. Critério para quando o disco pressionar: manter as
  três mais novas mais `sha-5ff93c7`, que é o piso de rollback, e apagar as sete
  anteriores a ele.
- **Backup ainda mora no mesmo disco da VM.** Segue como está descrito na seção
  10.8 do runbook de entrega, que depende da infraestrutura do órgão.
- **Nenhum job do CI roda `docker build`**, então o Dockerfile só é exercitado à
  mão, na bancada.

---

## 22/09/2026, `sha-90655b9`

| Campo | Valor |
|---|---|
| Versão que entrou | `sha-90655b9` (branch `chore/preparar-container-prodesp-offline`) |
| Versão anterior | `sha-7c8c04a` |
| Autorizado por | Rafael Damasceno, nesta data |
| Executado por | Matheus (DamaTech), via SSH com VPN |
| Transporte | imagem por arquivo, 242.256.021 bytes, `scp` (dashboard, migrate, carga-estoque e postgis) |
| Integridade | `sha256` conferido nas duas pontas: `29e4cb3581427e7e3c55d027805b396b19fca07d37185d0f8e0a9e9490df1d51` |

**O que entrou.** A fusão do Monitor dentro de Postos (mapa, filtros e vazão na
mesma tela), o fechamento da CVE crítica do Next e da crítica do libheif (`sharp`
para 0.35.4), os achados de acessibilidade da tela de Postos com régua de
renderização no Vitest, o otimizador de imagem desligado na imagem do órgão, e o
CI alinhado ao Node 24 da imagem. **Nenhuma migration nova**: as 73 são idênticas
às de `sha-7c8c04a`.

**Dois erros nesta subida, e o segundo derrubou o serviço.**

**1. O dump de antes da migração gravou a senha do sudo, em vez do banco.** No
roteiro, o `pg_dump` ia por pipe para um `tee` com `sudo`, e a função que injeta
a senha no `sudo` por `stdin` fez o `tee` herdar o `echo` da senha em vez da
saída do `pg_dump`. O arquivo saiu com **12 bytes** e os códigos do pipe foram
`255 0`. Consequências e o que foi feito:

- O arquivo foi destruído no servidor com `shred -u -n 3` na mesma sessão.
- **Não havia dump válido daquele momento.** Os backups legítimos de 16/09
  continuam no servidor e foram o que restou como ponto de retorno.
- **O roteiro seguiu mesmo com o código 255.** Faltava guarda de parada: dump que
  falha tem de abortar antes de trocar o `IMAGEM_TAG`. Está registrado como
  pendência no runbook de entrega.
- **Recomendação ao órgão e ao Rafael: rotacionar a senha do sudo do servidor.**
  O arquivo foi destruído, mas segredo exposto se trata por rotação, não por
  estimativa de quem viu.

**2. O `migrate` abortou na migration 0057 e o site respondeu 502.** O erro exato:

    ERROR: could not create unique index "uq_estoque_unidades_codigo_spaguas"
    DETAIL: Key (codigo_spaguas)=(SPA26) is duplicated.

É o **mesmo defeito do incidente de 10/09/2026**, em outro arquivo: índice único
transitório, criado pela 0057 e derrubado de propósito pela 0060, porque o
invariante da 0057 está errado. `codigo_spaguas` é código de lote e projeto, não
patrimônio por unidade: o banco tem **521 linhas** com `SPA26`, que são o lote da
aba GERAL PENHA e são legítimas desde a 0060. O `IF NOT EXISTS` não protege,
porque na reaplicação o índice está ausente. Como o `app` só sobe depois de o
`migrate` encerrar com sucesso, o site saiu do ar.

**Por que passou em 16/09 e não agora.** Naquela subida as migrations rodaram com
`estoque_unidades` ainda vazia, e a carga do estoque entrou depois. Estado de
partida vazio faz a migration certa e a errada passarem igual.

- **Tempo fora do ar:** não cronometrado.
- **Restauração:** `up -d --no-deps app`, seguro porque o esquema já estava
  completo (41 tabelas medidas depois da falha) e esta entrega não traz migration
  nova. A versão nova ficou no ar: `spaguas/dashboard:sha-90655b9`, app
  `Up (healthy)`, `/api/health` com `{"status":"ok","db":"ok"}` e **200 pela
  borda**.
- **Correção definitiva, feita na bancada no mesmo dia:** a criação do índice na
  0057 passou a ser guardada por catálogo, perguntando pelo índice não-único que
  a 0060 cria no mesmo passo em que derruba este.
- **A guarda que faltava não era régua nova, era a régua existente medindo o
  vazio.** O CI já reaplicava todas as migrations e ficava verde, porque
  reaplicava sobre banco vazio. Entraram dois passos entre a aplicação do zero e
  a reaplicação: `ops/testing/regua-migrations/semear-estado-de-producao.sql`,
  que semeia os dois casos reais e falha se não houver duplicata para medir, e
  `conferir-reaplicacao.sql`, que confere dado preservado, índices transitórios
  ausentes e substitutos presentes, com âncora de presença, e limpa a semeadura.
- **Provado nos dois sentidos contra Postgres real** (`postgis/postgis:16-3.4-alpine`
  descartável): aplicar do zero 0; semear 0 com 1 grupo duplicado em cada tabela,
  conferido por query independente; **mutante** (a 0057 anterior à correção, pelo
  `git show HEAD:`, sobre o mesmo estado) reprovou com exit 3 e a mensagem exata
  de produção; controle com a versão corrigida 0; reaplicar as 73 com o dado
  presente 0; conferência 0 e limpeza devolvendo 0 e 0.
- **Escopo fechado por varredura:** cruzados todos os `DROP INDEX` com todos os
  `CREATE UNIQUE INDEX` das 73 migrations. Só a 0057 estava em aberto. A 0045 já
  tem a guarda desde `5ff93c7`, e o caso da 0073 é deliberado e documentado.

**Pendente desta entrega, e é bloqueante para a próxima.**

- **A imagem de `migrate` corrigida ainda não subiu.** A VPN caiu antes disso.
  Enquanto não subir, o `docker compose up -d` do servidor **quebra**, e nenhum
  deploy sobe pelo caminho normal. O app segue no ar porque tem
  `restart: unless-stopped`, mas o `up -d` que o runbook manda rodar depois de
  reboot falharia.
- Rotação da senha do sudo (acima), decisão do Rafael.
- Guarda de parada no roteiro de subida, entre o dump e a troca de `IMAGEM_TAG`.
- **Retenção de imagem:** 9 versões de `dashboard` no servidor contra a política
  de 3. Ao limpar, o rollback não pode parar antes de `sha-5ff93c7`.
- **Disco do host com cerca de 2,3 GiB livres**, com `docker_data.vhdx` em
  61,3 GiB. Compactar exige administrador.

---

## 16/09/2026, `sha-7c8c04a`

| Campo | Valor |
|---|---|
| Versão que entrou | `sha-7c8c04a` (branch `chore/preparar-container-prodesp-offline`, CI verde no run 35139659247) |
| Versão anterior | `sha-5ff93c7` |
| Autorizado por | Rafael Damasceno, nesta data, repassado pelo Matheus |
| Executado por | Rodrigo (DevOS), via SSH com VPN |
| Transporte | imagem por arquivo, 254.779.338 bytes, `scp` (dashboard, migrate, carga-estoque e postgis) |
| Integridade | `sha256` conferido nas duas pontas: `82d59ceed71e3c8a4e93e1cc13d9807cfaff81ee598663081d910c97cea49358` |
| Janela sem identidade | revisão prevista para `2026-12-01`, **não confirmada com o órgão** |

**O que entrou.** O estoque com etiqueta Code 39 e a carga inicial da planilha,
as migrations 0070 (`f_unaccent` qualificada), 0071 (`estoque_desconformidades`),
0072 (`jsonb` gravado como string) e 0073 (código da unidade único sem distinção
de caixa), a escrita no estoque na janela sem identidade e o bloco do Nginx com os
cabeçalhos de IP.

**Antes de subir.**

- **Ensaio na bancada:**
  - O `migrate` da tag nova rodou duas vezes, com código 0 nas duas.
  - A volta para `sha-5ff93c7` deu código 0.
  - A ida seguinte teve a 0073 com "nada a fazer".
- **Dump de antes da migração:** `/var/backups/spaguas-dmo/antes-de-sha-7c8c04a-20260916T192658Z.dump`.
  - Códigos 0 0 e 43 `TABLE DATA`.
  - Restaurado pelo contorno do `sed` num banco temporário (a origem não tinha a
    0070): 36 tabelas idênticas.
- **`app.env`:** conferido sem imprimir valor.
- **Nginx:** backup e `nginx -t` OK.
  - `client_max_body_size` passou de 25m para 12m.

**Conferido depois de subir.**

- **Serviços:**
  - `migrate` com exit 0: 73 migrations aplicadas, 4 da série 007x e 0 `ERROR`.
  - `app` healthy 15 s depois do `up`.
  - `db` não foi recriado.
- **Esquema:** 41 tabelas e PostGIS 3.4.3.
- **Isolamento e recursos:** portas só em `127.0.0.1:3000`; limites e rotação de
  log aplicados.
- **Pela borda:** 200 com `{"status":"ok","db":"ok"}`.
- **0072, contagens do NOTICE:**
  - `diagramas.elementos` convertidas=1.
  - `cron_heartbeats.payload` convertidas=1998.
  - As outras sete colunas com 0.
  - `mantidas_como_string=0` em todas.
- **0073:**
  - Na subida, recriou o índice sobre `lower(codigo)`.
  - Reaplicada sozinha em seguida: código 0, "nada a fazer", OID 25323 antes e
    depois.
- **Limite por IP:** os três cabeçalhos forjados com IPs diferentes caíram no
  mesmo balde (199, 198, 198, 197).

**Carga do estoque** (runbook `carga-inicial-estoque.md`, seção 10).

- **Dump de antes da carga:** códigos 0 0 e 44 `TABLE DATA`. Restaurado direto
  com `--single-transaction`: 37 tabelas idênticas.

| Execução | Código | Totais | Desconformidades |
|---|---|---|---|
| `--estrito` | 2 | inseridas 933, atualizadas 1, puladas 1372, 27 avisos | novas 27, já registradas 0 |
| reexecução | 0 | inseridas 0, atualizadas 934, puladas 1372 | novas 0, já registradas 27 |

| Aceite | Valor |
|---|---|
| Unidades | 814 (626 com código): PENHA 667 ativo, 26 defeito, 16 descarte; ARARAQUARA 105 |
| Saldos | 119 somando 1.664 |
| Ledger | 916 entradas, 16 baixas |
| Desconformidades | 27 abertas |
| Materiais, locais, categorias | 85, 116, 0 |
| Conciliação | OK, 89 pares |

As mesmas contagens pela API na borda. Planilha e `carga-estoque.env` removidos
do servidor.

**O que deu errado.** O primeiro dump saiu com **0 bytes**, por dois motivos:

- O banco de produção se chama `spaguas_dmo`, e os runbooks diziam `spaguas`.
- O `exec -T` dentro de um heredoc consumiu o resto do script.

O arquivo foi apagado e o dump foi refeito e provado antes de seguir. Os dois
runbooks foram corrigidos. O serviço não saiu do ar por causa disso.

**Rollback disponível:** `sha-5ff93c7` no disco, com a volta ensaiada na bancada.
Não foi necessário.

**Pendente:**

- Arquivos antigos `app.env.bak-crlf` e `db.env.bak-crlf` em `/etc/spaguas-dmo`,
  que contêm segredo. Decidir se saem.
- Tempo de rollback real não medido.
- Uso do módulo em tela pelo órgão não medido.

---

## 10/09/2026 — `sha-5ff93c7`

| Campo | Valor |
|---|---|
| Versão que entrou | `sha-5ff93c7` |
| Versão anterior | `sha-006d33b` |
| Autorizado por | Rafael Damasceno, nesta data |
| Executado por | Matheus (DamaTech), via SSH com VPN |
| Transporte | imagem por arquivo, 236 MiB, `scp` |
| Integridade | `sha256` conferido nas duas pontas: `d60359f259a8145e6f376de2` |

**O que entrou.** As duas correções de código do fluxo de ficha: a aprovação de
triagem deixou de responder `posto_inativo` para posto ativo, e o `aceitar-match`
do inventário ANA deixou de responder 404 para posto existente e de tentar escrever
num cadastro que é somente leitura. Junto, a mensagem de erro na tela deixou de
mostrar o slug `erro_interno`. Antes disso, no mesmo dia, a migration 0069 já havia
removido em produção as nove chaves estrangeiras contra `postos`, restaurando a
gravação de ficha, favorito e foto.

**Incidente durante a subida, e o que se aprende.** A primeira tentativa
(`sha-903ecc4`) derrubou o serviço: o `migrate` abortou ao reaplicar a migration
0045, que recria um índice único de `prefixo` que a 0052 derruba de propósito, e o
banco tem 363 prefixos duplicados legítimos. Como o `app` só sobe depois de o
`migrate` encerrar com sucesso, o site respondeu **502**.

- **Tempo fora do ar:** cerca de três minutos.
- **Restauração:** o app subiu sem a dependência do `migrate`
  (`up -d --no-deps app`), o que era seguro porque o banco já estava com o schema
  completo, inclusive a 0069.
- **Correção definitiva:** commit `5ff93c7`, que guarda a criação do índice por
  catálogo. Provada do zero e na reaplicação com duplicata presente, e validada
  aqui: o `migrate` encerrou com **exit 0** e "[migrate] concluído".
- **Não era defeito desta entrega.** Enquanto estivesse assim, **nenhum** deploy
  subiria pelo caminho normal. O incidente antecipou uma falha que ia acontecer na
  próxima subida, qualquer que fosse.

**Conferido depois de subir** (seção 6.3 do runbook de entrega): `migrate` exit 0;
`app` e `db` healthy; 40 tabelas e PostGIS 3.4.3; o banco não publica porta e o app
publica só em `127.0.0.1`; limites de memória e `read_only` aplicados; e pela borda
`https://dmo.spaguas.sp.gov.br/` respondendo **200** com
`{"status":"ok","db":"ok"}`.

**Rollback disponível:** `sha-006d33b` e outras quatro tags no disco do servidor.
Não foi necessário.

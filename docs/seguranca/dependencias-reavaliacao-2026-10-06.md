# Reavaliação de dependências vulneráveis, 06/10/2026

Medição desta data, no commit `09aace0` da branch
`chore/preparar-container-prodesp-offline`. Substitui, para efeito de decisão, a
foto de `dependencias-aceitas-2026-05-18.md`, que envelheceu: aquele documento
pede recheck por sprint, e a única entrada aceita lá (`postcss < 8.5.10`,
moderate) descreve um `next@15.5.18` que não é mais o do projeto.

Nenhuma decisão foi aplicada aqui. O que este arquivo faz é separar o que alcança
o órgão do que morre na bancada, para a atualização não ser decidida pela cor do
`npm audit`.

## O número e o que ele é

`npm audit --audit-level=moderate` nesta data: **23 vulnerabilidades, 1 crítica,
12 altas, 9 moderadas, 1 baixa**. O veredito sai do `package-lock.json`, que é o
que o CI (`npm ci`) e o Dockerfile instalam. A árvore que existe hoje no disco
desta máquina é pnpm (`node_modules/.pnpm`), então `npm ls` local descreve a
bancada e não a entrega: o lockfile é a fonte, e foi dele que saíram as versões
citadas abaixo.

## A única que importa hoje, e ela não está aceita em lugar nenhum

**`@capacitor/android` 8.4.2, severidade crítica, range vulnerável
`>=8.3.5 <8.4.3`.** Título do aviso: "Capacitor Android and iOS: remote content
can be loaded at the app origin via the internal HTTP proxy path". Em português:
conteúdo remoto consegue ser carregado na origem do aplicativo, que é o nível em
que o WebView confia no que roda.

**Alcance medido hoje: nenhum usuário.** O módulo mobile está especificado como
"PWA, depois APK" (`docs/spec-modulo-mobile.md`, status "aguardando aprovação"),
e não há registro de APK distribuído em `docs/runbooks/registro-de-entregas.md`,
cujas entradas são todas do painel. O pacote também é `devDependency` e não entra
na imagem do painel: o estágio `runner` do Dockerfile parte de imagem nova e
copia apenas `.next/standalone`, `.next/static` e `public` (linhas 163 a 165),
sem `node_modules` do estágio de dependências.

**Por isso o grau é "consertar antes do primeiro APK", não "incidente".** O
conserto é bump de patch: `@capacitor/android` e `@capacitor/cli` para 8.4.3 ou
mais, com `@capacitor/core` na mesma minor. O PR #54 do Dependabot sobe o `core`
para 8.5.0, o que resolveria o conjunto se o `android` e o `cli` subirem com ele.

**Não apliquei o bump nesta sessão, por três razões escritas.** Primeira: a
branch está com entrega offline pendente de deploy no servidor do órgão, e
alterar o lockfile agora muda a imagem que vai subir. Segunda: há cinco PRs do
Dependabot abertos tocando o mesmo arquivo, e um bump isolado meu cria conflito
com eles. Terceira: provar um bump de Capacitor é construir o Android, e esta
máquina não tem a cadeia Android nem Docker. Decisão de dependência se registra;
esta fica para o Rafael, com o comando pronto.

## As doze altas, e por que nenhuma alcança produção

Todas são cadeia de build ou de teste, e o padrão nelas é negação de serviço por
entrada hostil (CPU ou memória), não execução de código:

| Pacote | Vem de | Onde roda |
|---|---|---|
| `braces`, `micromatch`, `fast-glob`, `chokidar` | `tailwindcss@3.4.19` e `eslint-config-next` | build e lint |
| `browserslist` | `@serwist/*` (gerador do service worker) | build |
| `source-map-js`, `postcss-selector-parser` | cadeia do PostCSS | build |
| `js-yaml` | cadeia de ferramenta | build |
| `@xmldom/xmldom` | cadeia do Capacitor CLI | geração do projeto Android |
| `@next/eslint-plugin-next`, `eslint-config-next` | lint | CI |

O `fixAvailable` que o npm oferece para o grupo do Tailwind é
`tailwindcss@4.3.3`, **major**, e para o grupo do ESLint é
`eslint-config-next@14.2.35`, que é **rebaixar** o Next. Os dois caminhos valem
menos que o risco que removem, do mesmo jeito que o documento de maio já
concluiu sobre o `postcss`: ferramenta de build recebe entrada nossa, no runner
do CI, e não entrada de usuário do órgão.

## As moderadas com consequência de produto

- **`exceljs@4.4.0`** depende de `uuid` com bounds check faltando
  (GHSA-w5hq-g745-h8pq). O `fixAvailable` é `exceljs@3.4.0`, ou seja, voltar uma
  major, o que o npm propõe porque não existe 4.x corrigido. O `exceljs` é
  dependência de produção e gera as planilhas que o órgão baixa. O caminho
  vulnerável é `uuid` v3/v5/v6 com `buf` fornecido pelo chamador, que não é o uso
  do `exceljs` aqui. Fica como aceite consciente até a 4.x subir o `uuid`.
- **`mssql@12.7.3`** (cadeia `tedious`, `sprintf-js`), com `fixAvailable`
  apontando `mssql@4.2.0`: rebaixar oito majors no driver que lê o SQL Server do
  órgão está fora de questão. Aceite consciente.
- **`vitest`, `@vitest/mocker`, `@vitest/coverage-v8`**: só teste, e o conserto é
  patch. Entra junto do próximo bump de ferramenta, sem cerimônia.

## Recomendação, em ordem

1. **Antes de gerar o primeiro APK**, subir `@capacitor/android`,
   `@capacitor/cli` e `@capacitor/core` juntos, e provar com build Android de
   verdade. Hoje é o único item com severidade crítica.
2. **Depois do go-live PRODESP**, resolver os cinco PRs do Dependabot em uma
   janela só (#53, #54, #55, #56 e #57), todos patch, com CI verde job por job.
   O mais antigo está aberto desde 10/08/2026.
3. **Reescrever o aceite do `postcss`** do documento de maio, que descreve versão
   que não existe mais no projeto, e acrescentar os aceites de `exceljs` e
   `mssql` com decisor e data.

## O que NÃO foi medido

- **Nada foi executado em container nem em Android**: não há Docker nem cadeia
  Android nesta máquina. A afirmação de que o pacote do Capacitor não entra na
  imagem do painel é leitura do Dockerfile, não inspeção da imagem pronta. O
  comando que a provaria, no servidor ou no runner, é
  `docker run --rm --entrypoint sh <imagem> -c 'ls node_modules/@capacitor 2>&1'`,
  que deve responder que o caminho não existe.
- **Exploração real de nenhuma das 23**: o que foi lido é o aviso do registry e a
  cadeia de dependência, não prova de alcance.
- **O servidor do órgão não foi consultado**: a imagem no ar hoje é `sha-4b93252`
  e pode carregar versões diferentes das deste lockfile.

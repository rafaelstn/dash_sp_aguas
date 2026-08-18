# Ficha Técnica de Postos Hidrológicos — SP Águas - DMO

Dashboard de consulta da rede de postos hidrológicos (pluviométricos, fluviométricos, piezométricos) do programa SP Águas — Governo do Estado de São Paulo.

Este repositório implementa a Fase 1 (MVP) definida em `docs/spec.md` e `docs/architecture.md`.

---

## Controle de acesso

> **O sistema exige autenticação individual.** Nenhuma rota de dado é servida sem sessão válida: o `src/middleware.ts` barra tudo que não esteja na lista de rotas públicas (`/login`, callback e encerramento de sessão, `/api/health` e os artefatos do PWA).

O acesso é governado por três papéis (`src/domain/auth/papel.ts`, espelhando o `CHECK` da coluna `papel` em `usuarios_papeis`, migration 0050):

| Papel | Alcance |
|-------|---------|
| `user` | App de campo (preenche e envia fichas) e consulta |
| `admin` | Tudo de `user`, mais aprovação de triagem, edição de dado oficial e gestão de usuários comuns |
| `super_admin` | Tudo de `admin`, mais criação e edição de Admins e definição de papéis |

Controles complementares em vigor:

- **Login por e-mail e senha** (ADR-0006, que atualiza o magic link do ADR-0004). Sem MFA, por decisão registrada no ADR-0010.
- **Autocadastro público desativado.** Contas são criadas pelo Admin ou Super Admin em `/admin/usuarios`; `/cadastrar` apenas redireciona para `/login`.
- **Allowlist de domínio institucional** server-side (`src/infrastructure/auth/allowlist.ts`).
- **Autorização reforçada no servidor**, nunca só na tela: cada rota de `/api/admin/*` revalida o papel do ator, e a política nega remoção do último Super Admin e auto remoção.
- **Cabeçalhos de segurança** em toda resposta (HSTS de dois anos, CSP com nonce por request montada no middleware, `X-Frame-Options`, COOP e CORP, `Permissions-Policy` restritiva). Ver `next.config.ts`.
- **Trilha de acesso** com identidade individual (`acesso_ficha`), base das obrigações de LGPD.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend / BFF | Next.js 15 (App Router) + TypeScript + Tailwind |
| Banco | PostgreSQL + PostGIS (Supabase no MVP; migração para hospedagem PRODESP / território nacional prevista — ver ADR-0015) |
| Cliente de banco | `postgres.js` (ver ADR-0002) |
| Importador CSV | Python 3.12 + `psycopg[binary]` |
| Worker de indexação | Python 3.12 + `psycopg[binary]` + `unidecode` |

---

## Estrutura de pastas

```
.
├── docs/
│   ├── spec.md                  # Especificação funcional (Camila)
│   ├── architecture.md          # Arquitetura técnica (Bruno)
│   └── adr/                     # Decisões de arquitetura (ADR-0001..0003)
├── data/
│   ├── Postos_PLU_FLU_...csv    # Planilha oficial dos 2.484 postos
│   ├── samples/                 # Fixtures de teste do indexer (PDFs de exemplo)
│   └── README.md                # Origem e atualização dos dados
├── src/
│   ├── app/                     # App Router (UI + API Routes)
│   ├── domain/                  # Entidades e invariantes
│   ├── application/             # Use cases + ports
│   ├── infrastructure/          # Adapters (db, config)
│   ├── components/              # UI reutilizável
│   ├── lib/                     # Helpers (normalize, format)
│   ├── styles/                  # CSS global
│   └── types/                   # DTOs compartilhados
├── ops/
│   ├── importer/                # Script de importação do CSV
│   └── indexer/                 # Worker de indexação do HD de rede
├── supabase/migrations/         # Schema SQL versionado
├── db/                          # auth-compat.sql (shim Supabase) + migrate.sh
├── scripts/                     # db-migrate, dev (bash)
├── startApp.ps1                 # Abre o PWA /app num navegador em viewport mobile (Windows)
├── Dockerfile                   # Imagem do app (Next standalone)
├── docker-compose.yml           # Stack conteinerizada (db + migrate + app + workers)
├── .env.docker.example          # Template de ambiente do compose
└── .github/workflows/ci.yml     # Smoke test (lint/typecheck/py_compile)
```

---

## Modo demo (preview sem banco)

O dashboard possui um modo de demonstração para preview rápido das telas sem depender da conexão com o PostgreSQL do cliente. É útil quando a VPN do setor ainda não está disponível ou para apresentações internas.

**Como ativar:** basta executar `npm run dev` com `DATABASE_URL` ausente ou vazia no `.env.local`. O sistema sobe normalmente e exibe um aviso no topo da tela indicando que os dados são fixtures em memória.

**O que está disponível em modo demo:**

- 12 postos reais copiados do CSV oficial (Fluviometria, Pluviometria, Piezometria) + 2 registros sintéticos para demonstrar a aba de desconformidades cadastrais.
- 10 arquivos indexados cobrindo os três formatos de nome aceitos pelo indexer (`COMPLETO`, `PARCIAL`, `LEGADO`).
- 4 arquivos órfãos/malformados e uma revisão pré-marcada.

**Restrições:**

- Modo demo é bloqueado em `NODE_ENV=production`. Qualquer tentativa resulta em erro explícito no boot.
- Alterações feitas via UI (por exemplo, marcar uma desconformidade como revisada) persistem apenas na memória do processo e são perdidas ao reiniciar o servidor.

Para voltar ao comportamento normal, preencha `DATABASE_URL` em `.env.local` e reinicie.

---

## Setup de desenvolvimento

### 1. Instalar dependências do dashboard

```bash
npm install
```

### 2. Preparar variáveis de ambiente

```bash
cp .env.example .env.local
# editar .env.local
```

`DATABASE_URL` é obrigatório. Duas opções:

- **Supabase (recomendado — POC):** `postgresql://USER:PASS@HOST:6543/postgres?sslmode=require`.
- **PG local via Docker:** subir `docker compose up -d` e usar `postgresql://spaguas:spaguas@localhost:5432/spaguas_dev`.

### 3. Aplicar migrations

```bash
bash scripts/db/db-migrate.sh
```

### 4. Importar a planilha mestra (uma vez)

```bash
cd ops/importer
uv venv && uv pip install -e .       # ou: python -m venv .venv && pip install -e .
cd ../..
python ops/importer/import_csv.py --csv "./data/Postos_PLU_FLU_PIEZO_CIAS_BAT_MUNIC_UGRHI_SUB_OTTO-18-03-26a-csv.csv"
```

Se houver prefixos duplicados na fonte, a importação aborta com código `2` e detalha o problema em `import_log` (ver `ops/importer/README.md`).

### 5. Subir o dashboard

> **Windows: rode de uma letra de unidade, nunca de um caminho UNC.** O `cmd.exe` não aceita `\\servidor\compartilhamento` como diretório atual e silenciosamente troca para a pasta do Windows, então o `eslint` e o `tsc` não acham a própria configuração e falham com erro que não tem nada a ver com o projeto. Se o repositório estiver num compartilhamento de rede, acesse pela unidade mapeada (por exemplo `F:\...`) ou trabalhe de um clone em disco local.

**Linha de comando (qualquer SO):**

```bash
bash scripts/dev.sh
# ou:
npm run dev
```

Abrir http://localhost:3000.

**App móvel (PWA) no desktop:** `startApp.ps1` abre `/app` num Chrome ou Edge configurado como
simulador de celular (viewport mobile, user-agent Android, perfil isolado). Se o Next não estiver
rodando, o script o sobe sozinho. Útil para testar ou demonstrar o app de campo sem dispositivo
físico.

### 6. (Opcional) Rodar o worker de indexação

Apenas em máquina com acesso ao HD de rede:

```bash
cd ops/indexer
uv venv && uv pip install -e .
cd ../..
python ops/indexer/index_fs.py --root "\\\\servidor\\postos"
```

---

## Execução conteinerizada (Docker — alvo PRODESP)

O stack completo roda em containers, num PostgreSQL próprio (sem depender do
Supabase managed para os **dados**). É a base da entrega on-prem na hospedagem
PRODESP. A camada de **identidade** (auth) é o ponto de transição: hoje usa
Supabase Auth; no PRODESP será substituída — o shim `db/auth-compat.sql` é o
ponto único a trocar. Detalhes e plano de migração em
[`docs/adr/0015-conteinerizacao-prodesp.md`](./docs/adr/0015-conteinerizacao-prodesp.md).

> O setup atual da Vercel/Supabase continua funcionando sem alterações — a
> conteinerização é aditiva (o `output: standalone` só é ativado quando
> `DOCKER_BUILD=1`).

```bash
# 1. Preparar ambiente (segredos — não versionar)
cp .env.docker.example .env.docker
# editar .env.docker: definir POSTGRES_PASSWORD (obrigatório) e demais valores

# 2. Subir o stack (db -> migrate -> app), com .env.docker carregado
docker compose --env-file .env.docker up -d --build
# dashboard em http://localhost:3000  (healthcheck: /api/health)

# 3. Workers batch (sob demanda — profile "ops")
docker compose --env-file .env.docker --profile ops run --rm importer        # carga do CSV
docker compose --env-file .env.docker --profile ops run --rm indexer --dry-run
```

Serviços do compose:

| Serviço | Imagem / build | Papel |
|---------|----------------|-------|
| `db` | `postgis/postgis:16-3.4-alpine` | PostgreSQL + PostGIS (PostGIS já é usado — ADR-0013) |
| `migrate` | `postgres:16-alpine` | aplica `auth-compat.sql` + migrations e encerra (one-shot) |
| `app` | `Dockerfile` (Next standalone, non-root) | dashboard |
| `importer` | `ops/importer/Dockerfile` | carga do CSV (profile `ops`) |
| `indexer` | `ops/indexer/Dockerfile` | sweep do HD de rede (profile `ops`, mount read-only) |

> **Observabilidade institucional (Grafana/Elasticsearch):** previstos como
> perfil opcional futuro, não incluídos no compose ativo para não subir serviço
> ocioso. Adicionar quando houver consumo real (métricas/busca).

---

## Scripts npm

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Ambiente de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Subir build de produção |
| `npm run lint` | ESLint + jsx-a11y |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Suíte Vitest completa (a integração é pulada sem `TEST_DATABASE_URL`) |
| `npm run test:integration` | Testes contra Postgres real (exige `TEST_DATABASE_URL`) |
| `npm run db:test:up` / `db:test:schema` / `db:test:down` | Sobe, popula e derruba o Postgres de teste local |
| `npm run lock:ci` | Regenera o `package-lock.json` compatível com o npm 10 do CI |

> **Testes de integração.** Provam contra Postgres o que o mock in-memory não
> alcança: atomicidade, idempotência sob concorrência, coluna `GENERATED`, índice
> único parcial. Rodam só quando `TEST_DATABASE_URL` aponta para um banco
> descartável, então nunca tocam produção. Local:
> ```bash
> npm run db:test:up && npm run db:test:schema
> TEST_DATABASE_URL=postgresql://spaguas:teste@localhost:55432/spaguas_test npm run test:integration
> npm run db:test:down
> ```
> No CI, o job `integracao` sobe o banco, aplica o schema **duas vezes** (as
> migrations têm que suportar reexecução, que é como o deploy on-prem roda) e
> executa a suíte.

> **Lockfile e CI.** O CI e o Dockerfile de produção rodam Node 20, ou seja, npm 10.
> Um `npm install` feito em Node 22+ (npm 11) grava um lock que o npm 10 recusa
> (`npm ci` falha com `Missing: @emnapi/... from lock file`), e a quebra só aparece
> no CI. Depois de alterar dependência, rodar `npm run lock:ci` e commitar o lock.

---

## Convenções

- **Clean Architecture:** `domain` -> `application` -> `infrastructure`. UI e API Routes consomem use cases, nunca o banco direto.
- **Acessibilidade:** WCAG 2.1 AA / e-MAG desde o primeiro componente. Skip link, foco visível, semântica, leitor de tela.
- **Tom:** formal (pt-BR) em toda UI e docs voltados ao cliente.
- **Autenticação obrigatória:** a trilha `acesso_ficha` registra `usuario_id`, IP, user_agent e prefixo. Registros com `usuario_id` nulo são anteriores à entrada do login (ADR-0004).
- **Secrets:** `.env.local` gitignored. Nunca commitar.

---

## Documentos de referência

- [`docs/spec.md`](./docs/spec.md) — especificação funcional (Camila)
- [`docs/architecture.md`](./docs/architecture.md) — arquitetura técnica (Bruno)
- [`docs/adr/0001-stack-inicial.md`](./docs/adr/0001-stack-inicial.md) — stack e portabilidade de banco
- [`docs/adr/0002-db-client-postgres-js.md`](./docs/adr/0002-db-client-postgres-js.md) — cliente de banco sem ORM
- [`docs/adr/0003-modulo-desconformidade.md`](./docs/adr/0003-modulo-desconformidade.md) — detecção sem correção automática
- [`docs/adr/0015-conteinerizacao-prodesp.md`](./docs/adr/0015-conteinerizacao-prodesp.md) — conteinerização e migração para PRODESP
- [`data/README.md`](./data/README.md) — origem e atualização dos dados brutos

---

## Governança e licença

Projeto alinhado às diretrizes da SP Águas (LGPD — Lei 13.709/2018, Decreto nº
10.046/2019, IN SGD/ME nº 1/2019) e a padrões abertos (REST, JSON, GeoJSON, CSV).

- [`LICENSE`](./LICENSE) — Apache License 2.0
- [`SECURITY.md`](./.github/SECURITY.md) — reporte de vulnerabilidades (divulgação coordenada)
- [`CODE_OF_CONDUCT.md`](./.github/CODE_OF_CONDUCT.md) — código de conduta
- [`CONTRIBUTING.md`](./.github/CONTRIBUTING.md) — guia de contribuição

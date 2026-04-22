# Ficha Técnica de Postos Hidrológicos — SPÁguas

Dashboard de consulta da rede de postos hidrológicos (pluviométricos, fluviométricos, piezométricos) do programa SPÁguas — Governo do Estado de São Paulo.

Este repositório implementa a Fase 1 (MVP) definida em `spec.md` e `architecture.md`.

---

## Pré-condição obrigatória de deploy

> **Durante o MVP, o sistema deve rodar exclusivamente em rede interna do setor, sem exposição à internet pública.** A autenticação individual de usuários foi deliberadamente adiada para a Fase 2 (ver `spec.md` §1.2 e `architecture.md` §5.6), e a proteção do ambiente depende da topologia de rede. Qualquer operação de deploy deve verificar essa pré-condição antes de expor o serviço.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend / BFF | Next.js 15 (App Router) + TypeScript + Tailwind |
| Banco | PostgreSQL (Supabase no MVP, migração para provedor em território nacional prevista) |
| Cliente de banco | `postgres.js` (ver ADR-0002) |
| Importador CSV | Python 3.12 + `psycopg[binary]` |
| Worker de indexação | Python 3.12 + `psycopg[binary]` + `unidecode` |

---

## Estrutura de pastas

```
.
├── spec.md                      # Especificação funcional (Camila)
├── architecture.md              # Arquitetura técnica (Bruno)
├── docs/adr/                    # Decisões de arquitetura
├── src/
│   ├── app/                     # App Router (UI + API Routes)
│   ├── domain/                  # Entidades e invariantes
│   ├── application/             # Use cases + ports
│   ├── infrastructure/          # Adapters (db, config)
│   ├── components/              # UI reutilizável
│   └── lib/                     # Helpers (normalize, format)
├── ops/
│   ├── importer/                # Script de importação do CSV
│   └── indexer/                 # Worker de indexação do HD de rede
├── supabase/migrations/         # Schema SQL versionado
├── scripts/                     # db-migrate, dev
├── docker-compose.yml           # PG local opcional
└── .github/workflows/ci.yml
```

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
bash scripts/db-migrate.sh
```

### 4. Importar a planilha mestra (uma vez)

```bash
cd ops/importer
uv venv && uv pip install -e .       # ou: python -m venv .venv && pip install -e .
cd ../..
python ops/importer/import_csv.py --csv "./Postos_PLU_FLU_PIEZO_CIAS_BAT_MUNIC_UGRHI_SUB_OTTO-18-03-26a-csv.csv"
```

Se houver prefixos duplicados na fonte, a importação aborta com código `2` e detalha o problema em `import_log` (ver `ops/importer/README.md`).

### 5. Subir o dashboard

```bash
bash scripts/dev.sh
# ou, direto:
npm run dev
```

Abrir http://localhost:3000.

### 6. (Opcional) Rodar o worker de indexação

Apenas em máquina com acesso ao HD de rede:

```bash
cd ops/indexer
uv venv && uv pip install -e .
cd ../..
python ops/indexer/index_fs.py --root "\\\\servidor\\postos"
```

---

## Scripts npm

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Ambiente de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Subir build de produção |
| `npm run lint` | ESLint + jsx-a11y |
| `npm run typecheck` | `tsc --noEmit` |

---

## Convenções

- **Clean Architecture:** `domain` -> `application` -> `infrastructure`. UI e API Routes consomem use cases, nunca o banco direto.
- **Acessibilidade:** WCAG 2.1 AA / e-MAG desde o primeiro componente. Skip link, foco visível, semântica, leitor de tela.
- **Tom:** formal (pt-BR) em toda UI e docs voltados ao cliente.
- **Sem autenticação no MVP:** a trilha `acesso_ficha` registra IP, user_agent e prefixo; `usuario_id` fica nulo.
- **Secrets:** `.env.local` gitignored. Nunca commitar.

---

## Documentos de referência

- [`spec.md`](./spec.md) — especificação funcional
- [`architecture.md`](./architecture.md) — arquitetura técnica
- [`docs/adr/0001-stack-inicial.md`](./docs/adr/0001-stack-inicial.md)
- [`docs/adr/0002-db-client-postgres-js.md`](./docs/adr/0002-db-client-postgres-js.md)

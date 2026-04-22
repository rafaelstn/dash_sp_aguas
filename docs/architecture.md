# Arquitetura Técnica — Sistema de Ficha Técnica de Postos Hidrológicos SPÁguas

| Campo | Valor |
|-------|-------|
| Cliente | SPÁguas — Governo do Estado de São Paulo |
| Responsável pela arquitetura | Bruno — PO Engenharia (Damasceno Dev OS) |
| Versão | 1.2 — MVP (Fase 1) |
| Data | 2026-04-22 |
| Status | Rascunho — atualizado com documentação oficial do cliente (22/04/2026) |
| Especificação de referência | `./spec.md` (Camila) — v1.2 |
| ADRs relacionadas | `./adr/0001-stack-inicial.md`, `./adr/0002-db-client-postgres-js.md`, `./adr/0003-modulo-desconformidade.md` |

---

## 1. Objetivo

Definir a arquitetura técnica da Fase 1 (MVP) do sistema, aderente à especificação funcional da Camila e às restrições do cliente (governo — LGPD, e-MAG/WCAG 2.1 AA, tom formal). A arquitetura é desenhada para:

1. Permitir entrega rápida do MVP sobre infraestrutura temporária (Supabase).
2. **Comportar migração futura do banco** para provedor em território nacional sem reescrita da aplicação.
3. **Comportar evolução para Fase 2** (geração de ficha técnica persistida, ficha de inspeção, *upload* de arquivos) sem reestruturação.
4. Garantir acessibilidade WCAG 2.1 AA desde a concepção — não como correção posterior.
5. Proteger o repositório físico de arquivos do governo (somente-leitura pelo *worker*).

---

## 2. Diagrama de Componentes

### 2.1 Visão geral

```
                          Navegador (técnico SPÁguas)
                                     │
                                     │ HTTPS
                                     ▼
┌────────────────────────────────────────────────────────────┐
│   Next.js — Dashboard SPÁguas                              │
│   ───────────────────────────────────────                  │
│   • Server Components (renderização padrão)                │
│   • Client Components pontuais (busca, cópia de caminho)   │
│   • API Routes (BFF) — única fronteira com o banco         │
│   • Middleware de auditoria LGPD (auth = Fase 2)           │
└─────────────────────┬──────────────────────────────────────┘
                      │ Data Access Layer (abstraída)
                      │ — trocável sem refactor da UI
                      ▼
┌────────────────────────────────────────────────────────────┐
│   PostgreSQL (Supabase — POC; futuramente território BR)  │
│   ───────────────────────────────────────                  │
│   • postos                                                 │
│   • tipos_dado             (seed: 5 valores)               │
│   • tipos_documento        (seed: 7 valores)               │
│   • arquivos_indexados     (agora com metadados derivados) │
│   • arquivos_orfaos        (c/ categoria e tipo_dado)      │
│   • v_postos_desconformes  (view: classifica por regex)    │
│   • revisoes_desconformidade (curadoria c/ IP no MVP)      │
│   • acesso_ficha    (auditoria LGPD, append-only)          │
│   • import_log      (rastreio de importações)              │
│   • indexacao_log   (rastreio de varreduras do worker)     │
│   • índices de FTS pt-BR (unaccent + pg_trgm)              │
└─────────▲──────────────────────────────────────▲───────────┘
          │                                      │
          │ service_role (escrita)               │ anon/authenticated (leitura via RLS)
          │                                      │
┌─────────┴──────────┐                  ┌────────┴────────────────────────┐
│ Script de importação│                  │ Next.js API Routes (server-only)│
│ do CSV (Python)     │                  │                                 │
│ — one-shot          │                  └─────────────────────────────────┘
└────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ Worker de Indexação (Python, standalone)                   │
│ ───────────────────────────────────────                    │
│ • Executa em máquina autorizada da rede do governo         │
│ • Varre HD de rede em modo somente-leitura                 │
│ • Extrai prefixo por regex e grava em `arquivos_indexados` │
│ • Agendável (cron/Task Scheduler) ou sob demanda           │
└────────────────────────────────────────────────────────────┘
                      │
                      │ SMB / UNC (read-only)
                      ▼
              HD de Rede do Governo (PDFs)
```

### 2.2 Responsabilidade de cada componente

| Componente | Responsabilidade | Linguagem | Hospedagem |
|------------|------------------|-----------|------------|
| Dashboard Next.js | Interface do usuário, Server Components, API Routes (BFF) | TypeScript | Vercel (POC) / território nacional (prod) |
| PostgreSQL | Persistência de postos, arquivos indexados, auditoria | SQL | Supabase (POC) / território nacional (prod) |
| Script de importação CSV | Carga única da planilha mestra na base | Python 3.12 | Execução local controlada |
| *Worker* de indexação | Varredura recorrente do HD de rede; extração de prefixo; gravação em `arquivos_indexados` | Python 3.12 | Máquina autorizada da rede do governo |

### 2.3 Restrições de comunicação

- Navegador **nunca** se comunica diretamente com o PostgreSQL; toda consulta passa por API Route do Next.js.
- Chave `service_role` do Supabase **nunca** é enviada ao navegador; reside apenas em variáveis de ambiente do servidor e do *worker*.
- *Worker* de indexação **não** fala com o dashboard; comunica-se somente com o banco.
- Dashboard **não** acessa o HD de rede; só lê a tabela `arquivos_indexados`.

---

## 3. Arquitetura em Camadas (Clean Architecture)

Aplicada ao Next.js (TypeScript) e ao código Python (script e *worker*) com adaptações próprias de cada ecossistema.

### 3.1 Next.js — estrutura de pastas

```
src/
├── app/                          # App Router — UI
│   ├── (dashboard)/
│   │   ├── page.tsx              # Busca (home)
│   │   ├── postos/[prefixo]/
│   │   │   └── page.tsx          # Ficha do posto
│   │   └── layout.tsx
│   ├── api/
│   │   ├── postos/
│   │   │   ├── search/route.ts   # GET /api/postos/search
│   │   │   └── [prefixo]/
│   │   │       ├── route.ts      # GET /api/postos/:prefixo
│   │   │       └── arquivos/route.ts
│   │   └── health/route.ts
│   └── layout.tsx                # Layout raiz + providers de acessibilidade
├── domain/                       # Entidades e regras puras
│   ├── posto.ts                  # Tipo Posto + invariantes
│   ├── arquivo-indexado.ts
│   ├── acesso-ficha.ts
│   └── errors.ts                 # Erros de domínio tipados
├── application/                  # Casos de uso + contratos de repositório
│   ├── use-cases/
│   │   ├── buscar-postos.ts
│   │   ├── obter-ficha.ts
│   │   └── listar-arquivos.ts
│   └── ports/                    # Interfaces (hexagonal)
│       ├── postos-repository.ts
│       ├── arquivos-repository.ts
│       └── auditoria-repository.ts
├── infrastructure/               # Implementações concretas
│   ├── db/
│   │   ├── client.ts             # Pool/cliente PG (server-only)
│   │   ├── postos-repository.pg.ts
│   │   ├── arquivos-repository.pg.ts
│   │   └── auditoria-repository.pg.ts
│   └── config/
│       └── env.ts                # Validação de env com zod
├── components/                   # UI reutilizável
│   ├── ui/                       # Button, Input, Card (WCAG-ready)
│   ├── features/
│   │   ├── busca/
│   │   ├── ficha/
│   │   └── arquivos/
│   └── a11y/                     # SkipLink, LiveRegion, FocusTrap
├── lib/
│   ├── a11y.ts                   # Helpers de acessibilidade
│   ├── normalize.ts              # remover acento, lowercase
│   └── format.ts                 # formatar “não informado”, datas, tamanhos
├── hooks/
├── types/
│   └── dto.ts                    # DTOs expostos pela API
└── styles/
```

### 3.2 Python — *worker* e script de importação

```
ops/
├── importer/                     # Script one-shot de importação do CSV
│   ├── src/
│   │   ├── domain/               # Dataclasses Posto (espelho do domínio)
│   │   ├── application/
│   │   │   └── import_csv.py     # Caso de uso (parse + idempotência)
│   │   ├── infrastructure/
│   │   │   ├── csv_reader.py
│   │   │   └── pg_writer.py      # Upsert via psycopg/supabase-py
│   │   └── main.py               # CLI
│   ├── pyproject.toml
│   └── README.md
└── indexer/                      # Worker de indexação
    ├── src/
    │   ├── domain/
    │   │   └── arquivo.py
    │   ├── application/
    │   │   ├── extract_prefix.py
    │   │   └── index_directory.py
    │   ├── infrastructure/
    │   │   ├── fs_scanner.py     # Leitura read-only do HD de rede
    │   │   └── pg_writer.py
    │   └── main.py               # CLI (modo total ou incremental)
    ├── pyproject.toml
    └── README.md
```

Ambos compartilham a regra de dependência: **domain → application → infrastructure**. Domínio permanece puro, sem import de bibliotecas externas.

### 3.3 Regra de dependência

```
UI / CLI         ──► Application (Use Cases)
Application      ──► Domain (Entidades, Invariantes)
Infrastructure   ──► Application (via Ports)
```

Nenhuma camada de domínio importa Next.js, React, psycopg, Supabase SDK ou qualquer framework.

---

## 4. Abstração da Camada de Dados (Ports & Adapters)

Objetivo: permitir substituir o Supabase por outro PostgreSQL (Neon, RDS, instância dedicada em território nacional) sem tocar em UI, casos de uso ou domínio.

### 4.1 Contratos (TypeScript)

```ts
// src/application/ports/postos-repository.ts
export interface PostosRepository {
  buscarPorPrefixo(prefixo: string): Promise<Posto | null>;
  pesquisar(params: {
    termo?: string;
    prefixoComecaCom?: string;
    pagina: number;
    porPagina: number;
  }): Promise<{ total: number; itens: Posto[] }>;
}

// src/application/ports/arquivos-repository.ts
export interface ArquivosRepository {
  listarPorPrefixo(prefixo: string): Promise<ArquivoIndexado[]>;
  foiIndexadoAlgumaVez(prefixo: string): Promise<boolean>;
}

// src/application/ports/auditoria-repository.ts
export interface AuditoriaRepository {
  registrarAcesso(evento: AcessoFicha): Promise<void>;
}
```

### 4.2 Adapters

- `PostosRepositoryPg` — implementação PostgreSQL, acessada via cliente SQL. **Decisão tomada:** `postgres.js` (ADR-0002) — driver enxuto, sem ORM, parametrização nativa e tipagem explícita. Preferido em vez de `pg + drizzle-orm` pelo volume pequeno do *schema* e pela rejeição a ORM como dependência estrutural em projeto de governo.
- Uso **deliberado** do cliente SQL em vez do SDK supabase-js no servidor, para não acoplar a lógica à API proprietária do Supabase. A migração para outro PG passa a ser apenas troca de `DATABASE_URL`.
- **Sem** cliente supabase-js no MVP (autenticação está fora de escopo). Se a Fase 2 optar por Supabase Auth, o uso ficará **isolado** em `infrastructure/auth/` a ser criado na ocasião; casos de uso permanecem desconhecendo a biblioteca.

### 4.3 Consequência

Para migrar o banco:
1. Provisionar novo PostgreSQL em território nacional.
2. Rodar *dump*/restore do Supabase → novo banco.
3. Atualizar `DATABASE_URL`.
4. **Nenhuma** alteração em `domain/`, `application/` ou `components/`.

---

## 4bis. Módulo de Desconformidade (novo — ADR-0003)

Componente transversal introduzido a partir da documentação oficial do cliente (22/04/2026). Detecta e apresenta desconformidades cadastrais e de arquivo, sem aplicar correções automáticas. Ver ADR-0003 para a decisão e alternativas rejeitadas.

### 4bis.1 Componentes por camada

| Camada | Arquivo | Responsabilidade |
|--------|---------|------------------|
| Domain | `src/domain/tipo-dado.ts` | Enum dos 5 tipos de dado + regex do prefixo |
| Domain | `src/domain/tipo-documento.ts` | Enum dos 7 tipos de documento |
| Domain | `src/domain/desconformidade.ts` | *Value objects* (`DesconformidadePrefixo`, `DesconformidadePrefixoAna`, `ArquivoDesconforme`) |
| Domain | `src/domain/revisao-desconformidade.ts` | Entidade `RevisaoDesconformidade` |
| Application | `src/application/ports/desconformidades-repository.ts` | Contrato de leitura das 4 categorias |
| Application | `src/application/ports/revisoes-repository.ts` | Contrato de gravação de revisões |
| Application | `src/application/use-cases/listar-desconformidades.ts` | Caso de uso por categoria |
| Application | `src/application/use-cases/marcar-revisao-desconformidade.ts` | Caso de uso de transição de estado |
| Application | `src/application/use-cases/listar-arquivos-agrupados.ts` | Agrupa por tipo de documento (US-010) |
| Infrastructure | `src/infrastructure/db/desconformidades-repository.pg.ts` | Leitura da *view* `v_postos_desconformes` e de `arquivos_orfaos` |
| Infrastructure | `src/infrastructure/db/revisoes-repository.pg.ts` | `INSERT`/`UPDATE` em `revisoes_desconformidade` |
| API | `src/app/api/desconformidades/[categoria]/route.ts` | `GET` da categoria, `POST` em `/revisoes` |
| UI | `src/app/(dashboard)/desconformidades/` | Rota com 4 abas controladas (WAI-ARIA) |
| UI | `src/components/features/desconformidades/*` | Componentes por aba e linha |

### 4bis.2 Fluxo de revisão (MVP, sem auth)

1. Técnico abre `/desconformidades`, vê 4 abas com contagem e *badge*.
2. Escolhe aba; cada linha traz problema + sugestão textual.
3. Clica *Marcar como revisado* → `POST /api/desconformidades/revisoes` com `tipoEntidade`, `idEntidade`, `nota` (opcional).
4. API grava `revisoes_desconformidade` com `usuario_id = NULL`, `ip` extraído de `x-forwarded-for`/`x-real-ip`, `revisado_em = NOW()`.
5. UI atualiza o status da linha via *optimistic update* + revalidação do *route segment*.

### 4bis.3 Fluxo de classificação (indexer → 3 *buckets*)

Ver §8 (reescrita). Resumo:
- Pasta raiz → `tipo_dado` determinístico.
- Nome do arquivo → regex oficial → `prefixo`, `cod_doc`, `cod_enc`, `opcional`, `data`.
- Prefixo capturado → *lookup* em `postos` (coluna conforme tipo_dado).
- Destino: `arquivos_indexados` (match total), `arquivos_orfaos` com `categoria = 'PREFIXO_DESCONHECIDO'` (parse OK, sem match cadastral), ou `arquivos_orfaos` com `categoria = 'NOME_FORA_DO_PADRAO'` (parse falhou).

---

## 5. *Schema* SQL Inicial

O *schema* é versionado como migrations em `ops/db/migrations/`. Todas as migrations são idempotentes e reversíveis.

### 5.1 Extensões

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- pgvector NÃO é necessário no MVP; previsto para Fase 3 (busca semântica eventual).
```

### 5.2 Tabela `postos`

```sql
CREATE TABLE postos (
  id                        UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  prefixo                   VARCHAR(32)  NOT NULL UNIQUE,
  mantenedor                TEXT         NULL,
  prefixo_ana               VARCHAR(64)  NULL,
  nome_estacao              TEXT         NULL,
  operacao_inicio_ano       INTEGER      NULL,
  operacao_fim_ano          INTEGER      NULL,
  latitude                  NUMERIC(10,7) NULL,
  longitude                 NUMERIC(10,7) NULL,
  municipio                 TEXT         NULL,
  municipio_alt             TEXT         NULL,
  bacia_hidrografica        TEXT         NULL,
  ugrhi_nome                TEXT         NULL,
  ugrhi_numero              VARCHAR(16)  NULL,
  sub_ugrhi_nome            TEXT         NULL,
  sub_ugrhi_numero          VARCHAR(16)  NULL,
  rede                      TEXT         NULL,
  proprietario              TEXT         NULL,
  tipo_posto                VARCHAR(32)  NULL,
  area_km2                  NUMERIC(12,3) NULL,
  btl                       TEXT         NULL,
  cia_ambiental             TEXT         NULL,
  cobacia                   TEXT         NULL,
  observacoes               TEXT         NULL,
  tempo_transmissao         TEXT         NULL,
  status_pcd                TEXT         NULL,
  ultima_transmissao        TEXT         NULL,    -- texto livre na planilha
  convencional              TEXT         NULL,
  logger_eqp                TEXT         NULL,
  telemetrico               TEXT         NULL,
  nivel                     TEXT         NULL,
  vazao                     TEXT         NULL,
  ficha_inspecao            TEXT         NULL,
  ultima_data_fi            TEXT         NULL,    -- texto livre na planilha
  ficha_descritiva          TEXT         NULL,
  ultima_atualizacao_fd     TEXT         NULL,    -- texto livre na planilha
  aquifero                  TEXT         NULL,
  altimetria                NUMERIC(10,3) NULL,

  -- auditoria
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- coluna gerada para FTS em pt-BR sem acento
  busca_tsv                 TSVECTOR
    GENERATED ALWAYS AS (
      to_tsvector(
        'portuguese',
        unaccent(coalesce(prefixo,'') || ' ' ||
                 coalesce(nome_estacao,'') || ' ' ||
                 coalesce(municipio,'') || ' ' ||
                 coalesce(municipio_alt,'') || ' ' ||
                 coalesce(bacia_hidrografica,'') || ' ' ||
                 coalesce(ugrhi_nome,'') || ' ' ||
                 coalesce(sub_ugrhi_nome,'') || ' ' ||
                 coalesce(proprietario,'') || ' ' ||
                 coalesce(mantenedor,''))
      )
    ) STORED,

  CONSTRAINT chk_postos_anos
    CHECK (operacao_fim_ano IS NULL
           OR operacao_inicio_ano IS NULL
           OR operacao_fim_ano >= operacao_inicio_ano)
);

CREATE INDEX idx_postos_prefixo_trgm
  ON postos USING gin (prefixo gin_trgm_ops);

CREATE INDEX idx_postos_busca_tsv
  ON postos USING gin (busca_tsv);

CREATE INDEX idx_postos_municipio_trgm
  ON postos USING gin (unaccent(lower(municipio)) gin_trgm_ops);

CREATE INDEX idx_postos_tipo
  ON postos (tipo_posto);
```

Campos originalmente datados na planilha (`ultima_transmissao`, `ultima_data_fi`, `ultima_atualizacao_fd`) são persistidos como `TEXT` porque a planilha apresenta valores heterogêneos e parciais. Conversão para `DATE`/`TIMESTAMPTZ` fica para etapa de curadoria posterior (Fase 2).

### 5.3 Tabela `arquivos_indexados`

Estrutura base definida na v1.1 e ampliada na v1.2 com metadados derivados do *parsing* do nome do arquivo (ADR-0003, US-010). Alterações materializadas na migration `0010_arquivos_indexados_metadados.sql`.

```sql
-- Estrutura consolidada (v1.2). A migration real é ALTER TABLE sobre a tabela da v1.1.
CREATE TABLE arquivos_indexados (
  id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  prefixo              VARCHAR(32)  NOT NULL,
  nome_arquivo         TEXT         NOT NULL,
  caminho_absoluto     TEXT         NOT NULL,
  tamanho_bytes        BIGINT       NOT NULL,
  data_modificacao     TIMESTAMPTZ  NOT NULL,
  hash_conteudo        VARCHAR(64)  NULL,
  indexado_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  lote_indexacao       UUID         NOT NULL,                -- agrupa execução do worker

  -- adições v1.2 (documentação oficial do cliente)
  tipo_dado            VARCHAR(32)  NOT NULL,                -- FK tipos_dado(codigo)
  cod_tipo_documento   SMALLINT     NULL,                    -- FK tipos_documento(codigo)
  cod_encarregado      VARCHAR(8)   NULL,
  data_documento       DATE         NULL,
  parte_opcional       TEXT         NULL,
  nome_valido          BOOLEAN      NOT NULL DEFAULT true,

  CONSTRAINT uq_arquivo UNIQUE (caminho_absoluto),
  CONSTRAINT fk_arquivos_tipo_dado
    FOREIGN KEY (tipo_dado) REFERENCES tipos_dado (codigo) ON DELETE RESTRICT,
  CONSTRAINT fk_arquivos_tipo_documento
    FOREIGN KEY (cod_tipo_documento) REFERENCES tipos_documento (codigo) ON DELETE RESTRICT
);

CREATE INDEX idx_arquivos_prefixo          ON arquivos_indexados (prefixo);
CREATE INDEX idx_arquivos_lote             ON arquivos_indexados (lote_indexacao);
CREATE INDEX idx_arquivos_data_mod         ON arquivos_indexados (data_modificacao DESC);
CREATE INDEX idx_arquivos_tipo_dado        ON arquivos_indexados (tipo_dado);
CREATE INDEX idx_arquivos_tipo_doc         ON arquivos_indexados (cod_tipo_documento);
CREATE INDEX idx_arquivos_prefixo_tipo_doc ON arquivos_indexados (prefixo, cod_tipo_documento, data_documento DESC);
```

Observação: **não** há FK de `arquivos_indexados.prefixo` → `postos.prefixo`. Motivo: o *worker* é reconstrutivo e pode ser executado contra base temporariamente sem o posto cadastrado; a relação é validada pelo próprio *worker* antes do `INSERT`. FKs são aplicadas apenas para `tipo_dado` e `cod_tipo_documento`, que são enums imutáveis no MVP (seed nas migrations 0008/0009). Arquivos cujo nome parsou mas o prefixo não existe em `postos` vão para `arquivos_orfaos` com `categoria = 'PREFIXO_DESCONHECIDO'` (ver 5.3.1).

### 5.3.1 Tabela `arquivos_orfaos`

Arquivos encontrados no HD de rede que não foram para `arquivos_indexados`. A v1.2 adiciona as colunas `categoria` (classificação operacional) e `tipo_dado` (quando detectável pela pasta raiz). A coluna `motivo` da v1.1 é mantida por compatibilidade (texto livre).

```sql
-- Estrutura consolidada (v1.2). A migration real é ALTER TABLE sobre a tabela da v1.1.
CREATE TABLE arquivos_orfaos (
  id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_arquivo         TEXT         NOT NULL,
  caminho_absoluto     TEXT         NOT NULL,
  tamanho_bytes        BIGINT       NOT NULL,
  data_modificacao     TIMESTAMPTZ  NOT NULL,
  indexado_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  lote_indexacao       UUID         NOT NULL,
  motivo               TEXT         NOT NULL DEFAULT 'prefixo_nao_identificado',

  -- adições v1.2
  categoria            VARCHAR(32)  NOT NULL DEFAULT 'PREFIXO_DESCONHECIDO',
  tipo_dado            VARCHAR(32)  NULL,     -- FK tipos_dado(codigo), nullable quando indetectável

  CONSTRAINT uq_arquivo_orfao UNIQUE (caminho_absoluto),
  CONSTRAINT chk_orfao_categoria
    CHECK (categoria IN ('PREFIXO_DESCONHECIDO', 'NOME_FORA_DO_PADRAO', 'EXTENSAO_NAO_PDF')),
  CONSTRAINT fk_orfao_tipo_dado
    FOREIGN KEY (tipo_dado) REFERENCES tipos_dado (codigo) ON DELETE RESTRICT
);

CREATE INDEX idx_orfaos_lote       ON arquivos_orfaos (lote_indexacao);
CREATE INDEX idx_orfaos_indexado   ON arquivos_orfaos (indexado_em DESC);
CREATE INDEX idx_orfaos_categoria  ON arquivos_orfaos (categoria);
CREATE INDEX idx_orfaos_tipo_dado  ON arquivos_orfaos (tipo_dado);
```

### 5.3.2 Tabelas `tipos_dado` e `tipos_documento` (seeds imutáveis)

Criadas nas migrations `0008_tipos_documento.sql` e `0009_tipos_dado.sql`. Seed parte da documentação oficial do cliente (22/04/2026).

```sql
CREATE TABLE tipos_documento (
  codigo SMALLINT PRIMARY KEY,                -- 01..07
  rotulo TEXT    NOT NULL UNIQUE
);

-- seed:
-- 01 Ficha Descritiva
-- 02 PCD
-- 03 Inspeção
-- 04 Nivelamento
-- 05 Levantamento de Seção
-- 06 Troca de Observador
-- 07 Vazão

CREATE TABLE tipos_dado (
  codigo        VARCHAR(32) PRIMARY KEY,      -- 'Fluviometria', 'FluviometriaANA', ...
  rotulo        TEXT        NOT NULL UNIQUE,
  regex_prefixo TEXT        NOT NULL,
  usa_prefixo_ana BOOLEAN   NOT NULL DEFAULT false
);

-- seed:
-- Fluviometria              | Fluviometria             | ^[0-9][A-Z]-[0-9]{3}$     | false
-- FluviometriaANA           | Fluviometria — ANA       | ^[0-9]{8}$                | true
-- FluviometriaQualiAgua     | Fluviometria — QualiÁgua | ^[0-9][A-Z]-[0-9]{3}$     | false
-- Piezometria               | Piezometria              | ^[0-9][A-Z]-[0-9]{3}[A-Z]$| false
-- Pluviometria              | Pluviometria             | ^[A-Z][0-9]-[0-9]{3}$     | false
-- QualiAgua                 | QualiÁgua                | ^[A-Z]{4}[0-9]{4,5}$      | false
```

### 5.3.3 View `v_postos_desconformes`

Calcula desconformidades de prefixo principal e ANA por regex, sem materialização (volume 2484 justifica cálculo em tempo real).

```sql
-- Migration 0012
CREATE OR REPLACE VIEW v_postos_desconformes AS
WITH classificacao AS (
  SELECT
    p.id,
    p.prefixo,
    p.prefixo_ana,
    CASE
      WHEN p.prefixo ~ '^[0-9][A-Z]-[0-9]{3}$'      THEN 'conforme_fluviometria'
      WHEN p.prefixo ~ '^[A-Z][0-9]-[0-9]{3}$'      THEN 'conforme_pluviometria'
      WHEN p.prefixo ~ '^[0-9][A-Z]-[0-9]{3}[A-Z]$' THEN 'conforme_piezometria'
      WHEN p.prefixo ~ '^[A-Z][0-9]-[0-9]{3}[A-Z]$' THEN 'suspeita_troca_letra_digito'
      WHEN p.prefixo ~ '^[A-Z]{3}[0-9]{3}\?$'       THEN 'placeholder_interrogacao'
      ELSE                                                'outlier_prefixo'
    END AS classe_prefixo,
    CASE
      WHEN p.prefixo_ana IS NULL OR p.prefixo_ana = '' THEN 'vazio'
      WHEN p.prefixo_ana ~ '^[0-9]{8}$'                 THEN 'conforme'
      WHEN p.prefixo_ana ~ '^[0-9]{7}$'                 THEN 'faltando_zero_esquerda'
      ELSE                                                   'outlier_ana'
    END AS classe_prefixo_ana
  FROM postos p
)
SELECT
  id,
  prefixo,
  prefixo_ana,
  classe_prefixo,
  classe_prefixo_ana,
  CASE classe_prefixo
    WHEN 'suspeita_troca_letra_digito' THEN
      'Verificar inversão de posição entre letra e dígito iniciais. Exemplo de correção: "B6-007A" poderia ser "6B-007A".'
    WHEN 'placeholder_interrogacao' THEN
      'Placeholder sem cadastro definitivo — confirmar numeração com a equipe SPÁguas.'
    WHEN 'outlier_prefixo' THEN
      'Prefixo fora de qualquer padrão oficial. Revisar cadastro na planilha-fonte.'
    ELSE NULL
  END AS sugestao_prefixo,
  CASE classe_prefixo_ana
    WHEN 'faltando_zero_esquerda' THEN
      'Preencher com zero à esquerda até atingir 8 dígitos (ex.: "' || prefixo_ana || '" -> "' || LPAD(prefixo_ana, 8, '0') || '").'
    WHEN 'outlier_ana' THEN
      'Código ANA fora do padrão oficial de 8 dígitos. Revisar cadastro na planilha-fonte.'
    ELSE NULL
  END AS sugestao_prefixo_ana
FROM classificacao
WHERE classe_prefixo NOT LIKE 'conforme_%'
   OR classe_prefixo_ana IN ('faltando_zero_esquerda', 'outlier_ana');
```

### 5.3.4 Tabela `revisoes_desconformidade`

Registra curadoria operacional sobre postos e arquivos desconformes. `UPDATE` permitido em `status` e `nota` no MVP (ausência de auth). Fase 2 aplica *trigger* bloqueante.

```sql
-- Migration 0013
CREATE TABLE revisoes_desconformidade (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo_entidade  VARCHAR(16)  NOT NULL,   -- 'posto' | 'arquivo'
  id_entidade    TEXT         NOT NULL,   -- prefixo do posto OU caminho do arquivo
  categoria      VARCHAR(32)  NOT NULL,   -- 'PREFIXO_PRINCIPAL', 'PREFIXO_ANA', 'ARQUIVO_ORFAO', 'ARQUIVO_MALFORMADO'
  status         VARCHAR(16)  NOT NULL DEFAULT 'pendente',
  nota           TEXT         NULL,
  ip             TEXT         NULL,
  revisado_em    TIMESTAMPTZ  NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_revisao_tipo
    CHECK (tipo_entidade IN ('posto','arquivo')),
  CONSTRAINT chk_revisao_status
    CHECK (status IN ('pendente','revisado')),
  CONSTRAINT chk_revisao_categoria
    CHECK (categoria IN ('PREFIXO_PRINCIPAL','PREFIXO_ANA','ARQUIVO_ORFAO','ARQUIVO_MALFORMADO')),
  CONSTRAINT uq_revisao UNIQUE (tipo_entidade, id_entidade, categoria)
);

CREATE INDEX idx_revisoes_status      ON revisoes_desconformidade (status);
CREATE INDEX idx_revisoes_categoria   ON revisoes_desconformidade (categoria);
```

### 5.4 Tabela `acesso_ficha` (auditoria LGPD, *append-only*)

```sql
CREATE TABLE acesso_ficha (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id        TEXT         NULL,           -- nullable no MVP (auth = Fase 2)
  prefixo           VARCHAR(32)  NOT NULL,
  acao              VARCHAR(32)  NOT NULL,       -- 'visualizou_ficha' | 'listou_arquivos'
  ip                TEXT         NULL,           -- IP do requester
  user_agent        TEXT         NULL,
  ocorreu_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_acesso_acao
    CHECK (acao IN ('visualizou_ficha', 'listou_arquivos'))
);

CREATE INDEX idx_acesso_usuario     ON acesso_ficha (usuario_id, ocorreu_em DESC);
CREATE INDEX idx_acesso_prefixo     ON acesso_ficha (prefixo, ocorreu_em DESC);
CREATE INDEX idx_acesso_ocorreu_em  ON acesso_ficha (ocorreu_em DESC);

REVOKE UPDATE, DELETE ON acesso_ficha FROM PUBLIC;
-- A aplicação usa um ROLE sem UPDATE/DELETE nesta tabela (append-only).
```

**Nota:** `usuario_id` fica nullable durante o MVP porque autenticação entra apenas na Fase 2. A coluna já está prevista no *schema* para evitar migração destrutiva quando a auth for introduzida.

### 5.5 Tabela `import_log`

Registra cada execução do script de importação para rastreabilidade e idempotência verificável.

```sql
CREATE TABLE import_log (
  id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  arquivo_origem       TEXT         NOT NULL,
  hash_arquivo         VARCHAR(64)  NOT NULL,
  iniciado_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  finalizado_em        TIMESTAMPTZ  NULL,
  linhas_lidas         INTEGER      NULL,
  linhas_inseridas     INTEGER      NULL,
  linhas_atualizadas   INTEGER      NULL,
  linhas_rejeitadas    INTEGER      NULL,
  erros_amostra        JSONB        NULL,
  status               VARCHAR(16)  NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento','ok','erro'))
);
```

### 5.6 *Row Level Security* no Supabase

- **RLS baseada em usuário fica fora do MVP** (autenticação é Fase 2). A proteção do banco no MVP é feita por:
  - Nenhuma chave de banco exposta ao navegador.
  - Dashboard acessa o PG exclusivamente via API Routes do Next.js em ambiente servidor, com `DATABASE_URL` contendo *role* de aplicação.
  - Pré-condição de deploy: sistema em rede interna, sem exposição à internet pública.
- `acesso_ficha`: `INSERT` apenas pela *role* da aplicação; sem `SELECT`/`UPDATE`/`DELETE` para usuário final. Consultas de auditoria ficam a cargo de DBA/administrador.
- A reativação de RLS com base em usuário volta à pauta na Fase 2, sob responsabilidade do André.

---

## 6. Busca — Estratégia

### 6.1 Busca por prefixo
- Correspondência exata via igualdade.
- Correspondência por prefixo parcial via `prefixo ILIKE 'termo%'` + índice `gin_trgm_ops`.

### 6.2 Busca textual
- Utiliza `tsvector` pré-computado (`postos.busca_tsv`) com dicionário `portuguese` e `unaccent`.
- Termo do usuário passa por `unaccent(lower(termo))` antes da consulta.
- Fallback: `ILIKE` sobre `unaccent(municipio)`, `unaccent(nome_estacao)` quando o termo for muito curto para FTS (≤ 2 caracteres).

### 6.3 Paginação
- Padrão: `LIMIT 25 OFFSET (pagina - 1) * 25`.
- Contagem total retornada em separado (não embutida no mesmo SQL da listagem para evitar degradação).

### 6.4 Tempo de resposta
- Meta: 2s no p95 com base de 2.484 registros. Facilmente atendível com os índices propostos; relaxável conforme decisão do Rafael em kickoff.

---

## 7. Importação do CSV — Estratégia

### 7.1 Decisão

Script Python one-shot executado localmente em ambiente controlado, usando `service_role` do Supabase. Razões, em ordem:

1. **Controle total** sobre *parsing* e normalização (acentuação, campos vazios, *trim*).
2. **Idempotência** via `INSERT ... ON CONFLICT (prefixo) DO UPDATE`.
3. **Relatório detalhado** (linhas lidas/rejeitadas/erros) — `supabase db import` não oferece.
4. **Portabilidade**: o mesmo script roda contra qualquer PostgreSQL (Supabase ou provedor nacional).

`supabase db import` e *dashboard* do Supabase ficam como alternativa manual de emergência, não como caminho oficial.

### 7.2 Pseudocódigo

```python
# Passo 1 — varredura prévia para detecção de prefixos duplicados na fonte
linhas = list(csv.DictReader(arquivo, encoding='utf-8'))
duplicados = agrupar_por_prefixo(linhas, tol_prefixos_vazios=False)
if duplicados:
    registrar_em_import_log(status='erro', erros_amostra=duplicados)
    sys.exit(ERR_PREFIXO_DUPLICADO)  # aborta sem gravar nada

# Passo 2 — carga idempotente (agora é seguro aplicar ON CONFLICT DO UPDATE)
for linha in linhas:
    posto = normalizar(linha)              # trim, NULL, tipos
    if not posto.prefixo:
        registrar_rejeicao(linha, motivo='prefixo ausente')
        continue
    try:
        upsert_posto(posto)                # ON CONFLICT (prefixo) DO UPDATE
        contar_sucesso()
    except Exception as e:
        registrar_rejeicao(linha, motivo=str(e))
```

A varredura prévia é intencional: a *ON CONFLICT DO UPDATE* aplicada numa carga com prefixo repetido faria com que o segundo registro sobrescrevesse silenciosamente o primeiro, descartando dado. O *abort* força o operador a tratar a duplicidade antes — que é o comportamento correto para fonte oficial de governo.

### 7.3 Hash do arquivo
- Calculado antes da execução e gravado em `import_log.hash_arquivo` — permite identificar reexecuções sobre arquivo idêntico.

### 7.4 Execução
- Comando: `uv run python -m importer --csv <caminho> --env .env.local`.
- Pré-requisito: migrations aplicadas no banco.
- Ambiente: `service_role` em variável de ambiente, nunca em argumento de linha de comando.

---

## 8. *Worker* de Indexação — Estratégia (v1.2 — atualizada com o padrão oficial do cliente)

### 8.1 Modo de execução
- Processo Python standalone, empacotável como executável Windows (PyInstaller) para facilitar instalação em máquina autorizada da rede do governo.
- Agendado via Task Scheduler do Windows (diário, fora de horário) ou executável sob demanda.

### 8.2 Fluxo (reescrito na v1.2)

1. Gera `lote_indexacao` (UUID) para a execução.
2. Carrega da base:
   - Conjunto de `postos.prefixo` (2484 registros).
   - Dicionário de `postos.prefixo_ana → postos.prefixo`, com a chave normalizada por `LPAD(prefixo_ana, 8, '0')` (para aceitar os 435 casos de 7 dígitos).
3. Para cada **pasta raiz** sob a raiz de varredura (`Fluviometria`, `Fluviometria/ANA`, `Fluviometria/QualiAgua`, `Piezometria`, `Pluviometria`, `QualiAgua`), determina o `tipo_dado` correspondente via tabela `tipos_dado` (carregada da base).
4. Varre cada pasta raiz em modo recursivo, somente-leitura.
5. Para cada PDF:
   - Coleta metadados de sistema de arquivos (`nome`, `caminho_absoluto`, `tamanho`, `mtime`).
   - Aplica a **regex oficial do nome** (ver RN-06.3):
     `^(?P<prefixo>[^ ]+)\s+(?P<cod_doc>\d{2})\s+(?P<cod_enc>\d{2})(?:\s+(?P<opcional>.+?))?\s+(?P<data>\d{4}\s+\d{2}\s+\d{2})\.pdf$`
   - **Se a regex NÃO casa** → `UPSERT` em `arquivos_orfaos` com `categoria = 'NOME_FORA_DO_PADRAO'` e `tipo_dado` da pasta raiz.
   - **Se a regex casa**:
     a. Extrai `prefixo`, `cod_doc`, `cod_enc`, `opcional`, `data` (parseada como `date`).
     b. Valida `prefixo` contra a regex do `tipo_dado` (coluna `regex_prefixo` de `tipos_dado`). Se não bate: `arquivos_orfaos` com `categoria = 'NOME_FORA_DO_PADRAO'`.
     c. Valida `cod_doc` contra `tipos_documento.codigo` (`01..07`). Se inválido: `arquivos_orfaos` com `categoria = 'NOME_FORA_DO_PADRAO'`.
     d. Executa *lookup* do prefixo:
        - Para `tipos_dado.usa_prefixo_ana = true` (`FluviometriaANA`): busca em `postos.prefixo_ana` com `LPAD(prefixo_ana, 8, '0') = LPAD(prefixo_capturado, 8, '0')`. Retorna o `postos.prefixo` correspondente.
        - Para os demais: busca exata em `postos.prefixo`.
        - Se não encontra: `arquivos_orfaos` com `categoria = 'PREFIXO_DESCONHECIDO'` e `tipo_dado` populado.
        - Se encontra: `UPSERT` em `arquivos_indexados` com `prefixo` (do `postos`), `tipo_dado`, `cod_tipo_documento`, `cod_encarregado`, `data_documento`, `parte_opcional`, `nome_valido = true`.
6. Reconstrução por raiz de varredura (idem v1.1): `DELETE FROM arquivos_indexados/arquivos_orfaos WHERE lote_indexacao <> :lote AND caminho_absoluto LIKE :raiz%`.
7. Grava relatório em `indexacao_log`.

### 8.3 Regex oficial — decisão arquitetural

- A regex é **constante de domínio** do *worker* Python. Não há equivalente no SQL, porque o *parsing* do nome ocorre fora do banco.
- Para **validação da classificação atual dos postos** (US-009), o SQL usa as regex simples de `v_postos_desconformes`. São dois universos de regex distintos — o de nome de arquivo vive no Python, o de classificação de prefixo cadastral vive no SQL.
- A regex oficial de nome tolera um bloco **opcional** entre `cod_enc` e a data. Isso é exigido pela documentação do cliente (campo `[Opcional]`). O grupo é lazy (`.+?`) para que a data final seja corretamente destacada.

### 8.4 Segurança
- *Worker* usa *role* de banco com permissão:
  - **Leitura**: `postos.prefixo`, `postos.prefixo_ana`, `tipos_dado`, `tipos_documento`.
  - **Escrita**: `arquivos_indexados`, `arquivos_orfaos`, `indexacao_log`.
- Acesso ao HD de rede via credencial da máquina hospedeira; nenhuma credencial de rede é armazenada no binário.

---

## 9. Acessibilidade (WCAG 2.1 AA / e-MAG) — Arquitetura

Acessibilidade é tratada como **requisito de arquitetura**, não enfeite de fim de linha.

### 9.1 Decisões estruturais
- **Server Components por padrão** (Next.js App Router). Cliente apenas quando há interatividade que exige (estado local de busca, cópia de caminho). Reduz JavaScript enviado, melhora tempo de resposta e é mais previsível para leitores de tela.
- **HTML semântico obrigatório**: `<main>`, `<nav>`, `<header>`, `<article>`, `<section>` com hierarquia de *headings* coerente.
- **Skip link** no topo de cada página (`src/components/a11y/SkipLink`).
- **LiveRegion** global para anúncio de mudanças de estado (busca concluída, erro, paginação).
- **Design tokens** com contraste mínimo 4.5:1 auditado automaticamente no *pipeline* de CI.
- **Formulários** com `<label>` associado e mensagens de erro ligadas via `aria-describedby`.
- **Foco visível** obrigatório em todo elemento interativo (override do `:focus-visible` do Tailwind).
- **Idioma** declarado em `<html lang="pt-BR">`.

### 9.2 Testes automatizados
- `eslint-plugin-jsx-a11y` no *lint*.
- `axe-core` em testes de integração (Thiago).
- Validação manual por teclado e com leitor de tela (NVDA/VoiceOver) antes de cada *release* — responsabilidade da Fernanda.

### 9.3 Responsabilidades
- **Fernanda (Frontend)**: implementação de componentes, semântica, foco, contraste.
- **Thiago (QA)**: validação por teclado, axe-core, regressão de acessibilidade.
- **André (Segurança)**: revisão final de conformidade e-MAG antes da entrega ao cliente.

---

## 10. Segurança e LGPD — Arquitetura

| Tema | Decisão |
|------|---------|
| Segredos | `.env.local` gitignored; `DATABASE_URL` com *role* de aplicação apenas em servidor; chaves de serviço apenas em *worker* e script de importação. |
| CORS | Restritivo em produção; *origin* do dashboard explicitamente listado. |
| SQL Injection | Queries parametrizadas obrigatórias; proibido `string interpolation` em SQL. |
| XSS | Saída via React (escape automático); nenhuma utilização de `dangerouslySetInnerHTML`. |
| Auditoria | Toda visualização de ficha e listagem de arquivos gera registro em `acesso_ficha`, com `usuario_id` nullable no MVP. |
| Retenção | Política a definir (pergunta em aberto na spec). |
| *Rate limiting* | Middleware no Next.js — valores definidos pelo André antes do *deploy*. |
| Territorialidade | Supabase é POC; migração para PG nacional prevista (ADR 0001). |
| **Exposição à rede** | **MVP roda exclusivamente em rede interna.** Sem auth, qualquer exposição à internet pública é proibida. Pré-condição de deploy documentada no runbook. |

---

## 11. Observabilidade (mínima no MVP)

| Item | Ferramenta sugerida | Responsável |
|------|--------------------|-------------|
| *Logs* estruturados do dashboard | `pino` (Node) | Lucas |
| *Logs* estruturados do *worker* | `structlog` (Python) | Lucas |
| Trilha de importações | Tabela `import_log` | Bruno |
| Métricas básicas | Logs + *health check* `/api/health` | Rodrigo |
| Erro em produção | Sem APM no MVP; avaliar Sentry na Fase 2 | Rodrigo |

---

## 12. Estratégia de Deploy (resumo — detalhes com Rodrigo)

| Ambiente | Dashboard | Banco | *Worker* |
|----------|-----------|-------|----------|
| Dev local | `next dev` | Supabase POC | Execução manual |
| Homologação | Vercel (branch) | Supabase POC | Máquina de teste |
| Produção (pós-aprovação) | A definir — território nacional | A definir — território nacional | Máquina autorizada da rede do governo |

Dockerfile do *worker* e do script de importação obrigatórios; Dashboard em Next.js pode ser *containerizado* ou *serverless*, decisão do Rodrigo conforme ambiente final.

---

## 13. Patterns Aplicados

| Pattern | Onde | Motivo |
|---------|------|--------|
| Clean Architecture | Todo o projeto | Padrão da org; isola domínio de infraestrutura |
| Repository | Acesso a `postos`, `arquivos_indexados`, `acesso_ficha` | Permite trocar provedor de banco sem tocar em lógica |
| Use Case | `buscar-postos`, `obter-ficha`, `listar-arquivos` | Unidades testáveis, independentes de *framework* |
| BFF (Next.js API Routes) | Fronteira única navegador ↔ banco | Evita exposição de chaves e centraliza auditoria |
| *Generated column* (PostgreSQL) | `busca_tsv` | Mantém FTS consistente sem *trigger* |
| *Append-only table* | `acesso_ficha` | Garantia estrutural de imutabilidade da trilha LGPD |

---

## 14. Não fazer

1. Conectar o navegador diretamente ao Supabase com a biblioteca `supabase-js`. Toda consulta passa pela API Route.
2. Acoplar casos de uso ao SDK supabase-js. Sempre pela interface `Repository`.
3. Embutir chaves de serviço no *build* do Next.js (`NEXT_PUBLIC_*` com `service_role` é bug grave — André bloqueia no CI).
4. Usar `FLOAT` para latitude/longitude ou valores numéricos sensíveis — `NUMERIC` sempre.
5. Gravar arquivos no HD de rede pelo *worker*. Leitura exclusivamente.
6. Deixar acessibilidade para revisão final — tem que nascer na estrutura.
7. Abrir ou servir PDFs pelo dashboard no MVP — fora de escopo.

---

## 15. Próximos Passos (ao aprovar)

1. Lucas: *scaffold* do projeto Next.js, migrations iniciais, *repositories*, script de importação e *worker* base.
2. Fernanda: sistema de *design tokens* com contraste auditado, componentes base, telas de busca e ficha.
3. Rodrigo: `.env.example` completo, Dockerfile do *worker*, GitHub Actions com lint/test/a11y-check.
4. Thiago: plano de testes de aceitação a partir das US-001 a US-007.
5. André: revisão de *threat model*, política de RLS no Supabase, conformidade e-MAG.
6. Marina: README operacional, runbook de importação e indexação, CHANGELOG.

Arquitetura aguardando aprovação do Rafael antes da execução das próximas etapas.

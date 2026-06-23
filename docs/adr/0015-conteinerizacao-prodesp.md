# ADR-0015, Conteinerização (Docker Compose) e caminho para hospedagem PRODESP

| Campo | Valor |
|-------|-------|
| Status | Aceito |
| Data | 2026-06-23 |
| Decisor | Rafael Damasceno (proprietário) |
| Escopo | Infra (Docker Compose), build do app, banco self-host, workers, identidade |

---

## 1. Contexto

O sistema roda hoje em **Vercel + Supabase managed** (Postgres + Supabase Auth).
A SP Águas determinou a migração futura para a hospedagem da **PRODESP**, que
opera a infra de governo do Estado, e suas diretrizes de desenvolvimento exigem
compatibilidade com o ecossistema interno (PostgreSQL/PostGIS, Elasticsearch,
Docker, Grafana), padrões abertos, hospedagem em território nacional (LGPD,
Decreto nº 10.046/2019) e licença Apache 2.0.

As credenciais e o ambiente da PRODESP **ainda não foram disponibilizados**.
Durante a transição é preciso continuar operando e ajustando o ambiente atual
(Vercel/Supabase) sem regressão.

Restrição técnica central: as 42 migrations assumem objetos providos pelo
Supabase (schema `auth`, `auth.users`, `auth.uid()`, roles `anon` /
`authenticated` / `service_role`). Num PostgreSQL puro elas falham.

## 2. Decisão

Adotar uma estratégia **dual-target aditiva**: conteinerizar o stack completo
como base da entrega PRODESP, sem alterar o funcionamento atual na Vercel.

1. **Build standalone condicional.** `output: 'standalone'` no `next.config.ts`
   só é ativado quando `DOCKER_BUILD=1`. Na Vercel é ignorado (a plataforma usa
   o próprio adapter), então o deploy atual permanece intacto.

2. **Docker Compose** (`docker-compose.yml`) com:
   - `db`: `postgis/postgis:16-3.4-alpine` — PostGIS já é dependência (ADR-0013).
   - `migrate`: one-shot que aplica o shim de compat + migrations; o `app` só
     sobe após sucesso (`service_completed_successfully`).
   - `app`: imagem multi-stage do Next standalone, usuário sem privilégio,
     healthcheck em `/api/health`.
   - `importer` / `indexer`: workers Python em profile `ops` (batch sob demanda),
     com a raiz varrida montada read-only.

3. **Shim de compatibilidade Supabase** (`db/auth-compat.sql`). Recria o mínimo
   (`auth` schema, `auth.users` stub, `auth.uid()`, roles) para que o schema da
   aplicação suba num Postgres puro. **Não é autenticação** — é a costura que
   torna o on-prem possível sem reescrever as 42 migrations.

4. **Observabilidade institucional** (Grafana/Elasticsearch): previstos como
   perfil opcional futuro, fora do compose ativo enquanto não há consumo real
   (evita serviço ocioso). O app hoje usa busca `tsvector` nativa, não Elastic.

## 3. Pendência explícita — identidade no PRODESP

A camada de **auth** é o único ponto que não migra automaticamente. Hoje usa
Supabase Auth (cloud). No PRODESP, `db/auth-compat.sql` é o ponto único a
substituir por uma das opções:

- **GoTrue self-hosted** (componente de auth do Supabase, isolado), mantendo o
  contrato `auth.users` / `auth.uid()` — menor impacto no código.
- **Auth própria** (tabela de usuários no schema `public` + sessão via cookie
  assinado), exigindo reapontar as FKs e as policies RLS.

A decisão entre as duas será tomada quando a PRODESP definir o que oferece como
serviço gerenciado. Até lá, o ambiente conteinerizado de avaliação roda com o
shim (ou em modo demo, sem banco). Relaciona-se a ADR-0004 e ADR-0006 (auth).

## 4. Consequências

**Positivas**
- Entrega on-prem PRODESP destravada e reproduzível em qualquer máquina.
- Vercel/Supabase seguem operando sem mudança (transição sem janela de parada).
- Segredos fora das imagens (`.dockerignore`), containers non-root, banco
  publicado só em `127.0.0.1` por padrão — hardening alinhado a gov.

**Negativas / a acompanhar**
- Mantém dois caminhos de deploy até a migração concluir (custo de manutenção).
- O shim não substitui auth real; o schema `auth` conteinerizado é stub.
- `NEXT_PUBLIC_*` são embutidos em build: trocar URL/anon key exige rebuild.

## 5. Alternativas descartadas

- **Supabase self-hosted completo** (GoTrue + PostgREST + Kong + Studio): stack
  de muitos containers, desproporcional ao MVP e ao que a PRODESP exigiu agora.
- **Reescrever as 42 migrations** removendo dependência de `auth` antes da
  definição da PRODESP: retrabalho prematuro, decidido junto da identidade.

# ADR 0002 — Cliente de banco: `postgres.js` (sem ORM)

| Campo | Valor |
|-------|-------|
| Status | Aceito |
| Data | 2026-04-22 |
| Autor | Lucas — PO Backend (Damasceno Dev OS) |
| Referência | `../architecture.md` §4 (Abstração da camada de dados) |

---

## Contexto

O `architecture.md` deixou aberta a escolha entre `pg + drizzle-orm` e `postgres.js` para implementação do `PostosRepositoryPg`. A decisão foi empurrada para esta ADR, a ser tomada no início da implementação.

Restrições relevantes:

1. Projeto de governo — estabilidade e auditabilidade pesam mais que produtividade de *feature flags*.
2. *Schema* relativamente pequeno (5 tabelas no MVP).
3. Queries predominantemente de leitura, com uma consulta FTS não-trivial (`tsvector`).
4. Ports & Adapters já isolam o cliente de banco — qualquer driver é trocável.
5. Prioridade em minimizar superfície de dependências (requisito de auditoria de dependências futura pelo André).

## Opções consideradas

### Opção A — `pg` + `drizzle-orm`

**Prós:** *schema* declarativo, *migrations* geradas, tipagem derivada.

**Contras:** ORM extra é dependência estrutural; *schema* pequeno não justifica; `drizzle` ainda apresenta *edge cases* em `tsvector` e *generated columns*; duas bibliotecas (driver + ORM) em vez de uma.

### Opção B — `postgres.js` (escolhida)

**Prós:** driver enxuto, sem ORM; API *tagged template* previne injeção SQL por construção; *connection pooling* nativo; excelente suporte a `array`/`jsonb`/`uuid`; 1 dependência; latência menor em PG serverless (Supabase); leitura de código SQL explícita em *repository* — mais auditável.

**Contras:** sem *schema* declarativo — as tabelas ficam definidas apenas nas *migrations* SQL. Mitigado por tipos TypeScript explícitos em `src/domain/`.

## Decisão

Adotar `postgres.js`. *Schema* fica em `supabase/migrations/` como SQL puro; tipos de domínio em `src/domain/`; *repositories* fazem o mapeamento explícito.

## Consequências

1. Sem geração automática de tipos — os tipos em `src/domain/posto.ts` são a única fonte da verdade no runtime TS, alinhados manualmente com as *migrations*.
2. `DATABASE_URL` é a única variável necessária para troca de provedor — alinhado ao objetivo de portabilidade da ADR-0001.
3. *Migrations* aplicadas via `psql` ou `supabase db push`; sem ferramenta de *migration* JS-side no MVP.
4. Reversível: migrar para Drizzle ou Prisma na Fase 2 afeta apenas `src/infrastructure/db/`, porque os casos de uso só enxergam as *ports*.

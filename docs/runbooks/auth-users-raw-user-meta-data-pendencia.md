# Pendência: `raw_user_meta_data` não existe fora do Supabase

| Campo | Valor |
|-------|-------|
| Owner | Lucas (Backend), com Bruno (Engenharia) na decisão de schema |
| Descoberto em | 2026-08-27, durante o levantamento da ADR 0023 |
| Como apareceu | Leitura integral de `usuarios-identidade-repository.pg.ts`, e não contagem de ocorrências de `auth.users` |
| Severidade | **Alta.** Quebra em tempo de execução, não em build nem em typecheck |
| Status | **Aberta.** Não corrigida nesta data |
| Independe da ADR 0023 | **Sim.** Vale mesmo que a migração para o SQL Server seja cancelada |

---

## 1. O defeito, em uma frase

Duas consultas da aplicação leem `auth.users.raw_user_meta_data`, que é **coluna do
GoTrue, provida pelo Supabase**. O shim que permite rodar fora do Supabase cria
`auth.users` **sem essa coluna**. Logo, **num PostgreSQL auto-hospedado as duas
consultas falham**, e nada no repositório denuncia isso antes da execução.

## 2. Evidência, medida em 2026-08-27

**Quem lê a coluna** (`grep -rn raw_user_meta_data src/`):

```
src/infrastructure/db/usuarios-identidade-repository.pg.ts:24   u.raw_user_meta_data->>'nome' AS nome
src/infrastructure/db/usuarios-admin-repository.supabase.ts:45  u.raw_user_meta_data->>'nome' AS nome,
```

**O que o shim cria** (`db/auth-compat.sql`, linhas 43 a 47):

```sql
CREATE TABLE IF NOT EXISTS auth.users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

**Ocorrências de `raw_user_meta_data` em `db/auth-compat.sql`: zero**
(`grep -c`, medido).

## 3. Por que ninguém viu até agora

Três razões que se somam, e todas continuam valendo para o próximo defeito
parecido:

1. **Em produção não quebra**, porque produção roda no Supabase gerenciado, onde a
   coluna existe. O defeito só existe no caminho conteinerizado da ADR 0015.
2. **Typecheck e lint não têm nada a dizer sobre SQL.** As duas consultas são
   template string; o TypeScript valida o tipo de retorno declarado, que continua
   plausível, e não o schema real.
3. **Contar ocorrências não acha isto.** A varredura por `auth.users` devolve o
   número de referências, e o defeito está em qual **coluna** cada referência usa.
   Foi preciso abrir os arquivos.

## 4. Impacto quando disparar

`usuariosIdentidadeRepository.resolver()` é o resolvedor em lote de nome e e-mail
de ator. Quem depende dele:

- Trilha de eventos de posto (`postos_evento`, quem fez a alteração).
- Exportação do módulo de estoque (identidade do operador em cada movimentação).

O modo de falha é `FalhaRepositorio`, porque o `catch` do repositório embrulha o
erro do driver. Ou seja, **a tela não diz "coluna não existe": ela diz que a
identidade do usuário está indisponível**, o que manda procurar em auth, e não em
schema. O mesmo vale para a listagem de usuários em
`usuarios-admin-repository.supabase.ts`.

## 5. Correção proposta

Não é reescrever consulta: é decidir **onde o nome do usuário mora** quando
`auth.users` deixa de ser do Supabase.

1. Acrescentar coluna própria de nome em `auth.users` no `db/auth-compat.sql`, ou
   passar a gravá-lo em tabela nossa.
2. Trocar `u.raw_user_meta_data->>'nome'` pela coluna nova nos **dois** arquivos.
   Corrigir só um deles reproduz o defeito na outra tela, e foi assim que a
   correção de CSP de 08/08 deixou o painel quebrado depois de consertar o site.
3. **Teste que denuncia:** subir o Postgres do `docker-compose`, aplicar
   `auth-compat.sql` mais as migrations, e exercitar as duas leituras. Um caso que
   só roda contra o Supabase não mede nada aqui, porque é justamente lá que o
   defeito não existe.

## 6. Relação com a ADR 0023

A ADR 0023 decide que `auth.users` passa a receber o identificador de
`Dbfch.dbo.UsuariosIdentity` e deixa de ser gerida pelo Supabase. **A correção
acima precisa entrar no mesmo passo dessa troca**, senão a trilha de eventos e a
exportação de estoque perdem o nome do operador em silêncio, sem erro visível na
esteira.

Mas a pendência **não depende** daquela decisão: o defeito existe hoje, no caminho
conteinerizado que a ADR 0015 já entregou, e sobrevive ao cancelamento da ADR 0023.

# ADR-0005 — Favoritos por usuário

| Campo | Valor |
|-------|-------|
| Status | Aceito — 2026-04-23 |
| Autor | Damasceno Dev OS (Matheus — orquestração; Bruno — design; André — RLS) |
| Contexto | Ficha Técnica de Postos Hidrológicos SPÁguas — Fase 1 |
| Depende de | ADR-0004 (auth Supabase antecipada) |
| Migration | `supabase/migrations/0020_postos_favoritos.sql` |

---

## 1. Contexto

Técnico SPÁguas retorna repetidamente a um subset estável de postos (os postos
sob sua responsabilidade operacional ou em investigação ativa). Hoje, cada acesso
passa por busca/filtro. Isso é fricção desnecessária: **favoritar** permite saltar
direto pra tela do posto e filtrar a busca por "apenas favoritos".

Com autenticação Supabase ativa (ADR-0004), cada favorito é vinculado a um
usuário específico — não há favoritos "globais" ou "do sistema".

## 2. Decisão

Criar tabela dedicada `postos_favoritos (usuario_id, prefixo, created_at)` com:

- **PK composta** `(usuario_id, prefixo)` — unicidade natural, sem surrogate UUID.
- **FK para `auth.users.id`** com `ON DELETE CASCADE` — quando usuário é apagado
  (direito LGPD de exclusão), seus favoritos somem automaticamente.
- **FK para `postos.prefixo`** com `ON UPDATE CASCADE` — proteção defensiva caso
  o fluxo do importer mude prefixo no futuro. Hoje o importer faz UPSERT por
  prefixo (prefixo é chave de conflito, nunca muda), mas a cascade não custa nada
  e cobre evolução.
- **RLS ON** com 3 policies (self_select, self_insert, self_delete) — defesa em
  profundidade. A aplicação já filtra por `usuario_id` no WHERE via use case,
  mas RLS impede vazamento caso PostgREST seja exposto no futuro (hoje não é,
  conforme ADR-0002).
- **2 índices:** `(usuario_id, created_at DESC)` para listagem em `/favoritos`
  e `(prefixo)` para subquery `EXISTS` na busca combinada.

## 3. Alternativas consideradas

| Alternativa | Por que rejeitada |
|-------------|-------------------|
| Coluna JSONB `favoritos` em `auth.users.raw_user_meta_data` | Update parcial de JSON é propenso a race condition; não permite JOIN/índice relacional; sobrecarrega metadata que Supabase reescreve em outros fluxos. |
| Tabela `postos_favoritos` com `id UUID` surrogate | Redundante — a PK composta já é única e mais leve. |
| FK para `postos(id)` (UUID) em vez de `postos(prefixo)` | Quebra consistência com o resto do código que usa `prefixo` como identificador lógico em `arquivos_indexados`, `acesso_ficha`, `revisoes_desconformidade`. Aumenta JOIN cost sem ganho. |
| Sem RLS (confiar só no WHERE da aplicação) | Mais fácil, mas tira camada defensiva. Se amanhã PostgREST for ligado, favoritos de A vazam pra B. Custo de RLS zero. |
| Favoritos compartilhados (ex.: "favoritos do setor") | Fora de escopo no MVP. Se surgir, cria tabela `postos_favoritos_setor` separada. |

## 4. Consequências

### 4.1 Positivas
- Acesso rápido a subset estável → redução de tempo-até-informação no dia-a-dia.
- `/favoritos` fica como página autônoma; `?apenas_favoritos=1` na busca geral.
- Modelo encaixa em `Ports & Adapters` — nova porta `FavoritosRepository`,
  use cases `alternarFavorito` e `listarFavoritos` sem contaminar domínio.

### 4.2 Negativas / trade-offs
- Mais uma migration (0020).
- Mais 3 rotas de API (`GET /api/favoritos`, `POST /api/favoritos/:prefixo`,
  `DELETE /api/favoritos/:prefixo`).
- Contador de favoritos do usuário na home exige 1 query extra.

### 4.3 Operacional
- Sem rate limiting explícito — UPSERT com ON CONFLICT DO NOTHING é idempotente,
  não há risco de flood destrutivo (PK composta bloqueia duplicata).
- Backup: já incluído no backup do Supabase. Tabela pequena (< 100 linhas × 50
  usuários esperado).

## 5. Como rolar back

Se o MVP for desativado:
1. `DROP TABLE postos_favoritos;` — CASCADE apaga FKs automaticamente.
2. Remover use cases e porta de `application/`.
3. Remover componentes `<BotaoFavoritar>` e rota `/favoritos`.

Sem dado perdido fora da própria tabela (não há replicação em outra).

## 6. Status de execução

- [x] Migration 0020 escrita
- [x] Migration aplicada no pooler Supabase
- [ ] `domain/favorito.ts` + port `FavoritosRepository`
- [ ] Use cases `alternar-favorito`, `listar-favoritos`
- [ ] `favoritos-repository.pg.ts` (+ mock pra demo)
- [ ] API routes `/api/favoritos/*`
- [ ] UI `<BotaoFavoritar>` + página `/favoritos`
- [ ] Teste de regressão (Thiago)

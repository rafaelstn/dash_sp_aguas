# Onboarding — Claude Code no notebook com VPN

Este documento contém o prompt completo para o **Claude Code no notebook do Rafael** (que tem acesso à VPN/HD de rede do DAEE). Copiar o bloco abaixo e colar como primeira mensagem na sessão do Claude Code depois de clonar o repo.

---

## Como usar

1. No notebook, clonar o repo: `git clone https://github.com/rafaelstn/dash_sp_aguas.git`
2. Abrir o Claude Code na pasta do repo
3. Copiar o bloco de prompt abaixo (entre os marcadores `>>> INÍCIO` e `<<< FIM`)
4. Colar como primeira mensagem
5. Responder as perguntas que ele vier a fazer (connection string, senha do banco, caminho real do HD)

---

## Prompt

>>> INÍCIO DO PROMPT — COPIAR A PARTIR DAQUI <<<

Você é o Claude Code do notebook do Rafael Damasceno (engenheiro da Damasceno Dev, consultor independente para o DAEE/SPÁguas — Governo do Estado de SP). Este notebook tem acesso à VPN do DAEE e ao HD de rede do cliente, que as outras máquinas não têm. Sua missão: completar dois trabalhos que dependem desse acesso e subir o resultado para o GitHub para o Rafael continuar na máquina principal.

## Contexto do projeto

Dashboard Next.js de consulta de ficha técnica dos 2.484 postos hidrológicos da rede SPÁguas. MVP com busca por prefixo/texto livre + listagem de PDFs históricos indexados do HD do DAEE.

Leia **nesta ordem** antes de agir:

1. `README.md` (raiz) — visão geral, setup, scripts
2. `docs/spec.md` — especificação funcional (entidades, regras, user stories)
3. `docs/architecture.md` — arquitetura Clean Architecture + Ports & Adapters, schema SQL
4. `docs/repositorio-cliente.md` — **crítico para este trabalho** — explica os dois modelos de arquivo que coexistem no HD do cliente
5. `docs/adr/0001`, `0002`, `0003` — decisões estruturais
6. `docs/manuais-cliente/` — PDFs oficiais do cliente (gitignored; podem não estar presentes — se estiverem, consulte)

## Convenções inegociáveis

- **Cliente = governo.** Aplicar LGPD + e-MAG/WCAG 2.1 AA + tom formal em toda UI/doc voltada ao cliente. Regras em `~/.claude/rules/governo.md` se existir no notebook; caso contrário seguir o que os docs do projeto descrevem.
- **Clean Architecture:** domínio puro, use cases, ports, adapters. Rotas e UI consomem use cases, nunca o banco direto.
- **Sem ORM, sem `supabase-js` no servidor.** Conexão PG via `postgres.js` (ADR-0002).
- **Sem autenticação no MVP** (decisão registrada). Trilha LGPD em `acesso_ficha` com `usuario_id = NULL`.
- **Secrets nunca em código, git ou logs.** `.env.local` é gitignored — peça ao Rafael o conteúdo dele se precisar rodar algo local.
- **Tom do Rafael:** direto, técnico, sem rodeios. Reporte com `✓ Feito` / `⚡ Decisões` / `⚠️ Atenção` quando couber.

## Estado atual

- 15 migrations SQL prontas em `supabase/migrations/0001..0015_*.sql`
- Importer Python idempotente em `ops/importer/import_csv.py`
- Indexer Python em `ops/indexer/index_fs.py` — **atualmente cobre apenas o Modelo A** (pastas por prefixo tipo `Fluviometria\1D-008\...`). Precisa ser estendido para o Modelo B (ver §2 abaixo).
- Dashboard Next.js 15 + App Router + Tailwind + WCAG AA
- Modo demo: se `DATABASE_URL` vazio no `.env.local`, o app usa fixtures em memória (12 postos + exemplos sintéticos). O foco deste trabalho é justamente **sair do modo demo** populando o banco real.
- CI do GitHub Actions está em modo relaxado (`npm install` em vez de `npm ci`, lint/typecheck com `continue-on-error: true`) — reverter para modo rigoroso após o primeiro `npm install` local gerar `package-lock.json`.

## O que preciso que você faça

### PARTE A — Setup do banco real (substituir modo demo)

1. **Peça ao Rafael:**
   - A connection string completa do PostgreSQL do Supabase (Dashboard Supabase → Project Settings → Database → Connection string → URI, usando o pooler porta 6543). Formato: `postgresql://postgres.PROJECTREF:SENHA@aws-0-REGIAO.pooler.supabase.com:6543/postgres`
   - (Opcional agora, necessário depois) `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` — já disponíveis nos painéis Supabase
   - Confirmação se a connection string deve ir como `DATABASE_URL`, `DATABASE_URL_IMPORTER` e `DATABASE_URL_INDEXER` (mesma por ora) ou se ele quer criar roles separadas agora

2. **Copiar `.env.example` para `.env.local`** e preencher **apenas** as variáveis de DB.

3. **Aplicar as 15 migrations** ao Supabase. Duas opções:
   - `bash scripts/db-migrate.sh` (se o bash do Git estiver instalado)
   - Ou via Supabase SQL Editor (copiar e colar cada migration na ordem)
   - Ou com `psql`: `for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done`
   - Validar que as 8 tabelas (`postos`, `arquivos_indexados`, `arquivos_orfaos`, `acesso_ficha`, `import_log`, `indexacao_log`, `tipos_documento`, `tipos_dado`, `revisoes_desconformidade`) + a view `v_postos_desconformes` foram criadas.

4. **Importar o CSV oficial:**
   ```bash
   cd ops/importer
   python -m venv .venv && .venv\Scripts\activate
   pip install -e .
   cd ../..
   python ops/importer/import_csv.py --csv "./data/Postos_PLU_FLU_PIEZO_CIAS_BAT_MUNIC_UGRHI_SUB_OTTO-18-03-26a-csv.csv"
   ```
   - Esperado: 2.484 postos inseridos, 1 linha registrada em `import_log` com status `ok`
   - Se abortar com código 2 por prefixo duplicado, avise o Rafael. Uma duplicata é conhecida (2484 linhas / 2483 únicos) e a decisão de como tratar é dele.

5. **Rodar o dashboard:**
   ```powershell
   . .\start.ps1
   ```
   - Confirmar que o banner de "modo demo" desapareceu
   - Abrir `/` e pesquisar por `1D-008` — deve encontrar CRUZEIRO / Piquete
   - Abrir a ficha do posto e confirmar que mostra os 37 campos
   - Abrir `/desconformidades` e verificar:
     - Aba "prefixo principal": 54 casos esperados (27 `LN-NNNL` tipo `B6-007A`, 26 `FLU001?`, 1 `J3`)
     - Aba "prefixo ANA": 436 casos (7 dígitos em vez de 8)
     - Abas de arquivos: vazias (indexer ainda não rodou)
   - Reportar qualquer divergência

### PARTE B — Estender indexer para Modelo B (REPOSITORIO numerado)

Ler `docs/repositorio-cliente.md` §3 e §6 antes de começar. Resumo:

- **Modelo A** (já implementado): `Y:\000 Documentos de Campo\{TipoDado}\{PREFIXO}\{arquivo.pdf}` — nome do PDF contém o prefixo.
- **Modelo B** (a implementar): `Y:\000 Documentos de Campo\DOCUMENTOS-CTHDOC-RECUPERAÇÃO\REPOSITORIO\{numero}.pdf` — nome do PDF é um número sequencial (`138639.pdf`). O mapeamento **posto ↔ número de arquivo** vem da planilha `Y:\000 Documentos de Campo\DOCUMENTOS-CTHDOC-RECUPERAÇÃO\relacao_doc_arquivos_cthdoc.xlsx` (colunas: PREFIXO, Tipo do Dado, Tipo de Documento, Arquivo).

Passos:

1. **Confirmar o caminho do HD.** Peça ao Rafael se o drive está de fato em `Y:\000 Documentos de Campo\` no notebook dele. Se não, pegue o caminho correto (pode ser UNC `\\10.x.x.x\Hidrologia\000 Documentos de Campo\` — ele confirma).

2. **Criar migration 0016** — `supabase/migrations/0016_arquivos_indexados_repositorio.sql`:
   - `ALTER TABLE arquivos_indexados ADD COLUMN numero_arquivo TEXT NULL` (número do PDF quando oriundo do REPOSITORIO)
   - `ADD COLUMN origem_mapeamento VARCHAR(16) NOT NULL DEFAULT 'NOME' CHECK (origem_mapeamento IN ('NOME', 'PLANILHA_XLSX'))`
   - `CREATE INDEX ON arquivos_indexados (numero_arquivo) WHERE numero_arquivo IS NOT NULL`
   - Comentários COMMENT ON COLUMN descritivos

3. **Criar migration 0017** — `supabase/migrations/0017_arquivos_orfaos_categorias_novas.sql`:
   - Ampliar o CHECK de `categoria` em `arquivos_orfaos` para aceitar também: `PENDENCIA_CLIENTE`, `FICHA_GERAL` (mantendo `PREFIXO_DESCONHECIDO`, `NOME_FORA_DO_PADRAO`, `EXTENSAO_NAO_PDF`)

4. **Estender o indexer** `ops/indexer/index_fs.py`:
   - Adicionar dependência `openpyxl` em `ops/indexer/pyproject.toml`
   - Novo modo: detectar automaticamente pela pasta raiz se é Modelo A ou B; alternativamente `--modo=por-prefixo | repositorio | auto` (default auto)
   - Para Modelo B:
     - Carregar a planilha `relacao_doc_arquivos_cthdoc.xlsx` (caminho fixo relativo à raiz informada, ou parametrizável via `--mapa-xlsx`)
     - Construir índice em memória `numero_arquivo -> { prefixo, tipo_dado, tipo_documento }` a partir das colunas da planilha
     - Para cada `{numero}.pdf` no REPOSITORIO: lookup no índice
     - Gravar em `arquivos_indexados` com `numero_arquivo`, `origem_mapeamento='PLANILHA_XLSX'`, `formato_nome='COMPLETO'` (o mapeamento da planilha substitui o parser de nome), `cod_tipo_documento` traduzido do texto ("Ficha de Inspeção" → 03, "Ficha Descritiva" → 01, "Outros" → NULL, etc.) usando a tabela `tipos_documento`
     - PDFs sem match no índice → `arquivos_orfaos` categoria `PREFIXO_DESCONHECIDO`
   - Para Modelo A, manter comportamento atual (3 formatos de nome) + **tratar pastas especiais**:
     - `0 SEM PREFIXO`, `0 SemPrefixo` → arquivos dentro vão pra `arquivos_orfaos` categoria `PREFIXO_DESCONHECIDO`, `tipo_dado` preenchido pela pasta pai
     - `0 DUVIDAS`, `0 duvidas` → `arquivos_orfaos` categoria `PENDENCIA_CLIENTE`
     - `0 Paralisados`, `0 Paralisado` → indexar normalmente, flag textual na coluna `observacoes` (ou adicionar `posto_paralisado BOOLEAN` via nova migration 0018 se fizer sentido — discutir com Rafael)
     - `0 FICHAS DESCRITIVAS FLU/PLU (...)` → `arquivos_orfaos` categoria `FICHA_GERAL`
     - Subpastas com sufixo textual tipo `1D-008 paralisado` → extrair prefixo antes do primeiro espaço via regex

5. **Rodar o indexer em dry-run** primeiro:
   ```bash
   python ops/indexer/index_fs.py --root "Y:\000 Documentos de Campo" --dry-run
   ```
   (adicionar flag `--dry-run` se ainda não existir — não grava no banco, apenas reporta o que gravaria)

6. **Revisar o sumário do dry-run com o Rafael** antes de rodar de verdade — ele pode querer ajustar categorias.

7. **Rodar de verdade:**
   ```bash
   python ops/indexer/index_fs.py --root "Y:\000 Documentos de Campo"
   ```

8. **Validar no dashboard:**
   - Abrir ficha de um posto conhecido (ex: `C6-100` que os manuais mostram) — deve listar arquivos agrupados por tipo de documento (Ficha de Inspeção, Ficha Descritiva, Outros)
   - Abrir `/desconformidades/arquivos-orfaos` e `/desconformidades/arquivos-malformados` — devem ter os casos esperados

### PARTE C — Endurecer CI + commit + push

1. **Rodar `npm install`** localmente para gerar `package-lock.json`.
2. **Reverter `.github/workflows/ci.yml`:**
   - `npm ci` no lugar de `npm install`
   - Remover `continue-on-error: true` dos steps de lint e typecheck
3. **Rodar tudo uma vez localmente** para garantir que passa:
   - `npm run lint` — zero erro
   - `npm run typecheck` — zero erro
   - `python -m py_compile ops/importer/import_csv.py ops/indexer/index_fs.py`
4. **Commits atômicos** (Conventional Commits):
   - `chore: gerar package-lock.json e reativar CI rigoroso`
   - `feat(indexer): suportar Modelo B (REPOSITORIO numerado via planilha xlsx)`
   - `feat(indexer): tratar pastas especiais do HD cliente (0 SEM PREFIXO, 0 DUVIDAS, etc)`
   - `feat(db): migrations 0016 e 0017 — campos do Modelo B e novas categorias de órfão`
   - `chore: atualizar docs/repositorio-cliente.md com resultados reais da indexação`
5. **Push:** `git push origin main`
6. Depois do push, rodar `gh run list` (ou abrir GitHub Actions no browser) e confirmar que o CI passou no verde.

## Cuidados de segurança

- **Nunca commitar `.env.local`** — está no `.gitignore`, mas confirmar com `git status` antes de cada commit.
- **Nunca commitar a planilha `relacao_doc_arquivos_cthdoc.xlsx`** em si — pode conter dados operacionais que não devem ir pro repo. Só os metadados derivados (no banco) vão. Se você precisar de uma cópia local para desenvolvimento, coloque em `data/` e adicione ao `.gitignore` antes.
- **Não subir PDFs reais do HD ao repo.** O PDF de sample em `data/samples/` é a exceção (fixture acordada com o cliente).
- Se descobrir IPs internos, senhas, tokens, ou qualquer credencial durante a investigação, **não coloque em docs/comentários** — diga ao Rafael privado.
- Worker/indexer deve acessar o HD de rede em modo **somente-leitura**. Nunca escrever, renomear ou mover arquivos na rede do cliente.

## Critério de aceitação

Só considere o trabalho concluído quando:

- [ ] Dashboard roda em `npm run dev` sem modo demo (banner desapareceu)
- [ ] `/postos/1D-008` mostra dados reais da planilha
- [ ] `/desconformidades` mostra os 54 postos principais desconformes + 436 ANA desconformes
- [ ] Indexer rodou com sucesso sobre o HD real, populou `arquivos_indexados`, `arquivos_orfaos` e registrou em `indexacao_log`
- [ ] Ao menos um posto consultado no dashboard (ex: `C6-100`) lista os PDFs reais agrupados por tipo
- [ ] CI do GitHub Actions está verde no último commit
- [ ] Rafael recebeu relatório final curto com totais (postos indexados, arquivos por modelo A/B, órfãos por categoria, tempo de execução)

## Se algo travar

- Se o Supabase não aceitar a connection string, verifique se o IP do notebook está na allowlist (Project Settings → Database → Network restrictions)
- Se o indexer demorar demais no HD (rede do cliente é lenta), considerar rodar por tipo de dado (flag `--tipo=Pluviometria`) em execuções separadas
- Se a planilha `relacao_doc_arquivos_cthdoc.xlsx` tiver divergência de colunas em relação ao documentado em `docs/repositorio-cliente.md` §3, parar e perguntar ao Rafael
- Se encontrar arquivo muito grande (> 50MB) ou coisa estranha no HD, não processar e reportar

## Quando terminar

Envie ao Rafael o relatório final no formato padrão (`✓ Feito` / `⚡ Decisões` / `⚠️ Atenção`). Confirme hash do último commit e link do GitHub Actions verde.

<<< FIM DO PROMPT — FIM DA CÓPIA <<<

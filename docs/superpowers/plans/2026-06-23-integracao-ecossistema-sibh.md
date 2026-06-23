# Integração do Ecossistema SP Águas (Diagramas Unifilares + Monitor Pluviométrico) — Plano de Implementação

> **Para executores:** SUB-SKILL recomendada na execução: `superpowers:subagent-driven-development` (um subagente por task, com revisão entre tasks) ou `superpowers:executing-plans`. Os passos usam checkbox (`- [ ]`).

**Goal:** Consolidar dois módulos hoje separados (o editor de Diagramas Unifilares e o Monitor Pluviométrico, ambos protótipos Lovable) dentro do dashboard SP Águas - DMO (Next 15), num único sistema e num único banco, adaptando e melhorando o que for necessário, com o visual no padrão do SIBH/DAEE.

**Arquitetura:** Tudo vira módulo do dashboard Next (rotas `/diagramas` e `/monitor`), consumindo o mesmo Postgres/Supabase já reconstruído, a mesma auth e o mesmo layout. O backend Express do monitor é descartado e reimplementado como API Routes do Next. A integração com a API oficial do SIBH vira uma camada de infraestrutura compartilhada (server-side, sem CORS), que serve tanto o monitor quanto a fase de dados ao vivo dos diagramas.

**Tech Stack:** Next.js 15 (App Router) + TypeScript strict + Tailwind, postgres.js (sem ORM), Supabase Auth, Clean Architecture (domain/application/infrastructure). Libs novas: `@xyflow/react` (editor de diagramas), `leaflet` + `react-leaflet` (mapa), `recharts` (gráficos), `html-to-image` + `jspdf` (export), `date-fns` (já presente? confirmar).

## Global Constraints

- Next 15 App Router, Server Components por padrão, `'use client'` só quando necessário.
- Clean Architecture: rota/UI -> use case -> repositório (`*.pg.ts`) com port em `application/ports/`. Nada de SQL na rota.
- SQL parametrizado via postgres.js tagged templates. Migrations numeradas idempotentes (próxima livre: `0045`). RLS deny-by-default como defesa em profundidade (padrão da migration `0040`).
- Acessibilidade e-MAG / WCAG 2.1 AA obrigatória (governo). Foco visível, teclado, contraste, aria.
- Texto visível em PT-BR com acentuação correta. NUNCA usar traço/dash (em-dash/en-dash) como conector. NUNCA `window.confirm/alert/prompt` (usar `ConfirmDialog` do projeto).
- Banco único: o projeto Supabase `wvjlnkvxnmxaeezmxwpn` (São Paulo/sa-east-1), já reconstruído.
- Backup diário já ativo; toda migration nova precisa ser aplicada no banco (não só commitada) via `scripts/apply_migrations.py`.

---

## Contexto: as três peças e como se encaixam

| Peça | Stack atual | Estado | Papel |
|------|-------------|--------|-------|
| **Dashboard SP Águas - DMO** | Next 15 + Postgres | Em produção (hub) | Catálogo de 2.483 postos, fichas, triagem, inventário ANA, auth |
| **Diagramas Unifilares** | Vite SPA (Lovable), localStorage | **Incompleto, mexer bastante** | Editor esquemático da rede (reservatório/nível/chuva/rio, limiares, status) |
| **Monitor Pluviométrico** | Vite + Express + Supabase próprio (Lovable) | **Mais avançado, adaptar e melhorar** | Mapa Leaflet das estações sobre bacias DAEE, gráficos auto vs manual, filtros temporais |
| **SIBH/CTH (oficial DAEE)** | `apps.spaguas.sp.gov.br/sibh/api/v2` | Externo, público | Fonte de dados ao vivo (medições horárias por `prefix`) e referência visual |

O elo que conecta tudo: o `prefix` das estações do SIBH é o **código do posto**. O mesmo código liga catálogo (postos), diagrama (posto de nível/chuva) e monitor (estação pluviométrica).

---

## Decisões transversais (consolidação num sistema só)

1. **Banco único.** As tabelas do monitor (`stations`, `readings`, hoje num Supabase separado) são migradas para o nosso banco como migrations numeradas, com nomes em PT-BR para consistência (`estacoes_pluviometricas`, `leituras_pluviometricas`) e FK opcional para `postos`.
2. **Sem Express.** O backend `backend/src/server.ts` do monitor não é portado. A função dele (proxy para o SIBH + cache) vira API Routes do Next (`/api/sibh/*`), server-side, o que elimina o problema de CORS que motivava o Express.
3. **Integração SIBH como infraestrutura compartilhada.** Um adapter `src/infrastructure/sibh/` consome a API v2 do SIBH com cache; usado pelo monitor (leituras) e, na fase final dos diagramas, pelo valor ao vivo dos postos de nível/chuva.
4. **Reuso de chrome.** Os módulos entram sob o route group `(dashboard)`, herdando layout, Sidenav, auth, `ConfirmDialog`, tokens de cor e o `MenuUsuario`. Os componentes shadcn dos protótipos Lovable são adaptados para os componentes `ui/` já existentes no dashboard (não duplicar).
5. **Canvas dos diagramas: `@xyflow/react` (React Flow).** O protótipo usa canvas próprio (divs + drag manual + SVG). Para "todas as funções possíveis" (zoom, pan, seleção múltipla, conexões, snap, minimapa, export) o React Flow entrega isso de fábrica; o visual SIBH vem de custom nodes/edges. O modelo de dados e a lógica de status do protótipo são reaproveitados.
6. **Migrations e dados.** Migração das tabelas é por migration idempotente. As estações pluviométricas reais vêm do SIBH (não do seed de 5 linhas do protótipo, que é descartado).

---

## Fase 0 — Fundação compartilhada

Pré-requisito dos dois módulos. Sem UI nova relevante; entrega a base de dados e a ponte SIBH.

### Task 0.1: Instalar dependências
**Files:** Modify `package.json`, `package-lock.json`
- [ ] Instalar: `@xyflow/react`, `leaflet`, `react-leaflet`, `@types/leaflet`, `recharts`, `html-to-image`, `jspdf`. Confirmar se `date-fns` já existe; se não, adicionar.
- [ ] `npm run typecheck` limpo, `npm run build` passa.
- [ ] Commit.

### Task 0.2: Migração das tabelas pluviométricas (monitor) para o banco
**Files:** Create `supabase/migrations/0045_estacoes_pluviometricas.sql`, `supabase/migrations/0046_leituras_pluviometricas.sql`
- Schema alvo (PT-BR, adaptado do `stations`/`readings` do monitor, com vínculo ao catálogo):
  - `estacoes_pluviometricas (id uuid pk, prefixo text unique null, nome text not null, lat double precision not null, lng double precision not null, tipo text check (tipo in ('manual','automatico')) not null, bacia text null, posto_id uuid null references postos(id) on delete set null, sibh_id text null, criado_em timestamptz default now())`
  - `leituras_pluviometricas (id bigserial pk, estacao_id uuid not null references estacoes_pluviometricas(id) on delete cascade, momento timestamptz not null, manual_mm double precision default 0, automatico_mm double precision default 0, criado_em timestamptz default now())` + índices em `(estacao_id)` e `(momento)`.
  - RLS deny-by-default + policies de leitura, alinhadas ao padrão da migration `0040` (não copiar as policies "authenticated write" abertas do protótipo; o app escreve via role de serviço, RLS é defesa em profundidade).
- [ ] Escrever as migrations idempotentes (`IF NOT EXISTS`, `DO $$`).
- [ ] Aplicar com `ops/indexer/.venv/Scripts/python.exe scripts/apply_migrations.py --since 0045`.
- [ ] Validar tabelas criadas (consulta de contagem). Commit.

### Task 0.3: Adapter de integração SIBH (infra) + API routes
**Files:** Create `src/application/ports/sibh-gateway.ts`, `src/infrastructure/sibh/sibh-client.ts`, `src/app/api/sibh/estacoes/route.ts`, `src/app/api/sibh/medicoes/route.ts`
- Port `SibhGateway`: `listarEstacoes(): Promise<EstacaoSibh[]>`, `medicoesPorPrefixo(prefixo, desde, ate): Promise<MedicaoSibh[]>`, `agregarDiario(medicoes): AgregacaoDiaria[]`. Tipos derivados do `sibhApi.ts` do protótipo (`SibhMeasurement`, `AgregacaoDiaria`, dia hidrológico 07:00 -> 06:59).
- Adapter consome `https://apps.spaguas.sp.gov.br/sibh/api/v2/stations` e endpoints de medição, com cache em memória (TTL 1h para estações, curto para medições), reaproveitando a lógica de cache do protótipo.
- API routes server-side expõem ao front sem CORS, exigindo sessão (`exigirUsuario`).
- [ ] Implementar adapter + port; teste unitário do `agregarDiario` (dia hidrológico) com fixture.
- [ ] Implementar as duas API routes; smoke contra o SIBH real (1 prefixo conhecido).
- [ ] typecheck/lint/test verdes. Commit.

---

## Módulo A — Diagramas Unifilares (incompleto: adaptar, completar e melhorar)

O protótipo tem o modelo de dados bom (4 elementos, status por limiares, `STATUS_COLORS`) mas é front-only (localStorage), com canvas próprio limitado e funções faltando. Aqui ele é reconstruído como módulo do dashboard sobre React Flow, com persistência em banco e o conjunto completo de funções.

### Fase A1 — Persistência e CRUD de diagramas
- **Task A1.1:** Migration `0047_diagramas.sql`: `diagramas (id uuid pk, nome text not null, bacia text null, descricao text null, elementos jsonb not null default '[]', criado_por uuid null references auth.users(id), criado_em timestamptz, atualizado_em timestamptz)` + trigger `atualizado_em` + RLS. Aplicar e validar.
- **Task A1.2:** Port `diagramas-repository.ts` + repo `diagramas-repository.pg.ts` (listar, obter, criar, renomear, duplicar, salvar elementos, excluir) + registrar em `repositories.ts` + mock. Espelha as operações do `useDiagrams` do protótipo, mas no banco.
- **Task A1.3:** Use cases em `application/use-cases/diagramas/` + API routes `/api/diagramas` e `/api/diagramas/[id]` (GET/POST/PATCH/DELETE) com auth e validação zod.
- **Task A1.4:** Rota `(dashboard)/diagramas/page.tsx` (lista: criar, abrir, duplicar, renomear, excluir com `ConfirmDialog`; estados vazio/carregando/erro). Item na `nav-itens.ts`.

### Fase A2 — Editor React Flow + modelo de domínio
- **Task A2.1:** Domínio em `src/domain/diagramas/`: tipos dos 4 elementos (reservatório, nível, chuva, rio) e `calcularStatus`/`STATUS_COLORS` portados do `types/diagram.ts` (com limiares atenção/alerta/emergência/extravasamento).
- **Task A2.2:** Shell do editor `(dashboard)/diagramas/[id]/page.tsx` com `<ReactFlowProvider>`, carregando elementos do banco, auto-save (debounce) via PATCH, indicador de salvamento.
- **Task A2.3:** Custom nodes (visual SIBH): `NivelNode` (caixinha branca com valor + seta tendência + unidade + badge de status colorido + min/max), `ChuvaNode` (valor + "Chuva"), `ReservatorioNode` (círculo azul com ícone de ondas). Custom edge `RioEdge` (faixa azul grossa com label e seta de direção).
- **Task A2.4:** Toolbar (selecionar, adicionar reservatório/nível/chuva/rio, excluir) adaptada do protótipo; paleta de cores e tipografia no padrão SIBH (header azul, legenda de status, footer).

### Fase A3 — Edição, melhorias e funções faltantes
- **Task A3.1:** Modais de edição por tipo (portados de `modals/Edit*Modal.tsx` para o `Dialog` do dashboard): editar código/nome/valor/limiares/coordenadas. `InputMoeda`/máscaras conforme padrão.
- **Task A3.2:** Funções que faltam no protótipo (o "mexer bastante"): seleção múltipla, mover em grupo, snap-to-grid, desfazer/refazer (undo/redo), zoom/pan/fit, minimapa, conexão entre elementos, ajuste de pontos do rio. A maioria sai do React Flow; o restante é estado local.
- **Task A3.3:** Acessibilidade do canvas (teclado para adicionar/mover/excluir, foco visível, labels), e responsividade (toolbar colapsável no mobile).

### Fase A4 — Exportação (todas as funções)
- **Task A4.1:** Export PNG e SVG via `html-to-image` (a partir do viewport do React Flow).
- **Task A4.2:** Export PDF via `jspdf` (imagem + cabeçalho institucional + timestamp, no padrão de relatório do projeto).
- **Task A4.3:** Export/Import JSON do diagrama (salvar/carregar arquivo), reaproveitando o formato de `elementos`.

### Fase A5 — Integração com postos reais e SIBH ao vivo
- **Task A5.1:** Vincular posto de nível/chuva do diagrama a um posto do catálogo (busca por código/prefixo, autocompletar com os 2.483 postos). Guardar `posto_id`/`prefixo` no elemento.
- **Task A5.2:** Modo "AGORA": puxar o valor ao vivo via a fundação SIBH (Fase 0) para os elementos vinculados, recalculando status pelos limiares. Seletor temporal como no SIBH.

---

## Módulo B — Monitor Pluviométrico (mais avançado: adaptar e melhorar)

Já tem mapa, gráficos e integração SIBH funcionando. Aqui é portado para o dashboard sobre o banco único, com as melhorias necessárias.

### Fase B1 — Dados e serviços (reuso da Fase 0)
- **Task B1.1:** Repo + port `estacoes-pluviometricas-repository` (listar com filtros por bacia/tipo, obter leituras por período) sobre as tabelas migradas na Fase 0.2.
- **Task B1.2:** Use case de carga: popular `estacoes_pluviometricas` a partir do SIBH (Fase 0.3) e cruzar com `postos` por prefixo/coordenada (script + API de sincronização). Substitui o seed de 5 estações do protótipo.

### Fase B2 — Mapa interativo
- **Task B2.1:** Rota `(dashboard)/monitor/page.tsx` (client component com `react-leaflet`), item na nav. Mapa base + camada de bacias do DAEE (GeoJSON; confirmar fonte/uso do protótipo).
- **Task B2.2:** Markers das estações por tipo (manual/automático) com cor/ícone, popup com dados e link para o posto no catálogo. Cluster se necessário.
- **Task B2.3:** Filtros temporais (24h, 7d, 15d, 30d, 6m, 1a) e por bacia/tipo, no padrão de UI do dashboard.

### Fase B3 — Gráficos comparativos
- **Task B3.1:** Componentes `recharts` de comparação automático vs manual (séries temporais), com estatísticas (totais, médias, diferença percentual) portadas dos `types/comparacao.ts`/`utils` do protótipo.
- **Task B3.2:** Painel de detalhe da estação (gráfico + tabela de leituras + alertas), acessível e responsivo.

### Fase B4 — Melhorias e alertas
- **Task B4.1:** Alertas (do `types/alerts.ts`): destacar estações com diferença anômala auto vs manual, ou acima de limiar. Integrar com a legenda de status do padrão SIBH.
- **Task B4.2:** Performance: cache de leituras (TTL), paginação/virtualização de listas, memoização (o protótipo já tinha cache; revisar e endurecer).

---

## Sequência de execução recomendada

1. **Fase 0** (fundação: libs, migração das tabelas, ponte SIBH). Destrava os dois módulos.
2. **Módulo A — Diagramas** (a sequência pedida primeiro; é o que precisa de mais trabalho, então começa cedo).
3. **Módulo B — Monitor** (mais avançado, aproveita a Fase 0 e o aprendizado do Módulo A).

Cada módulo é um subsistema independente: na hora de executar, escrevo o plano TDD task-by-task detalhado daquele módulo (esta versão é o plano de arquitetura e decomposição que você aprova; o detalhamento fino de cada componente vem no início da execução de cada fase, para não planejar o que ainda vai mudar na UI).

## Riscos e dependências

- **API do SIBH** (`apps.spaguas.sp.gov.br/sibh/api/v2`): é externa e pública; confirmar estabilidade, formato dos endpoints de medição e limites de uso. Tratar indisponibilidade com cache e degradação graciosa.
- **Camada de bacias do DAEE** no mapa: confirmar a fonte (GeoJSON/tiles) que o protótipo usa e os direitos de uso.
- **Volume de leituras**: série temporal horária de muitas estações cresce rápido; definir retenção/agregação e índices (já previstos).
- **Migração de dados reais do monitor**: o protótipo só tinha 5 estações de exemplo (descartadas); os dados reais vêm do SIBH, então não há migração de dados legados, só de esquema.
- **Acessibilidade do canvas e do mapa**: editores visuais e mapas são pontos sensíveis de e-MAG; reservar atenção nas Fases A3.3 e B3.2.

# Plano de remediação pós-auditoria — SP Águas DMO

Data: 25 de junho de 2026.
Escopo: auditoria de quatro dimensões (Application Security, LGPD/Privacidade,
Desempenho e Padrões/Arquitetura) sobre o dashboard SP Águas DMO
(Next.js 15 App Router, TypeScript strict, Clean Architecture, Supabase/Postgres,
Capacitor PWA). Auditoria executada em modo somente leitura.

## 1. Veredito geral

O sistema está acima da média de maturidade para projeto de governo. Não há
achado CRÍTICO em nenhuma das quatro dimensões e nenhum item exige reescrita.

- Segurança: SQL 100% parametrizado, CSP com nonce, HSTS, headers exemplares,
  incidente histórico de cache cross-user já corrigido na raiz.
- LGPD: base legal mapeada, trilha de auditoria imutável, segregação de segredos
  correta, ausência de dados sensíveis e de dados de cidadão terceiro.
- Desempenho: paginação server-side, índices feitos sob medição, N+1 já eliminado,
  cache de painel sem vazamento por usuário.
- Arquitetura: ports/adapters/mocks completos, injeção de dependência por
  parâmetro, zero `any` explícito, sem código morto.

As fraquezas são pontuais e se concentram em duas raízes: tratamento de erro e
logging não uniformes entre rotas, e poucos pontos de acoplamento indevido.

## 2. Convenções

- Severidade: CRÍTICO > ALTO > MÉDIO > BAIXO.
- Esforço: P (até meio dia), M (1 a 2 dias), G (3 dias ou mais).
- IDs por dimensão: SEG (segurança), LGPD (privacidade), PERF (desempenho),
  ARCH (arquitetura), ACES (acessibilidade), BASE (fundação para upgrades).

## 3. Fase 0 — Concluída

| ID | Item | Estado |
|----|------|--------|
| 0.1 | Limpeza de lixo de disco (~590 MB) e `.vscode` para explorer enxuto | Feito (commit `e138299`) |
| 0.2 | Reorganização de `scripts/` em subpastas + `README` catalogado | Feito (commit `e138299`) |
| 0.3 | Community files para `.github/`, raiz limpa | Feito (commit `e138299`) |
| 0.4 | Correção do logo SP Águas (proporção no `next/image`) | Feito (commit `445d293`) |

## 4. Fase 1 — Bloqueante de go-live em órgão público

Itens que devem estar resolvidos ou formalmente documentados antes da entrega à
SP Águas/PRODESP. Combinam segurança, LGPD e exigências da rule de governo.

> **Status: CONCLUÍDA em 25/06/2026** (branch `chore/organizar-repo-gov`).
> Validação: typecheck, lint e 307 testes verdes.

| ID | Item | Estado | Commit |
|----|------|--------|--------|
| SEG-2 | Validar magic bytes da foto de capa antes do upload | Feito (+ testes) | `cc6bdf1` |
| SEG-1 | Autorização dono-ou-aprovador em PATCH/DELETE de diagramas (decisão do Rafael: dono ou aprovador) | Feito | `64d6901` |
| ARCH-1 | Logging estruturado: `console.error` → `logger` em 14 páginas/rotas server (18 chamadas) | Feito | `360b2e9` |
| LGPD-1 | Cifrar backup de produção (Fernet) + ACL + runbook | Feito (cifra validada) | `4a92541` |
| LGPD-2 | Procedimento de direitos do titular (art. 18), com placeholders do DPO | Feito (doc) | `26714a1` |
| LGPD-3 | Bloqueio de wildcard de allowlist em produção | Já existia (`env.ts:67` + 4 testes) — verificado, sem mudança | — |

Pendência de ativação para o Rafael/SP Águas (não bloqueia o código, mas o
go-live): gerar e configurar `BACKUP_ENCRYPTION_KEY`, preencher os campos
**[PREENCHER]** do documento de direitos do titular (DPO, canais, SLAs) e
restringir a ACL de `data/backups/` no servidor.

## 5. Fase 2 — Robustez de API e contrato de erro

Raiz única apontada por AppSec e Arquitetura: metade das rotas mapeia erro de
domínio para HTTP, metade devolve 500 genérico.

| ID | Item | Origem | Arquivo | Sev | Esforço |
|----|------|--------|---------|-----|---------|
| ARCH-2 | Promover `respostaDeErro()` para `src/app/api/_helpers/erros.ts` e aplicar nas 36 rotas (mapeia `DadosInvalidos`/`NaoEncontrado` para 400/404/403 + correlation ID) | Arquitetura #2.1, #5.1 | `src/app/api/triagem/_helpers.ts` → global | ALTO | M |
| ARCH-3 | Consolidar as duas pastas `_helpers` em `src/app/api/_helpers/` | Arquitetura #2.2 | `src/app/api/` | BAIXO | P |
| ARCH-4 | Criar `error.tsx` e `loading.tsx` no ramo `/app` (PWA do agente em campo) | Arquitetura #5.3 | `src/app/app/` | MÉDIO | P |
| SEG-3 | Rate limit aplicacional no login (por IP e email), defesa em profundidade além do Supabase | AppSec #4 | `src/app/login/actions.ts:48` | BAIXO | P |
| SEG-4 | GET de ficha individual: confirmar com Produto se leitura é compartilhada por design; se não, espelhar `permitirDonoOuAprovador` | AppSec #3 | `src/app/api/fichas/[id]/route.ts:17` | BAIXO | P |

## 6. Fase 3 — Desempenho e escalabilidade

| ID | Item | Origem | Arquivo | Sev | Esforço |
|----|------|--------|---------|-----|---------|
| PERF-1 | Índice GIN trigram nas colunas `observacao_1..5` (filtro de cenário ANA faz 5 ILIKE `%...%` sem índice) | Desempenho #1 | `src/infrastructure/db/ana-revisao-repository.pg.ts:411`; migration nova | ALTO | M |
| PERF-2 | Materializar a classificação de desconformes (coluna gerada ou MATERIALIZED VIEW) em vez de 7 regex por linha em cada COUNT | Desempenho #2 | `supabase/migrations/0012_v_postos_desconformes.sql`; `painel-repository.pg.ts` | ALTO | M |
| PERF-3 | Lazy-load de jsPDF (`await import('jspdf')` no handler de export) | Desempenho #3 | `src/components/features/diagramas/editor/useExportarDiagrama.ts:5` | MÉDIO | P |
| PERF-4 | Lazy-load do `EditorDiagrama` (xyflow) via `next/dynamic({ ssr: false })` | Desempenho #5 | `src/components/features/diagramas/editor/EditorDiagrama.tsx` | MÉDIO | P |
| PERF-5 | Consolidar os ~6 COUNT de `postos` do `resumoPendencias` num único `COUNT(...) FILTER (...)` | Desempenho #4 | `src/infrastructure/db/painel-repository.pg.ts:123` | MÉDIO | P |
| PERF-6 | LIMIT + paginação em `listarEventos` (triagem) | Desempenho #6 | `src/infrastructure/db/triagem-repository.pg.ts:604` | BAIXO | P |

## 7. Fase 4 — Manutenibilidade (handoff PRODESP)

Reduz o custo de manutenção por equipe terceira on-prem.

| ID | Item | Origem | Arquivo | Sev | Esforço |
|----|------|--------|---------|-----|---------|
| ARCH-5 | Criar port `InventarioAnaExportRepository` e injetar (use-case de export importa `sql` concreto, fura o DIP e não tem mock) | Arquitetura #1.1 | `src/application/use-cases/inventario-ana/exportar.ts:3` | ALTO | M |
| ARCH-6 | Quebrar `FormularioFichaMobile.tsx` (977 linhas): extrair `useSubmissaoFicha`, `useGPS` e validação para `domain/fichas` | Arquitetura #4.1, #4.4 | `src/components/mobile/FormularioFichaMobile.tsx` | ALTO | G |
| ARCH-7 | Extrair `useHistoricoDiagrama` (undo/redo) do `EditorDiagrama` (724 linhas) | Arquitetura #4.2 | `src/components/features/diagramas/EditorDiagrama.tsx` | MÉDIO | M |
| ARCH-8 | Indicador de salvamento com estado de erro e retry visível (auto-save silencioso hoje) | Arquitetura #4.3 | `EditorDiagrama.tsx` | MÉDIO | P |
| ARCH-9 | Extrair `lib/numero-pt-br.ts` e `lib/mascara-campos.ts` (parsing/máscaras reimplementados por componente) | Arquitetura #2.3 | `FormularioFichaMobile.tsx`, `CampoFichaMobile.tsx`, `DialogEditarElemento.tsx` | MÉDIO | M |
| ARCH-10 | Port de storage (`FotoStorageGateway`) e injetar no use-case de foto | Arquitetura #1.2 | `src/application/use-cases/foto-posto.ts:5` | MÉDIO | M |
| LGPD-4 | Definir prazo de expurgo/anonimização de IP e user-agent na trilha de auditoria | LGPD #4 | `supabase/migrations/0005_acesso_ficha.sql`; job novo | BAIXO | M |
| SEG-5 | Plugar Upstash Redis no rate limit (contrato já preparado) antes de carga real | AppSec #5 | `src/infrastructure/security/rate-limit.ts` | BAIXO | M |

## 8. Fase 5 — Fundação para upgrades futuros

Não corrige defeito; prepara o terreno para crescer com qualidade.

| ID | Item | Razão |
|----|------|-------|
| BASE-1 | Template padrão de rota de API (auth + `respostaDeErro` + logger estruturado) documentado e reusado | Garante que toda rota nova já nasce no padrão de erro e audit trail |
| BASE-2 | ADR para a centralização de erro (ARCH-2) e para o port de export (ARCH-5) | Decisões técnicas registradas, exigência de governança |
| BASE-3 | Teste de paridade TS ↔ Python do export ANA, disparado quando `data/colunas-ana.json` mudar | Blinda a duplicação conhecida sem unificar linguagem (evita overengineering) |
| BASE-4 | Convenção de "componente máximo" (ex.: 400 linhas) + extração de hooks como padrão | Evita reincidência dos arquivos gigantes |
| BASE-5 | Checklist de release bloqueante: allowlist sem wildcard, `git log` sem secrets, lint/typecheck/test verdes, backup cifrado | Porta de qualidade antes de cada deploy de governo |

## 9. Gap de auditoria a cobrir

A acessibilidade (e-MAG / WCAG 2.1 AA) é exigência legal para órgão público e
NÃO foi coberta por esta rodada de auditoria (foco em segurança, LGPD, desempenho
e arquitetura). Recomenda-se uma auditoria dedicada antes do go-live.

| ID | Item | Esforço |
|----|------|---------|
| ACES-1 | Auditoria e-MAG/WCAG 2.1 AA: navegação por teclado, leitor de tela, contraste, foco visível, labels de formulário, especialmente no PWA mobile | M a G |

## 10. Sequência recomendada

1. Fase 1 completa (bloqueante de go-live).
2. ARCH-2 (Fase 2) em paralelo, pois destrava contrato de API e audit trail.
3. PERF-1 e PERF-2 (únicos itens que mexem em escalabilidade real).
4. ACES-1 antes da homologação.
5. Fase 4 e Fase 5 conforme janela, idealmente antes do handoff PRODESP.

Itens de esforço P das Fases 2 e 3 podem ser agrupados num único lote de
polimento de baixo risco. Itens que tocam auth, migrations ou contrato de API
seguem a matriz de autonomia: registram decisão técnica (ADR) antes de aplicar.

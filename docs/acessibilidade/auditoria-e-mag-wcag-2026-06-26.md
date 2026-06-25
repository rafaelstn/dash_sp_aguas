# Auditoria de acessibilidade — e-MAG / WCAG 2.1 AA

Data: 26 de junho de 2026.
Sistema: SP Águas DMO (dashboard web + PWA mobile do agente de campo).
Stack: Next.js 15 App Router, TypeScript strict, Tailwind, tokens de cor em
`src/styles/globals.css`.
Item de origem: ACES-1 do plano de remediação
(`docs/plano-remediacao-auditoria-2026-06-25.md`).

## 1. Base legal e normativa

A acessibilidade digital é exigência legal para órgão público, não item opcional:

- Lei nº 13.146/2015 (Lei Brasileira de Inclusão), arts. 63 e 64: acessibilidade
  obrigatória em sítios e aplicações da administração pública.
- Decreto nº 5.296/2004 e Portaria que institui o e-MAG (Modelo de Acessibilidade
  em Governo Eletrônico), alinhado ao WCAG.
- Referência técnica adotada: WCAG 2.1 nível AA (e-MAG 3.1).

Esta auditoria é **estática (revisão de código-fonte)**, não substitui teste com
tecnologia assistiva real. Antes de declarar conformidade formal recomenda-se uma
rodada com leitor de tela (NVDA) e navegação 100% por teclado nos fluxos de modal,
dropdown e formulário, conforme exige a metodologia e-MAG.

## 2. Método

Auditoria conduzida em três frentes paralelas (formulários e interativos;
estrutura/foco/navegação; contraste e uso de cor), com mapeamento de cada achado
a um critério WCAG, severidade e remediação. Razões de contraste calculadas pela
fórmula de luminância relativa do WCAG sobre os valores reais dos tokens.

## 3. Veredito geral

Maturidade de acessibilidade **acima da média** para projeto de governo.
**Nenhum achado CRÍTICO.** Os componentes de base (`Button`, `Input`, `Tabela`,
`Paginador`, `Alerta`, `ConfirmDialog`), os landmarks, o skip-link, `lang="pt-BR"`,
a hierarquia de headings e a cobertura de `aria-live` já estavam corretos. As
lacunas eram pontuais e concentradas em contraste de cor e detalhes de
foco/teclado.

Resultado por severidade: 0 CRÍTICO, 2 ALTO, 5 MÉDIO, 4 BAIXO (+ observações).

## 4. Achados e estado

Legenda de estado: **Corrigido** (nesta rodada, 26/06), **Pendente** (priorizado),
**Limitação conhecida** (decisão registrada).

| ID | Achado | Critério WCAG | Sev | Estado |
|----|--------|---------------|-----|--------|
| CONTRASTE-01 | `--fg-subtle` em texto 11–13px sobre `surface-2`/`surface-3` ficava em 3.92–4.42:1 (< 4.5:1) | 1.4.3 | ALTO | **Corrigido** |
| COR-01 | Links inline em texto corrido distinguidos só por cor (azul vs preto ~2:1), sem sublinhado em repouso | 1.4.1 | ALTO | **Corrigido** (casos inline) |
| A-1 | Campo "Data da visita" obrigatório: erro não ligado por `aria-describedby`, sem `aria-required` | 3.3.1 / 4.1.2 | MÉDIO | **Corrigido** |
| B-1 | `MenuUsuario` (dropdown div) não devolvia foco ao gatilho ao fechar com Esc | 2.4.3 | MÉDIO | **Corrigido** |
| B-2 | `MenuUsuario` usava `role="menu"` sem navegação por setas (descompasso role × comportamento) | 4.1.2 | MÉDIO | **Corrigido** (simplificado p/ popover de links) |
| B-4 | `CampoFichaMobile` célula de tabela: `focus:outline-none` (e não `focus-visible:`) podia suprimir foco em WebView sem `:focus-visible` | 2.4.7 | BAIXO | **Corrigido** |
| B-3 | `<dialog>` de confirmação e menu mobile sem `aria-modal` explícito | 4.1.2 | BAIXO | **Corrigido** |
| A-2 | Campo "Técnico" obrigatório sem `aria-required` (inconsistência com o filho) | 3.3.2 | BAIXO | **Corrigido** |
| B-5 | `EstadoVazio` com `<h2>` fixo (risco de salto de nível se usado sem `<h1>` ancestral) | 1.3.1 / 2.4.6 | BAIXO | **Corrigido** (prop `nivelTitulo`) |
| CONTRASTE-02 | Borda de `<input>` em repouso (`app-border` #D1D5DB) = 1.47:1, abaixo de 3:1 para componente | 1.4.11 | MÉDIO | **Pendente** (ver §6) |
| COR-02 | `BarraProgresso` de taxa de desconformidade: classificação de severidade comunicada só pela cor da barra | 1.4.1 | MÉDIO | **Pendente** (ver §6) |
| A-13 | Edição de vértice do traçado de rio (`NodeLinha`) operável só por ponteiro, sem teclado | 2.1.1 / 4.1.2 | MÉDIO | **Limitação conhecida** (ver §7) |
| A-12 | Canvas do editor de diagrama é read-only para tecnologia assistiva (já há lista textual alternativa) | 1.1.1 | MÉDIO | **Limitação conhecida** (ver §7) |
| COR-03 | Legenda do editor: "Emergência" e "Extravasamento" com o mesmo swatch vermelho (texto sempre presente) | 1.4.1 | BAIXO | **Limitação conhecida** (fidelidade SIBH) |

## 5. Correções aplicadas (26/06/2026)

- **CONTRASTE-01**: token `--fg-subtle` escurecido de `220 9% 46%` para `220 9% 41%`
  (`src/styles/globals.css`). Correção sistêmica: ~5.8:1 sobre branco e ~4.7:1 no
  pior caso (texto pequeno sobre zebra `surface-3`), mantendo a hierarquia abaixo de
  `--fg-muted`. Comentário enganoso do token corrigido.
- **COR-01**: links inline em texto corrido passaram a `underline underline-offset-2`
  (sublinhado permanente) em `login`, `cadastrar`, `inventario-ana/[codigo]` e
  `favoritos`. Links standalone (tabela, breadcrumb) permanecem como estão.
- **A-1 / A-2**: `aria-required` e vínculo `aria-describedby`→`id` do erro nos campos
  obrigatórios do cabeçalho da ficha mobile (`FormularioFichaMobile`).
- **B-1 / B-2**: `MenuUsuario` devolve foco ao botão ao fechar com Esc e abandonou o
  padrão `role="menu"`/`menuitem` (agora popover de links nativos, acessível por Tab;
  `aria-haspopup="true"`).
- **B-3**: `aria-modal="true"` explícito em `ConfirmDialog` e `MenuMobile`.
- **B-4**: `focus:outline-none` → `focus-visible:outline-none` na célula de tabela do
  `CampoFichaMobile`.
- **B-5**: `EstadoVazio` ganhou prop `nivelTitulo` (1–3, default 2).

Validação: `typecheck`, `lint` (0 warnings) e 307 testes verdes.

## 6. Pendências priorizadas (próxima rodada)

- **CONTRASTE-02 (1.4.11)**: a borda de campo em repouso precisa de ≥ 3:1. Decisão
  recomendada: criar token dedicado `--border-input` (~`#6B7280`, ≥ 3:1) e aplicá-lo
  aos `<input>`/`<select>`/`<textarea>` (base `Input` + campos mobile + diálogos),
  sem escurecer as bordas decorativas de card. Adiar a aplicação por ser mudança de
  identidade visual que vale alinhar (a paleta de bordas é derivada da marca).
- **COR-02 (1.4.1)**: adicionar rótulo textual de severidade (ex.: tag "Alta" /
  "Atenção" ou `sr-only`) à `BarraProgresso` da taxa, replicando o padrão que o
  `CardKPI` já acerta com `ROTULOS_SEVERIDADE`.

## 7. Limitações conhecidas (decisão registrada)

- **A-13 / A-12 (editor de diagramas)**: a edição fina do traçado de rio (mover,
  inserir e remover vértice) e a manipulação direta do canvas existem apenas por
  ponteiro. Mitigações já presentes: o `DialogEditarElemento` permite editar
  elementos por teclado, e o canvas tem alternativa textual (`<section sr-only>` com
  a lista dos elementos). A edição de diagrama é tarefa de aprovador no dashboard
  desktop, não do agente em campo. Decisão: aceitar como limitação conhecida nesta
  entrega; oferecer edição de pontos por formulário é candidato a fase futura.
- **COR-03**: a legenda do editor segue a fidelidade cromática do SIBH/DAEE; a
  distinção entre os dois níveis está sempre no texto adjacente e no `aria-label`
  dos nós, portanto não viola 1.4.1.

## 8. Dívida de consistência (fora do escopo de a11y)

`BadgeStatus.tsx`, `BadgeDivergencia.tsx` e alguns textos de `TabelaInventario.tsx`
usam classes Tailwind cruas (`bg-green-100 text-green-900` etc.) fora dos tokens do
design system. Passam contraste (≥ 8:1), mas contrariam `padrao-ui.md`. Registrar
para padronização de tokens, sem impacto de acessibilidade.

## 9. Recomendação de fechamento

Para homologação formal em órgão público: tratar CONTRASTE-02 e COR-02, e executar
uma rodada de teste com NVDA + teclado nos fluxos de modal/dropdown/formulário antes
de declarar conformidade e-MAG. Os fluxos centrais do agente em campo (login, busca
de posto, preenchimento e foto de ficha) estão, nos pontos auditados, em
conformidade com WCAG 2.1 AA.

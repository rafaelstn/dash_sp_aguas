# ADR-0003 — Módulo de Desconformidade: detecção e sugestão, sem correção automática

| Campo | Valor |
|-------|-------|
| Status | Aceita |
| Data | 2026-04-22 |
| Decisores | Rafael Damasceno (CEO), Bruno (PO Engenharia), André (PO Segurança, consultado) |
| Contexto relacionado | `spec.md` v1.2 §4.2.3, US-009, US-010; `architecture.md` v1.2 §4bis |
| Supersedes | — |
| Superseded by | — |

## 1. Contexto

A documentação oficial fornecida pelo cliente em 22/04/2026 consolida o padrão de pastas e nomes de arquivo do HD de rede SPÁguas. A análise cruzada do CSV oficial contra esse padrão revelou:

1. **Prefixo principal** (`postos.prefixo`): 54 desconformes entre 2484 linhas (2,2%), distribuídos em três classes — dígito/letra trocados (27), *placeholder* com interrogação literal (26), *outlier* (1).
2. **Prefixo ANA** (`postos.prefixo_ana`): 436 desconformes entre 512 preenchidos (85,2%), sendo 435 com 7 dígitos em vez dos 8 oficiais (zero à esquerda comido na digitação) e 1 *outlier* de 1 dígito.
3. **Cobertura de arquivos indexáveis**: observação oficial do cliente indica que apenas **7,88%** dos documentos do HD aderem ao padrão e são recuperáveis automaticamente — os 92,12% restantes dependem de curadoria.

O MVP não contempla autenticação (US-008, Fase 2). Alteração de dado cadastral em sistema de governo exige *audit trail* com responsável humano identificado — LGPD e práticas de auditoria exigem. Qualquer correção automática em lote aplicada pelo sistema durante o MVP seria **anônima** (`usuario_id` nullable), o que é inaceitável para dado cadastral da rede oficial de monitoramento hidrológico do Estado.

## 2. Decisão

O módulo de desconformidade implementado no MVP adota a política de **detecção e sugestão, sem correção automática**.

- O sistema identifica desconformidades (prefixo principal, prefixo ANA, arquivos órfãos, arquivos malformados), apresenta-as em 4 abas na rota `/desconformidades` (US-009), e gera **sugestão textual** de correção.
- Nenhuma rota da aplicação escreve em `postos`. A aplicação é somente-leitura sobre dados cadastrais durante o MVP.
- O técnico SPÁguas, ao concordar com a sugestão, corrige manualmente a planilha-fonte e reexecuta o importador (`ops/importer/import_csv.py`), que repopula `postos` por `ON CONFLICT DO UPDATE`.
- A ação "marcar como revisado" grava em `revisoes_desconformidade` com `usuario_id NULL`, `ip` preenchido, `revisado_em = NOW()`. Não altera o dado cadastral.

## 3. Alternativas consideradas

### Alternativa A (ESCOLHIDA) — Só sugestão, sem correção em lote

Vantagens:
- Respeita regra de *audit trail* LGPD (governo): qualquer mudança em dado cadastral é responsabilidade humana identificada.
- Mantém a planilha-fonte como única fonte de verdade cadastral durante o MVP.
- Compatível com ausência de autenticação no MVP: a ação de revisão é um registro operacional, não uma mudança de dado.
- Evita efeitos em cascata imprevistos (ex.: se uma correção automática alterasse `prefixo_ana` para o valor *paddado*, e um outro sistema externo dependesse do valor não *paddado*).

Desvantagens:
- Exige intervenção manual recorrente na planilha até a Fase 2.
- A métrica de cobertura (7,88%) só melhora quando o cliente corrige o dado-fonte.

### Alternativa B — Correção em lote via botão administrativo

Vantagens:
- Acelera a normalização da base.
- Reduz a carga manual do técnico.

Desvantagens:
- Viola o princípio de *audit trail* identificado: sem auth no MVP, o autor da correção é anônimo.
- A sugestão do sistema pode estar errada em casos de borda (ex.: um prefixo ANA com 7 dígitos que **não** seja o mesmo prefixo ANA de 8 dígitos após *padding* — colisão mascarada).
- Cria rota de escrita em `postos` só para ser removida na Fase 2, aumentando superfície de ataque durante o período de MVP em rede interna.
- Contradiz RN-10.2/10.3/10.4 da spec v1.2.

### Alternativa C — Sugestão + correção em lote atrás de *feature flag*

Descartada: mesma superfície de ataque da Alternativa B, com complexidade adicional de gestão da *flag*.

## 4. Consequências

### Positivas
- MVP entrega valor imediato (visibilidade das desconformidades) sem comprometer integridade do dado oficial.
- Superfície de escrita reduzida: apenas `revisoes_desconformidade`, `import_log`, `arquivos_indexados`, `arquivos_orfaos`, `indexacao_log`, `acesso_ficha`. `postos` permanece somente-leitura pela aplicação.
- Fase 2 herda registros de `revisoes_desconformidade` já acumulados — o trabalho de curadoria não é descartado.

### Negativas
- Exige processo operacional manual entre "marcar como revisado" e "corrigir planilha-fonte". Marina documentará o fluxo no *runbook* de operação.
- A cobertura de 7,88% só cresce conforme a correção da planilha — não há atalho tecnológico no MVP.

### Neutras
- A tabela `revisoes_desconformidade` admite `UPDATE` em `status` e `nota` no MVP (para permitir "desfazer" uma revisão acidental) e recebe *trigger* bloqueante na Fase 2, exigindo `usuario_id` e tornando histórico imutável.

## 5. Compliance

- **LGPD / Governo:** aderente — nenhuma alteração de dado cadastral ocorre sem audit trail humano.
- **WCAG 2.1 AA:** aderente — as 4 abas seguem padrão WAI-ARIA de *tabs*, navegação por teclado, *live region* ao trocar aba (responsabilidade da Fernanda).
- **Rules da Damasceno Dev OS:** `padrao.md` (Clean Code, error handling explícito), `governo.md` (tom formal, acessibilidade, audit trail).

## 6. Notas de implementação

- Seed das tabelas `tipos_documento` (7 valores) e `tipos_dado` (5 valores) nas migrations 0008 e 0009 é imutável durante o MVP. Alterações exigem nova migration.
- A *view* `v_postos_desconformes` calcula a classificação por regex na hora (sem materializar) — o volume de 2484 postos não justifica materialização, e a lógica de classificação muda raramente.
- A regex oficial do nome do arquivo é propriedade do Python (*worker* de indexação); não há equivalente no SQL para este parsing.

# ADR-0014, Resposta órfã em ana_revisao_estacao para estações sem posto

| Campo | Valor |
|-------|-------|
| Status | Aceito (retroativo) |
| Data | 2026-05-18 |
| Decisor | Rafael Damasceno (proprietário) |
| Escopo | Banco (Supabase), exportador SharePoint, listagem inventário ANA |
| Dependência | [[adr-0012-drop-correcoes-jsonb]] |

---

## 1. Contexto

O ADR-0012 estabeleceu `postos` como fonte única para correções de estações ANA. Mas há um caso edge: estação ANA sem posto SP correspondente (não foi promovida ou ainda não foi cadastrada). Para essas estações, o aprovador ainda pode revisar o município ou anotar uma observação, mas não há posto para receber a correção.

Sem mecanismo dedicado, a correção dessas estações ficava perdida no histórico de eventos, sem aparecer no export oficial para ANA.

Migration 0039 (`ana_resposta_orfas`) adiciona colunas `resposta_*` (municipio, operando, observacao, etc.) diretamente em `ana_revisao_estacao` para esse caso.

## 2. Decisão

`ana_revisao_estacao.resposta_*` é o segundo nível do fallback de 3 níveis:

1. Se existe posto promovido (`posto_id IS NOT NULL`), lê de `postos` (ADR-0012).
2. Caso contrário, lê de `resposta_*` da própria estação (este ADR).
3. Caso vazio, fallback final no snapshot original da ANA.

A regra é implementada de forma idêntica em:
- TypeScript: `src/application/use-cases/inventario-ana/exportar.ts:96-109`.
- Python: `scripts/aplicar_resposta_na_planilha_sharepoint.py:88-122`.

Listagem (`anaRevisaoRepository.listar`) usa os mesmos campos efetivos para sinalizar status na UI.

## 3. Consequências

- Estação órfã passa a aparecer no export oficial mesmo sem posto promovido.
- Custo: duplicidade de schema, há campos `municipio`, `municipio_nome`, `resposta_municipio` e `municipio_efetivo`. Mitigado por views e pela documentação clara dos 3 níveis.
- Aprovador que decide criar o posto depois (via "promover para posto"): a correção que estava em `resposta_*` é transferida para o novo `posto` no momento da promoção, e o fallback nível 1 passa a operar.

## 4. Alternativas consideradas

- Criar um "posto fantasma" para cada estação órfã: poluiria a tabela `postos` com registros sem dado oficial. Rejeitado.
- Manter o `correcoes JSONB` apenas para órfãs: reintroduziria parte do problema do ADR-0012 (duas fontes da verdade).

## 5. Terminologia

- "Estação ANA": linha do snapshot oficial, identificada por `codigo_ana` (8 dígitos).
- "Posto SP": cadastro interno em `postos`, com `prefixo` e opcionalmente `prefixo_ana`.
- "Posto promovido": estação ANA que tem um posto SP correspondente (`posto_id IS NOT NULL`).
- "Estação órfã": estação ANA sem posto SP, candidata a usar `resposta_*` deste ADR.

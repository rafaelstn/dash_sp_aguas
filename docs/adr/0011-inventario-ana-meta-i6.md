# ADR-0011, Módulo Inventário ANA (Meta I.6 PROGESTÃO)

| Campo | Valor |
|-------|-------|
| Status | Aceito |
| Data | 2026-05-14 |
| Decisor | Rafael Damasceno (proprietário) |
| Cliente | SPÁguas, Governo do Estado de São Paulo |
| Contexto | Ciclo PROGESTÃO 3 (2026), prazo de resposta 18/05/2026 |
| Complementa | ADR-0008 (módulo triagem), regra `governo.md` (LGPD, e-MAG) |
| Stack | Next.js 15, PostgreSQL + PostGIS, IBGE público (GeoJSON), exceljs |

---

## 1. Contexto

A ANA mantém inventário oficial das estações hidrológicas do estado e a cada ciclo do PROGESTÃO envia para o SPÁguas uma planilha com observações sobre as estações que apresentam alguma inconsistência (coordenadas suspeitas, código adicional ausente ou duplicado, município ou rio incompatíveis com as coordenadas, datas fora de ordem, estações duplicadas).

No ciclo de 2026, a planilha "SP_AGUAS_Estações_Dúvidas.xlsx" trouxe 2.371 estações no inventário, com **703 estações apontadas com observação** (216 em operação e 487 desativadas). Prazo de resposta: 18/05/2026. As respostas precisam ser feitas diretamente na planilha do SharePoint da ANA, com **células alteradas destacadas em amarelo**.

Ciclos anteriores eram respondidos por e-mail com justificativa textual ("coordenada deslocada no banco, mas a estação está no rio indicado"), o que a ANA passou a não aceitar mais.

## 2. Decisão

Criar módulo dedicado **Inventário ANA** integrado ao sistema existente (Ficha Técnica SPÁguas). Princípio: a planilha vira um lote no banco; cada linha vira uma estação revisável; correções vivem em JSONB sem tocar a tabela `postos`; export final gera XLSX com células alteradas em amarelo.

### 2.1 Modelo de dados (migrations 0029 e 0030)

- `ana_revisao_lote`: pacote de revisão (um upload de planilha = um lote, hash do arquivo garante idempotência).
- `ana_revisao_estacao`: linha-a-linha do inventário, com cruzamento opcional para `postos` (por `prefixo_ana` ou `prefixo`/código adicional). Campo `correcoes` JSONB mantém alterações pendentes sem mexer na base oficial.
- `ana_revisao_evento`: audit trail imutável (governo.md §4).
- `ibge_municipios_sp`: polígonos dos 645 municípios SP da malha IBGE 2024 (SIRGAS 2000, SRID 4674).
- Função SQL `bulk_analisar_divergencias(lote_id)`: roda análise geográfica em massa via PostGIS (`ST_Contains`, `ST_Distance`).

### 2.2 Análise geográfica (cenário k da ANA, "município incompatível com coordenadas")

Threshold de divergência: **10 km da fronteira do município declarado** (não do centroide; é distância até o polígono real, evitando falso positivo em municípios extensos como Iguape, 80km de costa).

Classificação de cada estação:

- `ok`: ponto dentro do polígono do município declarado.
- `margem_aceitavel`: ponto fora, mas a menos de 10km da fronteira (provável imprecisão de cadastro).
- `divergente`: ponto a 10km ou mais da fronteira (alerta vermelho na UI; sugere o município que de fato contém o ponto).
- `sem_coordenada`: lat/lng nulos na planilha ANA.

Match do município declarado é por nome com `unaccent` + `LOWER`, porque a planilha ANA usa código próprio (ex `21443000`), não o código IBGE (ex `3513801`).

### 2.3 Cruzamento com `postos` (bucket A, resolução automática)

Durante a importação:

1. Match por `prefixo_ana` (código ANA) → resolve 496/2371.
2. Match por `prefixo` (código adicional / DAEE) → resolve mais 1224/2371.
3. Resto vira `sem_match` (651 estações; 274 dessas têm observação).

Auto-correções aplicadas (armazenadas em `correcoes` JSONB como sugestões, sufixadas com `_sugerido`):

- Pluviômetro com `operando=Não` e `pluviometro_fim` vazio: sugere `pluviometro_fim = postos.operacao_fim_ano` (121 estações no primeiro lote).
- Código adicional ausente: sugere `postos.prefixo` quando há match (0 no primeiro lote, mas a regra fica ativa para próximos ciclos).

Marcio aceita ou rejeita cada sugestão na UI; somente quando aceita ela vira correção aplicada.

### 2.4 UI

- `/painel`: card "Inventário ANA" no topo (visível apenas para aprovadores), com pendências, prioridade, divergência geo e sem match.
- `/inventario-ana`: lista paginada (50/pág) com filtros (busca, operando, status, divergência, match), ações em lote (marcar revisada, descartar, aceitar sugestão de município, restaurar). Bulk até 500 estações por chamada.
- `/inventario-ana/[codigo]`: detalhe com observações da ANA, painel de divergência geográfica (quando aplicável), formulário de correção campo-a-campo com botão "aceitar sugestão" e campo de justificativa.
- Sidenav: novo item "Inventário ANA" com badge contando pendências + em-revisão (visível apenas para aprovadores).

### 2.5 Export (XLSX no formato ANA)

`GET /api/inventario-ana/exportar` (rota Node.js, runtime nodejs por causa do `exceljs`). Gera planilha com:

- 42 colunas iguais à aba `DÚVIDAS` original (ordem preservada, ANA consegue colar no SharePoint).
- 2 colunas de controle adicionadas no fim: `STATUS_REVISAO_SPAGUAS`, `JUSTIFICATIVA_SPAGUAS`.
- Células alteradas pintadas em amarelo (`#FFFF00`) conforme o requisito da ANA.
- AutoFilter na primeira linha + freeze pane.

### 2.6 Segurança (governo.md + banco.md)

- Acesso restrito ao papel `aprovador` em `usuarios_papeis` (mesmo controle da triagem).
- Audit trail completo em `ana_revisao_evento` (LGPD §4): cada criação, correção, descarte, restauração e exportação tem timestamp, ator, IP, user-agent e snapshot dos valores antes/depois.
- Rate limit: 200/min para leitura, 60/min para mutação por usuário (políticas `leituraInventarioAna`, `decisaoInventarioAna`).
- Validação Zod em todas as rotas de mutação.
- Sem dados sensíveis (PII): dados são técnicos de infraestrutura pública.

## 3. Consequências

### Positivas

- Reduz revisão manual de 703 estações para ~320 (Bucket A resolve sozinho, Bucket B fornece sugestão automática).
- Sistema reutilizável a cada ciclo PROGESTÃO (re-importação de planilha cria novo lote sem perder histórico).
- Export pronto para SharePoint da ANA (formato + células amarelas).
- Audit trail responde requisição de auditoria do governo.

### Negativas / risco aceito

- Adiciona dependência `exceljs` (470KB, justificada pelo requisito de células coloridas; sem alternativa boa pure-TS).
- Adiciona extensão `postgis` (~70MB no Supabase, mas Supabase já vem com a extensão disponível, sem custo).
- Adiciona ~6MB de polígonos IBGE em `ibge_municipios_sp` (645 municípios SP). Aceito.
- 274 estações ANA continuam sem match no banco SP. Decisão (Rafael, 2026-05-14): deixar separadas em `ana_revisao_estacao` até confirmação manual; bulk action permite descartar/promover em lote.

## 4. Alternativas consideradas

1. **Script ad-hoc Python que cospe CSV**. Rejeitada: não reutilizável; não atende a futuras revisões cíclicas.
2. **Editar diretamente a tabela `postos`**. Rejeitada: contamina a base oficial com dados não revisados; quebra invariantes de outros módulos.
3. **Heurística de divergência por centroide do município (mais simples)**. Rejeitada: falso positivo em município grande (Iguape, Itanhaém). Polígono real via PostGIS dá resposta correta.

## 5. Trigger de revisão obrigatória

Revisar este ADR quando:

- ANA mudar formato da planilha ou introduzir cenário novo.
- Volume superar 5.000 estações por lote (revisar paginação e bulk).
- Cliente exigir promoção automática para `postos` ao aprovar revisão.
- Adicionar análise geográfica para rios (cenário l) e bacias (cenário m).

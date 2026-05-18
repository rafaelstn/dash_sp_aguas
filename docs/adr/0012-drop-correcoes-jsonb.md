# ADR-0012, Drop `correcoes JSONB` em ana_revisao_estacao (fonte única em postos)

| Campo | Valor |
|-------|-------|
| Status | Aceito (retroativo) |
| Data | 2026-05-18 |
| Decisor | Rafael Damasceno (proprietário) |
| Escopo | Banco (Supabase), repositórios ANA, exportador SharePoint |
| Supersede | ADR-0011 §2.1 (coluna `correcoes` JSONB descrita como cache de pendências) |

---

## 1. Contexto

O ADR-0011 (Inventário ANA, Meta I.6 PROGESTÃO) descrevia a coluna `correcoes JSONB` em `ana_revisao_estacao` como cache local da revisão (município corrigido, código adicional, etc.). A correção era persistida no JSONB e o backend lia daí em todas as visualizações (listagem, detalhe, exportador).

Na Fase 5 da implementação, a equipe identificou divergências consistentes entre `correcoes` e o estado real dos postos cadastrados. Causa: aceitar a sugestão de município ou ajustar coordenada em `/postos/[prefixo]/editar` não regravava o JSONB da estação ANA correspondente. Surgiu uma janela de inconsistência: a revisão ficava "OK" na auditoria mas o dado oficial em `postos` permanecia errado.

As migrations 0031 (`postos_fonte_unica`), 0032 (`drop_correcoes_concorrentes_ana`) e 0039 (`ana_resposta_orfas`) já implementaram a mudança no banco. Faltava documento.

## 2. Decisão

A fonte única da verdade para qualquer correção de estação ANA passa a ser o cadastro de `postos` (e, quando o posto não existe, os campos `resposta_*` em `ana_revisao_estacao` adicionados pela migration 0039).

- Coluna `correcoes` JSONB removida (migration 0032, com migração de payload para o histórico de eventos antes do DROP).
- Backend lê com fallback de 3 níveis: `postos` (se houver match), depois `resposta_*` (resposta órfã para estações sem posto), depois snapshot da ANA. Lógica idêntica em TypeScript (`src/application/use-cases/inventario-ana/exportar.ts`) e Python (`scripts/aplicar_resposta_na_planilha_sharepoint.py`).
- A revisão deixa de aceitar `aceitar_sugestao_municipio` em bulk; o aprovador faz a correção via `/postos/[prefixo]/editar`, garantindo audit trail completo em `postos_evento`.

## 3. Consequências

- Sem janela de inconsistência: o que o aprovador vê na auditoria é exatamente o que vai pro export oficial.
- Removeu acoplamento entre `ana_revisao_estacao` e o ciclo de edição de posto. Cada feature opera sobre sua tabela natural.
- O bulk endpoint mantém a ação `aceitar_sugestao_municipio` no enum por compatibilidade, mas marca como `falhada` em vez de aplicar. Removido pelo lint da rota em fase futura.

## 4. Alternativas consideradas

- Bidirecional sync (trigger de `postos` regravando `correcoes`): complexidade desproporcional, sujeito a loops e a race conditions sob aprovação concorrente.
- Manter `correcoes` como espelho periódico: introduz cache stale e atrasa audit, mesma classe de problema.

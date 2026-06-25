# ADR-0018, Ports de leitura para export ANA e storage de foto

| Campo | Valor |
|-------|-------|
| Status | Aceito |
| Data | 2026-06-25 |
| Decisor | Rafael Damasceno (proprietário) |
| Escopo | Use cases `inventario-ana/exportar` e `foto-posto` |

---

## 1. Contexto

A auditoria de arquitetura (25/06/2026) apontou dois use cases que importavam
infraestrutura concreta, furando o DIP (Dependency Inversion Principle) que o
resto do projeto segue (repositórios injetados por parâmetro):

- `application/use-cases/inventario-ana/exportar.ts` importava `sql` direto
  (`@/infrastructure/db/client`), sem port nem mock (ARCH-5).
- `application/use-cases/foto-posto.ts` importava as funções de Storage
  (`@/infrastructure/storage/foto-posto-storage`) direto (ARCH-10).

Isso impedia testar o use case isoladamente e acoplava a camada de aplicação à
infraestrutura.

## 2. Decisão

Criar ports e injetar a dependência por parâmetro, como nos demais use cases:

- `InventarioAnaExportRepository` (`application/ports/`): expõe
  `carregarMunicipiosIbge()` e `carregarLinhasInventario(loteId)`. Implementação
  PG em `infrastructure/db/inventario-ana-export-repository.pg.ts`; mock em
  `infrastructure/mock/` (planilha vazia em modo demo). O use case recebe o repo
  como primeiro parâmetro.
- `FotoStorageGateway` (`application/ports/`): expõe `montarCaminho`, `subir` e
  `urlAssinada`. Implementação concreta sobre o Supabase Storage exportada de
  `foto-posto-storage.ts`. Os use cases de foto recebem o gateway por parâmetro.

A seleção PG vs mock segue o ponto único em `infrastructure/repositories.ts`
(toggle por modo demo). O gateway de Storage não tem variação demo (não há mock
de bucket hoje).

## 3. Consequências

- Os dois use cases passam a ser testáveis com stub (ver
  `tests/unit/application/foto-posto-upload.test.ts`, que troca o mock de módulo
  por um stub do gateway).
- O tipo da linha do JOIN do export mora no port (`LinhaInventarioAnaExport`),
  não mais no use case.
- Novo padrão para use case que precise de I/O: criar port + impl + mock e injetar
  por parâmetro. Nunca importar `sql`/Storage direto na camada de aplicação.

## 4. Reavaliar se

- Surgir necessidade de mock de Storage em modo demo (ex.: demonstração com fotos
  fictícias). Aí cria-se um `FotoStorageGateway` mock e entra no toggle de
  `repositories.ts`.

Relaciona-se a ADR-0017 (centralização de erro) e à auditoria de arquitetura de
2026-06-25.

# ADR-0017, Centralização do mapeamento de erro nas rotas de API

| Campo | Valor |
|-------|-------|
| Status | Aceito |
| Data | 2026-06-25 |
| Decisor | Rafael Damasceno (proprietário) |
| Escopo | Tratamento de erro de todas as rotas `src/app/api/**` |

---

## 1. Contexto

A auditoria de arquitetura (25/06/2026) apontou tratamento de erro não uniforme:
metade das rotas mapeava erro de domínio para o status HTTP correto, a outra
metade devolvia `500` genérico, perdendo a semântica (ex.: `DadosInvalidos` que
deveria ser `400`, `NaoEncontrado` que deveria ser `404`). Isso degradava o
contrato da API e o audit trail (erros relevantes mascarados como 500).

## 2. Decisão

Centralizar o mapeamento erro-de-domínio → resposta HTTP em um único helper,
`respostaDeErro` em `src/app/api/_helpers/erros.ts`, aplicado em todas as rotas
(ARCH-2/ARCH-3). O helper:

- Traduz as classes de erro de domínio (`DadosInvalidos`, `NaoEncontrado`,
  `FalhaRepositorio`, etc.) para o status HTTP correspondente.
- Loga com `logger` estruturado e um código de correlação, sem vazar detalhe
  interno ao cliente.
- Padroniza o corpo de erro da API.

A pasta `_helpers` foi consolidada (remoção do `triagem/_helpers.ts` duplicado).

## 3. Consequências

- Toda rota nova mapeia erro pelo mesmo caminho; rota que cai no `catch` usa
  `respostaDeErro` em vez de montar resposta ad hoc (ver template em
  `docs/arquitetura/template-rota-api.md`, BASE-1).
- Erro de domínio chega ao cliente com o status semântico correto; 500 fica
  reservado para falha genuinamente inesperada.
- Exceção conhecida (não bloqueante): 4 rotas de `postos/*` usam um DTO de erro
  **aninhado** (`{ erro: { codigo, mensagem } }`) e não foram migradas para não
  mudar o formato observável. Uniformizar exige decidir um shape único de erro da
  API — tratado como item próprio, não como esquecimento.

## 4. Reavaliar se

- A API ganhar consumidores externos que exijam um envelope de erro padronizado
  (ex.: RFC 7807 / Problem Details). Aí define-se um shape único e migram-se as 4
  rotas com DTO aninhado.

Relaciona-se a ADR-0018 (ports de leitura) e à auditoria de arquitetura de
2026-06-25.

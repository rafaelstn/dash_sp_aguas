# ADR-0016, Ficha de visita compartilhada entre operadores

| Campo | Valor |
|-------|-------|
| Status | Aceito |
| Data | 2026-06-23 |
| Decisor | Rafael Damasceno (proprietário) |
| Escopo | Autorização das rotas de leitura de ficha de visita (GET) |

---

## 1. Contexto

A auditoria de segurança (André) apontou que o `GET /api/fichas/[id]` e o
`GET /api/postos/[prefixo]/fichas` exigem apenas sessão autenticada
(`exigirUsuario`), sem validar que o usuário é o dono da ficha. Em tese, um
técnico autenticado poderia ler a ficha de outro técnico iterando IDs/prefixos.

As mutações (PATCH/DELETE) já validam ownership via `permitirDonoOuAprovador`.
A divergência era: leitura aberta, escrita fechada.

Diferente da triagem (onde o técnico só vê as próprias fichas, com 404
anti-oracle), a ficha de visita é o registro de campo da rede hidrológica.

## 2. Decisão

A ficha de visita é **dado compartilhado entre operadores por design**. A leitura
(GET) permanece exigindo apenas sessão autenticada, sem checagem de ownership.

Motivo: a operação de campo da SP Águas é colaborativa. Técnicos e aprovadores
precisam consultar fichas de qualquer posto/colega (substituição em campo,
continuidade de visita, conferência cruzada, triagem). A ficha não contém PII
de cidadão terceiro: o dado é técnico/hidrométrico do posto de monitoramento;
PII residual eventual (texto livre de observação) é de servidor/operador, não de
cidadão, e o acesso é restrito a usuários institucionais autenticados.

A **escrita** continua fechada (`permitirDonoOuAprovador`): só o dono ou um
aprovador altera/exclui uma ficha. A assimetria leitura-aberta / escrita-fechada
é intencional.

## 3. Consequências

- O GET de ficha de visita não recebe checagem de ownership (decisão consciente,
  não esquecimento). Documentado aqui para a auditoria não reabrir como achado.
- Acesso permanece gated por autenticação institucional (allowlist de domínio).
- O audit trail (`acesso_ficha`) continua registrando quem acessou, preservando a
  rastreabilidade exigida pela LGPD para governo, mesmo com leitura compartilhada.

## 4. Reavaliar se

- O escopo passar a incluir dado pessoal de cidadão terceiro na ficha (aí a
  leitura precisa de controle por necessidade de conhecer e classificação).
- O contrato exigir segregação por unidade/regional (técnico de uma regional não
  poder ver ficha de outra). Nesse caso, fechar o GET por escopo organizacional.

Relaciona-se a ADR-0008 (fluxo de triagem) e à auditoria de segurança de
2026-06-23 (André).

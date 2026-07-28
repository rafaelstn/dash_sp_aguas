# Runbook — Expurgo de PII da trilha de auditoria (LGPD-4)

| Campo | Valor |
|-------|-------|
| Owner | Rodrigo (DevOps) — agendamento; André (Segurança) — política de retenção |
| Base legal | LGPD art. 6º, III e V (necessidade e minimização); art. 15 e 16 (término do tratamento e prazo de retenção) |
| Origem | Migration `0048_anonimizar_trilha_lgpd.sql`; item LGPD-4 do plano de remediação |
| Endpoint | `GET https://<domínio>/api/cron/anonimizar-trilha` |
| Cadência recomendada | Mensal (`0 3 1 * *`) |
| Prazo de retenção | 180 dias (padrão); ajustável por `TRILHA_RETENCAO_DIAS`, com piso de 30 |
| Status | Endpoint pronto e testado. **Agendamento externo pendente de configuração.** |
| Última revisão | 2026-07-28 |

---

## 1. O que o job faz

Anonimiza (`NULL`) as colunas `ip` e `user_agent` dos eventos de trilha mais
antigos que o prazo de retenção, em quatro tabelas: `acesso_ficha`,
`triagem_eventos`, `ana_revisao_evento` e `postos_evento`.

**O evento permanece.** Quem, quando e o quê são imutáveis e sustentam a
rastreabilidade que a rule de governo exige. O que sai é apenas o metadado de
rede, que é dado pessoal indireto, quando deixa de ser necessário.

A operação é idempotente: reexecutar só alcança linhas que ainda tenham PII
vencida.

## 2. Por que existe um endpoint

Até 28/07/2026 a rotina só existia como script administrativo
(`scripts/manutencao/anonimizar_trilha_lgpd.py`), que alguém precisava lembrar
de rodar apontando para o banco de produção. Um controle de retenção que depende
de memória humana não é um controle: em auditoria, o que não tem execução
comprovada não existe.

O endpoint permite usar o mesmo agendador externo que o projeto já adota para o
cron de locks (ver `cron-externo-hobby.md`), com log estruturado de cada
execução.

## 3. O prazo não vem da requisição

A anonimização é **irreversível**. Se o endpoint aceitasse `?dias=1`, quem
tivesse o secret poderia apagar toda a PII de rede da trilha numa chamada, o que
destruiria evidência de incidente.

Por isso o prazo sai de `TRILHA_RETENCAO_DIAS` (variável de ambiente) ou do
padrão de 180 dias, sempre com piso de 30. Valor inválido ou abaixo do piso é
registrado em log e substituído pelo padrão, em vez de derrubar o job.

Ajuste fino pontual continua sendo feito pelo script administrativo, que roda
com credencial de operador e aceita `--dias` e `--dry-run`.

## 4. Ativação (uma vez)

1. Confirmar que `CRON_SECRET` está definido no ambiente de produção (o mesmo
   usado pelo cron de locks; mínimo de 32 caracteres).
2. Opcional: definir `TRILHA_RETENCAO_DIAS` se a SP Águas fixar prazo diferente
   de 180 dias. **Essa definição é institucional**, não técnica: alinhar com o
   encarregado antes de mudar.
3. Cadastrar o job no cron-job.org:
   - URL: `https://<domínio>/api/cron/anonimizar-trilha`
   - Método: `GET`
   - Header: `Authorization: Bearer <CRON_SECRET>`
   - Schedule: `0 3 1 * *` (dia 1 de cada mês, 03:00)
4. Disparar uma vez na mão e conferir o log `cron.anonimizar_trilha.sucesso`.

## 5. Verificação

```bash
curl -i -H "x-cron-secret: $CRON_SECRET" https://<domínio>/api/cron/anonimizar-trilha
```

Resposta esperada (200):

```json
{
  "diasRetencao": 180,
  "porTabela": [
    { "tabela": "acesso_ficha", "linhasAnonimizadas": 0 },
    { "tabela": "triagem_eventos", "linhasAnonimizadas": 0 },
    { "tabela": "ana_revisao_evento", "linhasAnonimizadas": 0 },
    { "tabela": "postos_evento", "linhasAnonimizadas": 0 }
  ],
  "total": 0,
  "duracaoMs": 12
}
```

Zero linhas é resultado normal e esperado na maior parte das execuções. O log é
emitido mesmo assim: o que a auditoria cobra é a evidência de que o controle
roda, não o volume.

## 6. Respostas de erro

| Status | Significado | Ação |
|--------|-------------|------|
| 401 | Secret ausente ou errado (a resposta é idêntica nos dois casos, de propósito) | Conferir o header do agendador |
| 429 | Rate limit por IP | Reduzir a frequência; a cadência é mensal |
| 500 `configuracao_invalida` | `CRON_SECRET` ausente ou com menos de 32 caracteres | Corrigir a variável de ambiente |
| 5xx com `correlationId` | Falha na execução da função SQL | Buscar o `correlationId` no log e verificar se a migration 0048 está aplicada |

## 7. Cobertura de teste

- Unitários (`tests/unit/use-cases/manutencao/`): piso do prazo, soma por tabela,
  paridade do adapter mock.
- Rota (`tests/unit/app/api/cron-anonimizar-trilha.test.ts`): 401 sem oráculo
  entre secret ausente e errado, prazo da querystring ignorado, piso aplicado.
- Integração (`tests/integration/anonimizar-trilha-postgres.test.ts`): contra
  Postgres real, porque a função é `SECURITY DEFINER` sobre tabelas com `UPDATE`
  revogado do `PUBLIC` e nenhum mock provaria que ela existe e tem permissão.

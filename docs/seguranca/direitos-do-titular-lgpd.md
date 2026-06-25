# Atendimento aos direitos do titular (LGPD, art. 18)

Procedimento de atendimento aos direitos dos titulares de dados pessoais tratados
pelo sistema SP Águas DMO. Aplica a Lei nº 13.709/2018 (LGPD) e a governança de
dados públicos (Decreto nº 10.046/2019).

> Itens marcados com **[PREENCHER]** dependem de definição institucional da SP
> Águas/DAEE antes do go-live. O encarregado (DPO) é a autoridade dessas
> definições.

## 1. Dados pessoais tratados

Conforme inventário da auditoria de privacidade (`docs/seguranca/`):

- Identificação do agente: email institucional e nome de exibição.
- Atividade de campo: `tecnico_nome`, `tecnico_id`, coordenadas GPS da captura.
- Trilha de auditoria: IP e user-agent (`acesso_ficha`, `triagem_eventos`).
- Autenticação: fator MFA/TOTP.

Não há dado pessoal sensível nem dado de cidadão terceiro. Os titulares são os
próprios servidores/agentes no exercício da função pública.

## 2. Base legal

Execução de políticas públicas pela administração (LGPD, art. 7º, III e art. 23),
no contexto da gestão da rede de monitoramento hidrológico.

## 3. Canal de atendimento

- Encarregado (DPO): **[PREENCHER: nome]**
- Canal oficial: **[PREENCHER: email/formulário institucional]**
- Forma de solicitação: requisição identificada do titular pelo canal oficial.

## 4. Direitos e como são atendidos (fase atual)

No MVP, o atendimento é manual, conduzido pelo encarregado mediante solicitação.

| Direito (art. 18) | Procedimento atual | SLA |
|-------------------|--------------------|-----|
| Confirmação e acesso | Consulta dos dados do titular pela administração do sistema | **[PREENCHER]** (sugerido: 15 dias) |
| Correção | Atualização via painel administrativo do Supabase | **[PREENCHER]** |
| Anonimização/eliminação | Procedimento manual de anonimização, preservando a trilha de auditoria exigida por lei | **[PREENCHER]** |
| Portabilidade | Exportação sob solicitação ao encarregado | **[PREENCHER]** |
| Informação sobre compartilhamento | Resposta formal do encarregado | **[PREENCHER]** |
| Revogação de consentimento | Não aplicável (base legal é execução de política pública, não consentimento) | — |

## 5. Retenção e expurgo (LGPD-4 — implementado)

A trilha de auditoria (`acesso_ficha`, `triagem_eventos`, `ana_revisao_evento`,
`postos_evento`) é append-only por exigência de governo: o EVENTO (quem, quando,
o quê) é imutável e preservado. Sobre os metadados de rede, que são dado pessoal
indireto (art. 6º III/V e art. 16 da LGPD):

- **Prazo de retenção de IP e user-agent: 180 dias (6 meses).** Após esse prazo,
  `ip` e `user_agent` são anonimizados (definidos como `NULL`), mantendo
  `usuario_id`/`ator_id` + `prefixo`/referência + `ocorreu_em` e o tipo de evento.
- Mecanismo: função SQL `anonimizar_trilha_auditoria(dias_retencao)`
  (migration `0048_anonimizar_trilha_lgpd.sql`), idempotente e `SECURITY DEFINER`
  (a anonimização de PII é a exceção controlada à imutabilidade, restrita às
  colunas `ip`/`user_agent`).
- Execução: job mensal `scripts/manutencao/anonimizar_trilha_lgpd.py`
  (`--dias` ajusta o prazo, `--dry-run` apenas conta). Recomenda-se agendar via
  cron mensal no ambiente de produção.

Pendência de ativação (Rafael/SP Águas): agendar o job mensal no servidor e
confirmar o prazo de 180 dias com o encarregado (DPO) do órgão.

## 6. Roadmap

Endpoint self-service `/api/lgpd/meus-dados` (confirmação, acesso e portabilidade
automatizados) previsto para fase posterior ao MVP. Até lá, vale o atendimento
manual descrito acima.

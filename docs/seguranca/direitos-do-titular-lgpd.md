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
- Solicitante da retirada no Estoque: `estoque_movimentacoes.solicitante_matricula`,
  a matrícula funcional de quem pediu a retirada. É identificador, e não nome: o
  nome legível é resolvido na leitura, a partir do cadastro, e não fica gravado na
  trilha. Classificação: restrito. A coluna entra pela migration 0075
  (06/10/2026), e **migration commitada não é migration aplicada**: até a
  aplicação no banco do órgão este item descreve dado que ainda não é tratado.
  Até 06/10/2026 este item também listava `autorizado_por_usuario_id` como campo
  existente desde 05/10/2026, o que nunca foi verdade em nenhum ambiente: aquela
  coluna foi retirada do escopo na mesma data, porque autorizar exige login
  individual, que a janela sem identificação do ADR-0024 não tem. Quando ela
  vier, volta para este inventário com a mesma classificação.

Não há dado pessoal sensível. Os titulares são os próprios servidores e agentes
no exercício da função pública, com uma ressalva registrada em 05/10/2026: a
matrícula do solicitante na retirada de material pode ser de pessoa que não é
servidora do órgão (terceiro contratado, por exemplo), e nessa hipótese o titular
não é agente público.

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
| Correção | No cadastro do titular. Dado gravado em trilha append-only não se corrige por UPDATE, e a redação anterior desta linha ("atualização via painel administrativo do Supabase") contradizia o desenho das trilhas: ver "Retenção e expurgo" | **[PREENCHER]** |
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
- Execução automática: endpoint `GET /api/cron/anonimizar-trilha`, protegido por
  `CRON_SECRET`, disparado mensalmente pelo agendador externo. O prazo NÃO vem da
  requisição (a anonimização é irreversível): sai de `TRILHA_RETENCAO_DIAS` ou do
  padrão de 180 dias, com piso de 30. Runbook de ativação e verificação em
  `docs/runbooks/expurgo-lgpd-trilha.md`.
- Execução manual/administrativa: `scripts/manutencao/anonimizar_trilha_lgpd.py`
  (`--dias` ajusta o prazo, `--dry-run` apenas conta), para ajuste pontual com
  credencial de operador.

### A trilha do Estoque não entra nessa exceção, e por quê

`estoque_movimentacoes` também é append-only, mas **não** está na lista de
tabelas do `anonimizar_trilha_auditoria` e não precisa estar: ela não grava `ip`
nem `user_agent`, e o campo de solicitante da retirada guarda identificador, não
nome (até 06/10/2026 esta frase dizia "os dois campos de autorização de
retirada", de um escopo de dois campos que foi reduzido a um na mesma data; o
motivo está no inventário da seção 1). Decidido em 05/10/2026, depois de a revisão de segurança
apontar que nome em texto livre numa trilha imutável ficaria sem caminho de
retificação: o nome legível é resolvido na leitura a partir do cadastro, então
retificar o nome é alterar o cadastro, e a linha da trilha não é tocada, porque
não contém o nome. É assim que a imutabilidade do evento e o direito de correção
(art. 18, III) coexistem sem exceção nenhuma à imutabilidade.

Se algum dia um campo de nome em texto livre entrar nessa tabela, esta seção
deixa de valer: aí a coluna precisa entrar na lista do
`anonimizar_trilha_auditoria` com prazo definido pelo encarregado, antes de ir ao
ar.

Pendência de ativação (Rafael/SP Águas): cadastrar o disparo mensal no agendador
(o endpoint já está pronto e testado) e confirmar o prazo de 180 dias com o
encarregado (DPO) do órgão.

## 6. Roadmap

Endpoint self-service `/api/lgpd/meus-dados` (confirmação, acesso e portabilidade
automatizados) previsto para fase posterior ao MVP. Até lá, vale o atendimento
manual descrito acima.

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

- Dados do observador na ficha de troca de observador (tipo de documento 6,
  `SCHEMA_TROCA_OBSERVADOR` em `src/domain/fichas/schemas.ts`), gravados no JSONB
  `fichas_triagem.dados` e copiados sem alteração para `fichas_visita.dados` na
  aprovação (`src/infrastructure/db/triagem-repository.pg.ts`): `novo_nome`,
  `novo_rg`, `novo_cpf`, `novo_data_nascimento`, `novo_profissao`,
  `novo_grau_instrucao`, `novo_end_residencial`, `novo_cidade`,
  `novo_end_postal`, `novo_telefone`, `novo_celular`, mais os dados bancários da
  gratificação (`agencia`, `conta`, `conta_conjunta`) e `ex_observador_nome`.
  Classificação: restrito. Este é o conjunto de dado pessoal mais extenso do
  sistema, e o titular NÃO é agente público: o observador é colaborador local do
  posto. Incluído no inventário em 06/10/2026, pelo André (PO de Segurança); até
  essa data o documento não o listava, embora o ADR-0024 já o citasse, e um
  inventário que omite a categoria mais extensa não sustenta o registro das
  operações de tratamento.
- Texto livre de desconformidade (`nota`, 3 a 500 caracteres): pode conter nome
  de pessoa por digitação do técnico, conforme o próprio ADR-0024. Não há campo
  estruturado para isso, então o controle é de finalidade e de acesso, não de
  esquema.

Não há dado pessoal **sensível** na acepção do art. 5º, II (origem racial,
convicção religiosa, opinião política, filiação sindical, saúde, vida sexual,
genética ou biometria). Isso não é o mesmo que "só há dado de agente público":
dois itens acima têm titular que não é servidor, o observador da ficha tipo 6 e,
em parte dos casos, a matrícula do solicitante na retirada de material (terceiro
contratado), ressalva registrada em 05/10/2026 e mantida.

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

## 6. Quem vê a identidade de quem (minimização na leitura, art. 6º III)

Decidido em 06/10/2026, na auditoria do André (PO de Segurança) sobre o módulo de
Estoque, e registrado aqui porque **conformidade por acidente se documenta**.

O problema não era inventário nem base legal: era PROJEÇÃO. O mesmo nome e
e-mail de agente público, que em `GET /api/admin/usuarios` só sai atrás de
`exigirAdmin`, saía para qualquer usuário autenticado em quatro rotas do estoque,
porque todas resolvem o operador a partir de `auth.users` na leitura. Base legal
igual (art. 7º, III e art. 23) e finalidade igual não autorizam alcance maior: o
art. 6º, III pede o mínimo necessário, e "quem está logado" não é critério de
necessidade.

Os quatro caminhos e o que ficou decidido em cada um:

| Rota | Antes | Depois |
|---|---|---|
| `GET /api/estoque/movimentacoes` | qualquer usuário autenticado via a trilha com nome do operador | gestor; para `user` a trilha sai `null` com `historicoVisivel: false` |
| `GET /api/estoque/export` | planilha com nome ou e-mail do operador para qualquer autenticado | gestor antes de olhar o `tipo`, nas três abas |
| `GET /api/estoque/unidades/[id]` | histórico com operador junto do cadastro da unidade | cadastro continua aberto, histórico só para gestor |
| `GET /api/estoque/conferencias/[id]/itens` | autoria da contagem (nome e e-mail) para qualquer autenticado | **a rota continua aberta, só a AUTORIA fecha** |

A tabela é só de LEITURA, e isso é medição, não detalhe de redação: a escrita de
movimentação (`POST /api/estoque/movimentacoes`) nunca esteve aberta a qualquer
autenticado. Conferido commit a commit em 06/10/2026 (`65b645d` com
`exigirAdmin`, `7c8c04a` em diante com `exigirGestorEstoque`), porque a primeira
versão desta seção juntava os dois verbos numa linha e dizia do `POST` o que só
valia para o `GET`.

A última linha é a decisão que exigiu escolha, e o motivo fica escrito: a
conferência é trabalho colaborativo e a tela de leitura dela é legítima para quem
tem só `user` (as páginas em `src/app/(dashboard)/estoque/conferencias/` abrem
para qualquer sessão), então fechar a rota inteira tiraria produto sem necessidade
de proteção. O que não sobrevive à minimização é a identificação de QUEM contou:
toda ação sobre o item já exige gestor, então a autoria não é insumo de trabalho
de quem só lê. Os quatro campos de autoria saem `null`, o instante (`contadoEm`,
`reconciliadoEm`) é preservado por ser dado de processo e não identificação, e a
resposta carrega `autoriaVisivel: false` para a tela poder dizer "você não vê" em
vez de "não há" (são estados diferentes, e dizer o errado é defeito de produto,
não de segurança).

**Alcance real hoje, medido por efeito, e esta ressalva é parte da decisão:**
enquanto a janela sem identificação do ADR-0024 (§4) estiver ativa, o painel
inteiro entra como o único usuário institucional, e `podeGerenciarEstoque`
devolve true para ele ANTES de consultar papel. Logo, nenhuma das quatro guardas
acima restringe nada no servidor da PRODESP: todas passam a restringir quando a
autenticação individual do órgão estiver ligada. Medido em 06/10/2026 em
`tests/unit/api/estoque-conferencia-autoria-rota.test.ts` e em
`tests/unit/api/estoque-leitura-gestor-rotas.test.ts`, com a janela ligada e
desligada no mesmo caso. Elas não são decorativas: é a diferença entre ligar a
identificação individual e já estar correto, e ligar e abrir quatro vazamentos de
uma vez.

Para a classe não voltar por uma quinta rota, a régua é
`tests/unit/api/projecao-de-identidade-nas-rotas.test.ts`: ela deriva o inventário
de rotas por `git ls-files`, reprova por AST qualquer handler que alcance a
projeção de identidade sem guarda forte ANTES do uso, e tem lista de exceção que
obriga escopo, motivo e citação neste documento. Exceção futura entra lá e volta
para esta seção.

Pendência registrada para o encarregado (DPO), fora do módulo de Estoque: a ficha
de troca de observador (tipo 6, seção 1 deste documento) é o conjunto de dado
pessoal mais extenso do sistema e tem titular que não é agente público, e sai
para qualquer usuário autenticado em `GET /api/fichas/[id]` e
`GET /api/postos/[prefixo]/fichas`, sem evento de auditoria, enquanto a mesma
ficha em `GET /api/triagem/[id]` só sai para aprovador ou dono (escopo aplicado
em `obterFichaTriagem`), com 404 anti-oráculo e evento de segurança na tentativa
negada (`seg.triagem.idor_blocked`). A decisão SEG-4 que abriu a leitura foi tomada
sobre "visão institucional do posto" e não pesou a ficha tipo 6, que ainda não
existia no escopo. Não é correção que o time deva aplicar sozinho: muda alcance de
produto para o órgão.

## 7. Roadmap

Endpoint self-service `/api/lgpd/meus-dados` (confirmação, acesso e portabilidade
automatizados) previsto para fase posterior ao MVP. Até lá, vale o atendimento
manual descrito acima.

# Roteiro de demonstração para os gestores

Preparado em 18/08/2026. Ordem pensada para contar uma história: primeiro o problema que o órgão
tinha, depois o que o sistema resolve, e só no fim o que ainda depende de decisão deles.

Estado verificado antes de escrever este roteiro: produção no ar, banco conectado, controle de
acesso fechado. Detalhe em `docs/verificacao-2026-08-18.md`.

---

## Antes de começar

**Endereço:** `https://dash-sp-aguas.vercel.app`

**Se for demonstrar da máquina local em vez da produção:** rode de `C:\Projetos\gov\dmo`, que é a
bancada. O `F:\Projetos\Clientes\GOV\SPAGUAS - DMO` é espelho de leitura e não tem as dependências
instaladas. Nunca abrir pelo caminho de rede `\\192.168.18.170\...`, porque as ferramentas não
rodam de caminho UNC.

A cópia desatualizada de abril que ficava em `C:\Projetos\Clientes\GOV\SPAGUAS - Ficha Tecnica`
foi apagada em 05/09/2026, na reorganização das pastas. O `.env.local` dela, que apontava para
outro projeto Supabase, ficou guardado em `F:\Credenciais\spaguas-dmo-ambiente-abril-2026.txt`.

**Checagem de 10 segundos, antes da reunião:** abrir
`https://dash-sp-aguas.vercel.app/api/health`. Tem que responder `{"status":"ok","db":"ok"}`. Se o
`db` não vier `ok`, o banco é o problema, não o sistema, e é melhor saber antes de projetar a tela.

**Entrar com qual conta:** use uma conta de papel `admin` ou `super_admin`, senão Triagem e
Usuários não aparecem no menu, e são dois dos pontos mais fortes da demonstração.

---

## 1. Abertura: o problema, em números do próprio órgão (2 minutos)

Antes de mostrar tela, enquadre o problema com o dado que veio do cliente: dos documentos de campo
da rede, apenas **7,88%** estavam recuperados quando o projeto começou, e o alto volume de arquivos
fora do padrão de nomenclatura era a causa.

Isso prepara a razão de existir do módulo de desconformidades, e evita que ele pareça um detalhe
técnico.

## 2. Painel: a visão de quem chega (3 minutos)

Caminho: entrar e cair no Painel (`/painel`).

Mostre os indicadores e o bloco de próxima ação. O ponto a fazer aqui: o sistema não é um
repositório passivo, ele aponta o que precisa de atenção.

## 3. Busca e ficha do posto: a base institucional (5 minutos)

Caminho: `Buscar postos` no menu, filtrar, abrir um posto.

São **2.484 postos** da rede (pluviométricos, fluviométricos e piezométricos). Abra a ficha de um
posto e mostre os dados consolidados e os arquivos indexados vinculados a ele.

Sugestão: escolha antes da reunião um posto que tenha arquivo indexado e histórico, e deixe o
prefixo anotado. Procurar posto bom ao vivo queima tempo.

## 4. Desconformidades: o que o órgão ganhou de imediato (5 minutos)

Caminho: `Desconformidades` no menu. São quatro visões: prefixo principal, prefixo ANA, arquivos
órfãos e arquivos malformados.

O ponto político importante, e que vale dizer com clareza: **o sistema detecta e sugere, nunca
corrige em lote.** A correção do dado de origem é do técnico do órgão, com responsabilidade
individual registrada na trilha. Isso foi decisão de arquitetura registrada (ADR-0003), não
limitação.

## 5. Dado hidrológico do SIBH, dentro da tela Postos (5 minutos)

> **Não existe mais um módulo "Monitor".** Ele foi fundido na tela Postos em 17/09/2026, e o endereço
> antigo `/monitor` só redireciona. Se este roteiro for lido por quem não acompanhou a fusão: o menu
> tem `Postos`, com atalho `H`, e não existe atalho `M`. Medido no código em 23/09/2026
> (`src/components/layout/nav-itens.ts`).

> **Leia antes de demonstrar.** A carga do SIBH está incompleta: cerca de 159 estações com
> transmissão nas últimas 24 horas, contra as aproximadamente 1.957 que a fonte reporta.
> **Não cite números absolutos de estações online.** A sincronização passou a rodar sozinha uma vez
> por dia, às 06:00 no horário de Brasília, e foi otimizada em 18/08/2026 para caber na janela de
> execução, mas a primeira carga completa só acontece na próxima execução automática.
>
> Se o assunto vier à tona, a resposta honesta e que sustenta: a integração com o SIBH funciona e
> traz dado do dia, e a atualização é automática e diária.

Caminho: `Postos` no menu (atalho `H`), que é a tela inicial.

O que mostrar, nesta ordem:

1. **Ligar a camada `Outras redes (SIBH)` na legenda do mapa.** Ela nasce desligada de propósito: o
   mapa abre com a rede do órgão, e as estações de outras redes entram quando o gestor pede. Ao
   ligar, a própria legenda mostra a contagem de estações que vieram.
2. **Abrir um posto e percorrer o detalhe:** séries de medição, leituras brutas, medições de vazão e
   curvas-chave, cada seção com o seu próprio estado de carregamento e de erro.
3. **Comparar chuva entre estações pluviométricas.** No detalhe de um posto pluviométrico existe o
   botão `Comparar chuva`, que joga a estação numa cesta; com duas ou mais, o painel de comparação
   abre com gráfico e tabela.

**O que NÃO prometer nesta demonstração:** a tela de detalhe de uma estação do SIBH com série de
nível saiu do ar junto com a fusão, e a decisão sobre restaurar ou descontinuar está com o órgão
(medido em 23/09/2026: a rota `/api/monitor/estacoes/[id]/nivel` não tem mais nenhum chamador na
interface). Se perguntarem por nível de rio estação por estação, a resposta é que o dado do SIBH hoje
entra pelo mapa e pela comparação de chuva, e o detalhe por estação depende dessa decisão.

## 6. Estoque e patrimônio: o módulo mais recente (7 minutos)

Caminho: `Estoque` no menu (atalho `E`).

É a entrega mais nova e a que costuma surpreender. Percorra:

1. **Inventário e saldo:** catálogo, materiais quantificáveis e itens serializados por patrimônio.
2. **Estoque mínimo e alerta de reposição:** o sistema avisa antes de faltar.
3. **Conferência física:** abrir uma conferência, registrar contagem, e mostrar as divergências
   entre o que o sistema tem e o que foi contado no físico. Cada divergência é tratada por decisão
   humana, com registro de quem declarou a contagem.
4. **Etiquetas com código de barras:** gerar a folha de etiquetas e, numa conferência aberta, ler
   o código com o leitor USB no campo "Ler código" para marcar o item como conferido.
5. **Exportação para Excel:** inventário, saldo e trilha.

O ponto a fazer: toda movimentação é registro imutável em trilha, e o saldo é projeção dessa trilha.
É o modelo que auditoria pede.

## 7. Fichas de campo e triagem: o fluxo completo (7 minutos)

É o melhor momento da demonstração, porque fecha o ciclo entre campo e escritório.

1. **No celular** (ou em `startApp.ps1`, que abre o app em viewport de celular): abrir `/app`,
   escolher um posto, preencher uma ficha de inspeção e enviar.
2. **No dashboard:** ir em `Triagem` (atalho `T`), ver a ficha que acabou de chegar, abrir, revisar
   os campos e **devolver** uma com um motivo.
3. Mostrar que a ficha devolvida volta ao técnico para correção, e que a linha do tempo registra
   cada passo com autor e horário.

Se for demonstrar em produção, combine antes quem envia a ficha, para não improvisar com dado real.

## 8. Controle de acesso e trilha: o que o órgão precisa ouvir (4 minutos)

Caminho: `Usuários` no menu (aparece para admin e super admin).

1. Mostre os três papéis e o que cada um alcança.
2. Diga que a autorização é reforçada no servidor, não só escondida na tela.
3. Mostre a trilha de auditoria: quem fez, quando, valor anterior e valor novo.
4. Mencione o expurgo de dado pessoal da trilha, que é obrigação de LGPD e roda como tarefa
   agendável.

Se perguntarem sobre segurança, dois fatos verificados hoje e que você pode afirmar com tranquilidade:

- Nenhuma página ou rota de API entrega dado sem sessão. Foram testadas 17 rotas em produção, todas
  desviaram para o login.
- O sistema **se recusa a construir para produção** se a lista de domínios de e-mail autorizados
  estiver aberta. A pré-condição de go-live não depende de alguém lembrar dela.

## 9. Fechamento: o que depende deles (5 minutos)

Termine pedindo o que precisa, com o motivo de cada item:

1. **As fichas oficiais dos tipos 4 (Nivelamento) e 5 (Levantamento de Seção).** Estão desabilitadas
   de propósito: sem o documento oficial, o formulário seria um genérico e o técnico preencheria
   campo que não corresponde à ficha real. Com os dois documentos, habilitar é rápido.
2. **Decisão sobre a hospedagem definitiva (PRODESP).** A conteinerização está pronta e o ponto de
   troca da identidade está isolado. Enquanto a hospedagem é provisória, duas limitações vêm de
   carona: a tarefa agendada roda por serviço externo e a política de HTTPS estrito fica no formato
   atual.
3. **Janela para o teste de acessibilidade com leitor de tela.** A auditoria e-MAG / WCAG foi feita
   e os achados corrigidos; falta esse teste para declarar conformidade formal, que é exigência
   legal.
4. **Definir quem são os administradores do órgão** e registrar o acesso administrativo em lugar
   recuperável.

---

## Perguntas que provavelmente vêm, e a resposta curta

**"O sistema é seguro para expor na internet?"**
Está exposto e com os controles ativos: HTTPS obrigatório com política de dois anos, política de
conteúdo com nonce por requisição, proteção contra enquadramento em iframe, permissões de hardware
fechadas por padrão, e nenhuma rota de dado acessível sem sessão. Verificado hoje.

**"Quem pode ver o que?"**
Três papéis. Técnico preenche e consulta; Admin aprova triagem, edita dado oficial e gerencia
usuários comuns; Super Admin gerencia Admins e papéis. Reforçado no servidor.

**"E a LGPD?"**
Trilha com identidade individual, registro de quem acessou o quê e quando, e expurgo de dado pessoal
da trilha como rotina agendável. Documentação dos direitos do titular em
`docs/seguranca/direitos-do-titular-lgpd.md`.

**"Dá para rodar dentro da infraestrutura do Estado?"**
Sim, é o plano registrado (ADR-0015). Sobe em contêiner com banco próprio, e a camada de identidade
tem um ponto único de troca preparado para isso.

**"Quanto do trabalho está testado?"**
A cada mudança, a integração contínua roda lint, verificação de tipos e a suíte automatizada, e
depois aplica as 73 migrations num banco vazio, semeia o estado real de produção, reaplica tudo por
cima e confere que nenhum dado se perdeu. É o mesmo procedimento do deploy on-premise, e é ele que
prova que uma instalação nova nasce igual à que está no ar. O número de testes do dia sai de
`npm test` no repositório, e não vale de cabeça.

**"E se o SIBH cair?"**
A tela não vai embora com ele: a legenda do mapa marca a camada de outras redes como
`indisponível`, e no detalhe do posto cada seção tem o seu próprio estado de erro, para uma origem
fora do ar não apagar as outras. O dado do órgão continua na tela, porque vem do banco próprio.

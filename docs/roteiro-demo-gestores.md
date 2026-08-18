# Roteiro de demonstração para os gestores

Preparado em 18/08/2026. Ordem pensada para contar uma história: primeiro o problema que o órgão
tinha, depois o que o sistema resolve, e só no fim o que ainda depende de decisão deles.

Estado verificado antes de escrever este roteiro: produção no ar, banco conectado, controle de
acesso fechado. Detalhe em `docs/verificacao-2026-08-18.md`.

---

## Antes de começar

**Endereço:** `https://dash-sp-aguas.vercel.app`

**Se for demonstrar da máquina local em vez da produção:** abra o projeto pela unidade mapeada
(`F:\Projetos\Clientes\GOV\SPAGUAS - DMO`), **nunca** pelo caminho de rede `\\192.168.18.170\...`,
porque as ferramentas não rodam de caminho UNC. E confira que é esta pasta: existe uma cópia
desatualizada, de abril, em `C:\Projetos\Clientes\GOV\SPAGUAS - Ficha Tecnica`, que não deve ser
aberta.

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

## 5. Monitor hidrológico (5 minutos)

> **Leia antes de demonstrar este módulo.** A carga do SIBH está incompleta: cerca de 159 estações
> com transmissão nas últimas 24 horas, contra as aproximadamente 1.957 que a fonte reporta.
> **Não cite números absolutos de estações online.** A sincronização passou a rodar sozinha uma vez
> por dia, às 06:00 no horário de Brasília, e foi otimizada em 18/08/2026 para caber na janela de
> execução, mas a primeira carga completa só acontece na próxima execução automática.
>
> Se o assunto vier à tona, a resposta honesta e que sustenta: a integração com o SIBH funciona e
> traz dado do dia, e a atualização é automática e diária.

Caminho: `Monitor` no menu (atalho de teclado `M`).

Mostre o mapa com os três tipos de estação, abra o detalhe de uma estação com série de nível, e use
a comparação de múltiplas estações. A integração com o SIBH busca leitura sob demanda.

O mapa abre filtrado pelas estações que estão transmitindo, e a barra de contagem informa quantas
ficaram de fora, com um clique para ver a rede inteira. Vale mostrar os dois estados: o filtrado
responde "o que está no ar agora" e o completo responde "qual o tamanho da rede".

Se uma estação não trouxer leitura, não é defeito de tela: o sistema distingue "sem dado" de "fonte
indisponível" e informa qual dos dois. Vale mostrar isso se acontecer, em vez de fugir.

## 6. Estoque e patrimônio: o módulo mais recente (7 minutos)

Caminho: `Estoque` no menu (atalho `E`).

É a entrega mais nova e a que costuma surpreender. Percorra:

1. **Inventário e saldo:** catálogo, materiais quantificáveis e itens serializados por patrimônio.
2. **Estoque mínimo e alerta de reposição:** o sistema avisa antes de faltar.
3. **Conferência física:** abrir uma conferência, registrar contagem, e mostrar as divergências
   entre o que o sistema tem e o que foi contado no físico. Cada divergência é tratada por decisão
   humana, com registro de quem declarou a contagem.
4. **Etiquetas com QR de patrimônio:** gerar a folha de etiquetas e mostrar que ler o código abre a
   página do item.
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
720 testes automatizados, e a cadeia de integração aplica as 65 migrations do zero duas vezes, para
provar que o mesmo procedimento funciona numa instalação nova, que é como o deploy on-premise roda.

**"E se o SIBH cair?"**
O monitor distingue ausência de dado de indisponibilidade da fonte e informa qual é o caso, em vez
de mostrar tela vazia.

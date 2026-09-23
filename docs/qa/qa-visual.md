# QA visual: o par de larguras oficial e o que se confere em cada uma

Escrito em 23/09/2026. Vale para toda captura de tela deste projeto, em revisão
de layout, prova de acabamento e auditoria de acessibilidade.

## O par oficial

| Largura | Altura da janela | Para que serve |
|---|---|---|
| 412 px | 915 px | O celular do técnico de campo, que é como o painel mais é usado fora do escritório. Sidebar em drawer, modal em tela cheia, tabela com scroll horizontal. |
| 1280 px | 800 px | A estação de trabalho do órgão, que é o menor desktop que a rede interna entrega. Sidebar fixa, tabela inteira visível, dois ou três cards por linha. |

Toda prova visual sai nas DUAS larguras, sempre as duas na mesma rodada. Uma
captura só, em qualquer largura, não é prova de acabamento: o defeito de grade,
de estouro e de alvo de toque quase sempre aparece em uma e não na outra.

**Por que este par, e o que não foi medido.** 412x915 cobre o Android de tela
média, e 1280 é o piso de desktop institucional. A distribuição real de
aparelhos dos técnicos não foi medida: isso depende de informação do órgão, e
até ter esse dado o par acima é convenção da casa, não medição. Se o órgão
informar que o parque é outro, o par muda aqui primeiro e as capturas seguem.

## O que se confere em cada largura

Em 412 px:

- Nada de scroll horizontal na página (o scroll é da tabela, dentro do container dela).
- Alvo de toque com pelo menos 24x24 px, que é o mínimo da WCAG 2.5.8 nível AA. Onde o controle é usado em campo, 44 px de lado é o conforto a perseguir.
- Modal ocupando a tela inteira, com o botão de fechar alcançável pelo polegar.
- Texto sem quebra que gere palavra cortada ou número partido.

Em 1280 px:

- Grade sem coluna órfã e sem card esticado sozinho na última linha.
- Tabela sem corte de coluna essencial.
- Foco visível em todo controle alcançável por teclado, com o anel inteiro dentro da área visível.

Nas duas:

- Contraste medido no PIXEL da captura, nos temas que existem no projeto, e já no estado de carregando.
- Estado vazio, carregando, erro e sucesso, cada um capturado.

## Como se captura hoje, e o que falta

Hoje a captura é manual, pela sessão que estiver trabalhando, com o servidor de
desenvolvimento de pé. Não existe Playwright versionado neste repositório, então
não existe régua automatizada de captura, e portanto nada impede uma regressão
visual de passar.

O que faltaria para virar régua: Playwright como dependência de
desenvolvimento, um roteiro que suba o servidor, percorra a lista de telas nas
duas larguras e compare com a captura de referência, e as referências
versionadas. Enquanto isso não existe, este documento é contrato de quem
captura, não garantia de que alguém capturou.

O que já é automático é outra coisa, e menor: defeito de acabamento que se lê no
código, e não na tela, tem régua estática em `tests/unit/`. A primeira delas
está registrada na última decisão deste documento.

## Decisões de acabamento registradas

**Tag de app instalável (fechada em 23/09/2026).** O head do root layout passou
a emitir `mobile-web-app-capable`, mantendo `apple-mobile-web-app-capable` como
legado para iOS antigo. O Next 15.5.26 já emite apenas a padronizada a partir de
`appleWebApp.capable`, medido no código do pacote instalado. O precache do
service worker não foi tocado.

**Alvo de toque do botão "Comparar" da cesta (aberta).** O botão vive em
`src/components/features/monitor/CestaComparacao.tsx`, na barra fixa do rodapé,
e não existe componente chamado `BotaoComparar` neste repositório. A revisão de
frontend relatou 107x30 px. Conferido no código em 23/09/2026, o botão usa
`px-3 py-1.5 text-sm` sem borda, o que pela escala do Tailwind dá 12 px de
padding vertical somados a 20 px de altura de linha do `text-sm`, ou seja
**32 px de altura**, não 30. Os 2 px de diferença ficam registrados como
discordância entre o relato e o cálculo: não houve captura de pixel para
decidir, porque levantar o servidor não caberia na bancada naquele dia.

A conclusão não muda com os 2 px. O botão passa o mínimo da WCAG 2.5.8 AA, que
é 24 px, e fica abaixo dos 44 px de conforto para uso em campo, possivelmente
com luva. A recomendação é subir a altura para 44 px na largura de 412 px, e a
mudança espera captura nas duas larguras para provar que não desalinha a barra
de comparação. Não está feita.

**Nome acessível do botão "Limpar" da cesta (fechada em 23/09/2026).** O rótulo
estava num `<span className="hidden sm:inline">` com o ícone `aria-hidden` ao
lado e nenhum `aria-label`, então abaixo de 640 px, que é a largura do celular
do técnico, o leitor de tela anunciava "botão" e nada mais (WCAG 4.1.2, e-MAG).
Entrou o par que a casa já usava em `TelaPostos.tsx`, `hidden sm:inline` com
`sr-only sm:hidden`. As outras duas ocorrências do padrão em `src/` foram
conferidas na mesma varredura: `TelaPostos.tsx` já tinha o par, e
`MenuExportar.tsx` resolve por `aria-label`.

Este defeito é o exemplo de por que a captura de tela não fecha o QA visual: a
classe é do Tailwind, e num teste de renderização com jsdom o CSS não é
aplicado, de modo que o texto continua no DOM e o axe aprova. A guarda desse
padrão é estática e por AST, em `tests/unit/regua-de-rotulo-escondido.test.ts`,
com o aparelho em `tests/apoio/rotulo-escondido.ts`. Ela reprova o controle que
esconde o rótulo num breakpoint sem oferecer nem a contraparte `sr-only` nem
atributo que nomeie o controle, e foi provada nos dois estados: reprovou o
defeito real do `CestaComparacao.tsx` nomeando arquivo e linha, e aprovou a
versão corrigida.

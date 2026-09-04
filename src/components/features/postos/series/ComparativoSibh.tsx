'use client';

import type {
  EstacaoCorrespondente,
  ResultadoComparativo,
} from '@/application/use-cases/monitor/comparar-serie-com-sibh';
import { fmtDia, fmtInteiro, fmtNumero } from './formato';

/**
 * Conferência da série do órgão contra a mesma série no SIBH.
 *
 * É o pedido do proprietário com estas palavras: "abrir um posto e ver o
 * histórico de chuva, do rio e piezo e bater com a SIBH pra ver se estão
 * coerentes".
 *
 * ═════════════════════════════════════════════════════════════════════════
 * QUATRO ESTADOS, QUATRO TELAS. NENHUM VIRA O MESMO VAZIO
 * ═════════════════════════════════════════════════════════════════════════
 * Uma tela que mostrasse gráfico em branco nos quatro casos estaria mentindo em
 * três deles, e cada um pede uma AÇÃO diferente de quem opera:
 *
 *   sem_correspondencia   não existe estação do SIBH para este posto. Cobrar a
 *                         tabela de equivalência ao órgão, não procurar defeito
 *                         no sistema. O motivo separa "falta código ANA no
 *                         cadastro" de "o código existe e o SIBH não o conhece",
 *                         que são duas conversas diferentes com o órgão.
 *   sem_dado_no_periodo   a estação existe e um dos lados está vazio na janela.
 *                         Mudar a janela. A tela diz QUAL lado está vazio.
 *   dado_dos_dois_lados   é o único estado que compara de fato.
 *   origem_indisponivel   o SIBH não respondeu AGORA. Tentar de novo. Se isto
 *                         aparecesse como "sem correspondência", uma queda
 *                         momentânea viraria uma conclusão permanente e errada
 *                         sobre o cadastro.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * O QUE VAI APARECER NA PRÁTICA, E POR QUE ISSO ESTÁ ESCRITO NA TELA
 * ═════════════════════════════════════════════════════════════════════════
 * MEDIDO em 03/09/2026: das 2.701 estações do SIBH, ZERO casam por prefixo e 46
 * casam por código ANA, ou seja, 2% de cobertura. Confirmado nesta bancada no
 * mesmo dia: o posto `1D-008` responde `sem_correspondencia` com motivo
 * `codigo_ana_nao_esta_no_sibh`.
 *
 * Isso NÃO é defeito, é o achado, e é justamente o que o proprietário precisa
 * ler para saber o que cobrar do órgão. Por isso o estado de ausência tem
 * texto próprio dizendo o que fazer, em vez de um espaço em branco educado.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * A TELA NÃO DÁ VEREDITO DE COERÊNCIA, E ISSO É DELIBERADO
 * ═════════════════════════════════════════════════════════════════════════
 * Seria fácil pintar de verde abaixo de uma tolerância e de vermelho acima. Não
 * existe tolerância definida pelo órgão para nenhuma destas séries, e inventar
 * uma aqui produziria um selo de "coerente" que ninguém assinou, em cima de uma
 * unidade que a própria origem não confirma. A tela entrega a diferença dia a
 * dia, destaca a MAIOR, e deixa o julgamento com quem tem competência para
 * dá-lo.
 */

interface ComparativoSibhProps {
  comparativo: ResultadoComparativo | null;
  carregando: boolean;
  onComparar: () => void;
}

export function ComparativoSibh({
  comparativo,
  carregando,
  onComparar,
}: ComparativoSibhProps) {
  return (
    <section aria-labelledby="cmp-sibh" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id="cmp-sibh" className="text-sm font-semibold text-app-fg">
          Conferência com o SIBH
        </h4>
        {comparativo !== null && !carregando ? (
          <BotaoComparar rotulo="Conferir de novo" onClick={onComparar} />
        ) : null}
      </div>

      {carregando ? (
        <p role="status" className="text-xs text-app-fg-muted">
          Consultando o SIBH…
        </p>
      ) : comparativo === null ? (
        <div className="space-y-2 rounded-gov-card bg-app-surface-2 p-3">
          <p className="text-xs text-app-fg-muted">
            A conferência consulta a API pública do SIBH, que pode não estar ao
            alcance deste servidor. Por isso ela não roda sozinha.
          </p>
          <BotaoComparar rotulo="Conferir com o SIBH" onClick={onComparar} />
        </div>
      ) : (
        <Resultado comparativo={comparativo} onComparar={onComparar} />
      )}
    </section>
  );
}

function Resultado({
  comparativo,
  onComparar,
}: {
  comparativo: ResultadoComparativo;
  onComparar: () => void;
}) {
  switch (comparativo.estado) {
    case 'sem_correspondencia':
      return (
        <Aviso tom="atencao" titulo="Este posto não tem estação correspondente no SIBH">
          {comparativo.motivo === 'posto_sem_identificador' ? (
            <p>
              O cadastro do órgão não traz prefixo nem código ANA para este
              posto, e é por um desses que se chega à estação correspondente no
              SIBH. Enquanto nenhum for preenchido, não há o que conferir.
            </p>
          ) : (
            <p>
              O posto tem identificador no cadastro do órgão, e a lista de
              estações do SIBH não o conhece. A divergência é de cadastro entre
              os dois sistemas, e não de medição.
            </p>
          )}
        </Aviso>
      );

    case 'sem_dado_no_periodo': {
      const { diasNoOrgao, diasNoSibh } = comparativo;
      const ladoVazio =
        diasNoOrgao === 0 && diasNoSibh === 0
          ? 'Nenhum dos dois lados tem dado neste período.'
          : diasNoOrgao === 0
            ? 'O lado do órgão não tem dia com medida neste período.'
            : diasNoSibh === 0
              ? 'O SIBH não tem dado neste período.'
              : 'Os dois lados têm dado, e nenhum dia coincide dentro do período.';
      return (
        <Aviso tom="atencao" titulo="A estação existe, e o período escolhido não compara">
          <Estacao estacao={comparativo.estacao} />
          <p className="mt-2">{ladoVazio}</p>
          <p className="mt-1 tabular">
            No período: {fmtInteiro(diasNoOrgao)}{' '}
            {diasNoOrgao === 1 ? 'dia' : 'dias'} com medida no órgão,{' '}
            {fmtInteiro(diasNoSibh)} {diasNoSibh === 1 ? 'dia' : 'dias'} no SIBH.
            Escolha outro período acima para tentar de novo.
          </p>
        </Aviso>
      );
    }

    case 'origem_indisponivel':
      return (
        <Aviso tom="erro" titulo="O SIBH não respondeu">
          <p>
            A consulta ao SIBH falhou agora. Isso não diz nada sobre a
            correspondência deste posto: pode ser rede, indisponibilidade do
            serviço ou este servidor não alcançar a internet.
          </p>
          <div className="mt-2">
            <BotaoComparar rotulo="Tentar de novo" onClick={onComparar} />
          </div>
        </Aviso>
      );

    case 'dado_dos_dois_lados':
      return <ParesComparados comparativo={comparativo} />;
  }
}

function ParesComparados({
  comparativo,
}: {
  comparativo: Extract<ResultadoComparativo, { estado: 'dado_dos_dois_lados' }>;
}) {
  const { estacao, unidade, unidadeInferida, pares, maiorDiferenca } = comparativo;
  const diaDaMaior =
    pares.find((p) => Math.abs(p.diferenca) === maiorDiferenca)?.dia ?? null;

  return (
    <div className="space-y-3">
      <div className="rounded-gov-card bg-app-surface-2 p-3 text-xs text-app-fg-muted">
        <Estacao estacao={estacao} />
        <p className="mt-2 tabular">
          {fmtInteiro(pares.length)}{' '}
          {pares.length === 1 ? 'dia comparado' : 'dias comparados'}, em {unidade}.
          Maior diferença: {fmtNumero(maiorDiferenca)} {unidade}
          {diaDaMaior ? ` em ${fmtDia(diaDaMaior)}` : ''}.
        </p>
        {comparativo.diasSoNoOrgao > 0 || comparativo.diasSoNoSibh > 0 ? (
          <p className="mt-1 tabular">
            Fora da comparação: {fmtInteiro(comparativo.diasSoNoOrgao)} só no
            órgão, {fmtInteiro(comparativo.diasSoNoSibh)} só no SIBH. Dia que
            existe de um lado só não vira par, porque emparelhá-lo com zero
            criaria uma divergência que não foi medida.
          </p>
        ) : null}
        {unidadeInferida ? (
          <p className="mt-1 font-medium text-gov-alerta">
            A unidade do lado do órgão é inferida, não confirmada por ele. A
            diferença abaixo depende dessa leitura.
          </p>
        ) : null}
      </div>

      <div className="max-h-80 overflow-auto rounded-gov-card bg-app-surface-2">
        <table className="w-full border-collapse text-sm tabular">
          <caption className="sr-only">
            Comparação dia a dia entre o valor do órgão e o do SIBH, em {unidade}
            , para a estação {estacao.nome}. A coluna de diferença é o valor do
            órgão menos o do SIBH.
          </caption>
          <thead className="sticky top-0 z-10 bg-app-surface-3">
            <tr>
              <th
                scope="col"
                className="border-b border-app-border-subtle px-3 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
              >
                Dia
              </th>
              <th
                scope="col"
                className="border-b border-app-border-subtle px-3 py-1.5 text-right text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
              >
                Órgão ({unidade})
              </th>
              <th
                scope="col"
                className="border-b border-app-border-subtle px-3 py-1.5 text-right text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
              >
                SIBH ({unidade})
              </th>
              <th
                scope="col"
                className="border-b border-app-border-subtle px-3 py-1.5 text-right text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
              >
                Diferença
              </th>
            </tr>
          </thead>
          <tbody>
            {pares.map((par) => {
              const ehMaior =
                maiorDiferenca > 0 && Math.abs(par.diferenca) === maiorDiferenca;
              return (
                <tr
                  key={par.dia}
                  className="border-b border-app-border-subtle last:border-0 odd:bg-app-surface"
                >
                  <th
                    scope="row"
                    className="whitespace-nowrap px-3 py-1.5 text-left font-normal text-app-fg"
                  >
                    {fmtDia(par.dia)}
                  </th>
                  <td className="px-3 py-1.5 text-right text-app-fg">
                    {fmtNumero(par.orgao)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-app-fg">
                    {fmtNumero(par.sibh)}
                  </td>
                  <td
                    className={[
                      'px-3 py-1.5 text-right font-medium',
                      ehMaior ? 'text-gov-alerta' : 'text-app-fg-muted',
                    ].join(' ')}
                  >
                    {par.diferenca > 0 ? '+' : ''}
                    {fmtNumero(par.diferenca)}
                    {ehMaior ? (
                      <span className="sr-only"> (maior diferença do período)</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Estacao({ estacao }: { estacao: EstacaoCorrespondente }) {
  return (
    <p className="text-xs text-app-fg-muted">
      Estação do SIBH:{' '}
      <span className="mono font-semibold text-app-fg">{estacao.prefixo}</span>{' '}
      <span className="text-app-fg">{estacao.nome}</span>
      {estacao.tipo ? ` · ${estacao.tipo}` : ''}
    </p>
  );
}

function BotaoComparar({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-gov-azul bg-app-surface px-3 py-1.5 text-xs font-medium text-gov-azul transition-colors hover:bg-gov-azul-claro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
    >
      {rotulo}
    </button>
  );
}

/**
 * Aviso de estado. Usa fundo pastel com o texto no token de status
 * correspondente, os mesmos pares já medidos em `globals.css` como AA.
 */
function Aviso({
  tom,
  titulo,
  children,
}: {
  tom: 'atencao' | 'erro';
  titulo: string;
  children: React.ReactNode;
}) {
  const classes =
    tom === 'erro'
      ? 'bg-red-50 text-gov-perigo'
      : 'bg-amber-50 text-gov-alerta';
  return (
    <div role="status" className={`rounded-gov-card p-3 ${classes}`}>
      <p className="text-sm font-semibold">{titulo}</p>
      <div className="mt-1 text-xs">{children}</div>
    </div>
  );
}

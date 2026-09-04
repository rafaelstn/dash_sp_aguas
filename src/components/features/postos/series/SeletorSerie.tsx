'use client';

import { useId } from 'react';
import type { ResumoSerie } from '@/application/ports/series-medicao-repository';
import type { SerieMedicao } from '@/domain/monitor/serie-medicao';
import { fmtDia, fmtInteiro, percentual } from './formato';

/**
 * As cinco séries do posto como cartões de resumo, e o seletor de qual delas
 * abrir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OS CINCO CARTÕES SÃO A FICHA INTEIRA ATÉ A PESSOA PEDIR MAIS
 * ─────────────────────────────────────────────────────────────────────────
 * Pedido do proprietário, nas palavras dele: "caso eu queira carregar todas as
 * medições do dia eu consiga, mas ela não precisa abrir de cara para não pesar
 * o processamento". Nada aqui carrega leitura: o resumo já veio com a página, e
 * a série só é consultada quando alguém escolhe uma.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A SÉRIE VAZIA APARECE, E APARECE DESABILITADA
 * ─────────────────────────────────────────────────────────────────────────
 * A API devolve as cinco sempre, inclusive as zeradas, e some com elas na tela
 * desfaria o motivo de a API fazer isso: "este posto não mede rio" e "não
 * conseguimos consultar o rio" viram a mesma tela em branco, e as duas frases
 * pedem ação diferente de quem opera.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE RÁDIO NATIVO, E NÃO BOTÃO
 * ─────────────────────────────────────────────────────────────────────────
 * Escolher uma entre cinco é exatamente a semântica de um grupo de rádio, e o
 * navegador entrega de graça o que teria de ser reimplementado à mão: seta
 * navega entre as opções, Tab entra e sai do grupo como uma parada só, o leitor
 * de tela anuncia "2 de 5", e a opção desabilitada sai da ordem de foco. O
 * cartão é o `<label>`; o controle real é o `<input>` visualmente oculto, e não
 * `hidden`, para continuar focável.
 *
 * Os `id` saem de `useId()`: a mesma ficha pode renderizar este bloco mais de
 * uma vez, e `id` repetido faz o clique no rótulo acionar o controle errado, o
 * que já aconteceu neste tipo de tela.
 */

interface SeletorSerieProps {
  series: readonly ResumoSerie[];
  selecionada: SerieMedicao | null;
  onSelecionar: (serie: SerieMedicao) => void;
}

export function SeletorSerie({ series, selecionada, onSelecionar }: SeletorSerieProps) {
  const grupoId = useId();

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">
        Séries históricas de medição deste posto. Escolha uma para ver o
        histórico e comparar com o SIBH.
      </legend>
      {/* `items-start` é o que impede o cartão vazio de esticar até a altura do
          cartão com dado: sem ele, uma série com 22 mil leituras deixava quatro
          retângulos de 140 px com uma linha de texto no topo, e a única série
          que existe no posto se perdia no meio do branco. Visto na tela, não no
          código. */}
      <div className="grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {series.map((resumo) => (
          <CartaoSerie
            key={resumo.serie}
            id={`${grupoId}-${resumo.serie}`}
            nomeGrupo={`${grupoId}-serie`}
            resumo={resumo}
            selecionada={selecionada === resumo.serie}
            onSelecionar={onSelecionar}
          />
        ))}
      </div>
    </fieldset>
  );
}

interface CartaoSerieProps {
  id: string;
  nomeGrupo: string;
  resumo: ResumoSerie;
  selecionada: boolean;
  onSelecionar: (serie: SerieMedicao) => void;
}

function CartaoSerie({
  id,
  nomeGrupo,
  resumo,
  selecionada,
  onSelecionar,
}: CartaoSerieProps) {
  const vazia = resumo.leituras === 0;
  const pctSemValor = percentual(resumo.leiturasSemValor, resumo.leituras);

  // Separação por superfície e não por borda: o fundo do cartão é um degrau de
  // luminosidade acima do fundo da seção, e o selecionado sobe mais um degrau
  // com a cor da marca. Cinco caixas contornadas lado a lado é o acabamento que
  // o padrão da casa manda evitar.
  const fundo = vazia
    ? 'bg-app-surface-2/60'
    : selecionada
      ? 'bg-gov-azul-claro'
      : 'bg-app-surface-2 hover:bg-app-surface-3';

  return (
    <div className="relative min-w-0">
      <input
        type="radio"
        id={id}
        name={nomeGrupo}
        value={resumo.serie}
        checked={selecionada}
        disabled={vazia}
        onChange={() => onSelecionar(resumo.serie)}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={[
          'flex min-w-0 flex-col gap-1.5 rounded-gov-card p-3 transition-colors',
          fundo,
          vazia ? 'cursor-not-allowed' : 'cursor-pointer',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gov-azul',
        ].join(' ')}
      >
        <span className="flex items-start gap-2">
          <MarcaEscolha selecionada={selecionada} desabilitada={vazia} />
          <span
            className={[
              'min-w-0 flex-1 text-sm font-semibold leading-snug',
              vazia ? 'text-app-fg-subtle' : 'text-app-fg',
            ].join(' ')}
          >
            {resumo.rotulo}
          </span>
        </span>

        {vazia ? (
          <span className="text-xs text-app-fg-subtle">
            Sem série neste posto.
          </span>
        ) : (
          <>
            {/* Número e rótulo ficam COLADOS, e não nas duas pontas do cartão.
                Empurrar um para cada extremo faz o olho perder o par assim que
                o cartão passa de uns 250 px, que é a largura normal em desktop.
                O rótulo é quem encolhe; o número nunca. */}
            <span className="flex items-baseline gap-1.5 tabular">
              <span className="shrink-0 text-xl font-semibold leading-none text-app-fg">
                {fmtInteiro(resumo.leituras)}
              </span>
              <span className="min-w-0 shrink text-xs text-app-fg-muted">
                {resumo.leituras === 1 ? 'leitura' : 'leituras'}
              </span>
            </span>

            <span className="text-xs text-app-fg-muted tabular">
              {resumo.primeiraData && resumo.ultimaData
                ? `${fmtDia(resumo.primeiraData)} a ${fmtDia(resumo.ultimaData)}`
                : 'Período indisponível'}
            </span>

            <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <Pastilha tom="neutro">{resumo.unidade}</Pastilha>
              {resumo.unidadeInferida ? (
                <Pastilha tom="atencao">unidade não confirmada</Pastilha>
              ) : null}
            </span>

            {resumo.leiturasSemValor > 0 ? (
              <span className="text-xs text-app-fg-muted tabular">
                {fmtInteiro(resumo.leiturasSemValor)} sem medida
                {pctSemValor ? ` (${pctSemValor})` : ''}
              </span>
            ) : null}

            {resumo.leiturasComDataFutura > 0 ? (
              <span className="text-xs text-gov-alerta tabular">
                {fmtInteiro(resumo.leiturasComDataFutura)} com data futura
              </span>
            ) : null}
          </>
        )}
      </label>
    </div>
  );
}

/**
 * Marcador de escolha desenhado à mão.
 *
 * O `<input>` está oculto para que o cartão inteiro seja a área clicável, e sem
 * este desenho a seleção seria comunicada só por cor de fundo, o que reprova em
 * WCAG 1.4.1. O anel cheio é uma pista de FORMA, e ela vale também para quem
 * enxerga bem e está olhando de longe.
 */
function MarcaEscolha({
  selecionada,
  desabilitada,
}: {
  selecionada: boolean;
  desabilitada: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={[
        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
        desabilitada
          ? 'border-app-border bg-app-surface-2'
          : selecionada
            ? 'border-gov-azul bg-gov-azul'
            : 'border-app-border-strong bg-app-surface',
      ].join(' ')}
    >
      {selecionada ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
    </span>
  );
}

function Pastilha({
  tom,
  children,
}: {
  tom: 'neutro' | 'atencao';
  children: React.ReactNode;
}) {
  const classes =
    tom === 'atencao'
      ? 'bg-amber-50 text-gov-alerta'
      : 'bg-app-surface-3 text-app-fg-muted';
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-medium ${classes}`}
    >
      {children}
    </span>
  );
}

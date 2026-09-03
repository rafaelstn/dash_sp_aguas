import Link from 'next/link';
import { ArrowRight, TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { calcularDelta, rotuloDelta } from '@/lib/delta';
import { ehNaoApurado, type ValorKPI } from '@/lib/painel-apuracao';
import { Sparkline } from './Sparkline';

export type SeveridadeKPI = 'critica' | 'alta' | 'media' | 'info' | 'sucesso';

const ROTULOS_SEVERIDADE: Record<SeveridadeKPI, string> = {
  critica: 'Crítico',
  alta: 'Alta atenção',
  media: 'Atenção',
  info: 'Informativo',
  sucesso: 'Sob controle',
};

export interface CardKPIProps {
  titulo: string;
  /**
   * O número, o texto já formatado, ou `naoApurado(motivo)` quando a origem
   * não tem como responder este indicador. Ver `@/lib/painel-apuracao`.
   */
  valor: ValorKPI;
  /**
   * Texto contextual curto (ex: "de 2.483 postos").
   *
   * IGNORADO no estado não apurado, e de propósito: o contexto sempre fala do
   * número ("100,0% da rede não indexada"), então mantê-lo ao lado de um
   * indicador sem número seria reintroduzir a afirmação que o estado existe
   * para desfazer. Quem manda ali é o motivo.
   */
  contexto?: string;
  href?: string;
  rotuloAcao?: string;
  severidade?: SeveridadeKPI;
  icone?: LucideIcon;
  /** Formata valor numérico com pt-BR. */
  formatarValor?: boolean;
  /**
   * Valor do mesmo indicador no período anterior. Quando informado (e o
   * valor atual for numérico), o card mostra o delta (seta + percentual)
   * com rótulo textual para acessibilidade.
   */
  valorAnterior?: number;
  /** Rótulo curto do período de comparação (ex: "vs. mês anterior"). */
  rotuloPeriodo?: string;
  /**
   * Série histórica para o sparkline (mais antigo → mais recente). Render
   * só acontece com 2+ pontos. Opcional: sem série, nenhum gráfico aparece.
   */
  serie?: readonly number[];
  /**
   * Direção "boa" do indicador. Para "postos ativos", subir é bom (verde);
   * para "postos sem arquivo", subir é ruim (vermelho). Padrão: 'maior'.
   */
  sentidoPositivo?: 'maior' | 'menor';
}

const estilos: Record<SeveridadeKPI, { borda: string; icone: string; fundoIcone: string }> = {
  critica: {
    borda: 'border-l-4 border-l-gov-perigo',
    icone: 'text-gov-perigo',
    fundoIcone: 'bg-red-50',
  },
  alta: {
    borda: 'border-l-4 border-l-gov-alerta',
    icone: 'text-gov-alerta',
    fundoIcone: 'bg-amber-50',
  },
  media: {
    borda: 'border-l-4 border-l-gov-azul',
    icone: 'text-gov-azul',
    fundoIcone: 'bg-gov-azul-claro',
  },
  info: {
    borda: 'border-l-4 border-l-app-border',
    icone: 'text-app-fg-muted',
    fundoIcone: 'bg-app-surface-2',
  },
  sucesso: {
    borda: 'border-l-4 border-l-gov-sucesso',
    icone: 'text-gov-sucesso',
    fundoIcone: 'bg-emerald-50',
  },
};

/**
 * Estado não apurado: neutro por decisão, não por falta de cor disponível.
 *
 * Vermelho e verde são as duas leituras erradas de um indicador sem medição
 * ("está péssimo" e "está resolvido"), então a faixa perde a cor e ganha o
 * tracejado, que é a convenção de "aqui não há dado", legível também em
 * escala de cinza e para quem não distingue as duas cores.
 */
const ESTILO_NAO_APURADO = {
  // `border-strong` e não `border-default`: tracejado claro demais some ao lado
  // das faixas sólidas de 4px dos cartões vizinhos, e o estado deixaria de ser
  // percebido como estado. O que carrega a informação continua sendo o TEXTO
  // ("Não apurado" mais o motivo), então a faixa é reforço, e não o único sinal
  // (WCAG 1.4.1).
  borda: 'border-l-4 border-dashed border-l-app-border-strong',
  icone: 'text-app-fg-subtle',
  fundoIcone: 'bg-app-surface-2',
};

export function CardKPI({
  titulo,
  valor,
  contexto,
  href,
  rotuloAcao = 'Ver detalhes',
  severidade = 'info',
  icone: Icone,
  formatarValor = true,
  valorAnterior,
  rotuloPeriodo = 'vs. período anterior',
  serie,
  sentidoPositivo = 'maior',
}: CardKPIProps) {
  const semApuracao = ehNaoApurado(valor) ? valor : null;

  /*
   * O estado não apurado ANULA ação, delta e série, e isso é guarda, não
   * cortesia: link ("Rodar worker"), seta de variação e sparkline são, os três,
   * afirmações sobre um número que não existe. Anular aqui, e não no chamador,
   * porque o chamador é quem esquece.
   */
  const destino = semApuracao ? undefined : href;
  const serieVisivel = semApuracao ? undefined : serie;

  const est = semApuracao ? ESTILO_NAO_APURADO : estilos[severidade];
  const valorFormatado = ehNaoApurado(valor)
    ? null
    : typeof valor === 'number' && formatarValor
      ? valor.toLocaleString('pt-BR')
      : valor;

  const delta =
    !ehNaoApurado(valor) &&
    typeof valor === 'number' &&
    typeof valorAnterior === 'number'
      ? calcularDelta(valor, valorAnterior)
      : null;

  const conteudo = (
    <div
      className={[
        'group flex h-full flex-col rounded-gov-card bg-app-surface p-4 shadow-gov-card transition-all motion-safe:duration-150',
        est.borda,
        destino ? 'hover:shadow-gov-card-hover hover:-translate-y-0.5' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        {Icone ? (
          <span
            className={['inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md', est.fundoIcone].join(' ')}
            aria-hidden="true"
          >
            <Icone className={['h-5 w-5', est.icone].join(' ')} strokeWidth={2.25} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-app-fg-muted">
            {/* Sem rótulo de severidade quando não há medição: o próprio valor
                visível já diz "Não apurado", e o leitor de tela o lê. */}
            {semApuracao ? null : (
              <span className="sr-only">{ROTULOS_SEVERIDADE[severidade]}: </span>
            )}
            {titulo}
          </p>
          {semApuracao ? (
            <>
              {/* Peso visual deliberadamente MENOR que o dos números vizinhos:
                  o que não foi medido não pode competir com o que foi. */}
              <p className="mt-0.5 text-base font-medium text-app-fg-muted">
                Não apurado
              </p>
              <p className="mt-0.5 text-xs text-app-fg-muted">
                {semApuracao.motivo}
              </p>
            </>
          ) : (
            <>
              <p className="tabular mt-0.5 text-2xl font-semibold text-app-fg">
                {valorFormatado}
              </p>
              {contexto ? (
                <p className="text-xs text-app-fg-muted">{contexto}</p>
              ) : null}
            </>
          )}
          {delta ? <DeltaBadge delta={delta} rotuloPeriodo={rotuloPeriodo} sentidoPositivo={sentidoPositivo} /> : null}
        </div>
      </div>
      {serieVisivel && serieVisivel.length >= 2 ? (
        <div className="mt-3">
          <Sparkline serie={serieVisivel} cor={est.icone} />
        </div>
      ) : null}
      {destino ? (
        <p
          className={[
            'mt-3 inline-flex items-center gap-1 text-xs font-medium',
            est.icone,
            'transition-[gap] motion-safe:duration-150 group-hover:gap-1.5',
          ].join(' ')}
        >
          <span>{rotuloAcao}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </p>
      ) : null}
    </div>
  );

  if (destino) {
    return (
      <Link
        href={destino}
        className="block rounded-gov-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
      >
        {conteudo}
      </Link>
    );
  }
  return conteudo;
}

function DeltaBadge({
  delta,
  rotuloPeriodo,
  sentidoPositivo,
}: {
  delta: ReturnType<typeof calcularDelta>;
  rotuloPeriodo: string;
  sentidoPositivo: 'maior' | 'menor';
}) {
  // "Bom" depende do indicador: subir pode ser positivo (postos ativos) ou
  // negativo (postos sem arquivo). Daí a cor; o texto sempre acompanha.
  const ehBom =
    delta.direcao === 'estavel'
      ? null
      : sentidoPositivo === 'maior'
        ? delta.direcao === 'subiu'
        : delta.direcao === 'caiu';

  const cor =
    ehBom === null
      ? 'text-app-fg-muted'
      : ehBom
        ? 'text-gov-sucesso'
        : 'text-gov-perigo';

  const Seta =
    delta.direcao === 'subiu'
      ? TrendingUp
      : delta.direcao === 'caiu'
        ? TrendingDown
        : Minus;

  const percentualVisivel =
    delta.percentual === null
      ? delta.absoluto.toLocaleString('pt-BR', { signDisplay: 'always' })
      : `${delta.percentual.toLocaleString('pt-BR', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
          signDisplay: 'always',
        })}%`;

  return (
    <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${cor}`}>
      <Seta className="h-3.5 w-3.5" aria-hidden="true" />
      {/* Texto explícito da direção, não só cor (WCAG 1.4.1). */}
      <span className="sr-only">{rotuloDelta(delta)}, </span>
      <span className="tabular" aria-hidden="true">
        {percentualVisivel}
      </span>
      <span className="font-normal text-app-fg-subtle">{rotuloPeriodo}</span>
    </p>
  );
}

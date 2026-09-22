'use client';

import { useEffect, useState } from 'react';
import type {
  DiaDaSerie,
  ResumoSerie,
} from '@/application/ports/series-medicao-repository';
import type { ResultadoComparativo } from '@/application/use-cases/monitor/comparar-serie-com-sibh';
import { SERIES_MEDICAO, type SerieMedicao } from '@/domain/monitor/serie-medicao';
import { ComparativoSibh } from './ComparativoSibh';
import { GraficoSerie } from './GraficoSerie';
import { LeiturasBrutas } from './LeiturasBrutas';
import { SeletorJanela } from './SeletorJanela';
import { SeletorSerie } from './SeletorSerie';
import { TabelaDiaria } from './TabelaDiaria';
import {
  diasNaJanela,
  fmtDia,
  janelaPadrao,
  rotuloUnidade,
  type Janela,
} from './formato';

/**
 * Séries históricas do posto: o que existe, o histórico do período escolhido, a
 * conferência com o SIBH e as medições cruas sob demanda.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * O DESENHO INTEIRO SAI DE UMA FRASE DO PROPRIETÁRIO
 * ═════════════════════════════════════════════════════════════════════════
 * "Caso eu queira carregar todas as medições do dia eu consiga, mas ela não
 * precisa abrir de cara para não pesar o processamento."
 *
 * Daí os três degraus, e nenhum deles acontece sem alguém pedir:
 *
 *   1. A ficha abre com os cinco cartões de resumo e NENHUMA leitura. O resumo
 *      chega pronto do servidor, junto da página, e custa entre 35 e 289 ms
 *      (medido em 03/09/2026 contra a produção do órgão).
 *   2. Escolher uma série carrega o resumo DIÁRIO da janela padrão daquela
 *      série. É um clique, e não dois: o período já nasce numa faixa que tem
 *      dado, então exigir "agora confirme o período" seria fricção sem ganho.
 *      Quem quiser outra janela troca logo acima do gráfico.
 *   3. As medições cruas, uma linha por leitura, só depois de um clique
 *      próprio. Há posto com 41.002 leituras numa série só.
 *
 * A conferência com o SIBH é um quarto pedido explícito, e por um motivo
 * diferente: ela fala com uma API pública, e num servidor sem saída para a
 * internet, como o do órgão, isso é uma espera até o tempo esgotar. Ela nunca
 * roda sozinha.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * NENHUMA SÉRIE VEM SELECIONADA
 * ═════════════════════════════════════════════════════════════════════════
 * Preselecionar a primeira com dado carregaria uma consulta que ninguém pediu,
 * toda vez que alguém abrisse a ficha do posto para ver outra coisa. O estado
 * inicial é o retrato, e o retrato já responde a maior parte das perguntas:
 * quantas leituras há, de quando até quando, e o que está furado.
 */

interface PainelSeriesPostoProps {
  prefixo: string;
  series: readonly ResumoSerie[];
  /**
   * Nível do título deste painel, e base para os títulos que ele aninha. Default
   * 2, que é o certo na rota dedicada `/postos/[prefixo]`, onde o `<h1>` é o
   * nome do posto.
   *
   * Dentro do detalhe aberto no mapa o painel é FILHO do posto, cujo título já é
   * um `<h2>`: ali o chamador passa 3. Sem essa prop o painel virava irmão do
   * posto para quem navega por cabeçalhos, e o mesmo texto ("Séries históricas
   * de medição") aparecia como `<h3>` enquanto carregava e como `<h2>` depois de
   * pronto, porque o esqueleto de carga é desenhado pelo pai. Nível de cabeçalho
   * que muda conforme o estado da requisição reprova em WCAG 1.3.1 e e-MAG 3.5.
   */
  nivelTitulo?: 2 | 3;
}

interface Pedido {
  serie: SerieMedicao;
  janela: Janela;
  comparar: boolean;
  /** Incrementa a cada nova solicitação, para que "tentar de novo" refaça. */
  seq: number;
}

interface DadosDiario {
  dias: readonly DiaDaSerie[];
  comparativo: ResultadoComparativo | null;
}

type EstadoDiario =
  | { situacao: 'inativo' }
  | { situacao: 'carregando' }
  | { situacao: 'erro'; mensagem: string }
  | { situacao: 'pronto'; dados: DadosDiario };

export function PainelSeriesPosto({
  prefixo,
  series,
  nivelTitulo = 2,
}: PainelSeriesPostoProps) {
  const Titulo = `h${nivelTitulo}` as const;
  const TituloFilho = `h${(nivelTitulo + 1) as 3 | 4}` as const;
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [estado, setEstado] = useState<EstadoDiario>({ situacao: 'inativo' });
  // Separado do estado principal para que conferir com o SIBH não apague o
  // gráfico que já está na tela: o dado do órgão não mudou, só falta o outro lado.
  const [comparando, setComparando] = useState(false);

  const selecionada = pedido?.serie ?? null;
  const resumoSelecionado =
    series.find((s) => s.serie === selecionada) ?? null;

  useEffect(() => {
    if (!pedido) return;

    let ativo = true;
    const controlador = new AbortController();

    if (pedido.comparar) setComparando(true);
    else setEstado({ situacao: 'carregando' });

    async function carregar() {
      const { serie, janela, comparar } = pedido as Pedido;
      try {
        const url =
          `/api/monitor/postos/${encodeURIComponent(prefixo)}/series/${serie}/diario` +
          `?desde=${janela.desde}&ate=${janela.ate}${comparar ? '&comparar=sibh' : ''}`;
        const resposta = await fetch(url, {
          signal: controlador.signal,
          headers: { Accept: 'application/json' },
        });
        const corpo = await resposta.json().catch(() => null);
        if (!ativo) return;

        if (!resposta.ok) {
          setEstado({
            situacao: 'erro',
            mensagem:
              typeof corpo?.mensagem === 'string'
                ? corpo.mensagem
                : `Não foi possível carregar o histórico (HTTP ${resposta.status}).`,
          });
          return;
        }

        setEstado({
          situacao: 'pronto',
          dados: {
            dias: Array.isArray(corpo?.dias) ? corpo.dias : [],
            comparativo: corpo?.comparativo ?? null,
          },
        });
      } catch (e) {
        if (!ativo || controlador.signal.aborted) return;
        setEstado({
          situacao: 'erro',
          mensagem:
            e instanceof Error ? e.message : 'Não foi possível carregar o histórico.',
        });
      } finally {
        if (ativo) setComparando(false);
      }
    }

    carregar();
    return () => {
      ativo = false;
      controlador.abort();
    };
  }, [pedido, prefixo]);

  function selecionarSerie(serie: SerieMedicao) {
    const resumo = series.find((s) => s.serie === serie);
    if (!resumo) return;
    const janela = janelaPadrao(resumo);
    if (!janela) return;
    setEstado({ situacao: 'inativo' });
    setPedido({ serie, janela, comparar: false, seq: 0 });
  }

  function aplicarJanela(janela: Janela) {
    setPedido((atual) =>
      atual ? { ...atual, janela, comparar: false, seq: atual.seq + 1 } : atual,
    );
  }

  function compararComSibh() {
    setPedido((atual) =>
      atual ? { ...atual, comparar: true, seq: atual.seq + 1 } : atual,
    );
  }

  function tentarDeNovo() {
    setPedido((atual) => (atual ? { ...atual, seq: atual.seq + 1 } : atual));
  }

  const temAlgumaSerie = series.some((s) => s.leituras > 0);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Titulo id="sec-series" className="text-base font-semibold text-app-fg">
          Séries históricas de medição
        </Titulo>
        <p className="text-xs text-app-fg-muted">
          Chuva, cota e vazão do rio e piezômetro lidos ao vivo do banco do órgão.
          Escolha uma série para ver o histórico e conferir com o SIBH.
        </p>
      </header>

      <SeletorSerie
        series={series}
        selecionada={selecionada}
        onSelecionar={selecionarSerie}
      />

      {!temAlgumaSerie ? (
        <p className="rounded-gov-card bg-app-surface-2 p-3 text-xs text-app-fg-muted">
          Nenhuma série tem leitura para este posto no banco do órgão.
        </p>
      ) : null}

      {pedido && resumoSelecionado ? (
        <div className="space-y-4 border-t border-app-border-subtle pt-4">
          <SeletorJanela
            resumo={resumoSelecionado}
            janela={pedido.janela}
            carregando={estado.situacao === 'carregando'}
            onAplicar={aplicarJanela}
          />

          {/*
            As duas seções abaixo carregam título próprio, ainda que oculto: sem
            eles, quem navega por cabeçalhos saltava do título das séries direto
            para a conferência com o SIBH, e o gráfico do histórico e a tabela de
            leituras ficavam sem âncora nenhuma (WCAG 1.3.1 / e-MAG 3.5). Ficam
            `sr-only` porque na tela o seletor logo acima já diz o que é, e
            repetir o rótulo visível só encheria a coluna.
          */}
          <section aria-labelledby="sec-historico">
            <TituloFilho id="sec-historico" className="sr-only">
              Histórico diário da série
            </TituloFilho>
            <BlocoHistorico
              estado={estado}
              serie={pedido.serie}
              janela={pedido.janela}
              onTentarDeNovo={tentarDeNovo}
            />
          </section>

          {estado.situacao === 'pronto' ? (
            <>
              <ComparativoSibh
                comparativo={estado.dados.comparativo}
                carregando={comparando}
                onComparar={compararComSibh}
                semEquivalente={SERIES_MEDICAO[pedido.serie].grandeza === 'vazao'}
                nivelTitulo={TituloFilho === 'h3' ? 3 : 4}
              />

              <section aria-labelledby="sec-leituras">
                <TituloFilho id="sec-leituras" className="sr-only">
                  Leituras brutas da série
                </TituloFilho>
                <LeiturasBrutas
                  prefixo={prefixo}
                  serie={pedido.serie}
                  definicao={SERIES_MEDICAO[pedido.serie]}
                  janela={pedido.janela}
                />
              </section>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BlocoHistorico({
  estado,
  serie,
  janela,
  onTentarDeNovo,
}: {
  estado: EstadoDiario;
  serie: SerieMedicao;
  janela: Janela;
  onTentarDeNovo: () => void;
}) {
  const definicao = SERIES_MEDICAO[serie];

  if (estado.situacao === 'inativo' || estado.situacao === 'carregando') {
    return (
      <div role="status" aria-live="polite" className="space-y-2">
        <div aria-hidden="true" className="h-64 w-full animate-pulse rounded-gov-card bg-app-surface-2 sm:h-72" />
        <span className="text-xs text-app-fg-muted">
          Carregando {definicao.rotulo.toLowerCase()} de {fmtDia(janela.desde)} a{' '}
          {fmtDia(janela.ate)}…
        </span>
      </div>
    );
  }

  if (estado.situacao === 'erro') {
    return (
      <div role="alert" className="rounded-gov-card bg-red-50 p-3 text-xs text-gov-perigo">
        <p className="text-sm font-semibold">Falha ao carregar o histórico</p>
        <p className="mt-1">{estado.mensagem}</p>
        <button
          type="button"
          onClick={onTentarDeNovo}
          className="mt-2 rounded border border-gov-perigo bg-app-surface px-3 py-1.5 font-medium text-gov-perigo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-perigo"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const { dias } = estado.dados;

  if (dias.length === 0) {
    return (
      <div className="rounded-gov-card bg-app-surface-2 p-3 text-xs text-app-fg-muted">
        <p className="text-sm font-medium text-app-fg">
          Nenhum dia com registro neste período
        </p>
        <p className="mt-1">
          A série existe neste posto, e entre {fmtDia(janela.desde)} e{' '}
          {fmtDia(janela.ate)} a origem não tem nenhuma linha. Use os atalhos
          acima para ir ao fim da série.
        </p>
      </div>
    );
  }

  const totalDiasJanela = diasNaJanela(janela.desde, janela.ate);

  return (
    <div className="space-y-4">
      {definicao.unidadeInferida ? (
        <p className="rounded-gov-card bg-amber-50 p-2.5 text-xs text-gov-alerta">
          A unidade desta série ({rotuloUnidade(definicao.unidade)}) não foi confirmada pelo
          órgão. O valor é exibido como está gravado, sem conversão.
        </p>
      ) : null}

      <GraficoSerie definicao={definicao} dias={dias} janela={janela} />

      <TabelaDiaria
        definicao={definicao}
        dias={dias}
        janela={janela}
        totalDiasJanela={totalDiasJanela}
      />
    </div>
  );
}

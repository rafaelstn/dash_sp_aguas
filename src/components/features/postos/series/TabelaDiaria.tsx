'use client';

import type { DiaDaSerie } from '@/application/ports/series-medicao-repository';
import type { DefinicaoSerie } from '@/domain/monitor/serie-medicao';
import { fmtDia, fmtInteiro, fmtNumero, type Janela } from './formato';

/**
 * Equivalente textual do `GraficoSerie` (e-MAG 3.5 recomendação 3.6, WCAG 1.1.1).
 *
 * Não é um extra opcional nem um modo alternativo escondido atrás de um botão:
 * em sistema de órgão público a alternativa textual do gráfico é exigência
 * legal, e por isso ela está sempre na tela, com os MESMOS números e a MESMA
 * distinção de estados que o desenho.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TRÊS ESTADOS, TRÊS TEXTOS DIFERENTES
 * ─────────────────────────────────────────────────────────────────────────
 * `valor` numérico            o dia tem medida.
 * `valor` nulo com leitura    o dia existe na origem e não tem medida. A célula
 *                             diz isso com estas palavras, e não com travessão,
 *                             porque travessão aqui seria indistinguível de
 *                             "campo vazio".
 * dia ausente                 não vira linha nenhuma. O rodapé conta quantos
 *                             são, senão a tabela pareceria completa.
 *
 * A ordem é crescente no tempo, a mesma do gráfico, para que o olho ande entre
 * os dois sem reinterpretar o eixo.
 */

interface TabelaDiariaProps {
  definicao: DefinicaoSerie;
  dias: readonly DiaDaSerie[];
  janela: Janela;
  totalDiasJanela: number;
}

export function TabelaDiaria({
  definicao,
  dias,
  janela,
  totalDiasJanela,
}: TabelaDiariaProps) {
  const ehMedia = definicao.criterioDiario === 'media';
  const rotuloValor = ehMedia ? 'Média' : 'Total';
  const lacunas = Math.max(0, totalDiasJanela - dias.length);

  return (
    <div className="space-y-2">
      <div className="max-h-96 overflow-auto rounded-gov-card bg-app-surface-2">
        <table className="w-full border-collapse text-sm tabular">
          <caption className="sr-only">
            {definicao.rotulo} por dia, de {fmtDia(janela.desde)} a{' '}
            {fmtDia(janela.ate)}, em {definicao.unidade}, em ordem crescente de
            data. Equivalente textual do gráfico acima. Dias sem nenhum registro
            na origem não aparecem como linha.
          </caption>
          <thead className="sticky top-0 z-10 bg-app-surface-3">
            <tr>
              <Cabecalho alinhamento="esquerda">Dia</Cabecalho>
              <Cabecalho alinhamento="direita">
                {rotuloValor} ({definicao.unidade})
              </Cabecalho>
              {ehMedia ? (
                <>
                  <Cabecalho alinhamento="direita">Mínimo</Cabecalho>
                  <Cabecalho alinhamento="direita">Máximo</Cabecalho>
                </>
              ) : null}
              <Cabecalho alinhamento="direita">Leituras</Cabecalho>
              <Cabecalho alinhamento="direita">Sem medida</Cabecalho>
            </tr>
          </thead>
          <tbody>
            {dias.map((dia) => {
              const semMedida = dia.valor === null;
              return (
                <tr
                  key={dia.dia}
                  className="border-b border-app-border-subtle last:border-0 odd:bg-app-surface"
                >
                  <th
                    scope="row"
                    className="whitespace-nowrap px-3 py-1.5 text-left font-normal text-app-fg"
                  >
                    {fmtDia(dia.dia)}
                  </th>
                  <td
                    className={[
                      'whitespace-nowrap px-3 py-1.5 text-right',
                      semMedida ? 'font-medium text-gov-alerta' : 'font-medium text-app-fg',
                    ].join(' ')}
                  >
                    {semMedida ? 'sem medida' : fmtNumero(dia.valor)}
                  </td>
                  {ehMedia ? (
                    <>
                      <td className="px-3 py-1.5 text-right text-app-fg-subtle">
                        {fmtNumero(dia.minimo)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-app-fg-subtle">
                        {fmtNumero(dia.maximo)}
                      </td>
                    </>
                  ) : null}
                  <td className="px-3 py-1.5 text-right text-app-fg-subtle">
                    {fmtInteiro(dia.leituras)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-app-fg-subtle">
                    {dia.leiturasSemValor > 0 ? fmtInteiro(dia.leiturasSemValor) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-app-fg-muted tabular">
        {fmtInteiro(dias.length)} {dias.length === 1 ? 'dia' : 'dias'} com registro
        {lacunas > 0 ? (
          <>
            {' '}
            e {fmtInteiro(lacunas)} {lacunas === 1 ? 'dia' : 'dias'} sem registro
            nenhum, dentro dos {fmtInteiro(totalDiasJanela)} dias do período.
          </>
        ) : (
          <>, cobrindo os {fmtInteiro(totalDiasJanela)} dias do período.</>
        )}
      </p>
    </div>
  );
}

function Cabecalho({
  alinhamento,
  children,
}: {
  alinhamento: 'esquerda' | 'direita';
  children: React.ReactNode;
}) {
  return (
    <th
      scope="col"
      className={[
        'whitespace-nowrap border-b border-app-border-subtle px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-app-fg-muted',
        alinhamento === 'direita' ? 'text-right' : 'text-left',
      ].join(' ')}
    >
      {children}
    </th>
  );
}

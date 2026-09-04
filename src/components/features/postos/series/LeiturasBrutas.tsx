'use client';

import { useEffect, useState } from 'react';
import type { LeituraSerie } from '@/application/ports/series-medicao-repository';
import type { DefinicaoSerie, SerieMedicao } from '@/domain/monitor/serie-medicao';
import {
  algumaLeituraTemHora,
  fmtDia,
  fmtInteiro,
  fmtMomento,
  fmtNumero,
  type Janela,
} from './formato';

/**
 * Todas as medições do período, uma linha por leitura, sob demanda.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ELA NÃO ABRE SOZINHA, E ESSE É O REQUISITO
 * ─────────────────────────────────────────────────────────────────────────
 * Pedido do proprietário: "caso eu queira carregar todas as medições do dia eu
 * consiga, mas ela não precisa abrir de cara para não pesar o processamento".
 * Nada aqui é buscado antes de alguém pedir, e o pedido é um clique explícito.
 *
 * O custo que isso evita é real: MEDIDO em 03/09/2026, o posto `E3-036` tem
 * 41.002 leituras numa série só, e o `1D-008` tem 22.584. O peso não estaria no
 * servidor (uma página de 500 leituras sai em 74 ms, e não degrada com a
 * profundidade), estaria no navegador de quem só queria ver a ficha do posto.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A COLUNA "BRUTO" EXISTE PARA QUE DUAS FRASES NÃO VIREM A MESMA
 * ─────────────────────────────────────────────────────────────────────────
 * `valor` é a nossa interpretação (o marcador de ausência já virou vazio) e
 * `bruto` é o que está gravado no banco do órgão, inclusive o marcador. Sem a
 * segunda coluna, "o sistema não mostra a leitura" e "a leitura não existe"
 * seriam indistinguíveis na tela, e é exatamente essa distinção que quem senta
 * com o pessoal do órgão precisa ter na mão.
 */

interface LeiturasBrutasProps {
  prefixo: string;
  serie: SerieMedicao;
  definicao: DefinicaoSerie;
  janela: Janela;
}

interface Resposta {
  pagina: number;
  porPagina: number;
  total: number;
  itens: LeituraSerie[];
}

type Estado =
  | { situacao: 'fechado' }
  | { situacao: 'carregando' }
  | { situacao: 'erro'; mensagem: string }
  | { situacao: 'pronto'; dados: Resposta };

const POR_PAGINA = 200;

export function LeiturasBrutas({
  prefixo,
  serie,
  definicao,
  janela,
}: LeiturasBrutasProps) {
  const [estado, setEstado] = useState<Estado>({ situacao: 'fechado' });
  const [pagina, setPagina] = useState(1);

  // Trocar de série ou de período fecha o bloco em vez de recarregá-lo: ele foi
  // aberto para UM recorte, e recarregar sozinho contraria o motivo de ele
  // existir, que é não buscar leitura sem pedido.
  useEffect(() => {
    setEstado({ situacao: 'fechado' });
    setPagina(1);
  }, [prefixo, serie, janela.desde, janela.ate]);

  useEffect(() => {
    if (estado.situacao !== 'carregando') return;

    let ativo = true;
    const controlador = new AbortController();

    async function carregar() {
      try {
        const url =
          `/api/monitor/postos/${encodeURIComponent(prefixo)}/series/${serie}/leituras` +
          `?desde=${janela.desde}&ate=${janela.ate}&pagina=${pagina}&porPagina=${POR_PAGINA}`;
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
                : `Não foi possível carregar as medições (HTTP ${resposta.status}).`,
          });
          return;
        }
        setEstado({ situacao: 'pronto', dados: corpo as Resposta });
      } catch (e) {
        if (!ativo || controlador.signal.aborted) return;
        setEstado({
          situacao: 'erro',
          mensagem:
            e instanceof Error ? e.message : 'Não foi possível carregar as medições.',
        });
      }
    }

    carregar();
    return () => {
      ativo = false;
      controlador.abort();
    };
  }, [estado.situacao, prefixo, serie, janela.desde, janela.ate, pagina]);

  function abrir(novaPagina: number) {
    setPagina(novaPagina);
    setEstado({ situacao: 'carregando' });
  }

  if (estado.situacao === 'fechado') {
    return (
      <div className="rounded-gov-card bg-app-surface-2 p-3">
        <button
          type="button"
          onClick={() => abrir(1)}
          className="rounded border border-gov-azul bg-app-surface px-3 py-1.5 text-xs font-medium text-gov-azul transition-colors hover:bg-gov-azul-claro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          Ver todas as medições do período
        </button>
        <p className="mt-2 text-xs text-app-fg-muted">
          Uma linha por leitura, de {fmtDia(janela.desde)} a {fmtDia(janela.ate)},
          com o valor como está gravado no banco do órgão.
        </p>
      </div>
    );
  }

  if (estado.situacao === 'carregando') {
    return (
      <p role="status" aria-live="polite" className="text-xs text-app-fg-muted">
        Carregando as medições do período…
      </p>
    );
  }

  if (estado.situacao === 'erro') {
    return (
      <div role="alert" className="rounded-gov-card bg-red-50 p-3 text-xs text-gov-perigo">
        <p className="font-semibold">Falha ao carregar as medições</p>
        <p className="mt-1">{estado.mensagem}</p>
        <button
          type="button"
          onClick={() => abrir(pagina)}
          className="mt-2 rounded border border-gov-perigo bg-app-surface px-3 py-1.5 font-medium text-gov-perigo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-perigo"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const { dados } = estado;
  const totalPaginas = Math.max(1, Math.ceil(dados.total / dados.porPagina));
  const ehCota = definicao.serie === 'cota_rio';

  if (dados.total === 0) {
    return (
      <div className="rounded-gov-card bg-app-surface-2 p-3 text-xs text-app-fg-muted">
        <p className="font-medium text-app-fg">
          Nenhuma medição registrada neste período
        </p>
        <p className="mt-1">
          A série existe neste posto, e entre {fmtDia(janela.desde)} e{' '}
          {fmtDia(janela.ate)} não há linha nenhuma na origem. Escolha outro
          período acima.
        </p>
      </div>
    );
  }

  const primeira = (dados.pagina - 1) * dados.porPagina + 1;
  const ultima = Math.min(dados.pagina * dados.porPagina, dados.total);
  const comHora = algumaLeituraTemHora(dados.itens.map((i) => i.momento));

  return (
    <div className="space-y-2">
      <p className="text-xs text-app-fg-muted tabular">
        <span className="font-medium text-app-fg">{fmtInteiro(dados.total)}</span>{' '}
        {dados.total === 1 ? 'medição' : 'medições'} no período. Mostrando{' '}
        {fmtInteiro(primeira)} a {fmtInteiro(ultima)}.
      </p>

      <div className="max-h-96 overflow-auto rounded-gov-card bg-app-surface-2">
        <table className="w-full border-collapse text-sm tabular">
          <caption className="sr-only">
            Medições registradas de {fmtDia(janela.desde)} a {fmtDia(janela.ate)}
            . A coluna Valor traz a leitura em {definicao.unidade}; a coluna
            Gravado traz o número exatamente como está no banco do órgão,
            inclusive o marcador que a origem usa para dizer que não houve
            leitura.
          </caption>
          <thead className="sticky top-0 z-10 bg-app-surface-3">
            <tr>
              <Cabecalho alinhamento="esquerda">
                {comHora ? 'Momento' : 'Dia'}
              </Cabecalho>
              <Cabecalho alinhamento="direita">
                Valor ({definicao.unidade})
              </Cabecalho>
              <Cabecalho alinhamento="direita">Gravado</Cabecalho>
              {ehCota ? <Cabecalho alinhamento="direita">Vazão (m³/s)</Cabecalho> : null}
              <Cabecalho alinhamento="direita">Validação</Cabecalho>
            </tr>
          </thead>
          <tbody>
            {dados.itens.map((item) => {
              const semMedida = item.valor === null && item.bruto !== null;
              return (
                <tr
                  key={item.momento}
                  className="border-b border-app-border-subtle last:border-0 odd:bg-app-surface"
                >
                  <th
                    scope="row"
                    className="whitespace-nowrap px-3 py-1.5 text-left font-normal text-app-fg"
                  >
                    {fmtMomento(item.momento, comHora)}
                  </th>
                  <td
                    className={[
                      'whitespace-nowrap px-3 py-1.5 text-right font-medium',
                      semMedida ? 'text-gov-alerta' : 'text-app-fg',
                    ].join(' ')}
                  >
                    {semMedida ? 'sem medida' : fmtNumero(item.valor)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-app-fg-subtle">
                    {fmtNumero(item.bruto)}
                  </td>
                  {ehCota ? (
                    <td className="px-3 py-1.5 text-right text-app-fg-subtle">
                      {fmtNumero(item.vazaoM3s)}
                    </td>
                  ) : null}
                  <td className="px-3 py-1.5 text-right text-app-fg-subtle">
                    {fmtNumero(item.validacao)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-app-fg-muted">
        <span className="font-medium text-app-fg">Gravado</span> é o número como
        está no banco do órgão, inclusive quando ele é o marcador de ausência de
        leitura.
        {comHora ? (
          <>
            {' '}
            <span className="font-medium text-app-fg">Momento</span> é a hora da
            origem, sem conversão de fuso.
          </>
        ) : null}{' '}
        <span className="font-medium text-app-fg">Validação</span> é uma coluna
        do órgão cujo significado não é publicado, entregue sem interpretação.
      </p>

      {totalPaginas > 1 ? (
        <nav
          aria-label="Paginação das medições"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-app-border-subtle pt-2"
        >
          <p className="text-xs text-app-fg-muted tabular">
            Página {fmtInteiro(dados.pagina)} de {fmtInteiro(totalPaginas)}
          </p>
          <div className="flex items-center gap-1.5">
            <BotaoPagina
              onClick={() => abrir(dados.pagina - 1)}
              desabilitado={dados.pagina <= 1}
            >
              Anterior
            </BotaoPagina>
            <BotaoPagina
              onClick={() => abrir(dados.pagina + 1)}
              desabilitado={dados.pagina >= totalPaginas}
            >
              Próxima
            </BotaoPagina>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function BotaoPagina({
  onClick,
  desabilitado,
  children,
}: {
  onClick: () => void;
  desabilitado: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-xs font-medium text-app-fg transition-colors hover:bg-app-surface-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-app-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
    >
      {children}
    </button>
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

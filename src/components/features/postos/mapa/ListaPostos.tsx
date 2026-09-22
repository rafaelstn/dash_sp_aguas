'use client';

import { useEffect, useState } from 'react';
import { Crosshair, MapPinOff, SearchX, TriangleAlert } from 'lucide-react';
import type { PontoMapaPosto } from '@/domain/mapa-postos';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { GlifoPosto } from './GlifoPosto';
import { estiloDoTipo } from './simbolos';
import { AVISO_COORDENADA_SUSPEITA, linhasDeLocal } from './local-posto';

/**
 * Lista dos postos: a alternativa acessível ao mapa, com os MESMOS postos.
 *
 * O Canvas não é navegável por teclado nem legível por leitor de tela; tudo o
 * que o mapa mostra na área visível está aqui como botão, na mesma ordem para
 * quem vê e para quem ouve. Os postos sem coordenada, que o mapa não consegue
 * desenhar, ficam num grupo próprio, para a lista não esconder o que o mapa
 * não mostra.
 */

const PASSO = 60;

interface ListaPostosProps {
  readonly naArea: readonly PontoMapaPosto[];
  readonly semCoordenada: readonly PontoMapaPosto[];
  /** Total que passa nos filtros, antes do recorte do mapa. */
  readonly totalFiltrado: number;
  readonly selecionado: string | null;
  readonly aoAbrir: (prefixo: string, origem: HTMLElement) => void;
  readonly aoRealcar: (prefixo: string | null) => void;
  readonly aoLimparFiltros: () => void;
  readonly aoEnquadrar: () => void;
  readonly avisoVazao: boolean;
  readonly aoIncluirFluviometricos: () => void;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');

export function ListaPostos({
  naArea,
  semCoordenada,
  totalFiltrado,
  selecionado,
  aoAbrir,
  aoRealcar,
  aoLimparFiltros,
  aoEnquadrar,
  avisoVazao,
  aoIncluirFluviometricos,
}: ListaPostosProps) {
  const [limite, setLimite] = useState(PASSO);
  const [verSemCoordenada, setVerSemCoordenada] = useState(false);

  // Filtro ou enquadramento novo volta ao começo da lista.
  useEffect(() => setLimite(PASSO), [naArea]);

  if (totalFiltrado === 0) {
    return (
      <EstadoVazio
        icone={SearchX}
        titulo="Nenhum posto com esses filtros"
        descricao={
          avisoVazao
            ? 'Vazão só existe em posto fluviométrico, e esse tipo está fora do filtro.'
            : undefined
        }
        acao={
          <div className="flex flex-wrap justify-center gap-2">
            {avisoVazao && (
              <button type="button" onClick={aoIncluirFluviometricos} className={classeAcaoPrimaria}>
                Incluir fluviométricos
              </button>
            )}
            <button type="button" onClick={aoLimparFiltros} className={classeAcaoSecundaria}>
              Limpar filtros
            </button>
          </div>
        }
      />
    );
  }

  const exibidos = verSemCoordenada ? semCoordenada : naArea;
  const visiveis = exibidos.slice(0, limite);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline gap-2 border-b border-app-border-subtle px-4 py-3">
        <h2 className="text-sm font-semibold text-app-fg">
          {verSemCoordenada ? 'Sem coordenada válida' : 'Na área do mapa'}
        </h2>
        <p className="text-sm tabular-nums text-app-fg-muted" aria-live="polite">
          {fmt(exibidos.length)} {exibidos.length === 1 ? 'posto' : 'postos'}
        </p>
      </div>

      {semCoordenada.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setVerSemCoordenada((v) => !v);
            setLimite(PASSO);
          }}
          aria-pressed={verSemCoordenada}
          className="mx-3 mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-left text-xs text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
        >
          <MapPinOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            {verSemCoordenada
              ? 'Voltar aos postos na área do mapa'
              : `${fmt(semCoordenada.length)} ${
                  semCoordenada.length === 1 ? 'posto sem coordenada válida fica' : 'postos sem coordenada válida ficam'
                } fora do mapa. Ver`}
          </span>
        </button>
      )}

      {exibidos.length === 0 ? (
        <EstadoVazio
          icone={Crosshair}
          titulo="Nenhum posto nesta área"
          descricao={`${fmt(totalFiltrado)} ${totalFiltrado === 1 ? 'posto passa' : 'postos passam'} nos filtros, fora do enquadramento atual.`}
          nivelTitulo={3}
          acao={
            <button type="button" onClick={aoEnquadrar} className={classeAcaoSecundaria}>
              Enquadrar
            </button>
          }
        />
      ) : (
        <div className="relative min-h-0 flex-1 overflow-y-auto" onMouseLeave={() => aoRealcar(null)}>
          <ul className="divide-y divide-app-border-subtle">
            {visiveis.map((p) => (
              <li key={p.prefixo}>
                <ItemPosto
                  ponto={p}
                  atual={p.prefixo === selecionado}
                  aoAbrir={aoAbrir}
                  aoRealcar={aoRealcar}
                />
              </li>
            ))}
          </ul>
          {exibidos.length > limite && (
            <div className="p-3">
              <button
                type="button"
                onClick={() => setLimite((l) => l + PASSO)}
                className={`${classeAcaoSecundaria} w-full`}
              >
                Mostrar mais {fmt(Math.min(PASSO, exibidos.length - limite))} (restam{' '}
                {fmt(exibidos.length - limite)})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ItemPosto({
  ponto,
  atual,
  aoAbrir,
  aoRealcar,
}: {
  ponto: PontoMapaPosto;
  atual: boolean;
  aoAbrir: ListaPostosProps['aoAbrir'];
  aoRealcar: ListaPostosProps['aoRealcar'];
}) {
  const extinto = ponto.situacao === 'extinto';
  const telemetrico = ponto.transmissao.includes('telemetrico');
  return (
    <button
      type="button"
      data-prefixo={ponto.prefixo}
      aria-current={atual ? 'true' : undefined}
      onClick={(e) => aoAbrir(ponto.prefixo, e.currentTarget)}
      onMouseEnter={() => aoRealcar(ponto.prefixo)}
      onFocus={() => aoRealcar(ponto.prefixo)}
      onBlur={() => aoRealcar(null)}
      className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors duration-150 ease-gov-ease hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gov-azul ${
        atual ? 'bg-gov-azul-claro/60' : ''
      }`}
    >
      <span className="mt-1">
        <GlifoPosto tipo={ponto.tipo} extinto={extinto} tamanho={12} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-app-fg">
          <span className="font-semibold tabular-nums">{ponto.prefixo}</span>{' '}
          {ponto.nome ?? <span className="text-app-fg-subtle">Sem nome</span>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-app-fg-muted">
          <span className="sr-only">{estiloDoTipo(ponto.tipo).nome}, </span>
          {linhasDeLocal(ponto).map((linha) => (
            <span key={linha} className="min-w-0 truncate">
              {linha}
            </span>
          ))}
          {extinto && <Etiqueta>Extinto</Etiqueta>}
          {telemetrico && <Etiqueta>Telemétrico</Etiqueta>}
        </span>
        {ponto.coordenadaSuspeita && (
          <span className="mt-1 flex items-center gap-1 text-xs text-amber-900">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {AVISO_COORDENADA_SUSPEITA}
          </span>
        )}
      </span>
    </button>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-app-surface-3 px-1.5 py-px text-2xs font-medium text-app-fg">{children}</span>
  );
}

export const classeAcaoPrimaria =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded bg-gov-azul px-3.5 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul';

export const classeAcaoSecundaria =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded border border-app-border-input bg-app-surface px-3.5 text-sm font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul';
